/***
 * Script to set bridge limits for GoodDollarOFTAdapter contract
 * Calls setBridgeLimits directly on the OFT adapter (not via Controller/Avatar).
 * 
 * Note: Limits are now managed in GoodDollarOFTAdapter, not GoodDollarOFTMinterBurner
 * 
 * Usage:
 *   npx hardhat run test/oft/set-bridge-limits.ts --network development-celo
 * 
 * Configuration:
 *   All limit values are read from test/oft/oft.config.json
 *   Each network/env has its entry in the config file.
 * 
 * Note: This script must be run by the OFT adapter owner (usually the deployer or DAO Avatar)
 */

import { network, ethers } from "hardhat";
import { BigNumber } from "ethers";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import { getOftDeploymentAddresses } from "../../deploy/utils/getOftDeploymentAddresses";
import config from "./oft.config.json";

const main = async () => {
  const networkName = network.name;
  const [signer] = await ethers.getSigners();

  console.log("=== Set Bridge Limits for GoodDollarOFTAdapter ===");
  console.log("Network:", networkName);
  console.log("Signer:", signer.address);
  
  // Derive native token name from network
  const nativeTokenName = networkName.includes("celo") ? "CELO" : networkName.includes("xdc") ? "XDC" : "native token";
  console.log("Signer balance:", ethers.utils.formatEther(await ethers.provider.getBalance(signer.address)), nativeTokenName);

  // Get deployment info (from hardhat-deploy artifacts)
  const { GoodDollarOFTAdapter: oftAdapterAddress } = getOftDeploymentAddresses(networkName);

  // Get GoodProtocol contracts for Controller and Avatar
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  if (!goodProtocolContracts) {
    throw new Error(`No GoodProtocol contracts found for network: ${networkName}`);
  }

  const controllerAddress = goodProtocolContracts.Controller;
  const avatarAddress = goodProtocolContracts.Avatar;

  if (!controllerAddress) {
    throw new Error(`Controller not found in GoodProtocol deployment.json for ${networkName}`);
  }

  if (!avatarAddress) {
    throw new Error(`Avatar not found in GoodProtocol deployment.json for ${networkName}`);
  }

  console.log("\nContract addresses:");
  console.log("GoodDollarOFTAdapter:", oftAdapterAddress);
  console.log("Controller:", controllerAddress);
  console.log("Avatar:", avatarAddress);

  // Get current limits from OFTAdapter contract
  const oftAdapter = await ethers.getContractAt("GoodDollarOFTAdapter", oftAdapterAddress);
  const currentLimits = await oftAdapter.bridgeLimits();

  console.log("\nCurrent bridge limits:");
  console.log("Daily Limit:", ethers.utils.formatEther(currentLimits.dailyLimit), "G$");
  console.log("Transaction Limit:", ethers.utils.formatEther(currentLimits.txLimit), "G$");
  console.log("Account Daily Limit:", ethers.utils.formatEther(currentLimits.accountDailyLimit), "G$");
  console.log("Min Amount:", ethers.utils.formatEther(currentLimits.minAmount), "G$");
  console.log("Only Whitelisted:", currentLimits.onlyWhitelisted);

  // Get config for this network
  const networkConfig = (config as any)[networkName];
  if (!networkConfig || !networkConfig.limits) {
    console.log("\n⚠️  No limits configuration found for this network.");
    console.log(`Please add a "limits" entry for "${networkName}" in test/oft/oft.config.json`);
    return;
  }

  const limitsConfig = networkConfig.limits;

  // Parse limit values (values can be in decimal format, e.g., "1000000" for 1M G$)
  // The script will automatically convert them to wei (18 decimals)
  const parseLimit = (value: string | undefined): BigNumber | null => {
    if (!value) return null;
    // Check if value contains a decimal point or is a simple number
    // If it's a simple number string, treat it as G$ and convert to wei
    // If it's already in wei format (very large number), use it as-is
    const numValue = value.trim();
    if (numValue.includes('.') || numValue.length < 15) {
      // Treat as decimal G$ value and convert to wei
      return ethers.utils.parseEther(numValue);
    } else {
      // Assume it's already in wei format
      return ethers.BigNumber.from(numValue);
    }
  };

  const dailyLimit = parseLimit(limitsConfig.dailyLimit);
  const txLimit = parseLimit(limitsConfig.txLimit);
  const accountDailyLimit = parseLimit(limitsConfig.accountDailyLimit);
  const minAmount = parseLimit(limitsConfig.minAmount);
  const onlyWhitelisted = limitsConfig.onlyWhitelisted !== undefined ? limitsConfig.onlyWhitelisted : null;

  // Prepare new limits struct (use current values if not provided)
  const newLimits = {
    dailyLimit: dailyLimit !== null ? dailyLimit : currentLimits.dailyLimit,
    txLimit: txLimit !== null ? txLimit : currentLimits.txLimit,
    accountDailyLimit: accountDailyLimit !== null ? accountDailyLimit : currentLimits.accountDailyLimit,
    minAmount: minAmount !== null ? minAmount : currentLimits.minAmount,
    onlyWhitelisted: onlyWhitelisted !== null ? onlyWhitelisted : currentLimits.onlyWhitelisted
  };

  // Check if limits are changing
  const limitsChanged = 
    !newLimits.dailyLimit.eq(currentLimits.dailyLimit) ||
    !newLimits.txLimit.eq(currentLimits.txLimit) ||
    !newLimits.accountDailyLimit.eq(currentLimits.accountDailyLimit) ||
    !newLimits.minAmount.eq(currentLimits.minAmount) ||
    newLimits.onlyWhitelisted !== currentLimits.onlyWhitelisted;

  if (!limitsChanged) {
    console.log("\n✅ All limits are already set to the requested values. No transactions needed.");
    return;
  }

  console.log("\n📝 New bridge limits to set:");
  console.log("Daily Limit:", ethers.utils.formatEther(newLimits.dailyLimit), "G$");
  console.log("Transaction Limit:", ethers.utils.formatEther(newLimits.txLimit), "G$");
  console.log("Account Daily Limit:", ethers.utils.formatEther(newLimits.accountDailyLimit), "G$");
  console.log("Min Amount:", ethers.utils.formatEther(newLimits.minAmount), "G$");
  console.log("Only Whitelisted:", newLimits.onlyWhitelisted);

  // Execute setBridgeLimits directly (signer must be the OFT adapter owner)
  try {
    console.log("\nExecuting setBridgeLimits...");
    const tx = await oftAdapter.setBridgeLimits(newLimits);
    await tx.wait();
    console.log("✅ Transaction confirmed:", tx.hash);

    // Verify the limits were set
    console.log("\nVerifying limits were set...");
    const updatedLimits = await oftAdapter.bridgeLimits();

    console.log("\nUpdated bridge limits:");
    console.log("Daily Limit:", ethers.utils.formatEther(updatedLimits.dailyLimit), "G$");
    console.log("Transaction Limit:", ethers.utils.formatEther(updatedLimits.txLimit), "G$");
    console.log("Account Daily Limit:", ethers.utils.formatEther(updatedLimits.accountDailyLimit), "G$");
    console.log("Min Amount:", ethers.utils.formatEther(updatedLimits.minAmount), "G$");
    console.log("Only Whitelisted:", updatedLimits.onlyWhitelisted);

    console.log("\n✅ Successfully set bridge limits!");

  } catch (error: any) {
    console.error("\n❌ Error setting limits:");
    if (error.message) {
      console.error("Error message:", error.message);
    }
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
    throw error;
  }
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
