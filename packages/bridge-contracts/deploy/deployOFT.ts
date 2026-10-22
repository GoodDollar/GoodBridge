/***
 * Hardhat-deploy script for GoodDollar OFT (Omnichain Fungible Token) contracts
 *
 * Deploys:
 * 1. GoodDollarOFTMinterBurner - DAO-upgradeable contract that handles minting and burning of GoodDollar tokens for OFT
 * 2. GoodDollarOFTAdapter - Upgradeable LayerZero OFT adapter that wraps GoodDollar token for cross-chain transfers
 *
 * Everything goes through CreateX (https://github.com/pcaversaccio/createx), the universal deployer
 * that sits at the same address on every chain:
 * 1. Deploy both implementations with CreateX CREATE2, salt entropy = init code hash
 *    (the adapter implementation takes chain-specific constructor args, so its address is per-chain)
 * 2. Predict both proxy addresses with CreateX CREATE3 - the address comes from (CreateX, deployer,
 *    salt label) only, so the proxies get the SAME address on every chain, and both addresses are
 *    known up front, which breaks the MinterBurner <-> adapter init cycle
 * 3. Deploy + initialize each ERC1967 proxy atomically via CreateX.deployCreate3AndInit
 *    - MinterBurner.initialize(nameService, adapter)
 *    - Adapter.initialize(token, minterBurner, deployer, Avatar as feeRecipient)
 * 4. verifyOftDeployment: impl slots, owner, token, minterBurner, feeRecipient, operators(adapter)
 *
 * Note: the deployer EOA is part of the CREATE3 salt, so every chain must be deployed from the same
 * signer to land on the same address. Run `hardhat oft:addresses` to see the addresses beforehand.
 */

import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import Contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import { getImplementationAddress } from '@openzeppelin/upgrades-core';
import { verifyContract } from './utils/verifyContract';
import { getLzEndpoint } from './utils/getLzEndpoint';
import { verifyOftDeployment } from './utils/verifyOftDeployment';
import {
  CreateXDeployment,
  computeCreate3Address,
  createXSalt,
  deployCreate2IfMissing,
  deployCreate3AndInitIfMissing,
  getCreateX,
} from './utils/createX';
import { oftProxySalts, oftSaltLabels } from './utils/oftSalts';

/// GoodProtocol's ERC1967 proxy: deployed empty, then initialized with (implementation, initData).
/// It is the proxy every other GoodDollar contract uses, and it has no constructor args, so the
/// same init code is used on every chain.
export const ERC1967_PROXY_FQN = '@gooddollar/goodprotocol/contracts/utils/ProxyFactory1967.sol:ERC1967Proxy';

const func: DeployFunction = async function (hre) {
  const { deployments, network } = hre;
  const [root] = await ethers.getSigners();

  const networkName = network.name;

  console.log('Deployment signer:', {
    networkName,
    root: root.address,
    balance: await ethers.provider.getBalance(root.address).then((_) => _.toString()),
  });

  // Get contract addresses from GoodProtocol deployment
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  if (!goodProtocolContracts) {
    throw new Error(
      `No GoodProtocol contracts found for network ${networkName}. Please check @gooddollar/goodprotocol/releases/deployment.json`,
    );
  }

  // Get token address from GoodProtocol
  const tokenAddress = goodProtocolContracts.GoodDollar;
  if (!tokenAddress) {
    throw new Error(
      `Token address not found in GoodProtocol deployment for network ${networkName}. Please deploy SuperGoodDollar or GoodDollar first.`,
    );
  }

  // Get NameService for DAO integration from GoodProtocol
  const nameServiceAddress = goodProtocolContracts.NameService;
  if (!nameServiceAddress) {
    throw new Error(
      `NameService address not found in GoodProtocol deployment for network ${networkName}. Please deploy NameService first.`,
    );
  }

  // Get Controller address directly from GoodProtocol contracts (or via NameService if needed)
  let controllerAddress = goodProtocolContracts.Controller;
  if (!controllerAddress) {
    // Fallback: try to get Controller via NameService interface
    const INameService = await ethers.getContractAt(
      '@gooddollar/goodprotocol/contracts/Interfaces.sol:INameService',
      nameServiceAddress,
    );
    controllerAddress = await INameService.getAddress('CONTROLLER');
    if (!controllerAddress || controllerAddress === ethers.constants.AddressZero) {
      throw new Error(`Controller address not found in GoodProtocol deployment for network ${networkName}`);
    }
  }

  const lzEndpoint = getLzEndpoint(networkName);

  console.log('Deployment parameters:', {
    tokenAddress,
    nameServiceAddress,
    controllerAddress,
    lzEndpoint,
    networkName,
  });

  // Get Controller and Avatar addresses (used for OFT adapter owner)
  const Controller = await ethers.getContractAt('Controller', controllerAddress);
  const avatarAddress = await Controller.avatar();

  if (!avatarAddress || avatarAddress === ethers.constants.AddressZero) {
    throw new Error(`Avatar address is invalid: ${avatarAddress}`);
  }
  console.log('✅ Verified Avatar address:', avatarAddress);

  // Reverts unless the code at the canonical CreateX address really is CreateX
  const createX = await getCreateX(root);
  console.log('Using CreateX at', createX.address);

  const minterBurnerFactory = await ethers.getContractFactory('GoodDollarOFTMinterBurner');
  const oftAdapterFactory = await ethers.getContractFactory('GoodDollarOFTAdapter');

  // Implementations: CREATE2 through CreateX, with the init code hash as salt entropy so a new
  // version (or different constructor args) maps to a different implementation address.
  const minterBurnerImplInitCode = minterBurnerFactory.getDeployTransaction().data as string;
  const oftAdapterImplInitCode = oftAdapterFactory.getDeployTransaction(tokenAddress, lzEndpoint).data as string;

  const logDeployment = (name: string, deployment: CreateXDeployment) =>
    console.log(
      `${name} ${deployment.reused ? 'already deployed' : 'deployed'}`,
      deployment.address,
      deployment.transactionHash ?? '',
    );

  const minterBurnerImpl = await deployCreate2IfMissing(
    createX,
    root.address,
    createXSalt(root.address, ethers.utils.keccak256(minterBurnerImplInitCode)),
    minterBurnerImplInitCode,
  );
  logDeployment('GoodDollarOFTMinterBurner implementation', minterBurnerImpl);
  await deployments.save('GoodDollarOFTMinterBurner_Implementation', {
    address: minterBurnerImpl.address,
    abi: (await hre.artifacts.readArtifact('GoodDollarOFTMinterBurner')).abi,
    args: [],
    transactionHash: minterBurnerImpl.transactionHash,
    receipt: minterBurnerImpl.receipt as any,
  });

  const oftAdapterImpl = await deployCreate2IfMissing(
    createX,
    root.address,
    createXSalt(root.address, ethers.utils.keccak256(oftAdapterImplInitCode)),
    oftAdapterImplInitCode,
  );
  logDeployment('GoodDollarOFTAdapter implementation', oftAdapterImpl);
  await deployments.save('GoodDollarOFTAdapter_Implementation', {
    address: oftAdapterImpl.address,
    abi: (await hre.artifacts.readArtifact('GoodDollarOFTAdapter')).abi,
    args: [tokenAddress, lzEndpoint],
    transactionHash: oftAdapterImpl.transactionHash,
    receipt: oftAdapterImpl.receipt as any,
  });

  // Proxies: CREATE3 through CreateX. The address only depends on (CreateX, deployer, salt), not on
  // the implementation address, so it is identical on every chain and known before deploying.
  const proxyArtifact = await hre.artifacts.readArtifact(ERC1967_PROXY_FQN);
  const proxyInterface = new ethers.utils.Interface(proxyArtifact.abi);
  const salts = oftProxySalts(networkName, root.address);

  const minterBurnerAddress = computeCreate3Address(root.address, salts.minterBurner);
  const oftAdapterAddress = computeCreate3Address(root.address, salts.adapter);

  const deployProxyIfMissing = async (name: string, salt: string, logic: string, initData: string) => {
    const deployment = await deployCreate3AndInitIfMissing(
      createX,
      root.address,
      salt,
      proxyArtifact.bytecode,
      proxyInterface.encodeFunctionData('initialize', [logic, initData]),
    );
    logDeployment(`${name} proxy`, deployment);
    await deployments.save(name, {
      address: deployment.address,
      abi: (await hre.artifacts.readArtifact(name)).abi,
      transactionHash: deployment.transactionHash,
      receipt: deployment.receipt as any,
      implementation: logic,
    });
    return deployment.address;
  };

  await deployProxyIfMissing(
    'GoodDollarOFTMinterBurner',
    salts.minterBurner,
    minterBurnerImpl.address,
    minterBurnerFactory.interface.encodeFunctionData('initialize', [nameServiceAddress, oftAdapterAddress]),
  );

  // Deployer owns the adapter until oft:configure hands owner + LZ delegate to the Avatar; fees go to the Avatar
  await deployProxyIfMissing(
    'GoodDollarOFTAdapter',
    salts.adapter,
    oftAdapterImpl.address,
    oftAdapterFactory.interface.encodeFunctionData('initialize', [
      tokenAddress,
      minterBurnerAddress,
      root.address,
      avatarAddress,
    ]),
  );

  await verifyOftDeployment(networkName, [root.address, avatarAddress]);

  // Verify implementations on non-local networks (skip: 'hardhat', 'localhost')
  if (!['hardhat', 'localhost'].includes(networkName)) {
    await verifyContract(hre as any, minterBurnerImpl.address, [], 'GoodDollarOFTMinterBurner');
    await verifyContract(hre as any, oftAdapterImpl.address, [tokenAddress, lzEndpoint], 'GoodDollarOFTAdapter');
  }

  const minterBurnerImplAddress = await getImplementationAddress(ethers.provider, minterBurnerAddress).catch(
    () => undefined,
  );
  const oftAdapterImplAddress = await getImplementationAddress(ethers.provider, oftAdapterAddress).catch(
    () => undefined,
  );

  const saltLabels = oftSaltLabels(networkName);

  console.log('\n=== Deployment Summary ===');
  console.log('Network:', networkName);
  console.log('Deployer (part of the CREATE3 address):', root.address);
  console.log('GoodDollarOFTMinterBurner:', minterBurnerAddress, '(upgradeable, same address on every chain)');
  console.log('  Salt label:', saltLabels.minterBurner);
  if (minterBurnerImplAddress) {
    console.log('  Implementation:', minterBurnerImplAddress);
  }
  console.log('GoodDollarOFTAdapter:', oftAdapterAddress, '(upgradeable, same address on every chain)');
  console.log('  Salt label:', saltLabels.adapter);
  if (oftAdapterImplAddress) {
    console.log('  Implementation:', oftAdapterImplAddress);
  }
  console.log('Token:', tokenAddress);
  console.log('OFT Adapter Owner (deployer, until oft:configure):', root.address);
  console.log('Fee recipient (Avatar):', avatarAddress);
  console.log('LayerZero Endpoint:', lzEndpoint);
  console.log('========================\n');
};

export default func;
func.tags = ['OFT', 'GoodDollar'];
