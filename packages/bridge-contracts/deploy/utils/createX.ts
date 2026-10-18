import { ethers } from 'hardhat';

/**
 * Canonical CreateX universal factory address deployed across EVM chains (Celo, XDC, Ethereum, Fuse, etc.).
 * @see https://github.com/pcaversaccio/createx
 */
export const CREATEX_ADDRESS = '0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed';

/**
 * Keccak-256 hash of CreateX's 16-byte CREATE3 child proxy initcode (`0x67363d3d37363d34f03d5260086018f3`).
 */
export const CREATE3_PROXY_INITCODE_HASH = '0x21c35dbe1b344a2488cf3321d6ce542f8e9f305544ff09e4993a62319a497c1f';

export const CREATEX_ABI = [
  'function deployCreate3AndInit(bytes32 salt, bytes initCode, bytes data, tuple(uint256 constructorAmount, uint256 initCallAmount) values) payable returns (address newContract)',
  // Note: CreateX's on-chain computeCreate3Address(bytes32) does NOT run _guard(salt); it expects the post-guard salt
  // produced by guardCreateXSalt(deployer, rawSalt), whereas deployCreate3AndInit takes the raw salt and calls _guard(salt).
  'function computeCreate3Address(bytes32 salt) view returns (address computedAddress)',
  'function computeCreate3Address(bytes32 salt, address deployer) pure returns (address computedAddress)',
];

/**
 * Builds a 32-byte CreateX salt with sender-permissioned deploy protection and cross-chain address consistency:
 * - bytes 0..19 (20 bytes): `deployer` address (`SenderBytes.MsgSender` — only `deployer` can produce the guarded salt)
 * - byte 20 (1 byte): `0x00` (`RedeployProtectionFlag.False` — omits `block.chainid` so the address is identical across all chains)
 * - bytes 21..31 (11 bytes): first 11 bytes of `keccak256(utf8(label))`
 */
export function buildCreateXSalt(deployer: string, label: string): string {
  const entropy = ethers.utils.hexDataSlice(ethers.utils.id(label), 0, 11);
  return ethers.utils.solidityPack(['address', 'uint8', 'bytes11'], [ethers.utils.getAddress(deployer), 0, entropy]);
}

/**
 * Computes the post-`_guard(salt)` value that CreateX derives internally in `deployCreate3*` when
 * `msg.sender == deployer` and `salt[20] == 0x00`:
 * `_efficientHash(bytes32(uint256(uint160(msg.sender))), salt)` == `keccak256(abi.encode(deployer, salt))`.
 * Note: CreateX's view function `computeCreate3Address(bytes32)` does NOT apply `_guard`, so callers of
 * `computeCreate3Address(bytes32)` must pass this guarded salt, while `deployCreate3AndInit` takes the raw salt.
 */
export function guardCreateXSalt(deployer: string, salt: string): string {
  const normalizedDeployer = ethers.utils.getAddress(deployer);
  const saltPrefix = ethers.utils.getAddress(ethers.utils.hexDataSlice(salt, 0, 20));
  if (saltPrefix !== normalizedDeployer) {
    throw new Error(`CreateX salt sender prefix mismatch: expected ${normalizedDeployer}, got ${saltPrefix}`);
  }
  const redeployFlag = ethers.utils.hexDataSlice(salt, 20, 21);
  if (redeployFlag !== '0x00') {
    throw new Error(`CreateX cross-chain redeploy protection must be 0x00 for cross-chain deterministic addresses, got ${redeployFlag}`);
  }
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [normalizedDeployer, salt]),
  );
}

/**
 * Deterministically computes the CREATE3 deployment address for a sender-guarded CreateX salt.
 * Depends only on `createXAddress`, `deployer`, and `salt` (independent of chain ID and contract bytecode).
 */
export function computeCreateXCreate3Address(
  deployer: string,
  salt: string,
  createXAddress: string = CREATEX_ADDRESS,
): string {
  const guardedSalt = guardCreateXSalt(deployer, salt);
  const proxyChild = ethers.utils.getCreate2Address(createXAddress, guardedSalt, CREATE3_PROXY_INITCODE_HASH);
  return ethers.utils.getContractAddress({ from: proxyChild, nonce: 1 });
}
