/***
 * Hardhat-deploy script for GoodDollar OFT (Omnichain Fungible Token) contracts
 *
 * Deploys (same pattern as MessageBridge: deterministic proxy + implementation + execute initialize):
 * 1. GoodDollarOFTMinterBurner - DAO-upgradeable contract that handles minting and burning of GoodDollar tokens for OFT
 * 2. GoodDollarOFTAdapter - Upgradeable LayerZero OFT adapter that wraps GoodDollar token for cross-chain transfers
 *
 * Steps:
 * 1. Deploy ERC1967Proxy (deterministic) for GoodDollarOFTMinterBurner, deploy implementation
 *    then execute initialize(nameService, adapter) once the adapter proxy address is known
 * 2. Deploy ERC1967Proxy (deterministic) for GoodDollarOFTAdapter, deploy implementation (constructor: token, lzEndpoint), execute initialize(token, minterBurner, owner, feeRecipient)
 *
 * Note: GoodDollarOFTMinterBurner.initialize wires the adapter as operator.
 */

import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import Contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import { getImplementationAddress } from '@openzeppelin/upgrades-core';
import { verifyContract } from './utils/verifyContract';

// Network-specific LayerZero endpoints
const lzEndpoints: { [key: string]: string } = {
  'development-celo': '0x1a44076050125825900e736c501f859c50fE728c',
  'production-celo': '0x1a44076050125825900e736c501f859c50fE728c',
  'development-xdc': '0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa',
  'production-xdc': '0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa',
};

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

  // Get LayerZero endpoint
  const lzEndpoint = lzEndpoints[networkName] || process.env.LAYERZERO_ENDPOINT;
  if (!lzEndpoint) {
    throw new Error(
      `LayerZero endpoint not found. Please set LAYERZERO_ENDPOINT environment variable or add default for network ${networkName}`,
    );
  }

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

  let isDevelopment = false;
  if (network.name.includes('development')) {
    isDevelopment = true;
  }

  // CREATE2 salt for implementations:
  // hardhat-deploy uses `deterministicDeployment` as the CREATE2 salt.
  // We derive it from the contract's compiled bytecode so version changes
  // map to different deterministic implementation addresses.
  const minterBurnerArtifact = await hre.artifacts.readArtifact('GoodDollarOFTMinterBurner');
  const minterBurnerImplSalt = ethers.utils.keccak256(minterBurnerArtifact.bytecode);
  const oftAdapterArtifact = await hre.artifacts.readArtifact('GoodDollarOFTAdapter');
  const oftAdapterImplSalt = ethers.utils.keccak256(oftAdapterArtifact.bytecode);

  // --- GoodDollarOFTMinterBurner (hardhat-deploy: deterministic proxy + implementation + execute initialize) ---
  const minterBurnerProxySalt = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(
      isDevelopment ? 'Development-GoodDollarOFTMinterBurnerV1' : 'Production-GoodDollarOFTMinterBurnerV1'
    ),
  );
  const minterBurnerProxyDeploy = await deployments.deterministic('GoodDollarOFTMinterBurner', {
    contract: 'ERC1967Proxy',
    from: root.address,
    salt: minterBurnerProxySalt,
    log: true,
  });
  const minterBurnerProxy = await minterBurnerProxyDeploy.deploy();
  const minterBurnerAddress = minterBurnerProxy.address;
  console.log('GoodDollarOFTMinterBurner proxy', minterBurnerAddress);

  const minterBurnerImpl = await deployments.deploy('GoodDollarOFTMinterBurner_Implementation', {
    contract: 'GoodDollarOFTMinterBurner',
    from: root.address,
    deterministicDeployment: minterBurnerImplSalt,
    log: true,
  });
  console.log('GoodDollarOFTMinterBurner implementation', minterBurnerImpl.address);

  const minterBurnerContract = await ethers.getContractAt('GoodDollarOFTMinterBurner', minterBurnerAddress);
  const minterBurnerInitialized = await minterBurnerContract
    .token()
    .then((addr: string) => addr !== ethers.constants.AddressZero)
    .catch(() => false);

  if (!minterBurnerInitialized) {
    console.log('GoodDollarOFTMinterBurner not initialized yet; will initialize after deploying adapter...');
  } else {
    console.log('GoodDollarOFTMinterBurner already initialized');
  }

  // Verify GoodDollarOFTMinterBurner implementation (no constructor args) on non-local networks (skip: 'hardhat', 'localhost')
  if (!['hardhat', 'localhost'].includes(networkName)) {
    await verifyContract(hre as any, minterBurnerImpl.address, [], 'GoodDollarOFTMinterBurner');
  }

  // --- GoodDollarOFTAdapter (hardhat-deploy: deterministic proxy + implementation with constructor + execute initialize) ---
  const oftAdapterProxySalt = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(isDevelopment ? 'Development-GoodDollarOFTAdapterV1' : 'Production-GoodDollarOFTAdapterV1'),
  );
  const oftAdapterProxyDeploy = await deployments.deterministic('GoodDollarOFTAdapter', {
    contract: 'ERC1967Proxy',
    from: root.address,
    salt: oftAdapterProxySalt,
    log: true,
  });
  const oftAdapterProxy = await oftAdapterProxyDeploy.deploy();
  const oftAdapterAddress = oftAdapterProxy.address;
  console.log('GoodDollarOFTAdapter proxy', oftAdapterAddress);

  // Initialize minter/burner after we know the adapter address
  if (!minterBurnerInitialized) {
    console.log('Initializing GoodDollarOFTMinterBurner with adapter address...');
    const minterBurnerInitData = minterBurnerContract.interface.encodeFunctionData('initialize', [
      nameServiceAddress,
      oftAdapterAddress,
    ]);
    await deployments.execute(
      'GoodDollarOFTMinterBurner',
      { from: root.address },
      'initialize',
      minterBurnerImpl.address,
      minterBurnerInitData,
    );
    console.log('GoodDollarOFTMinterBurner initialized');
  }

  const oftAdapterImpl = await deployments.deploy('GoodDollarOFTAdapter_Implementation', {
    contract: 'GoodDollarOFTAdapter',
    from: root.address,
    deterministicDeployment: oftAdapterImplSalt,
    log: true,
    args: [tokenAddress, lzEndpoint],
  });
  console.log('GoodDollarOFTAdapter implementation', oftAdapterImpl.address);

  const oftAdapterContract = await ethers.getContractAt('GoodDollarOFTAdapter', oftAdapterAddress);
  const oftAdapterInitialized = await oftAdapterContract
    .minterBurner()
    .then((addr: string) => addr !== ethers.constants.AddressZero)
    .catch(() => false);

  if (!oftAdapterInitialized) {
    console.log('Initializing GoodDollarOFTAdapter...');
    const oftAdapterInitData = oftAdapterContract.interface.encodeFunctionData('initialize', [
      tokenAddress,
      minterBurnerAddress,
      root.address,
      avatarAddress,
    ]);
    await deployments.execute(
      'GoodDollarOFTAdapter',
      { from: root.address },
      'initialize',
      oftAdapterImpl.address,
      oftAdapterInitData,
    );
    console.log('GoodDollarOFTAdapter initialized');
    console.log('Fee recipient:', avatarAddress);
  } else {
    console.log('GoodDollarOFTAdapter already initialized');
  }

  // Verify GoodDollarOFTAdapter implementation (constructor: tokenAddress, lzEndpoint) on non-local networks (skip: 'hardhat', 'localhost')
  if (!['hardhat', 'localhost'].includes(networkName)) {
    await verifyContract(hre as any, oftAdapterImpl.address, [tokenAddress, lzEndpoint], 'GoodDollarOFTAdapter');
  }

  const minterBurnerImplAddress = await getImplementationAddress(ethers.provider, minterBurnerAddress).catch(
    () => undefined,
  );
  const oftAdapterImplAddress = await getImplementationAddress(ethers.provider, oftAdapterAddress).catch(
    () => undefined,
  );

  console.log('\n=== Deployment Summary ===');
  console.log('Network:', networkName);
  console.log('GoodDollarOFTMinterBurner:', minterBurnerAddress, '(upgradeable)');
  if (minterBurnerImplAddress) {
    console.log('  Implementation:', minterBurnerImplAddress);
  }
  console.log('GoodDollarOFTAdapter:', oftAdapterAddress, '(upgradeable)');
  if (oftAdapterImplAddress) {
    console.log('  Implementation:', oftAdapterImplAddress);
  }
  console.log('Token:', tokenAddress);
  console.log('OFT Adapter Owner (Avatar):', avatarAddress);
  console.log('LayerZero Endpoint:', lzEndpoint);
  console.log('========================\n');
};

export default func;
func.tags = ['OFT', 'GoodDollar'];
