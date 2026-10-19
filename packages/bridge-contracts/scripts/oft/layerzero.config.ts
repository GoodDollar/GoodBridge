import { EndpointId } from "@layerzerolabs/lz-definitions";
import type { OmniPointHardhat } from "@layerzerolabs/toolbox-hardhat";
import { OAppEnforcedOption } from "@layerzerolabs/toolbox-hardhat";
import { ExecutorOptionType } from "@layerzerolabs/lz-v2-utilities";
import { TwoWayConfig, generateConnectionsConfig } from "@layerzerolabs/metadata-tools";
import { getOftDeploymentAddresses } from "../../deploy/utils/getOftDeploymentAddresses";

const XDC_NETWORK = process.env.OFT_XDC_NETWORK || "development-xdc";
const CELO_NETWORK = process.env.OFT_CELO_NETWORK || "development-celo";

const { GoodDollarOFTAdapter: xdcOftAdapterAddress } = getOftDeploymentAddresses(XDC_NETWORK);
const { GoodDollarOFTAdapter: celoOftAdapterAddress } = getOftDeploymentAddresses(CELO_NETWORK);

const xdcContract: OmniPointHardhat = {
  eid: EndpointId.XDC_V2_MAINNET,
  contractName: "GoodDollarOFTAdapter",
  address: xdcOftAdapterAddress,
};

const celoContract: OmniPointHardhat = {
  eid: EndpointId.CELO_V2_MAINNET,
  contractName: "GoodDollarOFTAdapter",
  address: celoOftAdapterAddress,
};

const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
  {
    msgType: 1,
    optionType: ExecutorOptionType.LZ_RECEIVE,
    gas: 200000,
    value: 0,
  },
];

const pathways: TwoWayConfig[] = [
  [
    celoContract,
    xdcContract,
    // 2 required DVNs: every required DVN must attest before a packet verifies, so a single
    // compromised verifier cannot forge an inbound message. Both are live and non-deprecated
    // per the LayerZero DVN metadata API (verified 2026-10-15):
    //   Celo            Nethermind 0xdd7b5e1db4aafd5c8ec3b764efb8ed265aa5445b
    //   XDC (EID 30365) Nethermind 0x1294e3347ec64fd63e1d0594dc1294247cd237c7
    // One Nethermind entry per chain, so the name resolves unambiguously; Celo's lzRead DVN
    // 0x6cde6b51d91e9d81b639abb6552e5b1b04d98a0b is a separate record, not used for messaging.
    // Re-check before changing this list:
    //   curl -s https://metadata.layerzero-api.com/v1/metadata/dvns \
    //     | jq '.xdc.dvns | to_entries[] | select(.value.canonicalName=="Nethermind")'
    [["LayerZero Labs", "Nethermind"], []],
    [20, 20],
    [EVM_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS],
  ],
];

export default async function () {
  const connections = await generateConnectionsConfig(pathways);
  return {
    contracts: [{ contract: xdcContract }, { contract: celoContract }],
    connections,
  };
}
