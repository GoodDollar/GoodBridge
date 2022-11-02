// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scopecode.
import { ethers, upgrades } from 'hardhat';

async function main() {
  const deployed = '0x44a1E0A83821E239F9Cef248CECc3AC5b910aeD2';
  // const voting = "0x4c889f137232E827c00710752E86840805A70484"
  const voting = await ethers.getSigners().then((_) => _[0].address);
  console.log({ voting });
  const rf = await ethers.getContractFactory('BlockHeaderRegistry');
  console.log('deploying registery');
  if (deployed) {
    await upgrades.upgradeProxy(deployed, rf, { kind: 'uups' });
  } else {
    const registery = await upgrades.deployProxy(rf, [voting, '0x3014ca10b91cb3D0AD85fEf7A3Cb95BCAc9c0f79', true], {
      kind: 'uups',
    });
    console.log('deployed registery to:', registery.address);

    console.log('adding blockchains');

    await (await registery.addBlockchain(122, 'https://rpc.fuse.io,https://fuse-rpc.gateway.pokt.network')).wait();
    await (
      await registery.addBlockchain(
        42220,
        'https://rpc.ankr.com/celo,https://forno.celo.org,https://celo-hackathon.lavanet.xyz/celo/http',
      )
    ).wait();
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
