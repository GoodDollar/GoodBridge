/***
 * Script to bridge 1 G$ token between XDC and CELO using LayerZero OFT adapter
 * 
 * Usage:
 *   # Bridge from XDC to CELO:
 *   npx hardhat run scripts/multichain-deploy/oft/bridge-oft-token.ts --network production-xdc
 *   # or
 *   npx hardhat run scripts/multichain-deploy/oft/bridge-oft-token.ts --network development-xdc
 * 
 *   # Bridge from CELO to XDC:
 *   npx hardhat run scripts/multichain-deploy/oft/bridge-oft-token.ts --network production-celo
 *   # or
 *   npx hardhat run scripts/multichain-deploy/oft/bridge-oft-token.ts --network development-celo
 * 
 * Note: Make sure you have:
 * - GoodDollarOFTAdapter deployed on both XDC and CELO
 * - Sufficient G$ balance on the source chain
 * - Sufficient native token (XDC or CELO) for gas and LayerZero fees
 */

import { network, ethers } from "hardhat";
import { Contract } from "ethers";
import { EndpointId } from "@layerzerolabs/lz-definitions";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import release from "../../release/deployment-oft.json";

// IERC20 interface for token operations
const IERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

// LayerZero Endpoint IDs (eid)
// These are LayerZero v2 endpoint IDs, not chain IDs
const XDC_ENDPOINT_ID = EndpointId.XDC_V2_MAINNET;
const CELO_ENDPOINT_ID = process.env.CELO_LZ_ENDPOINT_ID 
  ? parseInt(process.env.CELO_LZ_ENDPOINT_ID) 
  : EndpointId.CELO_V2_MAINNET; // Default CELO LayerZero endpoint ID

const main = async () => {
  const networkName = network.name;
  const [sender] = await ethers.getSigners();

  // Detect source and destination networks
  const isXDC = networkName.includes("xdc");
  const isCELO = networkName.includes("celo");

  if (!isXDC && !isCELO) {
    throw new Error(
      `Network must be XDC or CELO. Current network: ${networkName}\n` +
      `Supported networks: production-xdc, development-xdc, production-celo, development-celo`
    );
  }

  const sourceNetwork = isXDC ? "XDC" : "CELO";
  const destNetwork = isXDC ? "CELO" : "XDC";
  const sourceEndpointId = isXDC ? XDC_ENDPOINT_ID : CELO_ENDPOINT_ID;
  const destEndpointId = isXDC ? CELO_ENDPOINT_ID : XDC_ENDPOINT_ID;
  const nativeTokenName = isXDC ? "XDC" : "CELO";

  console.log("=== Bridge G$ ===");
  console.log(`Bridging from ${sourceNetwork} to ${destNetwork}`);
  console.log("Source Network:", networkName);
  console.log("Sender:", sender.address);
  console.log(`Sender balance: ${ethers.utils.formatEther(await ethers.provider.getBalance(sender.address))} ${nativeTokenName}`);

  // Get deployment info for source network
  const currentRelease = release[networkName] || {};
  const goodProtocolContracts = Contracts[networkName as keyof typeof Contracts] as any;
  
  if (!goodProtocolContracts) {
    throw new Error(`No GoodProtocol contracts found for network: ${networkName}`);
  }

  const oftAdapterAddress = currentRelease.GoodDollarOFTAdapter;
  const tokenAddress = goodProtocolContracts.GoodDollar || goodProtocolContracts.SuperGoodDollar;
  const minterBurnerAddress = currentRelease.GoodDollarMinterBurner;

  if (!oftAdapterAddress) {
    throw new Error(`GoodDollarOFTAdapter not found in deployment-oft.json for ${networkName}`);
  }

  if (!tokenAddress) {
    throw new Error(`GoodDollar token not found in GoodProtocol deployment.json for ${networkName}`);
  }

  if (!minterBurnerAddress) {
    throw new Error(`GoodDollarMinterBurner not found in deployment-oft.json for ${networkName}`);
  }

  console.log("\nSource chain contract addresses:");
  console.log("OFT Adapter:", oftAdapterAddress);
  console.log("Token:", tokenAddress);
  console.log("MinterBurner:", minterBurnerAddress);

  // Get contracts
  const token = new ethers.Contract(tokenAddress, IERC20_ABI, sender);
  const oftAdapter = await ethers.getContractAt("GoodDollarOFTAdapter", oftAdapterAddress);

  // Amount to bridge: 1 G$ = 1e18
  const amount = ethers.utils.parseEther("1");
  console.log("\nAmount to bridge:", ethers.utils.formatEther(amount), "G$");

  // Check token balance
  const balance = await token.balanceOf(sender.address);
  console.log("Current G$ balance:", ethers.utils.formatEther(balance), "G$");

  if (balance.lt(amount)) {
    throw new Error(`Insufficient balance. Need ${ethers.utils.formatEther(amount)} G$, have ${ethers.utils.formatEther(balance)} G$`);
  }

  // Check and approve MinterBurner if needed (required for burning tokens)
  // The OFT adapter calls minterBurner.burn(), which calls token.burnFrom() requiring approval
  // Note: OFT adapter itself doesn't need approval since approvalRequired() returns false
  const minterBurnerAllowance = await token.allowance(sender.address, minterBurnerAddress);
  console.log("\nChecking MinterBurner allowance...");
  console.log("Current MinterBurner allowance:", ethers.utils.formatEther(minterBurnerAllowance), "G$");

  if (minterBurnerAllowance.lt(amount)) {
    console.log("\nApproving MinterBurner to burn tokens...");
    const approveMinterBurnerTx = await token.approve(minterBurnerAddress, amount);
    await approveMinterBurnerTx.wait();
    console.log("MinterBurner approval confirmed:", approveMinterBurnerTx.hash);
  } else {
    console.log("Sufficient MinterBurner allowance already set");
  }

  // Recipient address (same address on destination chain)
  const recipient = sender.address;
  console.log(`\nRecipient on ${destNetwork}:`, recipient);

  // Get destination network OFT adapter address
  let destNetworkName: string;
  if (isXDC) {
    // Bridging to CELO - try production-celo first, then development-celo
    destNetworkName = "development-celo";
  } else {
    // Bridging to XDC - try production-xdc first, then development-xdc
    destNetworkName = "development-xdc";
  }

  const destRelease = release[destNetworkName] || {};
  if (!destRelease.GoodDollarOFTAdapter) {
    throw new Error(`No deployment found for destination network: ${destNetworkName}`);
  }

  const destOFTAdapter = destRelease.GoodDollarOFTAdapter;
  
  if (!destOFTAdapter) {
    throw new Error(
      `${destNetwork} OFT adapter address not found in deployment-oft.json.\n` +
      `Please either:\n` +
      `  1. Deploy OFT adapter on ${destNetwork} and add it to deployment-oft.json, or\n` +
      `  2. Manually set the peer using: scripts/set-oft-peer.ts`
    );
  }

  console.log(`\nDestination chain (${destNetwork}):`);
  console.log(`OFT Adapter: ${destOFTAdapter}`);
  console.log(`Network name: ${destNetworkName}`);

  // Check if peer is set for destination chain
  console.log(`\nChecking if ${destNetwork} peer is configured...`);
  const destPeer = await oftAdapter.peers(destEndpointId);
  console.log(`Current ${destNetwork} peer:`, destPeer);
  
  const expectedPeer = ethers.utils.hexZeroPad(destOFTAdapter, 32);
  console.log(`Expected ${destNetwork} peer (OFT adapter on ${destNetwork}):`, destOFTAdapter);
  console.log("Expected peer (bytes32):", expectedPeer);
  
  // Compare case-insensitively (addresses can have different case)
  const destPeerLower = destPeer.toLowerCase();
  const expectedPeerLower = expectedPeer.toLowerCase();
  
  if (destPeerLower === ethers.constants.HashZero.toLowerCase() || destPeerLower !== expectedPeerLower) {
    console.log(`\n⚠️  WARNING: ${destNetwork} peer is not configured correctly!`);
    console.log("You need to set the peer before bridging. Run this command:");
    console.log(`  oftAdapter.setPeer(${destEndpointId}, "${expectedPeer}")`);
    console.log("\nOr use the LayerZero wire command:");
    console.log(`  npx hardhat lz:oapp:wire --oapp-config layerzero.config.ts --network ${networkName}`);
    throw new Error(`NoPeer: ${destNetwork} peer (endpoint ${destEndpointId}) is not set. Expected: ${destOFTAdapter}`);
  }
  
  console.log(`✅ ${destNetwork} peer is configured correctly`);

  // Double-check MinterBurner approval before calling quoteSend
  console.log("\nVerifying MinterBurner approval before quoteSend...");
  const finalMinterBurnerAllowance = await token.allowance(sender.address, minterBurnerAddress);
  console.log("Final MinterBurner allowance:", ethers.utils.formatEther(finalMinterBurnerAllowance), "G$");
  
  if (finalMinterBurnerAllowance.lt(amount)) {
    throw new Error(
      `MinterBurner allowance insufficient. Need ${ethers.utils.formatEther(amount)} G$, have ${ethers.utils.formatEther(finalMinterBurnerAllowance)} G$`
    );
  }

  // Check send library configuration before attempting quoteSend
  console.log("\nChecking send library configuration...");
  try {
    // Get the endpoint address from the OFT adapter (OApp has endpoint() function)
    let endpointAddress: string;
    try {
      endpointAddress = await oftAdapter.endpoint();
    } catch {
      // Fallback: try to get from the deployment config
      const lzEndpoints: { [key: string]: string } = {
        "development-celo": "0x1a44076050125825900e736c501f859c50fE728c",
        "production-celo": "0x1a44076050125825900e736c501f859c50fE728c",
        "development-xdc": "0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa",
        "production-xdc": "0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa",
      };
      endpointAddress = lzEndpoints[networkName] || "";
      if (!endpointAddress) {
        throw new Error(`Could not determine endpoint address for ${networkName}`);
      }
    }
    console.log("LayerZero Endpoint:", endpointAddress);
    
    // Check if send library is configured
    // The endpoint's MessageLibManager has getSendLibrary function
    const endpointABI = [
      "function getSendLibrary(address _sender, uint32 _dstEid) external view returns (address lib)",
      "function defaultSendLibrary(uint32 _dstEid) external view returns (address lib)",
      "function defaultReceiveLibrary(uint32 _srcEid) external view returns (address lib)",
      "function getReceiveLibrary(address _receiver, uint32 _srcEid) external view returns (address lib)",
    ];
    const endpoint = new ethers.Contract(endpointAddress, endpointABI, sender);
    
    try {
      const sendLib = await endpoint.getSendLibrary(oftAdapterAddress, destEndpointId);
      console.log(`Send library for ${destNetwork} (eid ${destEndpointId}):`, sendLib);
      
      if (sendLib === ethers.constants.AddressZero) {
        console.log("⚠️  WARNING: No send library configured!");
        try {
          const defaultSendLib = await endpoint.defaultSendLibrary(destEndpointId);
          console.log(`Default send library for ${destNetwork}:`, defaultSendLib);
          if (defaultSendLib === ethers.constants.AddressZero) {
            throw new Error(
              `No send library configured for ${destNetwork} (eid ${destEndpointId}). ` +
              `You need to run the LayerZero wiring command: ` +
              `yarn hardhat lz:oapp:wire --oapp-config ./layerzero.config.ts --network ${networkName}`
            );
          } else {
            console.log("ℹ️  Using default send library. Consider configuring a specific send library for better control.");
          }
        } catch (e: any) {
          throw new Error(
            `Send library not configured for ${destNetwork} (eid ${destEndpointId}). ` +
            `Error: ${e.message}. ` +
            `You need to run the LayerZero wiring command: ` +
            `yarn hardhat lz:oapp:wire --oapp-config ./layerzero.config.ts --network ${networkName}`
          );
        }
      } else {
        console.log("✅ Send library is configured");
        
        // Note: We can't check receive library on destination chain from here (cross-chain calls not supported)
        // The error 0x6592671c likely indicates missing DVN/executor configuration from wiring
        console.log(`\nℹ️  Note: Cannot check receive library on ${destNetwork} from ${sourceNetwork} network.`);
        console.log(`   If quoteSend fails, ensure wiring is completed on BOTH networks.`);
      }
    } catch (e: any) {
      console.log("⚠️  Could not check send library configuration:", e.message);
      console.log("Proceeding with quoteSend - will fail if send library is not configured...");
    }
  } catch (e: any) {
    console.log("⚠️  Could not check endpoint configuration:", e.message);
    console.log("Proceeding with quoteSend...");
  }

  // Estimate LayerZero fee using quoteSend
  console.log("\nEstimating LayerZero fee...");
  try {
    // LayerZero v2 OFT uses quoteSend with SendParam struct
    // SendParam: { dstEid, to, amountLD, minAmountLD, extraOptions, composeMsg, oftCmd }
    // 
    // For extraOptions: Use combineOptions to build proper options, or use empty bytes
    // Since wiring failed, we'll try using the OApp's combineOptions if available,
    // otherwise use empty options (but this might fail if enforced options are required)
    let extraOptions = "0x";
    
    try {
      // Try to use combineOptions to build proper options
      // combineOptions(msgType, extraOptions) - msgType 1 = SEND
      const combineOptionsResult = await oftAdapter.combineOptions(destEndpointId, 1, extraOptions);
      if (combineOptionsResult && combineOptionsResult !== "0x") {
        extraOptions = combineOptionsResult;
        console.log("Using combined options from OApp");
      }
    } catch (e: any) {
      console.log("Note: Could not use combineOptions, using empty options");
      console.log("If quoteSend fails, enforced options may need to be configured via wiring");
    }
    
    const sendParam = {
      dstEid: destEndpointId, // destination endpoint ID
      to: ethers.utils.hexZeroPad(recipient, 32), // recipient address (bytes32 encoded)
      amountLD: amount, // amount to send in local decimals
      minAmountLD: amount, // minimum amount to receive (slippage protection)
      extraOptions: extraOptions, // extra options (may need to be properly encoded)
      composeMsg: "0x", // compose message (empty for simple send)
      oftCmd: "0x" // OFT command (unused in default)
    };

    // Quote the fee (payInLzToken = false means pay in native token)
    const msgFee = await oftAdapter.quoteSend(sendParam, false);

    console.log(`Estimated native fee: ${ethers.utils.formatEther(msgFee.nativeFee)} ${nativeTokenName}`);
    console.log("Estimated LZ token fee:", ethers.utils.formatEther(msgFee.lzTokenFee), "LZ");

    // Check if sender has enough native token for fee
    const senderBalance = await ethers.provider.getBalance(sender.address);
    if (senderBalance.lt(msgFee.nativeFee)) {
      throw new Error(
        `Insufficient native token for fee. Need ${ethers.utils.formatEther(msgFee.nativeFee)} ${nativeTokenName}, have ${ethers.utils.formatEther(senderBalance)} ${nativeTokenName}`
      );
    }

    // Send tokens
    console.log("\nSending tokens via LayerZero OFT...");
    console.log("This may take a few minutes...");

    const sendTx = await oftAdapter.send(
      sendParam, // SendParam struct
      msgFee, // MessagingFee struct
      sender.address, // refund address
      { value: msgFee.nativeFee } // send native fee
    );

    console.log("Transaction sent:", sendTx.hash);
    console.log("Waiting for confirmation...");

    const receipt = await sendTx.wait();
    console.log("\n✅ Transaction confirmed!");
    console.log("Block number:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());

    // Look for Send event
    const sendEvent = receipt.events?.find((e: any) => e.event === "Send");
    if (sendEvent) {
      console.log("\nSend event found:");
      console.log("  Amount:", ethers.utils.formatEther(sendEvent.args?.amountLD || 0), "G$");
      console.log("  Recipient:", sendEvent.args?.to);
    }

    console.log("\n=== Bridge Initiated Successfully ===");
    console.log(`Bridging from ${sourceNetwork} to ${destNetwork}`);
    console.log("Transaction hash:", sendTx.hash);
    console.log(`Recipient on ${destNetwork}:`, recipient);
    console.log("Amount:", ethers.utils.formatEther(amount), "G$");
    console.log("\nYou can track the cross-chain message at:");
    console.log(`https://layerzeroscan.com/tx/${sendTx.hash}`);
    console.log(`\nNote: The tokens will arrive on ${destNetwork} after the LayerZero message is delivered.`);
    console.log("This typically takes a few minutes.");

  } catch (error: any) {
    console.error("\n❌ Error during bridge:");
    
    // Provide helpful error messages for common issues
    if (error.code === 'CALL_EXCEPTION' || error.reason || error.data) {
      const errorData = error.data || error.error?.data || '';
      
      // Check for invalid worker options error (error code 0x6592671c = LZ_ULN_InvalidWorkerOptions)
      if (errorData.includes('6592671c')) {
        console.error("\n🔍 DIAGNOSIS: Invalid Worker Options");
        console.error("The error code 0x6592671c = LZ_ULN_InvalidWorkerOptions indicates invalid extraOptions.");
        console.error("This happens when enforced options are required but not properly configured.");
        console.error("\nWhat's configured:");
        console.error("  ✅ Send library: Found");
        console.error("  ✅ Peer connection: Set");
        console.error("\nWhat's likely missing:");
        console.error("  ❌ DVN (Data Verification Network) configuration");
        console.error("  ❌ Executor configuration");
        console.error("  ❌ Receive library configuration on destination");
        console.error("  ❌ Complete wiring configuration");
        console.error("\nROOT CAUSE:");
        console.error("The 'lz:oapp:wire' command failed earlier, so enforced options weren't configured.");
        console.error("The OApp requires specific worker options (gas limits, etc.) but they're not set.");
        console.error("\nSOLUTION:");
        console.error("1. The wiring command MUST succeed to configure enforced options:");
        console.error(`   yarn hardhat lz:oapp:wire --oapp-config ./layerzero.config.ts --network ${networkName}`);
        console.error(`   yarn hardhat lz:oapp:wire --oapp-config ./layerzero.config.ts --network ${destNetworkName}`);
        console.error("\n2. If wiring fails with permission errors (0xc4c52593), you need to:");
        console.error("   - Run wiring from an account that has delegate permissions on the endpoint");
        console.error("   - The OApp owner must be set as a delegate on the endpoint");
        console.error("   - Contact LayerZero support if you need help with endpoint permissions");
        console.error("\n3. Alternative: Manually configure enforced options:");
        console.error("   - Use the OApp's setEnforcedOptions function if available");
        console.error("   - Or check LayerZero documentation for manual option configuration");
        console.error("\n4. Check LayerZero Scan for default configurations:");
        console.error(`   Visit: https://layerzeroscan.com/tools/defaults?version=V2`);
      } else if (error.message?.includes('send library') || error.message?.includes('SendLib') || error.message?.includes('receive library') || error.message?.includes('ReceiveLib')) {
        console.error("\n🔍 DIAGNOSIS: LayerZero library configuration issue");
        console.error("Check library configuration using:");
        console.error(`   yarn hardhat run scripts/oft/check-layerzero-config.ts --network ${networkName}`);
      }
      
      // Check for peer errors
      if (errorData.includes('NoPeer') || error.message?.includes('peer')) {
        console.error("\n🔍 DIAGNOSIS: Peer not configured");
        console.error("The peer connection between chains is not set.");
        console.error("\nSOLUTION:");
        console.error(`Run: yarn hardhat run scripts/oft/set-layerzero-peers.ts --network ${networkName}`);
      }
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

