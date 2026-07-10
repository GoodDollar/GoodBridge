import { network, ethers } from "hardhat";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import { getOftDeploymentAddresses } from "../../../deploy/utils/getOftDeploymentAddresses";

export const main = async () => {
  const networkName = network.name;
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  if (!goodProtocolContracts) {
    throw new Error(`No GoodProtocol contracts for ${networkName}`);
  }

  const tokenAddress = goodProtocolContracts.GoodDollar || goodProtocolContracts.SuperGoodDollar;
  const controllerAddress = goodProtocolContracts.Controller;
  const avatarAddress = goodProtocolContracts.Avatar;
  if (!tokenAddress || !controllerAddress || !avatarAddress) {
    throw new Error(`Missing GoodDollar/Controller/Avatar for ${networkName}`);
  }

  const { GoodDollarOFTMinterBurner: minterBurnerAddress } = getOftDeploymentAddresses(networkName);
  const token = await ethers.getContractAt(
    "contracts/oft/interfaces/ISuperGoodDollar.sol:ISuperGoodDollar",
    tokenAddress
  );

  if (await token.isMinter(minterBurnerAddress)) {
    console.log("minter role: already granted");
    return;
  }

  const Controller = await ethers.getContractAt("Controller", controllerAddress);
  const encodedCall = ethers.utils.hexConcat([
    ethers.utils.id("addMinter(address)").slice(0, 10),
    ethers.utils.defaultAbiCoder.encode(["address"], [minterBurnerAddress]),
  ]);
  const tx = await Controller.genericCall(tokenAddress, encodedCall, avatarAddress, 0);
  await tx.wait();

  if (!(await token.isMinter(minterBurnerAddress))) {
    throw new Error(`MINTER_ROLE not granted (tx ${tx.hash})`);
  }
  console.log(`minter role: granted (${tx.hash})`);
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
