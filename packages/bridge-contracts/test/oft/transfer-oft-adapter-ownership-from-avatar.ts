/***
 * Script to transfer ownership of GoodDollarOFTAdapter from DAO Avatar to current signer
 * 
 * Usage:
 *   yarn hardhat run test/oft/transfer-oft-adapter-ownership-from-avatar.ts --network development-celo
 *   yarn hardhat run test/oft/transfer-oft-adapter-ownership-from-avatar.ts --network development-xdc
 * 
 * Note: This script must be run by an account that can execute DAO proposals.
 * If the Avatar owns the contract, ownership transfer must go through the Controller.
 */

import { network, ethers } from "hardhat";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import { getOftDeploymentAddresses } from "../../deploy/utils/getOftDeploymentAddresses";

const main = async () => {
  const networkName = network.name;
  const [signer] = await ethers.getSigners();

  console.log("=== Transfer GoodDollarOFTAdapter Ownership from Avatar to Signer ===");
  console.log("Network:", networkName);
  console.log("Signer:", signer.address);
  console.log("Signer balance:", ethers.utils.formatEther(await ethers.provider.getBalance(signer.address)), "ETH/CELO/XDC");
  console.log("");

  // Get deployment info
  const { GoodDollarOFTAdapter: oftAdapterAddress } = getOftDeploymentAddresses(networkName);
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  
  if (!goodProtocolContracts) {
    throw new Error(`No GoodProtocol contracts found for network: ${networkName}`);
  }

  const avatarAddress = goodProtocolContracts.Avatar;
  const controllerAddress = goodProtocolContracts.Controller;

  if (!avatarAddress) {
    throw new Error(`Avatar not found in GoodProtocol deployment.json for ${networkName}`);
  }

  if (!controllerAddress) {
    throw new Error(`Controller not found in GoodProtocol deployment.json for ${networkName}`);
  }

  console.log("Contract addresses:");
  console.log("GoodDollarOFTAdapter:", oftAdapterAddress);
  console.log("Avatar:", avatarAddress);
  console.log("Controller:", controllerAddress);
  console.log("");

  // Get OFT adapter contract
  const oftAdapter = await ethers.getContractAt("GoodDollarOFTAdapter", oftAdapterAddress);
  
  // Get current owner
  let currentOwner: string;
  try {
    currentOwner = await oftAdapter.owner();
    console.log("Current owner:", currentOwner);
  } catch (e: any) {
    throw new Error(`Could not read owner: ${e.message}`);
  }

  // Check if already owned by signer
  if (currentOwner.toLowerCase() === signer.address.toLowerCase()) {
    console.log("\n✅ GoodDollarOFTAdapter is already owned by signer. No action needed.");
    return;
  }

  // Check if owned by Avatar
  const isAvatarOwner = currentOwner.toLowerCase() === avatarAddress.toLowerCase();
  
  if (!isAvatarOwner) {
    console.log("\n❌ Error: Current owner is not the Avatar.");
    console.log(`Current owner: ${currentOwner}`);
    console.log(`Expected owner (Avatar): ${avatarAddress}`);
    console.log("\nThis script can only transfer ownership FROM the Avatar.");
    console.log("If you need to transfer from a different owner, use transferOwnership directly.");
    throw new Error("Current owner is not the Avatar");
  }

  console.log("✅ Current owner is Avatar. Proceeding with ownership transfer...");
  console.log("Target owner (signer):", signer.address);
  console.log("");

  // Transfer ownership from Avatar to signer
  // Since Avatar is the owner, we need to call through Controller
  try {
    console.log("Transferring ownership from Avatar to signer through Controller...");
    
    const Controller = await ethers.getContractAt("Controller", controllerAddress);
    
    // Encode transferOwnership(address newOwner)
    const functionSignature = "transferOwnership(address)";
    const functionSelector = ethers.utils.id(functionSignature).slice(0, 10);
    const encodedParams = ethers.utils.defaultAbiCoder.encode(
      ["address"],
      [signer.address]
    );
    const encodedCall = ethers.utils.hexConcat([functionSelector, encodedParams]);
    
    console.log("Encoded function call:", encodedCall);
    console.log("Calling Controller.genericCall...");
    
    const tx = await Controller.genericCall(
      oftAdapterAddress,
      encodedCall,
      avatarAddress,
      0
    );
    
    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed!");
    console.log("Block number:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());

    // Verify ownership was transferred
    console.log("\nVerifying ownership transfer...");
    const newOwner = await oftAdapter.owner();
    console.log("New owner:", newOwner);

    if (newOwner.toLowerCase() === signer.address.toLowerCase()) {
      console.log("\n✅ Successfully transferred ownership from Avatar to signer!");
      console.log(`Contract is now owned by: ${signer.address}`);
    } else {
      console.log("\n⚠️  Warning: Ownership was not transferred correctly.");
      console.log("Expected:", signer.address);
      console.log("Got:", newOwner);
      throw new Error("Ownership transfer verification failed");
    }

  } catch (error: any) {
    console.error("\n❌ Error transferring ownership:");
    if (error.message) {
      console.error("Error message:", error.message);
    }
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
    if (error.data) {
      console.error("Error data:", error.data);
    }
    
    // Provide helpful error messages
    if (error.message?.includes("genericCall") || error.message?.includes("Controller")) {
      console.error("\n💡 Tip: Make sure you have permission to execute DAO proposals.");
      console.error("   The Controller.genericCall requires proper DAO permissions.");
    }
    
    throw error;
  }
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

