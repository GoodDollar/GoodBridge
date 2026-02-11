/***
 * Hardhat-deploy script for GoodDollar OFT (Omnichain Fungible Token) contracts
 * 
 * Deploys:
 * 1. GoodDollarMinterBurner - DAO-upgradeable contract that handles minting and burning of GoodDollar tokens for OFT
 * 2. GoodDollarOFTAdapter - Upgradeable LayerZero OFT adapter that wraps GoodDollar token for cross-chain transfers
 * 
 * Steps:
 * 1. Deploy GoodDollarMinterBurner as upgradeable proxy with NameService
 * 2. Deploy GoodDollarOFTAdapter as upgradeable proxy with constructor(token, lzEndpoint), then initialize(token, minterBurner, lzEndpoint, owner, feeRecipient)
 * 
 * Note: Setting OFT adapter as operator on GoodDollarMinterBurner must be done separately via DAO governance
 */

import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import Contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import fse from 'fs-extra';
import release from '../release/deployment-oft.json';
import { getImplementationAddress } from '@openzeppelin/upgrades-core';
import { verifyContract } from './utils/verifyContract';

// Network-specific LayerZero endpoints
const lzEndpoints: { [key: string]: string } = {
  'development-celo': '0x1a44076050125825900e736c501f859c50fE728c',
  'production-celo': '0x1a44076050125825900e736c501f859c50fE728c',
  'development-xdc': '0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa',
  'production-xdc': '0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa',
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
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

  // Get current deployment state
  const currentRelease = release[networkName] || {};

  // Deploy GoodDollarMinterBurner (upgradeable)
  let minterBurnerAddress: string;
  let minterBurnerImplAddress: string | undefined;
  if (!currentRelease.GoodDollarMinterBurner) {
    console.log('Deploying GoodDollarMinterBurner as upgradeable contract...');
    const MinterBurnerFactory = await ethers.getContractFactory('GoodDollarMinterBurner');
    const MinterBurner = await upgrades.deployProxy(MinterBurnerFactory, [nameServiceAddress], {
      kind: 'uups',
      initializer: 'initialize',
    });
    await MinterBurner.deployed();
    minterBurnerAddress = MinterBurner.address;
    console.log('GoodDollarMinterBurner deployed to:', minterBurnerAddress);

    // Get implementation address for verification
    minterBurnerImplAddress = await getImplementationAddress(ethers.provider, minterBurnerAddress);
    console.log('GoodDollarMinterBurner implementation address:', minterBurnerImplAddress);

    // Save to hardhat-deploy
    await deployments.save('GoodDollarMinterBurner', {
      address: minterBurnerAddress,
      abi: MinterBurnerFactory.interface.format(ethers.utils.FormatTypes.json) as any,
    });

    // Update release file
    if (!release[networkName]) {
      release[networkName] = {};
    }
    release[networkName].GoodDollarMinterBurner = minterBurnerAddress;
    await fse.writeJSON('release/deployment-oft.json', release, { spaces: 2 });

    // Verify GoodDollarMinterBurner implementation
    // No constructor args - initialized via initialize() function
    await verifyContract(hre, minterBurnerImplAddress, [], 'GoodDollarMinterBurner');
  } else {
    minterBurnerAddress = currentRelease.GoodDollarMinterBurner;
    console.log('GoodDollarMinterBurner already deployed at:', minterBurnerAddress);
    // Get implementation address even if already deployed (for verification if needed)
    try {
      minterBurnerImplAddress = await getImplementationAddress(ethers.provider, minterBurnerAddress);
      console.log('GoodDollarMinterBurner implementation address:', minterBurnerImplAddress);
      await verifyContract(hre, minterBurnerImplAddress, [], 'GoodDollarMinterBurner');
      console.log('GoodDollarMinterBurner verified successfully');
    } catch (error) {
      console.log('⚠️  Could not get implementation address for GoodDollarMinterBurner');
    }
  }

  // Deploy GoodDollarOFTAdapter (upgradeable via proxy)
  // Constructor takes (token, lzEndpoint) - initialize() is called automatically by proxy
  let oftAdapterAddress: string;
  let oftAdapterImplAddress: string | undefined;
  if (!currentRelease.GoodDollarOFTAdapter) {
    console.log('Deploying GoodDollarOFTAdapter as upgradeable proxy...');
    console.log('Constructor parameters: token, lzEndpoint');
    console.log('Initialize parameters: token, minterBurner, owner, feeRecipient');

    const OFTAdapterFactory = await ethers.getContractFactory('GoodDollarOFTAdapter');

    // Create UUPS proxy with constructor args and initialize
    console.log('Deploying proxy and initializing...');
    const OFTAdapter = await upgrades.deployProxy(
      OFTAdapterFactory,
      [tokenAddress, minterBurnerAddress, root.address, root.address],
      {
        kind: 'uups',
        initializer: 'initialize',
        unsafeAllow: ['constructor', 'state-variable-immutable', 'duplicate-initializer-call'],
        constructorArgs: [tokenAddress, lzEndpoint],
      },
    );
    await OFTAdapter.deployed();
    oftAdapterAddress = OFTAdapter.address;
    console.log('✅ GoodDollarOFTAdapter proxy deployed to:', oftAdapterAddress);
    console.log('Fee recipient:', root.address);

    // Get implementation address for verification
    oftAdapterImplAddress = await getImplementationAddress(ethers.provider, oftAdapterAddress);
    console.log('GoodDollarOFTAdapter implementation address:', oftAdapterImplAddress);

    // Save to hardhat-deploy
    await deployments.save('GoodDollarOFTAdapter', {
      address: oftAdapterAddress,
      abi: OFTAdapterFactory.interface.format(ethers.utils.FormatTypes.json) as any,
    });

    // Update release file
    release[networkName].GoodDollarOFTAdapter = oftAdapterAddress;
    await fse.writeJSON('release/deployment-oft.json', release, { spaces: 2 });

    // Verify GoodDollarOFTAdapter implementation
    // Constructor args: tokenAddress, lzEndpoint
    await verifyContract(
      hre,
      oftAdapterImplAddress,
      [tokenAddress, lzEndpoint],
      'GoodDollarOFTAdapter',
    );
  } else {
    oftAdapterAddress = currentRelease.GoodDollarOFTAdapter;
    console.log('GoodDollarOFTAdapter already deployed at:', oftAdapterAddress);
    // Get implementation address even if already deployed (for verification if needed)
    try {
      oftAdapterImplAddress = await getImplementationAddress(ethers.provider, oftAdapterAddress);
      console.log('GoodDollarOFTAdapter implementation address:', oftAdapterImplAddress);
      await verifyContract(
        hre,
        oftAdapterImplAddress,
        [tokenAddress, lzEndpoint],
        'GoodDollarOFTAdapter',
      );
      console.log('GoodDollarOFTAdapter verified successfully');
    } catch (error) {
      console.log('⚠️  Could not get implementation address for GoodDollarOFTAdapter');
    }
  }

  console.log('\n=== Deployment Summary ===');
  console.log('Network:', networkName);
  console.log('GoodDollarMinterBurner:', minterBurnerAddress, '(upgradeable)');
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

