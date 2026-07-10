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
    [["LayerZero Labs"], []],
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
