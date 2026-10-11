import { ethers } from 'hardhat';

// The MinterBurner implementation disables initializers, so tests put it behind a proxy and initialize it later
export async function deployMinterBurnerProxy() {
  const impl = await (await ethers.getContractFactory('GoodDollarOFTMinterBurner')).deploy();
  const proxy = await (
    await ethers.getContractFactory('@gooddollar/goodprotocol/contracts/utils/ProxyFactory1967.sol:ERC1967Proxy')
  ).deploy();
  await proxy.initialize(impl.address, '0x');
  return ethers.getContractAt('GoodDollarOFTMinterBurner', proxy.address);
}
