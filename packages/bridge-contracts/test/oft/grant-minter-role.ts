/***
 * Script to grant MINTER_ROLE to GoodDollarMinterBurner contract on development-celo
 * Uses genericCall through Avatar/Controller to execute the transaction
 * 
 * Usage:
 *   npx hardhat run test/oft/grant-minter-role.ts --network development-celo
 * 
 * Note: This script must be run by a guardian or address with permissions to execute via Controller
 */

import { network, ethers } from "hardhat";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import release from "../../release/deployment-oft.json";

const main = async () => {
  const networkName = network.name;
  const [signer] = await ethers.getSigners();

  console.log("=== Grant MINTER_ROLE to GoodDollarMinterBurner ===");
  console.log("Network:", networkName);
  console.log("Signer:", signer.address);
  
  // Derive native token name from network
  const nativeTokenName = networkName.includes("celo") ? "CELO" : networkName.includes("xdc") ? "XDC" : "native token";
  console.log("Signer balance:", ethers.utils.formatEther(await ethers.provider.getBalance(signer.address)), nativeTokenName);

  // Get deployment info from GoodProtocol and GoodBridge
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  if (!goodProtocolContracts) {
    throw new Error(`No GoodProtocol contracts found for network: ${networkName}`);
  }

  const currentRelease = release[networkName] || {};
  const tokenAddress = goodProtocolContracts.GoodDollar || goodProtocolContracts.SuperGoodDollar;
  const minterBurnerAddress = currentRelease.GoodDollarMinterBurner;
  const controllerAddress = goodProtocolContracts.Controller;
  const avatarAddress = goodProtocolContracts.Avatar;

  if (!tokenAddress) {
    throw new Error(`GoodDollar token not found in GoodProtocol deployment.json for ${networkName}`);
  }

  if (!minterBurnerAddress) {
    throw new Error(`GoodDollarMinterBurner not found in deployment-oft.json for ${networkName}`);
  }

  if (!controllerAddress) {
    throw new Error(`Controller not found in GoodProtocol deployment.json for ${networkName}`);
  }

  if (!avatarAddress) {
    throw new Error(`Avatar not found in GoodProtocol deployment.json for ${networkName}`);
  }

  console.log("\nContract addresses:");
  console.log("GoodDollar token:", tokenAddress);
  console.log("GoodDollarMinterBurner:", minterBurnerAddress);
  console.log("Controller:", controllerAddress);
  console.log("Avatar:", avatarAddress);

  // Get token contract to check current status
  // Use the local interface file
  const token = await ethers.getContractAt(
    "contracts/oft/interfaces/ISuperGoodDollar.sol:ISuperGoodDollar",
    tokenAddress
  );
  
  // Check if MinterBurner already has minter role
  const isMinter = await token.isMinter(minterBurnerAddress);
  console.log("\nCurrent status:");
  console.log("MinterBurner has MINTER_ROLE:", isMinter);

  if (isMinter) {
    console.log("\n✅ GoodDollarMinterBurner already has MINTER_ROLE. No action needed.");
    return;
  }

  // Prepare the generic call through Avatar
  // Function signature: addMinter(address)
  const functionSignature = "addMinter(address)";
  
  // Encode the function input (minterBurnerAddress)
  const abiCoder = ethers.utils.defaultAbiCoder;
  const functionInputs = abiCoder.encode(["address"], [minterBurnerAddress]);

  console.log("\nPreparing generic call:");
  console.log("Function:", functionSignature);
  console.log("Target contract:", tokenAddress);
  console.log("Parameter (minterBurner):", minterBurnerAddress);

  // Execute via Controller/Avatar
  try {
    console.log("\nExecuting via Controller/Avatar...");
    const Controller = await ethers.getContractAt("Controller", controllerAddress);
    
    // Use genericCall to execute through Avatar
    // Encode the function call: function selector + parameters
    const functionSelector = ethers.utils.id(functionSignature).slice(0, 10);
    const encodedCall = ethers.utils.hexConcat([functionSelector, functionInputs]);
    
    const tx = await Controller.genericCall(
      tokenAddress,
      encodedCall,
      avatarAddress,
      0
    );
    await tx.wait();
    console.log("Transaction hash:", tx.hash);

    // Verify the role was granted
    console.log("\nVerifying role was granted...");
    const isMinterAfter = await token.isMinter(minterBurnerAddress);
    console.log("MinterBurner has MINTER_ROLE:", isMinterAfter);

    if (isMinterAfter) {
      console.log("\n✅ Successfully granted MINTER_ROLE to GoodDollarMinterBurner via Avatar!");
    } else {
      console.log("\n⚠️  Warning: MINTER_ROLE was not granted. Please check the transaction.");
    }

  } catch (error: any) {
    console.error("\n❌ Error granting MINTER_ROLE:");
    if (error.message) {
      console.error("Error message:", error.message);
    }
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
    throw error;
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
