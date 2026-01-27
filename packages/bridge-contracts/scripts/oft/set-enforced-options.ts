/**
 * Script to manually set LayerZero enforced options
 * 
 * This sets enforced options when wiring fails due to permission errors.
 * Enforced options specify gas limits and other parameters for cross-chain messages.
 * 
 * Usage:
 *   yarn hardhat run scripts/oft/set-enforced-options.ts --network development-xdc
 *   yarn hardhat run scripts/oft/set-enforced-options.ts --network development-celo
 */

import { network, ethers } from "hardhat";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import { Options } from "@layerzerolabs/lz-v2-utilities";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import release from "../../release/deployment.json";

const { name: networkName } = network;

// Endpoint IDs
const XDC_EID = EndpointId.XDC_V2_MAINNET; // 30109
const CELO_EID = EndpointId.CELO_V2_MAINNET; // 30125

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("=== Setting LayerZero Enforced Options ===\n");
  console.log("Network:", networkName);
  console.log("Signer:", signer.address);
  console.log("");

  const isXDC = networkName.includes("xdc");
  const isCELO = networkName.includes("celo");

  if (!isXDC && !isCELO) {
    throw new Error(`Unsupported network: ${networkName}. Use development-xdc or development-celo`);
  }

  const oftAdapterAddress = (release[networkName] as any)?.GoodDollarOFTAdapter;
  if (!oftAdapterAddress) {
    throw new Error(`OFT adapter not found for ${networkName}`);
  }

  const destEid = isXDC ? CELO_EID : XDC_EID;
  const destNetwork = isXDC ? "CELO" : "XDC";

  console.log("OFT Adapter:", oftAdapterAddress);
  console.log("Destination:", destNetwork, `(eid ${destEid})`);
  console.log("");

  // Get the OFT adapter contract
  const oftAdapter = await ethers.getContractAt("GoodDollarOFTAdapter", oftAdapterAddress);

  // Check current owner
  let currentOwner: string;
  try {
    currentOwner = await oftAdapter.owner();
    console.log(`Current owner: ${currentOwner}`);
  } catch (error: any) {
    throw new Error(`Could not read owner: ${error.message}`);
  }

  // Get GoodProtocol contracts for DAO access
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  if (!goodProtocolContracts) {
    throw new Error(`No GoodProtocol contracts found for network: ${networkName}`);
  }

  const controllerAddress = goodProtocolContracts.Controller;
  const avatarAddress = goodProtocolContracts.Avatar;

  // Build enforced options
  // From layerzero.config.ts: gas: 200000, value: 0
  // msgType: 1 = SEND
  const gasLimit = 200000;
  const nativeDrop = 0; // Native token value to send (0 for now)
  
  console.log("Building enforced options...");
  console.log(`  Gas limit: ${gasLimit}`);
  console.log(`  Native drop: ${nativeDrop}`);
  console.log(`  Message type: 1 (SEND)`);
  
  // Build options using Options utility
  const options = Options.newOptions().addExecutorLzReceiveOption(gasLimit, nativeDrop).toHex();
  console.log(`  Options bytes: ${options}`);
  console.log("");

  // Prepare enforced options parameter
  // EnforcedOptionParam: { eid, msgType, options }
  const enforcedOptions = [
    {
      eid: destEid,
      msgType: 1, // SEND message type
      options: options,
    },
  ];

  // Check if owner is Avatar (DAO) - need to call through Controller
  const isAvatarOwner = currentOwner.toLowerCase() === avatarAddress.toLowerCase();
  const isSignerOwner = currentOwner.toLowerCase() === signer.address.toLowerCase();

  try {
    let tx: any;

    if (isAvatarOwner && controllerAddress) {
      // Owner is DAO Avatar - call through Controller
      console.log("Owner is DAO Avatar. Calling setEnforcedOptions through Controller...");
      const Controller = await ethers.getContractAt("Controller", controllerAddress);

      // Encode setEnforcedOptions(EnforcedOptionParam[] calldata _enforcedOptions)
      const functionSignature = "setEnforcedOptions((uint32,uint16,bytes)[])";
      const functionSelector = ethers.utils.id(functionSignature).slice(0, 10);
      const encodedParams = ethers.utils.defaultAbiCoder.encode(
        ["tuple(uint32 eid, uint16 msgType, bytes options)[]"],
        [enforcedOptions]
      );
      const encodedCall = ethers.utils.hexConcat([functionSelector, encodedParams]);

      tx = await Controller.genericCall(
        oftAdapterAddress,
        encodedCall,
        avatarAddress,
        0
      );
    } else if (isSignerOwner) {
      // Owner is signer - call directly
      console.log("Calling setEnforcedOptions directly...");
      tx = await oftAdapter.setEnforcedOptions(enforcedOptions);
    } else {
      throw new Error(
        `Cannot set enforced options: Current owner (${currentOwner}) is not the signer (${signer.address}) and not the Avatar (${avatarAddress}). ` +
        `Please run this script from the owner's account or ensure ownership has been transferred to Avatar.`
      );
    }

    console.log(`\nTransaction sent: ${tx.hash}`);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log(`✅ Enforced options set successfully!`);
    console.log(`Block number: ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // Verify enforced options were set
    const storedOptions = await oftAdapter.enforcedOptions(destEid, 1);
    console.log(`\nVerified enforced options: ${storedOptions}`);
    
    if (storedOptions === "0x") {
      console.log("⚠️  Warning: Enforced options appear to be empty after setting");
    } else {
      console.log("✅ Enforced options verified successfully!");
    }

  } catch (error: any) {
    console.error("\n❌ Error setting enforced options:");
    if (error.reason) {
      console.error(`Reason: ${error.reason}`);
    }
    if (error.data) {
      console.error(`Data: ${error.data}`);
    }
    if (error.message) {
      console.error(`Message: ${error.message}`);
    }
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

