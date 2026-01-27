/**
 * Script to check LayerZero configuration status
 * 
 * This script checks what's configured and what's missing for LayerZero OFT.
 * 
 * Usage:
 *   yarn hardhat run scripts/oft/check-layerzero-config.ts --network development-xdc
 *   yarn hardhat run scripts/oft/check-layerzero-config.ts --network development-celo
 */

import { network, ethers } from "hardhat";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import release from "../../release/deployment.json";

const { name: networkName } = network;

// Endpoint IDs
const XDC_EID = EndpointId.XDC_V2_MAINNET; // 30109
const CELO_EID = EndpointId.CELO_V2_MAINNET; // 30125

// Endpoint addresses
const ENDPOINTS: { [key: string]: string } = {
  "development-celo": "0x1a44076050125825900e736c501f859c50fE728c",
  "production-celo": "0x1a44076050125825900e736c501f859c50fE728c",
  "development-xdc": "0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa",
  "production-xdc": "0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa",
};

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("=== LayerZero Configuration Check ===\n");
  console.log("Network:", networkName);
  console.log("Signer:", signer.address);
  console.log("");

  const isXDC = networkName.includes("xdc");
  const isCELO = networkName.includes("celo");
  
  if (!isXDC && !isCELO) {
    throw new Error(`Unsupported network: ${networkName}`);
  }

  const endpointAddress = ENDPOINTS[networkName];
  if (!endpointAddress) {
    throw new Error(`Endpoint address not found for ${networkName}`);
  }

  const oftAdapterAddress = (release[networkName] as any)?.GoodDollarOFTAdapter;
  if (!oftAdapterAddress) {
    throw new Error(`OFT adapter not found for ${networkName}`);
  }

  const destEid = isXDC ? CELO_EID : XDC_EID;
  const destNetwork = isXDC ? "CELO" : "XDC";

  console.log("LayerZero Endpoint:", endpointAddress);
  console.log("OFT Adapter:", oftAdapterAddress);
  console.log("Destination:", destNetwork, `(eid ${destEid})`);
  console.log("");

  // Endpoint ABI
  const endpointABI = [
    "function getSendLibrary(address _sender, uint32 _dstEid) external view returns (address lib)",
    "function defaultSendLibrary(uint32 _dstEid) external view returns (address lib)",
    "function getReceiveLibrary(address _receiver, uint32 _srcEid) external view returns (address lib)",
    "function defaultReceiveLibrary(uint32 _srcEid) external view returns (address lib)",
    "function getDefaultExecutor(uint32 _eid) external view returns (address executor)",
    "function getDefaultDVN(uint32 _eid) external view returns (address dvn)",
    "function getConfig(address _oapp, address _lib, uint32 _eid, uint32 _configType) external view returns (bytes memory)",
  ];

  const endpoint = new ethers.Contract(endpointAddress, endpointABI, signer);

  // Check send library
  console.log("📤 Send Library Configuration:");
  try {
    const sendLib = await endpoint.getSendLibrary(oftAdapterAddress, destEid);
    if (sendLib !== ethers.constants.AddressZero) {
      console.log(`  ✅ Configured: ${sendLib}`);
    } else {
      const defaultSendLib = await endpoint.defaultSendLibrary(destEid);
      if (defaultSendLib !== ethers.constants.AddressZero) {
        console.log(`  ⚠️  Using default: ${defaultSendLib}`);
      } else {
        console.log(`  ❌ Not configured (no default available)`);
      }
    }
  } catch (e: any) {
    console.log(`  ❌ Error checking: ${e.message}`);
  }

  // Check receive library
  console.log("\n📥 Receive Library Configuration:");
  try {
    const sourceEid = isXDC ? XDC_EID : CELO_EID;
    const receiveLib = await endpoint.getReceiveLibrary(oftAdapterAddress, sourceEid);
    if (receiveLib !== ethers.constants.AddressZero) {
      console.log(`  ✅ Configured: ${receiveLib}`);
    } else {
      const defaultReceiveLib = await endpoint.defaultReceiveLibrary(sourceEid);
      if (defaultReceiveLib !== ethers.constants.AddressZero) {
        console.log(`  ⚠️  Using default: ${defaultReceiveLib}`);
      } else {
        console.log(`  ❌ Not configured (no default available)`);
      }
    }
  } catch (e: any) {
    console.log(`  ❌ Error checking: ${e.message}`);
  }

  // Check executor
  console.log("\n⚙️  Executor Configuration:");
  try {
    const executor = await endpoint.getDefaultExecutor(destEid);
    if (executor !== ethers.constants.AddressZero) {
      console.log(`  ✅ Default executor for ${destNetwork}: ${executor}`);
    } else {
      console.log(`  ❌ No default executor configured for ${destNetwork}`);
    }
  } catch (e: any) {
    console.log(`  ⚠️  Could not check executor: ${e.message}`);
  }

  // Check DVN
  console.log("\n🔐 DVN (Data Verification Network) Configuration:");
  try {
    const dvn = await endpoint.getDefaultDVN(destEid);
    if (dvn !== ethers.constants.AddressZero) {
      console.log(`  ✅ Default DVN for ${destNetwork}: ${dvn}`);
    } else {
      console.log(`  ❌ No default DVN configured for ${destNetwork}`);
    }
  } catch (e: any) {
    console.log(`  ⚠️  Could not check DVN: ${e.message}`);
  }

  // Check peer
  console.log("\n🔗 Peer Configuration:");
  try {
    const oftAdapter = await ethers.getContractAt("GoodDollarOFTAdapter", oftAdapterAddress);
    const peer = await oftAdapter.peers(destEid);
    const peerAddress = ethers.utils.getAddress(ethers.utils.hexDataSlice(peer, 12));
    if (peerAddress !== ethers.constants.AddressZero) {
      console.log(`  ✅ Peer set: ${peerAddress}`);
    } else {
      console.log(`  ❌ Peer not set`);
    }
  } catch (e: any) {
    console.log(`  ❌ Error checking peer: ${e.message}`);
  }

  console.log("\n=== Summary ===");
  console.log("If quoteSend is failing with error 0x6592671c, check:");
  console.log("1. Send library is configured (✅ or ⚠️)");
  console.log("2. Receive library is configured (✅ or ⚠️)");
  console.log("3. Executor is configured (✅)");
  console.log("4. DVN is configured (✅)");
  console.log("5. Peer is set (✅)");
  console.log("\nIf any are missing (❌), you need to run:");
  console.log(`  yarn hardhat lz:oapp:wire --oapp-config ./layerzero.config.ts --network ${networkName}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


