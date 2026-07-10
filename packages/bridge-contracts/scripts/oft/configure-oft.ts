import { spawnSync } from "child_process";
import path from "path";
import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

export type ConfigureFlags = {
  skipMinter: boolean;
  skipLimits: boolean;
  skipWire: boolean;
  skipAdapterOwnership: boolean;
};

const OFT_NETWORK_PAIRS: Record<string, { xdc: string; celo: string }> = {
  "production-xdc": { xdc: "production-xdc", celo: "production-celo" },
  "production-celo": { xdc: "production-xdc", celo: "production-celo" },
  "development-xdc": { xdc: "development-xdc", celo: "development-celo" },
  "development-celo": { xdc: "development-xdc", celo: "development-celo" },
};

function resolveOftPairNetworks(networkName: string): { xdc: string; celo: string } {
  const pair = OFT_NETWORK_PAIRS[networkName];
  if (!pair) {
    throw new Error(`Unknown network pairing for "${networkName}"`);
  }
  return pair;
}

function runLayerZeroWire(networkName: string, xdcNetwork: string, celoNetwork: string) {
  const result = spawnSync(
    "npx",
    [
      "hardhat",
      "lz:oapp:wire",
      "--oapp-config",
      "./scripts/oft/layerzero.config.ts",
      "--network",
      networkName,
      "--ci",
    ],
    {
      cwd: path.resolve(__dirname, "../.."),
      stdio: "inherit",
      env: {
        ...process.env,
        OFT_XDC_NETWORK: xdcNetwork,
        OFT_CELO_NETWORK: celoNetwork,
      },
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`LayerZero wire failed with exit code ${result.status ?? "unknown"}`);
  }
}

function wireLayerZero(networkName: string) {
  const pair = resolveOftPairNetworks(networkName);
  runLayerZeroWire(networkName, pair.xdc, pair.celo);
}

export async function configureOft(hre: HardhatRuntimeEnvironment, flags: ConfigureFlags) {
  const { main: grantMinterRole } = await import("./steps/grant-minter-role");
  const { main: setBridgeLimits } = await import("./steps/set-bridge-limits");
  const { main: transferAdapterOwnership } = await import("./steps/adapter-ownership");

  const networkName = hre.network.name;
  console.log(`oft:configure ${networkName}`, flags);

  if (!flags.skipMinter) await grantMinterRole();
  if (!flags.skipLimits) await setBridgeLimits();
  if (!flags.skipWire) wireLayerZero(networkName);
  if (!flags.skipAdapterOwnership) await transferAdapterOwnership();

  console.log(`oft:configure done (${networkName})`);
}

task("oft:configure", "Configure GoodDollar OFT after deploy (minter, limits, wire, ownership)")
  .addFlag("skipMinter", "Skip granting MINTER_ROLE")
  .addFlag("skipLimits", "Skip setBridgeLimits")
  .addFlag("skipWire", "Skip LayerZero lz:oapp:wire")
  .addFlag("skipAdapterOwnership", "Skip ownership transfer to Avatar")
  .setAction(async (taskArgs, hre) => {
    await configureOft(hre, {
      skipMinter: taskArgs.skipMinter,
      skipLimits: taskArgs.skipLimits,
      skipWire: taskArgs.skipWire,
      skipAdapterOwnership: taskArgs.skipAdapterOwnership,
    });
  });
