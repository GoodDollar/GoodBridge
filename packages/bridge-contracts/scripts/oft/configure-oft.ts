/***
 * Orchestrates post-deploy OFT configuration for a single Hardhat network.
 *
 * Steps (in order):
 *   1. Grant MINTER_ROLE to GoodDollarOFTMinterBurner
 *   2. Set bridge limits from scripts/oft/oft.config.json
 *   3. Wire LayerZero peers / DVNs / enforced options (lz:oapp:wire --ci)
 *   4. Transfer GoodDollarOFTAdapter ownership to DAO Avatar
 *
 * Usage:
 *   yarn oft:configure --network production-xdc
 *   yarn oft:configure --network production-celo
 *   yarn oft:configure --network development-xdc --skip-wire
 *
 * Flags (forwarded by scripts/oft/run-configure.js):
 *   --skip-minter
 *   --skip-limits
 *   --skip-wire
 *   --skip-adapter-ownership
 */

import { spawnSync } from "child_process";
import path from "path";
import { network } from "hardhat";
import { main as grantMinterRole } from "./grant-minter-role";
import { main as setBridgeLimits } from "./set-bridge-limits";
import { main as transferAdapterOwnership } from "./adapter-ownership";

type ConfigureFlags = {
  skipMinter: boolean;
  skipLimits: boolean;
  skipWire: boolean;
  skipAdapterOwnership: boolean;
};

function flagEnabled(name: string): boolean {
  const value = process.env[name];
  return value === "1" || value === "true";
}

function parseFlags(): ConfigureFlags {
  return {
    skipMinter: flagEnabled("SKIP_MINTER"),
    skipLimits: flagEnabled("SKIP_LIMITS"),
    skipWire: flagEnabled("SKIP_WIRE"),
    skipAdapterOwnership: flagEnabled("SKIP_ADAPTER_OWNERSHIP"),
  };
}

function resolveOftPairNetworks(networkName: string): { xdc: string; celo: string } {
  const isProduction = networkName.includes("production");
  return {
    xdc: isProduction ? "production-xdc" : "development-xdc",
    celo: isProduction ? "production-celo" : "development-celo",
  };
}

function wireLayerZero(networkName: string) {
  const pair = resolveOftPairNetworks(networkName);
  const packageRoot = path.resolve(__dirname, "../..");
  console.log("\n=== Wire LayerZero OApp ===");
  console.log("Network (signer/RPC):", networkName);
  console.log("OFT_XDC_NETWORK:", pair.xdc);
  console.log("OFT_CELO_NETWORK:", pair.celo);

  const result = spawnSync(
    "npx",
    [
      "hardhat",
      "lz:oapp:wire",
      "--oapp-config",
      "./layerzero.config.ts",
      "--network",
      networkName,
      "--ci",
    ],
    {
      cwd: packageRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        OFT_XDC_NETWORK: pair.xdc,
        OFT_CELO_NETWORK: pair.celo,
      },
    }
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`LayerZero wire failed with exit code ${result.status ?? "unknown"}`);
  }
  console.log("✅ LayerZero wire completed");
}

export const main = async () => {
  const flags = parseFlags();
  const networkName = network.name;

  console.log("=== Configure GoodDollar OFT ===");
  console.log("Network:", networkName);
  console.log("Flags:", flags);

  if (!flags.skipMinter) {
    await grantMinterRole();
  } else {
    console.log("\nSkipping grant MINTER_ROLE (--skip-minter)");
  }

  if (!flags.skipLimits) {
    await setBridgeLimits();
  } else {
    console.log("\nSkipping set bridge limits (--skip-limits)");
  }

  if (!flags.skipWire) {
    wireLayerZero(networkName);
  } else {
    console.log("\nSkipping LayerZero wire (--skip-wire)");
  }

  if (!flags.skipAdapterOwnership) {
    await transferAdapterOwnership();
  } else {
    console.log("\nSkipping adapter ownership transfer (--skip-adapter-ownership)");
  }

  console.log("\n=== OFT configuration complete ===");
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
