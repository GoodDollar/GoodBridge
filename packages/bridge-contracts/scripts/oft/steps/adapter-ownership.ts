import { network, ethers } from "hardhat";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import { getOftDeploymentAddresses } from "../../../deploy/utils/getOftDeploymentAddresses";

export const main = async () => {
  const networkName = network.name;
  const [signer] = await ethers.getSigners();
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  if (!goodProtocolContracts?.Avatar) {
    throw new Error(`Avatar not found for ${networkName}`);
  }

  const avatarAddress = goodProtocolContracts.Avatar as string;
  const { GoodDollarOFTAdapter: oftAdapterAddress } = getOftDeploymentAddresses(networkName);
  const oftAdapter = await ethers.getContractAt("GoodDollarOFTAdapter", oftAdapterAddress);
  const currentOwner = await oftAdapter.owner();

  if (currentOwner.toLowerCase() === avatarAddress.toLowerCase()) {
    console.log("adapter ownership: already Avatar");
    return;
  }

  if (currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not owner ${currentOwner}`);
  }

  const tx = await oftAdapter.transferOwnership(avatarAddress);
  await tx.wait();

  const newOwner = await oftAdapter.owner();
  if (newOwner.toLowerCase() !== avatarAddress.toLowerCase()) {
    throw new Error(`Ownership transfer failed (tx ${tx.hash})`);
  }
  console.log(`adapter ownership: transferred to Avatar (${tx.hash})`);
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
