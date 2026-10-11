import { deployments, ethers } from 'hardhat';
import Contracts from '@gooddollar/goodprotocol/releases/deployment.json';

const EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

async function readProxyImplementation(proxy: string): Promise<string> {
  const raw = await ethers.provider.getStorageAt(proxy, EIP1967_IMPLEMENTATION_SLOT);
  return ethers.utils.getAddress(ethers.utils.hexDataSlice(raw, 12));
}

function expectEqual(label: string, actual: string, expected: string) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`OFT deployment check failed: ${label} is ${actual}, expected ${expected}`);
  }
}

/**
 * Verifies the OFT proxies point at our implementations and were initialized with the expected wiring.
 * Must pass before granting MINTER_ROLE or setting LZ peers.
 * @param allowedOwners adapter owners accepted at this stage (deployer before handover, Avatar after)
 */
export async function verifyOftDeployment(networkName: string, allowedOwners: string[]) {
  const gp = Contracts[networkName as keyof typeof Contracts] as any;
  if (!gp?.GoodDollar || !gp?.Avatar) throw new Error(`Missing GoodDollar/Avatar for ${networkName}`);

  const minterBurnerAddress = (await deployments.get('GoodDollarOFTMinterBurner')).address;
  const adapterAddress = (await deployments.get('GoodDollarOFTAdapter')).address;

  expectEqual(
    'GoodDollarOFTAdapter implementation',
    await readProxyImplementation(adapterAddress),
    (await deployments.get('GoodDollarOFTAdapter_Implementation')).address,
  );
  expectEqual(
    'GoodDollarOFTMinterBurner implementation',
    await readProxyImplementation(minterBurnerAddress),
    (await deployments.get('GoodDollarOFTMinterBurner_Implementation')).address,
  );

  const adapter = await ethers.getContractAt('GoodDollarOFTAdapter', adapterAddress);
  const owner: string = await adapter.owner();
  if (!allowedOwners.some((o) => o.toLowerCase() === owner.toLowerCase())) {
    throw new Error(`OFT deployment check failed: adapter owner ${owner} not in [${allowedOwners.join(', ')}]`);
  }
  expectEqual('adapter.token()', await adapter.token(), gp.GoodDollar);
  expectEqual('adapter.minterBurner()', await adapter.minterBurner(), minterBurnerAddress);
  expectEqual('adapter.feeRecipient()', await adapter.feeRecipient(), gp.Avatar);

  const minterBurner = await ethers.getContractAt('GoodDollarOFTMinterBurner', minterBurnerAddress);
  expectEqual('minterBurner.token()', await minterBurner.token(), gp.GoodDollar);
  if (!(await minterBurner.operators(adapterAddress))) {
    throw new Error('OFT deployment check failed: adapter is not a MinterBurner operator');
  }

  console.log(`OFT deployment verified on ${networkName} (adapter owner ${owner})`);
}
