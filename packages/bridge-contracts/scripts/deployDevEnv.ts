// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scopecode.
import { ethers } from "hardhat";

async function main() {
    // Hardhat always runs the compile task when running scripts with its command
    // line interface.
    //
    // If this script is run directly using `node` you may want to call compile
    // manually to make sure everything is compiled
    // await hre.run('compile');

    // We get the contract to deploy
    const cf = await ethers.getContractFactory("ConsensusMock");
    const vf = await ethers.getContractFactory("VotingMock");
    const mockValidators = await ethers.getSigners().then(_ => _.map(_ => _.address))
    const consensus = await cf.deploy(await ethers.getSigners().then(_ => _.map(_ => _.address)))
    const voting = await vf.deploy()

    console.log("deployed to:", consensus.address, voting.address);
    const rf = await ethers.getContractFactory("BlockHeaderRegistry");
    const registery = await rf.deploy(mockValidators[0],consensus.address)
    await registery.addBlockchain(122,"https://rpc.fuse.io")
    console.log("deployed registery to:", registery.address)

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
