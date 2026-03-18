/***
 * Script to transfer ownership of GoodDollarOFTAdapter to DAO Avatar
 * 
 * Usage:
 *   npx hardhat run test/oft/transfer-oft-adapter-ownership.ts --network development-celo
 * 
 * Note: This script must be run by the current owner of the OFT adapter.
 * If the current owner is not the signer, you'll need to run this script from the owner's account.
 */

import { network, ethers } from "hardhat";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import release from "../../release/deployment-oft.json";

const main = async () => {
  const networkName = network.name;
  const [signer] = await ethers.getSigners();

  console.log("=== Transfer GoodDollarOFTAdapter Ownership to Avatar ===");
  console.log("Network:", networkName);
  console.log("Signer:", signer.address);
  console.log("Signer balance:", ethers.utils.formatEther(await ethers.provider.getBalance(signer.address)), "ETH/CELO");

  // Get deployment info
  const currentRelease = release[networkName] || {};
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  
  if (!goodProtocolContracts) {
    throw new Error(`No GoodProtocol contracts found for network: ${networkName}`);
  }

  const oftAdapterAddress = currentRelease.GoodDollarOFTAdapter;
  const avatarAddress = goodProtocolContracts.Avatar;

  if (!oftAdapterAddress) {
    throw new Error(`GoodDollarOFTAdapter not found in deployment-oft.json for ${networkName}`);
  }

  if (!avatarAddress) {
    throw new Error(`Avatar not found in GoodProtocol deployment.json for ${networkName}`);
  }

  console.log("\nContract addresses:");
  console.log("GoodDollarOFTAdapter:", oftAdapterAddress);
  console.log("Avatar:", avatarAddress);

  // Get OFT adapter contract
  const oftAdapter = await ethers.getContractAt("GoodDollarOFTAdapter", oftAdapterAddress);
  
  // Get current owner
  let currentOwner: string;
  try {
    currentOwner = await oftAdapter.owner();
  } catch (e: any) {
    // If owner() fails, contract might not be initialized
    console.log("⚠️  Warning: Could not read owner. Contract may not be initialized.");
    currentOwner = ethers.constants.AddressZero;
  }
  
  console.log("\nCurrent owner:", currentOwner);
  console.log("Target owner (Avatar):", avatarAddress);

  // Check if already owned by Avatar
  if (currentOwner.toLowerCase() === avatarAddress.toLowerCase()) {
    console.log("\n✅ GoodDollarOFTAdapter is already owned by Avatar. No action needed.");
    return;
  }

  // If owner is zero, try to initialize the contract first
  if (currentOwner === ethers.constants.AddressZero) {
    console.log("\n⚠️  Owner is zero address. Contract may not be initialized.");
    console.log("Attempting to initialize the contract...");
    
    // Get required addresses for initialization
    const tokenAddress = goodProtocolContracts.GoodDollar || goodProtocolContracts.SuperGoodDollar;
    const minterBurnerAddress = currentRelease.GoodDollarMinterBurner;
    const nameServiceAddress = goodProtocolContracts.NameService;
    const controllerAddress = goodProtocolContracts.Controller;
    
    if (!tokenAddress || !minterBurnerAddress || !nameServiceAddress) {
      throw new Error(
        `Cannot initialize: Missing required addresses. ` +
        `Token: ${tokenAddress}, MinterBurner: ${minterBurnerAddress}, NameService: ${nameServiceAddress}`
      );
    }
    
    // Get LayerZero endpoint (from network config or environment)
    const lzEndpoint = networkName.includes("xdc") 
      ? "0x9740FF91F1985D8d2B71494aE1A2f723bb3Ed9E4"  // XDC endpoint
      : "0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9"; // CELO endpoint
    
    const feeRecipient = avatarAddress; // Use Avatar as fee recipient
    
    try {
      console.log("Initializing with parameters:");
      console.log("  Token:", tokenAddress);
      console.log("  MinterBurner:", minterBurnerAddress);
      console.log("  LZ Endpoint:", lzEndpoint);
      console.log("  Owner (Avatar):", avatarAddress);
      console.log("  Fee Recipient:", feeRecipient);
      console.log("  NameService:", nameServiceAddress);
      
      const initTx = await oftAdapter.initialize(
        tokenAddress,
        minterBurnerAddress,
        lzEndpoint,
        avatarAddress, // Set Avatar as owner during initialization
        feeRecipient,
      );
      await initTx.wait();
      console.log("✅ Contract initialized successfully!");
      console.log("Transaction hash:", initTx.hash);
      
      // Verify owner was set
      const newOwner = await oftAdapter.owner();
      console.log("New owner after initialization:", newOwner);
      
      if (newOwner.toLowerCase() === avatarAddress.toLowerCase()) {
        console.log("\n✅ Contract initialized and ownership set to Avatar!");
        return;
      } else {
        console.log("\n⚠️  Warning: Initialization completed but owner is not Avatar.");
        console.log("Expected:", avatarAddress);
        console.log("Got:", newOwner);
        // Continue to try transfer ownership below
        currentOwner = newOwner;
      }
    } catch (initError: any) {
      const errorMsg = initError.message || initError.reason || "";
      if (errorMsg.includes("already initialized") || errorMsg.includes("Initializable: contract is already initialized")) {
        console.log("⚠️  Contract is already initialized (detected via error)");
      } else {
        console.error("❌ Initialization failed:", errorMsg);
        throw initError;
      }
    }
  }

  // Check if signer is the current owner (after potential initialization)
  if (currentOwner !== ethers.constants.AddressZero && currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log("\n❌ Error: Current owner is not the signer.");
    console.log(`Current owner: ${currentOwner}`);
    console.log(`Signer: ${signer.address}`);
    console.log("\nTo transfer ownership, you must run this script from the owner's account.");
    console.log("Alternatively, the current owner can manually call:");
    console.log(`  oftAdapter.transferOwnership("${avatarAddress}")`);
    throw new Error("Signer is not the current owner");
  }
  
  // If we reach here and owner is still zero, we can't transfer
  if (currentOwner === ethers.constants.AddressZero) {
    throw new Error(
      "Cannot transfer ownership: Contract owner is zero address and initialization failed.\n" +
      "The contract may need to be redeployed. Please check the contract deployment and initialization."
    );
  }

  console.log("\n✅ Signer is the current owner. Proceeding with ownership transfer...");

  // Transfer ownership to Avatar
  try {
    console.log("\nTransferring ownership to Avatar...");
    const tx = await oftAdapter.transferOwnership(avatarAddress);
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

    if (newOwner.toLowerCase() === avatarAddress.toLowerCase()) {
      console.log("\n✅ Successfully transferred ownership to Avatar!");
    } else {
      console.log("\n⚠️  Warning: Ownership was not transferred correctly.");
      console.log("Expected:", avatarAddress);
      console.log("Got:", newOwner);
    }

  } catch (error: any) {
    console.error("\n❌ Error transferring ownership:");
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
