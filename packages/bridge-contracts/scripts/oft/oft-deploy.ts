/***
 * Deployment script for GoodDollar OFT (Omnichain Fungible Token) contracts
 * 
 * Deploys:
 * 1. GoodDollarMinterBurner - DAO-upgradeable contract that handles minting and burning of GoodDollar tokens for OFT
 * 2. GoodDollarOFTAdapter - Upgradeable LayerZero OFT adapter that wraps GoodDollar token for cross-chain transfers
 * 
 * Steps:
 * 1. Deploy GoodDollarMinterBurner as upgradeable proxy with token address and NameService
 * 2. Deploy GoodDollarOFTAdapter as upgradeable proxy with constructor(token, lzEndpoint), then initialize(token, minterBurner, lzEndpoint, owner, feeRecipient, nameService)
 * 3. Set OFT adapter as operator on GoodDollarMinterBurner via DAO
 */

import { network, ethers, upgrades } from "hardhat";
import { Contract } from "ethers";
import fse from "fs-extra";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import release from "../../release/deployment.json";

const { name: networkName } = network;

export const deployOFTContracts = async () => {
  const [root] = await ethers.getSigners();

  console.log("got signers:", {
    networkName,
    root: root.address,
    balance: await ethers.provider.getBalance(root.address).then(_ => _.toString())
  });

  // Get contract addresses from GoodProtocol deployment
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  if (!goodProtocolContracts) {
    throw new Error(`No GoodProtocol contracts found for network ${networkName}. Please check @gooddollar/goodprotocol/releases/deployment.json`);
  }

  // Get token address from GoodProtocol
  const tokenAddress = goodProtocolContracts.GoodDollar || goodProtocolContracts.SuperGoodDollar;
  if (!tokenAddress) {
    throw new Error(`Token address not found in GoodProtocol deployment for network ${networkName}. Please deploy SuperGoodDollar or GoodDollar first.`);
  }

  // Get NameService for DAO integration from GoodProtocol
  const nameServiceAddress = goodProtocolContracts.NameService;
  if (!nameServiceAddress) {
    throw new Error(`NameService address not found in GoodProtocol deployment for network ${networkName}. Please deploy NameService first.`);
  }

  // Get Controller address directly from GoodProtocol contracts (or via NameService if needed)
  let controllerAddress = goodProtocolContracts.Controller;
  if (!controllerAddress) {
    // Fallback: try to get Controller via NameService interface
    // Use the interface path suggested by Hardhat error message
    const INameService = await ethers.getContractAt("@gooddollar/goodprotocol/contracts/Interfaces.sol:INameService", nameServiceAddress);
    controllerAddress = await INameService.getAddress("CONTROLLER");
    if (!controllerAddress || controllerAddress === ethers.constants.AddressZero) {
      throw new Error(`Controller address not found in GoodProtocol deployment for network ${networkName}`);
    }
  }

  // Network-specific defaults (can be overridden via env var)
  const lzEndpoints: { [key: string]: string } = {
    "development-celo": "0x1a44076050125825900e736c501f859c50fE728c",
    "production-celo": "0x1a44076050125825900e736c501f859c50fE728c",
    "development-xdc": "0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa",
    "production-xdc": "0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa",
  };
  const lzEndpoint = lzEndpoints[networkName];
  if (!lzEndpoint) {
    throw new Error(`LayerZero endpoint not found. Please set LAYERZERO_ENDPOINT environment variable or add default for network ${networkName}`);
  }

  console.log("Deployment parameters:", {
    tokenAddress,
    lzEndpoint,
    networkName
  });

  // Get current deployment state
  const currentRelease = release[networkName] || {};

  // Deploy GoodDollarMinterBurner (upgradeable)
  let MinterBurner: Contract;
  if (!currentRelease.GoodDollarMinterBurner) {
    console.log("Deploying GoodDollarMinterBurner as upgradeable contract...");
    const MinterBurnerFactory = await ethers.getContractFactory("GoodDollarMinterBurner");
    MinterBurner = await upgrades.deployProxy(
      MinterBurnerFactory,
      [tokenAddress, nameServiceAddress],
      { kind: "uups", initializer: "initialize" }
    );
    await MinterBurner.deployed();
    console.log("GoodDollarMinterBurner deployed to:", MinterBurner.address);

    // Update release file
    if (!release[networkName]) {
      release[networkName] = {};
    }
    release[networkName].GoodDollarMinterBurner = MinterBurner.address;
    await fse.writeJSON("release/deployment.json", release, { spaces: 2 });
  } else {
    console.log("GoodDollarMinterBurner already deployed at:", currentRelease.GoodDollarMinterBurner);
    MinterBurner = await ethers.getContractAt("GoodDollarMinterBurner", currentRelease.GoodDollarMinterBurner);
  }

  // Get Controller and Avatar addresses (used for OFT adapter owner and operator setup)
  const Controller = await ethers.getContractAt("Controller", controllerAddress);
  const avatarAddress = await Controller.avatar();

  // Get fee recipient (can be Avatar or address(0) to disable fees)
  // Default to Avatar, but can be overridden via environment variable
  const feeRecipient = process.env.OFT_FEE_RECIPIENT || avatarAddress || ethers.constants.AddressZero;

  // Deploy GoodDollarOFTAdapter (upgradeable via proxy)
  // Constructor takes (token, lzEndpoint) - initialize() is called automatically by proxy
  let OFTAdapter: Contract;
  if (!currentRelease.GoodDollarOFTAdapter) {
    console.log("Deploying GoodDollarOFTAdapter as upgradeable proxy...");
    console.log("Constructor parameters: token, lzEndpoint");
    console.log("Initialize parameters: token, minterBurner, lzEndpoint, owner, feeRecipient, nameService");
    
    const OFTAdapterFactory = await ethers.getContractFactory("GoodDollarOFTAdapter");
    
    if (!avatarAddress || avatarAddress === ethers.constants.AddressZero) {
      throw new Error(`Avatar address is invalid: ${avatarAddress}`);
    }
    console.log("✅ Verified Avatar address:", avatarAddress);
    
    // Encode the initialize function call
    const initializeInterface = OFTAdapterFactory.interface;
    const initializeData = initializeInterface.encodeFunctionData("initialize", [
      tokenAddress,
      MinterBurner.address,
      lzEndpoint,
      avatarAddress,
      feeRecipient,
      nameServiceAddress
    ]);
    
    console.log("Initialize parameters:", {
      token: tokenAddress,
      minterBurner: MinterBurner.address,
      lzEndpoint,
      owner: avatarAddress,
      feeRecipient,
      nameService: nameServiceAddress
    });
    
    // Create UUPS proxy manually using OpenZeppelin's ERC1967Proxy
    // This follows the same pattern as upgrades.deployProxy but bypasses validation
    console.log("Deploying proxy and initializing...");
    OFTAdapter = await upgrades.deployProxy(
      OFTAdapterFactory, 
      [
        tokenAddress, 
        MinterBurner.address,
        lzEndpoint,
        root.address,
        feeRecipient,
        nameServiceAddress
      ], 
      { 
        kind: "uups", 
        initializer: "initialize", 
        unsafeAllow: ["constructor", "state-variable-immutable", "missing-initializer-call", "duplicate-initializer-call"],
        constructorArgs: [tokenAddress, lzEndpoint]
      }
    );
    await OFTAdapter.deployed();
    console.log("✅ GoodDollarOFTAdapter proxy deployed to:", OFTAdapter.address);
    
    // Update release file
    release[networkName].GoodDollarOFTAdapter = OFTAdapter.address;
    await fse.writeJSON("release/deployment.json", release, { spaces: 2 });
    
    console.log("Fee recipient:", feeRecipient);
  } else {
    console.log("GoodDollarOFTAdapter already deployed at:", currentRelease.GoodDollarOFTAdapter);
    OFTAdapter = await ethers.getContractAt("GoodDollarOFTAdapter", currentRelease.GoodDollarOFTAdapter);
  }

  // Set OFT adapter as operator on MinterBurner if not already set
  // This must be done via DAO governance since MinterBurner is DAO-controlled
  const isOperator = await MinterBurner.operators(OFTAdapter.address);
  
  if (!isOperator) {
    console.log("Setting OFT adapter as operator on MinterBurner via DAO...");
    console.log(`  MinterBurner address: ${MinterBurner.address}`);
    console.log(`  OFTAdapter address: ${OFTAdapter.address}`);
    
    // Encode the setOperator function call
    const setOperatorEncoded = MinterBurner.interface.encodeFunctionData("setOperator", [
      OFTAdapter.address,
      true
    ]);
    
    // Execute via Controller/Avatar
    try {
      const tx = await Controller.genericCall(
        MinterBurner.address,
        setOperatorEncoded,
        avatarAddress,
        0
      );
      await tx.wait();
      console.log("✅ Successfully set OFT adapter as operator on MinterBurner");
      console.log("Transaction hash:", tx.hash);
      
      // Verify it was set
      const isOperatorAfter = await MinterBurner.operators(OFTAdapter.address);
      if (isOperatorAfter) {
        console.log("✅ Verified: OFT adapter is now an operator");
      } else {
        console.log("⚠️  Warning: Operator status not set. Please check the transaction.");
      }
    } catch (error: any) {
      console.error("❌ Error setting operator:");
      if (error.message) {
        console.error("Error message:", error.message);
      }
      if (error.reason) {
        console.error("Reason:", error.reason);
      }
      throw error;
    }
  } else {
    console.log("OFT adapter is already an operator on MinterBurner");
  }

  console.log("\n=== Deployment Summary ===");
  console.log("Network:", networkName);
  console.log("GoodDollarMinterBurner:", MinterBurner.address, "(upgradeable)");
  console.log("GoodDollarOFTAdapter:", OFTAdapter.address, "(upgradeable)");
  console.log("Token:", tokenAddress);
  console.log("OFT Adapter Owner (Avatar):", avatarAddress);
  console.log("LayerZero Endpoint:", lzEndpoint);
  console.log("========================\n");

  return {
    MinterBurner: MinterBurner.address,
    OFTAdapter: OFTAdapter.address
  };
};

export const main = async () => {
  await deployOFTContracts();
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

