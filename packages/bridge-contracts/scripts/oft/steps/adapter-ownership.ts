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
  const endpoint = await ethers.getContractAt(
    ["function delegates(address) view returns (address)"],
    await oftAdapter.endpoint()
  );
  const isAvatar = (addr: string) => addr.toLowerCase() === avatarAddress.toLowerCase();
  const currentOwner = await oftAdapter.owner();
  const currentDelegate = await endpoint.delegates(oftAdapterAddress);

  if (isAvatar(currentOwner)) {
    // The LZ delegate can rewrite DVN/executor config, so it must be the Avatar too
    if (!isAvatar(currentDelegate)) {
      throw new Error(
        `Adapter owner is Avatar but LZ delegate is ${currentDelegate}; setDelegate(Avatar) must go through a DAO proposal`
      );
    }
    console.log("adapter ownership: already Avatar (owner + LZ delegate)");
    return;
  }

  if (currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not owner ${currentOwner}`);
  }

  if (!isAvatar(currentDelegate)) {
    const delegateTx = await oftAdapter.setDelegate(avatarAddress);
    await delegateTx.wait();
    console.log(`adapter LZ delegate: set to Avatar (${delegateTx.hash})`);
  }

  const tx = await oftAdapter.transferOwnership(avatarAddress);
  await tx.wait();

  const newOwner = await oftAdapter.owner();
  const newDelegate = await endpoint.delegates(oftAdapterAddress);
  if (!isAvatar(newOwner) || !isAvatar(newDelegate)) {
    throw new Error(`Ownership handover failed: owner ${newOwner}, delegate ${newDelegate} (tx ${tx.hash})`);
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
