import { task } from 'hardhat/config';
import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { computeCreate3Address, getCreateX } from '../../deploy/utils/createX';
import { oftProxySalts, oftSaltLabels } from '../../deploy/utils/oftSalts';

/**
 * Prints the CREATE3 addresses the OFT proxies will get on this network, before any gas is spent.
 * The addresses only depend on CreateX, the deployer EOA and the salt label, so running this on
 * every target network must print the same two addresses - if it doesn't, the deployer differs.
 */
export async function predictOftAddresses(hre: HardhatRuntimeEnvironment, deployerOverride?: string) {
  const { ethers, network } = hre;
  const networkName = network.name;

  const deployer = deployerOverride
    ? ethers.utils.getAddress(deployerOverride)
    : await ethers.getSigners().then(([signer]) => signer.address);

  const createX = await getCreateX();
  const salts = oftProxySalts(networkName, deployer);
  const labels = oftSaltLabels(networkName);

  const addresses = {
    GoodDollarOFTMinterBurner: computeCreate3Address(deployer, salts.minterBurner),
    GoodDollarOFTAdapter: computeCreate3Address(deployer, salts.adapter),
  };

  console.log(`\n=== Predicted OFT proxy addresses (${networkName}) ===`);
  console.log('CreateX:', createX.address);
  console.log('Deployer:', deployer);
  for (const [name, address] of Object.entries(addresses)) {
    const label = name === 'GoodDollarOFTAdapter' ? labels.adapter : labels.minterBurner;
    const deployed = (await ethers.provider.getCode(address)) !== '0x';
    console.log(`${name}: ${address} (salt "${label}"${deployed ? ', already deployed' : ''})`);
  }
  console.log('These addresses are the same on every chain deployed from this signer.');
  console.log('=====================================\n');

  return addresses;
}

task('oft:addresses', 'Print the deterministic CreateX addresses the OFT proxies get on this network')
  .addOptionalParam('deployer', 'Predict for this deployer instead of the configured signer')
  .setAction(async (args, hre) => {
    await predictOftAddresses(hre, args.deployer);
  });
