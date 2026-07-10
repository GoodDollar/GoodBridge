import { network, ethers } from "hardhat";
import { BigNumber } from "ethers";
import { getOftDeploymentAddresses } from "../../../deploy/utils/getOftDeploymentAddresses";
import config from "../oft.config.json";

function parseLimit(value: string | undefined): BigNumber | null {
  if (!value) return null;
  const numValue = value.trim();
  if (numValue.includes(".") || numValue.length < 15) {
    return ethers.utils.parseEther(numValue);
  }
  return ethers.BigNumber.from(numValue);
}

export const main = async () => {
  const networkName = network.name;
  const networkConfig = (config as any)[networkName];
  if (!networkConfig?.limits) {
    throw new Error(`No limits in oft.config.json for ${networkName}`);
  }

  const { GoodDollarOFTAdapter: oftAdapterAddress } = getOftDeploymentAddresses(networkName);
  const oftAdapter = await ethers.getContractAt("GoodDollarOFTAdapter", oftAdapterAddress);
  const current = await oftAdapter.bridgeLimits();
  const limits = networkConfig.limits;

  const next = {
    dailyLimit: parseLimit(limits.dailyLimit) ?? current.dailyLimit,
    txLimit: parseLimit(limits.txLimit) ?? current.txLimit,
    accountDailyLimit: parseLimit(limits.accountDailyLimit) ?? current.accountDailyLimit,
    minAmount: parseLimit(limits.minAmount) ?? current.minAmount,
    onlyWhitelisted:
      limits.onlyWhitelisted !== undefined ? limits.onlyWhitelisted : current.onlyWhitelisted,
  };

  const unchanged =
    next.dailyLimit.eq(current.dailyLimit) &&
    next.txLimit.eq(current.txLimit) &&
    next.accountDailyLimit.eq(current.accountDailyLimit) &&
    next.minAmount.eq(current.minAmount) &&
    next.onlyWhitelisted === current.onlyWhitelisted;

  if (unchanged) {
    console.log("bridge limits: already set");
    return;
  }

  const tx = await oftAdapter.setBridgeLimits(next);
  await tx.wait();
  console.log(`bridge limits: set (${tx.hash})`);
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
