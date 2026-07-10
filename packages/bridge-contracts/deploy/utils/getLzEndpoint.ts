const celoMainnetEndpoint = require("@layerzerolabs/lz-evm-sdk-v2/deployments/celo-mainnet/EndpointV2.json");
const xdcMainnetEndpoint = require("@layerzerolabs/lz-evm-sdk-v2/deployments/xdc-mainnet/EndpointV2.json");

const LZ_ENDPOINT_BY_NETWORK: Record<string, string> = {
  "development-celo": celoMainnetEndpoint.address,
  "production-celo": celoMainnetEndpoint.address,
  "development-xdc": xdcMainnetEndpoint.address,
  "production-xdc": xdcMainnetEndpoint.address,
};

export function getLzEndpoint(networkName: string): string {
  const fromEnv = process.env.LAYERZERO_ENDPOINT;
  if (fromEnv) return fromEnv;

  const endpoint = LZ_ENDPOINT_BY_NETWORK[networkName];
  if (!endpoint) {
    throw new Error(
      `LayerZero EndpointV2 not mapped for "${networkName}". Set LAYERZERO_ENDPOINT or add a mapping in deploy/utils/getLzEndpoint.ts`
    );
  }
  return endpoint;
}
