/***
 * Transfer GoodDollarOFTAdapter ownership to DAO Avatar.
 *
 * Used by configure-oft.ts (step 4). Standalone:
 *   npx hardhat run scripts/oft/adapter-ownership.ts --network development-celo
 *
 * Must be run by the current OFT adapter owner.
 */

import { network, ethers } from "hardhat";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import { getOftDeploymentAddresses } from "../../deploy/utils/getOftDeploymentAddresses";

export const main = async () => {
  const networkName = network.name;
  const [signer] = await ethers.getSigners();

  console.log("=== Transfer GoodDollarOFTAdapter Ownership to Avatar ===");
  console.log("Network:", networkName);
  console.log("Signer:", signer.address);
  console.log(
    "Signer balance:",
    ethers.utils.formatEther(await ethers.provider.getBalance(signer.address)),
    "ETH/CELO"
  );

  const { GoodDollarOFTAdapter: oftAdapterAddress } = getOftDeploymentAddresses(networkName);
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;

  if (!goodProtocolContracts) {
    throw new Error(`No GoodProtocol contracts found for network: ${networkName}`);
  }

  const avatarAddress = goodProtocolContracts.Avatar;
  if (!avatarAddress) {
    throw new Error(`Avatar not found in GoodProtocol deployment.json for ${networkName}`);
  }

  console.log("\nContract addresses:");
  console.log("GoodDollarOFTAdapter:", oftAdapterAddress);
  console.log("Avatar:", avatarAddress);

  const oftAdapter = await ethers.getContractAt("GoodDollarOFTAdapter", oftAdapterAddress);
  const currentOwner = await oftAdapter.owner();

  console.log("\nCurrent owner:", currentOwner);
  console.log("Target owner (Avatar):", avatarAddress);

  if (currentOwner.toLowerCase() === avatarAddress.toLowerCase()) {
    console.log("\n✅ GoodDollarOFTAdapter is already owned by Avatar. No action needed.");
    return;
  }

  if (currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log("\n❌ Error: Current owner is not the signer.");
    console.log(`Current owner: ${currentOwner}`);
    console.log(`Signer: ${signer.address}`);
    console.log(`Manually call: oftAdapter.transferOwnership("${avatarAddress}")`);
    throw new Error("Signer is not the current owner");
  }

  console.log("\n✅ Signer is the current owner. Proceeding with ownership transfer...");

  try {
    console.log("\nTransferring ownership to Avatar...");
    const tx = await oftAdapter.transferOwnership(avatarAddress);
    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed!");
    console.log("Block number:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());

    const newOwner = await oftAdapter.owner();
    console.log("\nNew owner:", newOwner);

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

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
