/***
 * Hardhat-deploy script for GoodDollar OFT (Omnichain Fungible Token) contracts
 *
 * Deploys:
 * 1. GoodDollarOFTMinterBurner - DAO-upgradeable contract that handles minting and burning of GoodDollar tokens for OFT
 * 2. GoodDollarOFTAdapter - Upgradeable LayerZero OFT adapter that wraps GoodDollar token for cross-chain transfers
 *
 * Steps:
 * 1. Deploy both implementations (deterministic, salt = bytecode hash)
 * 2. Predict both proxy addresses via CreateX.computeCreate3Address(guardedSalt)
 * 3. Deploy + initialize each proxy atomically via CreateX.deployCreate3AndInit(salt, proxyBytecode, initCallData, values)
 *    - MinterBurner.initialize(nameService, adapter)
 *    - Adapter.initialize(token, minterBurner, deployer, Avatar as feeRecipient)
 * 4. verifyOftDeployment: impl slots, owner, token, minterBurner, feeRecipient, operators(adapter)
 *
 * Note: CreateX is deployed at 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed across all chains,
 * so sender-guarded CREATE3 salts produce identical deterministic proxy addresses on every chain.
 */

import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import Contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import { getImplementationAddress } from '@openzeppelin/upgrades-core';
import { verifyContract } from './utils/verifyContract';
import { getLzEndpoint } from './utils/getLzEndpoint';
import { verifyOftDeployment } from './utils/verifyOftDeployment';
import { CREATEX_ABI, CREATEX_ADDRESS, buildCreateXSalt, guardCreateXSalt } from './utils/createX';

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

  // CreateX deploys and initializes ERC1967Proxy in one tx via CREATE3, with a salt bound to the deployer
  // (no init front-running) and cross-chain protection disabled (0x00 flag) so proxy addresses match across chains.
  if ((await ethers.provider.getCode(CREATEX_ADDRESS)) === '0x') {
    throw new Error(`CreateX not deployed at ${CREATEX_ADDRESS} on network ${networkName}`);
  }
  const createX = await ethers.getContractAt(CREATEX_ABI, CREATEX_ADDRESS);
  const proxyArtifact = await hre.artifacts.readArtifact(
    '@gooddollar/goodprotocol/contracts/utils/ProxyFactory1967.sol:ERC1967Proxy',
  );
  const proxyInterface = new ethers.utils.Interface(proxyArtifact.abi);

  const envPrefix = isDevelopment ? 'Development' : 'Production';
  const minterBurnerProxySalt = buildCreateXSalt(root.address, `${envPrefix}-GoodDollarOFTMinterBurnerV1`);
  const oftAdapterProxySalt = buildCreateXSalt(root.address, `${envPrefix}-GoodDollarOFTAdapterV1`);
  // Both proxy addresses are known before deployment, which breaks the MinterBurner <-> adapter init cycle
  const minterBurnerAddress: string = await createX['computeCreate3Address(bytes32)'](
    guardCreateXSalt(root.address, minterBurnerProxySalt),
  );
  const oftAdapterAddress: string = await createX['computeCreate3Address(bytes32)'](
    guardCreateXSalt(root.address, oftAdapterProxySalt),
  );

  const deployProxyIfMissing = async (name: string, address: string, salt: string, logic: string, initData: string) => {
    if ((await ethers.provider.getCode(address)) !== '0x') {
      console.log(`${name} proxy already deployed`, address);
    } else {
      const proxyInitCall = proxyInterface.encodeFunctionData('initialize', [logic, initData]);
      const tx = await createX.deployCreate3AndInit(salt, proxyArtifact.bytecode, proxyInitCall, {
        constructorAmount: 0,
        initCallAmount: 0,
      });
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
