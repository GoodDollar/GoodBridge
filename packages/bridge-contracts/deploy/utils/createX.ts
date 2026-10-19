/***
 * Helpers for deploying through CreateX, the universal deployer that lives at the same address on
 * every chain: https://github.com/pcaversaccio/createx
 *
 * Why: proxy addresses used to come from the per-chain GoodProtocol ProxyFactory1967, so the same
 * contract got a different address on every chain. CreateX is at one address everywhere, and its
 * CREATE3 deployments derive the address from (CreateX, guarded salt) only - not from the init code
 * or the implementation address - so the OFT proxies get one address across all chains.
 *
 * Salt layout (CreateX `_guard`/`_parseSalt`):
 *   bytes20(deployer) | 0x00 | bytes11(entropy)
 *     - the deployer prefix enables permissioned deploy protection: only that EOA can use the salt,
 *       so nobody can squat our address on a chain we haven't deployed to yet
 *     - the 0x00 flag byte disables cross-chain redeploy protection, i.e. block.chainid is left out
 *       of the guarded salt, which is exactly what makes the address identical on every chain
 *   guarded salt = keccak256(bytes32(uint256(uint160(deployer))) ++ salt)
 *
 * Consequence: the deployer EOA is part of the address. Deploy every chain with the same signer.
 */

import { BigNumber, Contract, Signer, providers, utils } from 'ethers';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import createxRuntime from './createxRuntime.json';

/// hardhat.config.ts registers the oft tasks, which reach this module, so the HRE can only be
/// pulled in lazily - importing it at module level breaks config loading (HH9).
async function getHre(): Promise<HardhatRuntimeEnvironment> {
  return (await import('hardhat')) as unknown as HardhatRuntimeEnvironment;
}

export const CREATEX_ADDRESS = '0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed';

/// keccak256 of the deployed CreateX runtime bytecode, as published by the CreateX project.
/// CreateX asks integrators to check this before interacting with it on any chain.
export const CREATEX_RUNTIME_CODE_HASH = '0xbd8a7ea8cfca7b4e5f5041d7d4b17bc317c5ce42cfbc42066a00cf26b43eb53f';

export const CREATEX_ABI = [
  'function deployCreate2(bytes32 salt, bytes initCode) payable returns (address newContract)',
  'function deployCreate3(bytes32 salt, bytes initCode) payable returns (address newContract)',
  'function deployCreate3AndInit(bytes32 salt, bytes initCode, bytes data, (uint256 constructorAmount, uint256 initCallAmount) values) payable returns (address newContract)',
  'function computeCreate2Address(bytes32 salt, bytes32 initCodeHash) view returns (address computedAddress)',
  'function computeCreate3Address(bytes32 salt) view returns (address computedAddress)',
  'event ContractCreation(address indexed newContract)',
];

/// CreateX's CREATE3 proxy: CREATE2-deployed from the guarded salt, it then CREATEs the contract as
/// its first and only transaction (nonce 1). Addresses are computed here rather than through
/// CreateX's view functions, which keeps prediction free of RPC quirks (e.g. eth_call at a fork block).
const CREATE3_PROXY_INIT_CODE = '0x67363d3d37363d34f03d5260086018f3';

const LOCAL_NETWORKS = ['hardhat', 'localhost'];

/**
 * Builds a CreateX salt for `deployer`: permissioned (only `deployer` can use it) and without
 * cross-chain redeploy protection (same address on every chain).
 * @param entropy a label (e.g. "Production-GoodDollarOFTAdapterV1") or any hex string; it is hashed
 *                and truncated to the 11 entropy bytes. Changing it changes the resulting address.
 */
export function createXSalt(deployer: string, entropy: string): string {
  const hashed = utils.isHexString(entropy) ? utils.keccak256(entropy) : utils.id(entropy);
  return utils.hexConcat([utils.getAddress(deployer), '0x00', utils.hexDataSlice(hashed, 0, 11)]);
}

/// Mirrors CreateX `_guard` for the permissioned, cross-chain-enabled salt layout above.
export function guardCreateXSalt(deployer: string, salt: string): string {
  return utils.keccak256(utils.hexConcat([utils.hexZeroPad(utils.getAddress(deployer), 32), salt]));
}

/**
 * Makes CreateX usable on local networks (hardhat/localhost) by etching its runtime bytecode at the
 * canonical address. CreateX stores its own address as an immutable, so the fetched runtime code is
 * only valid at that same address - which is where we put it.
 */
export async function etchCreateX(): Promise<void> {
  const { ethers, network } = await getHre();
  if (!LOCAL_NETWORKS.includes(network.name)) return;
  if ((await ethers.provider.getCode(CREATEX_ADDRESS)) !== '0x') return;
  if (utils.keccak256(createxRuntime.runtimeCode) !== CREATEX_RUNTIME_CODE_HASH) {
    throw new Error('createxRuntime.json does not match the published CreateX runtime code hash');
  }
  await network.provider.send('hardhat_setCode', [CREATEX_ADDRESS, createxRuntime.runtimeCode]);
}

/**
 * Returns the CreateX instance, after checking that the code at the canonical address really is
 * CreateX. On local networks CreateX is etched in first.
 */
export async function getCreateX(signerOrProvider?: Signer | providers.Provider): Promise<Contract> {
  await etchCreateX();

  const { ethers, network } = await getHre();
  const code = await ethers.provider.getCode(CREATEX_ADDRESS);
  if (code === '0x') {
    throw new Error(
      `CreateX is not deployed at ${CREATEX_ADDRESS} on network "${network.name}". ` +
        `See https://github.com/pcaversaccio/createx#deployments for the chains it is available on.`,
    );
  }
  if (utils.keccak256(code) !== CREATEX_RUNTIME_CODE_HASH) {
    throw new Error(
      `Code at ${CREATEX_ADDRESS} on "${network.name}" is not CreateX ` +
        `(runtime code hash ${utils.keccak256(code)}, expected ${CREATEX_RUNTIME_CODE_HASH})`,
    );
  }

  return new Contract(CREATEX_ADDRESS, CREATEX_ABI, signerOrProvider ?? ethers.provider);
}

/// CREATE3 address for `salt`: depends on the deployer and salt only, never on the init code.
export function computeCreate3Address(deployer: string, salt: string): string {
  const proxy = utils.getCreate2Address(
    CREATEX_ADDRESS,
    guardCreateXSalt(deployer, salt),
    utils.keccak256(CREATE3_PROXY_INIT_CODE),
  );
  return utils.getContractAddress({ from: proxy, nonce: 1 });
}

/// CREATE2 address for `salt` and `initCode`; changes whenever the init code (incl. constructor args) changes.
export function computeCreate2Address(deployer: string, salt: string, initCode: string): string {
  return utils.getCreate2Address(CREATEX_ADDRESS, guardCreateXSalt(deployer, salt), utils.keccak256(initCode));
}

export type CreateXDeployment = {
  address: string;
  /// undefined when the contract was already deployed at the predicted address
  transactionHash?: string;
  receipt?: providers.TransactionReceipt;
  reused: boolean;
};

/**
 * CREATE2-deploys `initCode` through CreateX, or reports the existing contract when the predicted
 * address is already taken (so deploy scripts stay re-runnable).
 */
export async function deployCreate2IfMissing(
  createX: Contract,
  deployer: string,
  salt: string,
  initCode: string,
): Promise<CreateXDeployment> {
  const { ethers } = await getHre();
  const address = computeCreate2Address(deployer, salt, initCode);
  if ((await ethers.provider.getCode(address)) !== '0x') {
    return { address, reused: true };
  }

  const tx = await createX.deployCreate2(salt, initCode);
  const receipt = await tx.wait();
  return { address, transactionHash: tx.hash, receipt, reused: false };
}

/**
 * CREATE3-deploys `initCode` through CreateX and calls `data` on the new contract in the same
 * transaction, or reports the existing contract when the predicted address is already taken.
 * Atomic deploy+initialize means an uninitialized proxy can never be front-run.
 */
export async function deployCreate3AndInitIfMissing(
  createX: Contract,
  deployer: string,
  salt: string,
  initCode: string,
  data: string,
): Promise<CreateXDeployment> {
  const { ethers } = await getHre();
  const address = computeCreate3Address(deployer, salt);
  if ((await ethers.provider.getCode(address)) !== '0x') {
    return { address, reused: true };
  }

  const tx = await createX.deployCreate3AndInit(salt, initCode, data, {
    constructorAmount: BigNumber.from(0),
    initCallAmount: BigNumber.from(0),
  });
  const receipt = await tx.wait();
  return { address, transactionHash: tx.hash, receipt, reused: false };
}
