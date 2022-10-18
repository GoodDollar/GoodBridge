// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scopecode.
import { ethers } from 'hardhat';

async function main() {
  // const voting = "0x4c889f137232E827c00710752E86840805A70484"
  const voting = await ethers.getSigners().then((_) => _[0].address);

  const rf = await ethers.getContractFactory('BlockHeaderRegistry');
  const registery = await rf.deploy(voting, '0x3014ca10b91cb3D0AD85fEf7A3Cb95BCAc9c0f79');
  await registery.addBlockchain(122, 'https://rpc.fuse.io,https://fuse-rpc.gateway.pokt.network');
  console.log('deployed registery to:', registery.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
