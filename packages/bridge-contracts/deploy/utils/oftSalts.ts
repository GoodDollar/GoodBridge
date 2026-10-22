/***
 * Salt labels for the OFT proxies, shared by the deploy script and the `oft:addresses` task.
 *
 * The label is the only entropy behind the CREATE3 address, so these strings are effectively the
 * deployment's identity: changing one moves the contract to a different address on every chain.
 */

import { createXSalt } from './createX';

export function oftEnvPrefix(networkName: string): string {
  return networkName.includes('development') ? 'Development' : 'Production';
}

export function oftSaltLabels(networkName: string): { minterBurner: string; adapter: string } {
  const envPrefix = oftEnvPrefix(networkName);
  return {
    minterBurner: `${envPrefix}-GoodDollarOFTMinterBurnerV1`,
    adapter: `${envPrefix}-GoodDollarOFTAdapterV1`,
  };
}

export function oftProxySalts(networkName: string, deployer: string): { minterBurner: string; adapter: string } {
  const labels = oftSaltLabels(networkName);
  return {
    minterBurner: createXSalt(deployer, labels.minterBurner),
    adapter: createXSalt(deployer, labels.adapter),
  };
}
