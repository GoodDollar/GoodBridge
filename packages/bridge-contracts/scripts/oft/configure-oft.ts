import { spawnSync } from "child_process";
import path from "path";
import { network } from "hardhat";
import { main as grantMinterRole } from "./steps/grant-minter-role";
import { main as setBridgeLimits } from "./steps/set-bridge-limits";
import { main as transferAdapterOwnership } from "./steps/adapter-ownership";

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
  const result = spawnSync(
    "npx",
    ["hardhat", "lz:oapp:wire", "--oapp-config", "./scripts/oft/layerzero.config.ts", "--network", networkName, "--ci"],
    {
      cwd: path.resolve(__dirname, "../.."),
      stdio: "inherit",
      env: {
        ...process.env,
        OFT_XDC_NETWORK: pair.xdc,
        OFT_CELO_NETWORK: pair.celo,
      },
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`LayerZero wire failed with exit code ${result.status ?? "unknown"}`);
  }
}

export const main = async () => {
  const flags = parseFlags();
  const networkName = network.name;
  console.log(`oft:configure ${networkName}`, flags);

  if (!flags.skipMinter) await grantMinterRole();
  if (!flags.skipLimits) await setBridgeLimits();
  if (!flags.skipWire) wireLayerZero(networkName);
  if (!flags.skipAdapterOwnership) await transferAdapterOwnership();

  console.log(`oft:configure done (${networkName})`);
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
