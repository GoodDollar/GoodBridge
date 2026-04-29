import path from 'path';
import fse from 'fs-extra';

export type OftDeploymentAddresses = {
  GoodDollarOFTMinterBurner: string;
  GoodDollarOFTAdapter: string;
};

/**
 * Reads OFT proxy addresses from hardhat-deploy's `deployments/` artifacts.
 *
 * hardhat-deploy writes:
 *   deployments/<networkName>/GoodDollarOFTMinterBurner.json
 *   deployments/<networkName>/GoodDollarOFTAdapter.json
 */
export function getOftDeploymentAddresses(networkName: string): OftDeploymentAddresses {
  const deploymentsDir = path.resolve(__dirname, '../../deployments');

  const minterBurnerPath = path.join(deploymentsDir, networkName, 'GoodDollarOFTMinterBurner.json');
  const oftAdapterPath = path.join(deploymentsDir, networkName, 'GoodDollarOFTAdapter.json');

  if (!fse.existsSync(minterBurnerPath)) {
    throw new Error(
      `Missing hardhat-deploy artifact for GoodDollarOFTMinterBurner on network "${networkName}". ` +
        `Expected: ${minterBurnerPath}. Make sure you've run: hardhat deploy --tags OFT --network ${networkName}`
    );
  }
  if (!fse.existsSync(oftAdapterPath)) {
    throw new Error(
      `Missing hardhat-deploy artifact for GoodDollarOFTAdapter on network "${networkName}". ` +
        `Expected: ${oftAdapterPath}. Make sure you've run: hardhat deploy --tags OFT --network ${networkName}`
    );
  }

  const minterBurnerDeployment = fse.readJSONSync(minterBurnerPath) as { address?: string };
  const oftAdapterDeployment = fse.readJSONSync(oftAdapterPath) as { address?: string };

  if (!minterBurnerDeployment.address) {
    throw new Error(`Invalid deployment file (no "address") for GoodDollarOFTMinterBurner: ${minterBurnerPath}`);
  }
  if (!oftAdapterDeployment.address) {
    throw new Error(`Invalid deployment file (no "address") for GoodDollarOFTAdapter: ${oftAdapterPath}`);
  }

  return {
    GoodDollarOFTMinterBurner: minterBurnerDeployment.address,
    GoodDollarOFTAdapter: oftAdapterDeployment.address,
  };
}

