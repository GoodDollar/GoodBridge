/***
 * Hardhat-deploy script to upgrade existing GoodDollar OFT contracts.
 *
 * Same flow as deployOFT.ts (no hardhat-upgrades):
 *  - Reads proxy addresses from release/deployment-oft.json for the current network
 *  - Resolves token and LayerZero endpoint from GoodProtocol deployment (same as deployOFT)
 *  - Deploys new implementations (OFT adapter with constructor args, MinterBurner with none)
 *  - Calls upgradeTo(newImplementation) on each proxy (UUPS)
 *
 * Usage:
 *   npx hardhat deploy --tags OFT-Upgrade --network development-xdc
 *   npx hardhat deploy --tags OFT-Upgrade --network development-celo
 *   npx hardhat deploy --tags OFT-Upgrade --network production-xdc
 *   npx hardhat deploy --tags OFT-Upgrade --network production-celo
 */

import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import Contracts from "@gooddollar/goodprotocol/releases/deployment.json";
import release from "../release/deployment-oft.json";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";

const lzEndpoints: { [key: string]: string } = {
  "development-celo": "0x1a44076050125825900e736c501f859c50fE728c",
  "production-celo": "0x1a44076050125825900e736c501f859c50fE728c",
  "development-xdc": "0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa",
  "production-xdc": "0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa",
};

const func: DeployFunction = async function (hre) {
  const { deployments, network } = hre;
  const [root] = await ethers.getSigners();
  const networkName = network.name;

  console.log("=== Upgrade GoodDollar OFT Contracts ===");
  console.log("Network:", networkName);
  console.log("Deployer:", root.address);
  console.log(
    "Deployer balance:",
    (await ethers.provider.getBalance(root.address)).toString()
  );

  const currentRelease = (release as any)[networkName] || {};
  const oftAdapterProxy = currentRelease.GoodDollarOFTAdapter as string | undefined;
  const minterBurnerProxy = currentRelease.GoodDollarMinterBurner as string | undefined;

  if (!oftAdapterProxy) {
    throw new Error(
      `GoodDollarOFTAdapter not found in deployment-oft.json for network "${networkName}".`
    );
  }
  if (!minterBurnerProxy) {
    throw new Error(
      `GoodDollarMinterBurner not found in deployment-oft.json for network "${networkName}".`
    );
  }

  console.log("\nExisting proxy addresses (from deployment-oft.json):");
  console.log("GoodDollarOFTAdapter proxy:", oftAdapterProxy);
  console.log("GoodDollarMinterBurner proxy:", minterBurnerProxy);

  const goodProtocolContracts = (Contracts as any)[networkName] as any;
  if (!goodProtocolContracts) {
    throw new Error(
      `No GoodProtocol contracts found for network ${networkName}. Please check @gooddollar/goodprotocol/releases/deployment.json`
    );
  }

  const tokenAddress = goodProtocolContracts.GoodDollar as string | undefined;
  if (!tokenAddress) {
    throw new Error(
      `Token address not found in GoodProtocol deployment for network ${networkName}. Please deploy SuperGoodDollar or GoodDollar first.`
    );
  }

  const lzEndpoint = lzEndpoints[networkName] || process.env.LAYERZERO_ENDPOINT;
  if (!lzEndpoint) {
    throw new Error(
      `LayerZero endpoint not found. Please set LAYERZERO_ENDPOINT or add default for network ${networkName}`
    );
  }

  console.log("\nDeployment parameters (same as deployOFT):");
  console.log("Token:", tokenAddress);
  console.log("LayerZero endpoint:", lzEndpoint);

  // Controller / Avatar (same pattern as deployOFT)
  const nameServiceAddress = goodProtocolContracts.NameService as string | undefined;
  if (!nameServiceAddress) {
    throw new Error(
      `NameService address not found in GoodProtocol deployment for network ${networkName}. Please deploy NameService first.`
    );
  }

  let controllerAddress = goodProtocolContracts.Controller as string | undefined;
  if (!controllerAddress) {
    const INameService = await ethers.getContractAt(
      "@gooddollar/goodprotocol/contracts/Interfaces.sol:INameService",
      nameServiceAddress
    );
    controllerAddress = await INameService.getAddress("CONTROLLER");
    if (!controllerAddress || controllerAddress === ethers.constants.AddressZero) {
      throw new Error(
        `Controller address not found in GoodProtocol deployment for network ${networkName}`
      );
    }
  }

  const Controller = await ethers.getContractAt("Controller", controllerAddress);
  const avatarAddress = await Controller.avatar();
  if (!avatarAddress || avatarAddress === ethers.constants.AddressZero) {
    throw new Error(`Avatar address is invalid: ${avatarAddress}`);
  }
  console.log("Controller:", controllerAddress);
  console.log("Avatar:", avatarAddress);

  // --- GoodDollarOFTAdapter: deploy new implementation via hardhat-deploy, then upgrade proxy ---
  console.log("\nDeploying new GoodDollarOFTAdapter implementation...");

  const oftAdapterImpl = await deployments.deploy("GoodDollarOFTAdapter_Implementation", {
    contract: "GoodDollarOFTAdapter",
    from: root.address,
    deterministicDeployment: true,
    log: true,
    args: [tokenAddress, lzEndpoint],
  });
  console.log("GoodDollarOFTAdapter implementation", oftAdapterImpl.address);

  console.log("Upgrading GoodDollarOFTAdapter proxy via upgradeTo...");
  const oftAdapterProxyContract = await ethers.getContractAt(
    "GoodDollarOFTAdapter",
    oftAdapterProxy
  );
  const txOft = await oftAdapterProxyContract.upgradeTo(oftAdapterImpl.address);
  await txOft.wait();
  console.log("✅ GoodDollarOFTAdapter upgraded");

  // --- GoodDollarMinterBurner: deploy new implementation via hardhat-deploy, then upgrade proxy ---
  console.log("\nDeploying new GoodDollarMinterBurner implementation...");
  const minterBurnerImpl = await deployments.deploy(
    "GoodDollarMinterBurner_Implementation",
    {
      contract: "GoodDollarMinterBurner",
      from: root.address,
      deterministicDeployment: true,
      log: true,
    }
  );
  console.log("GoodDollarMinterBurner implementation", minterBurnerImpl.address);

  console.log("Upgrading GoodDollarMinterBurner proxy via Controller.genericCall (avatar)...");
  const minterBurnerProxyContract = await ethers.getContractAt(
    "GoodDollarMinterBurner",
    minterBurnerProxy
  );
  const upgradeData = minterBurnerProxyContract.interface.encodeFunctionData("upgradeTo", [
    minterBurnerImpl.address,
  ]);
  const txMb = await Controller.genericCall(
    minterBurnerProxy,
    upgradeData,
    avatarAddress,
    0
  );
  await txMb.wait();
  console.log("✅ GoodDollarMinterBurner upgraded via DAO avatar");

  const minterBurnerImplAddress = await getImplementationAddress(
    ethers.provider,
    minterBurnerProxy
  ).catch(() => undefined);
  const oftAdapterImplAddress = await getImplementationAddress(
    ethers.provider,
    oftAdapterProxy
  ).catch(() => undefined);

  console.log("\n=== Upgrade Summary ===");
  console.log("Network:", networkName);
  console.log("GoodDollarMinterBurner:", minterBurnerProxy, "(upgradeable)");
  if (minterBurnerImplAddress) {
    console.log("  Implementation:", minterBurnerImplAddress);
  }
  console.log("GoodDollarOFTAdapter:", oftAdapterProxy, "(upgradeable)");
  if (oftAdapterImplAddress) {
    console.log("  Implementation:", oftAdapterImplAddress);
  }
  console.log("Token:", tokenAddress);
  console.log("LayerZero Endpoint:", lzEndpoint);
  console.log("\n--- Verify commands (constructor args for GoodDollarOFTAdapter) ---");
  console.log(
    "GoodDollarOFTAdapter implementation:\n  npx hardhat verify --network",
    networkName,
    oftAdapterImpl.address,
    tokenAddress,
    lzEndpoint
  );
  console.log(
    "GoodDollarMinterBurner implementation (no constructor args):\n  npx hardhat verify --network",
    networkName,
    minterBurnerImpl.address
  );
  console.log("========================\n");
};

export default func;
func.tags = ["OFT-Upgrade", "OFT"];
