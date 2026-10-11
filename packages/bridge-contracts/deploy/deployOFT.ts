/***
 * Hardhat-deploy script for GoodDollar OFT (Omnichain Fungible Token) contracts
 *
 * Deploys:
 * 1. GoodDollarOFTMinterBurner - DAO-upgradeable contract that handles minting and burning of GoodDollar tokens for OFT
 * 2. GoodDollarOFTAdapter - Upgradeable LayerZero OFT adapter that wraps GoodDollar token for cross-chain transfers
 *
 * Steps:
 * 1. Deploy both implementations (deterministic, salt = bytecode hash)
 * 2. Predict both proxy addresses via GoodProtocol ProxyFactory1967.getDeploymentAddress(salt, deployer)
 * 3. Deploy + initialize each proxy atomically via ProxyFactory1967.deployProxy(salt, impl, initData)
 *    - MinterBurner.initialize(nameService, adapter)
 *    - Adapter.initialize(token, minterBurner, deployer, Avatar as feeRecipient)
 * 4. verifyOftDeployment: impl slots, owner, token, minterBurner, feeRecipient, operators(adapter)
 *
 * Note: proxy addresses depend on the per-chain ProxyFactory address, so they differ between chains.
 */

import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import Contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import { getImplementationAddress } from '@openzeppelin/upgrades-core';
import { verifyContract } from './utils/verifyContract';
import { getLzEndpoint } from './utils/getLzEndpoint';
import { verifyOftDeployment } from './utils/verifyOftDeployment';

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

  const minterBurnerImpl = await deployments.deploy('GoodDollarOFTMinterBurner_Implementation', {
    contract: 'GoodDollarOFTMinterBurner',
    from: root.address,
    deterministicDeployment: minterBurnerImplSalt,
    log: true,
  });
  console.log('GoodDollarOFTMinterBurner implementation', minterBurnerImpl.address);

  const oftAdapterImpl = await deployments.deploy('GoodDollarOFTAdapter_Implementation', {
    contract: 'GoodDollarOFTAdapter',
    from: root.address,
    deterministicDeployment: oftAdapterImplSalt,
    log: true,
    args: [tokenAddress, lzEndpoint],
  });
  console.log('GoodDollarOFTAdapter implementation', oftAdapterImpl.address);

  // ProxyFactory1967 deploys and initializes in one tx, with a CREATE2 salt bound to the deployer (no init front-running)
  const proxyFactoryAddress = goodProtocolContracts.ProxyFactory;
  if (!proxyFactoryAddress) {
    throw new Error(`ProxyFactory address not found in GoodProtocol deployment for network ${networkName}`);
  }
  const proxyFactory = await ethers.getContractAt(
    [
      'function deployProxy(uint256 _salt, address _logic, bytes _data) returns (address)',
      'function getDeploymentAddress(uint256 _salt, address _sender) view returns (address)',
    ],
    proxyFactoryAddress,
  );

  const envPrefix = isDevelopment ? 'Development' : 'Production';
  const minterBurnerProxySalt = ethers.BigNumber.from(
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${envPrefix}-GoodDollarOFTMinterBurnerV1`)),
  );
  const oftAdapterProxySalt = ethers.BigNumber.from(
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`${envPrefix}-GoodDollarOFTAdapterV1`)),
  );
  // Both proxy addresses are known before deployment, which breaks the MinterBurner <-> adapter init cycle
  const minterBurnerAddress: string = await proxyFactory.getDeploymentAddress(minterBurnerProxySalt, root.address);
  const oftAdapterAddress: string = await proxyFactory.getDeploymentAddress(oftAdapterProxySalt, root.address);

  const deployProxyIfMissing = async (name: string, address: string, salt: BigNumber, logic: string, initData: string) => {
    if ((await ethers.provider.getCode(address)) !== '0x') {
      console.log(`${name} proxy already deployed`, address);
    } else {
      const tx = await proxyFactory.deployProxy(salt, logic, initData);
      await tx.wait();
      console.log(`${name} proxy deployed and initialized`, address, tx.hash);
    }
    await deployments.save(name, { address, abi: (await hre.artifacts.readArtifact(name)).abi });
  };

  const minterBurnerInterface = (await ethers.getContractFactory('GoodDollarOFTMinterBurner')).interface;
  await deployProxyIfMissing(
    'GoodDollarOFTMinterBurner',
    minterBurnerAddress,
    minterBurnerProxySalt,
    minterBurnerImpl.address,
    minterBurnerInterface.encodeFunctionData('initialize', [nameServiceAddress, oftAdapterAddress]),
  );

  // Deployer owns the adapter until oft:configure hands owner + LZ delegate to the Avatar; fees go to the Avatar
  const oftAdapterInterface = (await ethers.getContractFactory('GoodDollarOFTAdapter')).interface;
  await deployProxyIfMissing(
    'GoodDollarOFTAdapter',
    oftAdapterAddress,
    oftAdapterProxySalt,
    oftAdapterImpl.address,
    oftAdapterInterface.encodeFunctionData('initialize', [
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
  console.log('OFT Adapter Owner (deployer, until oft:configure):', root.address);
  console.log('Fee recipient (Avatar):', avatarAddress);
  console.log('LayerZero Endpoint:', lzEndpoint);
  console.log('========================\n');
};

export default func;
func.tags = ['OFT', 'GoodDollar'];
