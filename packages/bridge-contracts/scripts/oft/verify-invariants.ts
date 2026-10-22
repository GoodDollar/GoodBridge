import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import config from "./oft.config.json";
import { getOftDeploymentAddresses } from "../../deploy/utils/getOftDeploymentAddresses";

const REMOTE_NETWORK: Record<string, string> = {
  "production-xdc": "production-celo",
  "production-celo": "production-xdc",
  "development-xdc": "development-celo",
  "development-celo": "development-xdc",
};

const MIN_REQUIRED_DVNS = 2;
const ULN_CONFIG_TYPE = 2;
const ULN_CONFIG_ABI = [
  "tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)",
];
const ENDPOINT_ABI = [
  "function delegates(address) view returns (address)",
  "function getSendLibrary(address _sender, uint32 _dstEid) view returns (address)",
  "function getReceiveLibrary(address _receiver, uint32 _srcEid) view returns (address lib, bool isDefault)",
  "function getConfig(address _oapp, address _lib, uint32 _eid, uint32 _configType) view returns (bytes)",
];

const eidOf = (networkName: string) =>
  networkName.includes("xdc") ? EndpointId.XDC_V2_MAINNET : EndpointId.CELO_V2_MAINNET;

/**
 * Post-deploy invariants: Avatar owns/delegates the adapter, peers, limits, DVNs and minting rights are as expected.
 * Collects every failure and throws once at the end.
 */
export async function verifyOftInvariants(hre: HardhatRuntimeEnvironment) {
  const { ethers, network } = hre;
  const { verifyOftDeployment } = await import("../../deploy/utils/verifyOftDeployment");
  const { parseLimit } = await import("./steps/set-bridge-limits");

  const networkName = network.name;
  const remoteNetwork = REMOTE_NETWORK[networkName];
  if (!remoteNetwork) throw new Error(`Unknown network pairing for "${networkName}"`);
  const gp = (Contracts as any)[networkName];
  const avatar: string = gp?.Avatar;
  if (!avatar) throw new Error(`Avatar not found for ${networkName}`);

  // implementation slots, token/minterBurner/feeRecipient wiring, operators(adapter); owner must be the Avatar
  await verifyOftDeployment(networkName, [avatar]);

  const failures: string[] = [];
  const check = (ok: boolean, label: string) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) failures.push(label);
  };
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  const { GoodDollarOFTAdapter: adapterAddress, GoodDollarOFTMinterBurner: minterBurnerAddress } =
    getOftDeploymentAddresses(networkName);
  const { GoodDollarOFTAdapter: remoteAdapter } = getOftDeploymentAddresses(remoteNetwork);
  const adapter = await ethers.getContractAt("GoodDollarOFTAdapter", adapterAddress);
  const endpoint = await ethers.getContractAt(ENDPOINT_ABI, await adapter.endpoint());
  const remoteEid = eidOf(remoteNetwork);

  check(same(await adapter.owner(), avatar), `adapter.owner() == Avatar ${avatar}`);
  check(same(await endpoint.delegates(adapterAddress), avatar), "endpoint.delegates(adapter) == Avatar");
  check(
    same(await adapter.peers(remoteEid), ethers.utils.hexZeroPad(remoteAdapter, 32)),
    `adapter.peers(${remoteEid}) == ${remoteNetwork} adapter ${remoteAdapter}`
  );
  // CREATE3 deployments from one deployer share an address across chains; a mismatch means the
  // chains were deployed from different keys or salts. The bridge still works, so this only warns.
  if (!same(adapterAddress, remoteAdapter)) {
    console.log(
      `warn adapter address differs from ${remoteNetwork}: ${adapterAddress} vs ${remoteAdapter}`
    );
  }

  const token = await ethers.getContractAt(
    "contracts/oft/interfaces/ISuperGoodDollar.sol:ISuperGoodDollar",
    gp.GoodDollar
  );
  check(await token.isMinter(minterBurnerAddress), "G$.isMinter(minterBurner)");

  const expected = (config as any)[networkName]?.limits;
  if (!expected) {
    check(false, `limits for ${networkName} in oft.config.json`);
  } else {
    const actual = await adapter.bridgeLimits();
    for (const key of ["dailyLimit", "txLimit", "accountDailyLimit", "minAmount"]) {
      check(parseLimit(expected[key])!.eq(actual[key]), `bridgeLimits.${key} == ${expected[key]}`);
    }
    check(actual.onlyWhitelisted === expected.onlyWhitelisted, `bridgeLimits.onlyWhitelisted == ${expected.onlyWhitelisted}`);
  }

  const sendLib: string = await endpoint.getSendLibrary(adapterAddress, remoteEid);
  const [receiveLib] = await endpoint.getReceiveLibrary(adapterAddress, remoteEid);
  for (const [side, lib] of [
    ["send", sendLib],
    ["receive", receiveLib],
  ]) {
    const raw = await endpoint.getConfig(adapterAddress, lib, remoteEid, ULN_CONFIG_TYPE);
    const [uln] = ethers.utils.defaultAbiCoder.decode(ULN_CONFIG_ABI, raw);
    check(
      uln.requiredDVNCount >= MIN_REQUIRED_DVNS && uln.requiredDVNCount !== 255,
      `${side} ULN requiredDVNCount ${uln.requiredDVNCount} >= ${MIN_REQUIRED_DVNS} (${uln.requiredDVNs.join(", ")})`
    );
  }

  if (failures.length > 0) {
    throw new Error(`OFT invariants failed on ${networkName}:\n- ${failures.join("\n- ")}`);
  }
  console.log(`OFT invariants hold on ${networkName}`);
}

task("oft:verify", "Check post-deploy OFT invariants (ownership, delegate, peers, limits, DVNs, minter)").setAction(
  async (_, hre) => {
    await verifyOftInvariants(hre);
  }
);
