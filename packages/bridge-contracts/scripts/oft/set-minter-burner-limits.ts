/***
 * Script to set bridge limits for GoodDollarOFTAdapter contract
 * Uses genericCall through Avatar/Controller to execute the transaction
 * 
 * Note: Limits are now managed in GoodDollarOFTAdapter, not GoodDollarMinterBurner
 * 
 * Usage:
 *   DAILY_LIMIT=1000000 TX_LIMIT=100000 ACCOUNT_DAILY_LIMIT=50000 MIN_AMOUNT=10 \
 *   npx hardhat run scripts/oft/set-minter-burner-limits.ts --network development-celo
 * 
 * Note: This script must be run by a guardian or address with permissions to execute via Controller
 */

import { network, ethers } from "hardhat";
import { BigNumber } from "ethers";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import release from "../../release/deployment.json";

const main = async () => {
  const networkName = network.name;
  const [signer] = await ethers.getSigners();

  console.log("=== Set Bridge Limits for GoodDollarOFTAdapter ===");
  console.log("Network:", networkName);
  console.log("Signer:", signer.address);
  
  // Derive native token name from network
  const nativeTokenName = networkName.includes("celo") ? "CELO" : networkName.includes("xdc") ? "XDC" : "native token";
  console.log("Signer balance:", ethers.utils.formatEther(await ethers.provider.getBalance(signer.address)), nativeTokenName);

  // Get deployment info
  const currentRelease = release[networkName] || {};
  if (!currentRelease.GoodDollarOFTAdapter) {
    throw new Error(`GoodDollarOFTAdapter not found in deployment.json for ${networkName}`);
  }

  // Get GoodProtocol contracts for Controller and Avatar
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  if (!goodProtocolContracts) {
    throw new Error(`No GoodProtocol contracts found for network: ${networkName}`);
  }

  const oftAdapterAddress = currentRelease.GoodDollarOFTAdapter;
  const controllerAddress = goodProtocolContracts.Controller;
  const avatarAddress = goodProtocolContracts.Avatar;

  if (!oftAdapterAddress) {
    throw new Error(`GoodDollarOFTAdapter not found in deployment.json for ${networkName}`);
  }

  if (!controllerAddress) {
    throw new Error(`Controller not found in deployment.json for ${networkName}`);
  }

  if (!avatarAddress) {
    throw new Error(`Avatar not found in deployment.json for ${networkName}`);
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

  // Parse environment variables (values can be in decimal format, e.g., "1000000" for 1M G$)
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

  const dailyLimit = parseLimit(process.env.DAILY_LIMIT);
  const txLimit = parseLimit(process.env.TX_LIMIT);
  const accountDailyLimit = parseLimit(process.env.ACCOUNT_DAILY_LIMIT);
  const minAmount = parseLimit(process.env.MIN_AMOUNT);
  const onlyWhitelisted = process.env.ONLY_WHITELISTED !== undefined ? process.env.ONLY_WHITELISTED === "true" : null;

  // Check if any limits are being set
  if (dailyLimit === null && txLimit === null && accountDailyLimit === null && minAmount === null && onlyWhitelisted === null) {
    console.log("\n⚠️  No limits specified. Please provide at least one limit to set.");
    console.log("\nUsage examples:");
    console.log("  # Using decimal values (recommended - easier to read):");
    console.log("  DAILY_LIMIT=1000000 TX_LIMIT=100000 \\");
    console.log("  ACCOUNT_DAILY_LIMIT=50000 MIN_AMOUNT=10 \\");
    console.log("  ONLY_WHITELISTED=false \\");
    console.log("  npx hardhat run scripts/oft/set-minter-burner-limits.ts --network development-celo");
    console.log("\n  # Or using wei values (if you prefer):");
    console.log("  DAILY_LIMIT=1000000000000000000000000 TX_LIMIT=100000000000000000000000 \\");
    console.log("  ACCOUNT_DAILY_LIMIT=50000000000000000000000 MIN_AMOUNT=10000000000000000000 \\");
    console.log("  ONLY_WHITELISTED=false \\");
    console.log("  npx hardhat run scripts/oft/set-minter-burner-limits.ts --network development-celo");
    console.log("\nNote: Decimal values (e.g., '1000000' for 1M G$) are automatically converted to wei.");
    return;
  }

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

  // Prepare transaction
  const abiCoder = ethers.utils.defaultAbiCoder;
  const setBridgeLimitsEncoded = oftAdapter.interface.encodeFunctionData("setBridgeLimits", [newLimits]);

  // Execute via Controller/Avatar
  try {
    console.log("\nExecuting via Controller/Avatar...");
    const Controller = await ethers.getContractAt("Controller", controllerAddress);
    const tx = await Controller.genericCall(
      oftAdapterAddress,
      setBridgeLimitsEncoded,
      avatarAddress,
      0
    );
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

    console.log("\n✅ Successfully set bridge limits via Avatar!");

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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

