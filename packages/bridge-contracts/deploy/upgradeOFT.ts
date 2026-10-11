/***
 * Hardhat-deploy script to upgrade existing GoodDollar OFT contracts.
 *
 * Same flow as deployOFT.ts (no hardhat-upgrades):
 *  - Reads proxy addresses from hardhat-deploy artifacts (`deployments/`) for the current network
 *  - Resolves token and LayerZero endpoint from GoodProtocol deployment (same as deployOFT)
 *  - Deploys new implementations (OFT adapter with constructor args, MinterBurner with none)
 *  - Upgrades each proxy (UUPS) through the DAO: Controller.genericCall when the deployer is a registered scheme,
 *    otherwise prints the genericCall payloads to submit as a DAO proposal
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
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { getOftDeploymentAddresses } from "./utils/getOftDeploymentAddresses";
import { getLzEndpoint } from "./utils/getLzEndpoint";

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

  const { GoodDollarOFTAdapter: oftAdapterProxy, GoodDollarOFTMinterBurner: minterBurnerProxy } =
    getOftDeploymentAddresses(networkName);

  console.log("\nExisting proxy addresses (from hardhat-deploy artifacts):");
  console.log("GoodDollarOFTAdapter proxy:", oftAdapterProxy);
  console.log("GoodDollarOFTMinterBurner proxy:", minterBurnerProxy);

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

  const lzEndpoint = getLzEndpoint(networkName);

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

  const isScheme: boolean = await Controller.isSchemeRegistered(root.address, avatarAddress);
  const pendingProposals: { target: string; data: string }[] = [];

  // Avatar-owned proxies are upgraded via the DAO; a deployer-owned adapter (before handover) is upgraded directly
  const upgradeProxy = async (name: string, proxy: string, newImpl: string, ownedByAvatar: boolean) => {
    const contract = await ethers.getContractAt(name, proxy);
    const data = contract.interface.encodeFunctionData("upgradeTo", [newImpl]);
    if (!ownedByAvatar) {
      await (await contract.upgradeTo(newImpl)).wait();
      console.log(`✅ ${name} upgraded by owner`);
    } else if (isScheme) {
      await (await Controller.genericCall(proxy, data, avatarAddress, 0)).wait();
      console.log(`✅ ${name} upgraded via DAO avatar`);
    } else {
      pendingProposals.push({ target: proxy, data });
      console.log(`⏳ ${name} upgrade requires a DAO proposal`);
    }
  };

  // CREATE2 salt for implementations:
  // hardhat-deploy uses `deterministicDeployment` as the CREATE2 salt.
  // We derive it from the contract's compiled bytecode.
  const minterBurnerArtifact = await hre.artifacts.readArtifact("GoodDollarOFTMinterBurner");
  const minterBurnerImplSalt = ethers.utils.keccak256(minterBurnerArtifact.bytecode);
  const oftAdapterArtifact = await hre.artifacts.readArtifact("GoodDollarOFTAdapter");
  const oftAdapterImplSalt = ethers.utils.keccak256(oftAdapterArtifact.bytecode);

  // --- GoodDollarOFTAdapter: deploy new implementation via hardhat-deploy, then upgrade proxy ---
  console.log("\nDeploying new GoodDollarOFTAdapter implementation...");

  const oftAdapterImpl = await deployments.deploy("GoodDollarOFTAdapter_Implementation", {
    contract: "GoodDollarOFTAdapter",
    from: root.address,
    deterministicDeployment: oftAdapterImplSalt,
    log: true,
    args: [tokenAddress, lzEndpoint],
  });
  console.log("GoodDollarOFTAdapter implementation", oftAdapterImpl.address);

  console.log("Upgrading GoodDollarOFTAdapter proxy...");
  const oftAdapterProxyContract = await ethers.getContractAt(
    "GoodDollarOFTAdapter",
    oftAdapterProxy
  );
  const adapterOwner: string = await oftAdapterProxyContract.owner();
  if (adapterOwner !== avatarAddress && adapterOwner !== root.address) {
    throw new Error(`GoodDollarOFTAdapter owner ${adapterOwner} is neither the Avatar nor the deployer`);
  }
  await upgradeProxy("GoodDollarOFTAdapter", oftAdapterProxy, oftAdapterImpl.address, adapterOwner === avatarAddress);

  // --- GoodDollarOFTMinterBurner: deploy new implementation via hardhat-deploy, then upgrade proxy ---
  console.log("\nDeploying new GoodDollarOFTMinterBurner implementation...");
  const minterBurnerImpl = await deployments.deploy(
    "GoodDollarOFTMinterBurner_Implementation",
    {
      contract: "GoodDollarOFTMinterBurner",
      from: root.address,
      deterministicDeployment: minterBurnerImplSalt,
      log: true,
    }
  );
  console.log("GoodDollarOFTMinterBurner implementation", minterBurnerImpl.address);

  console.log("Upgrading GoodDollarOFTMinterBurner proxy via the DAO avatar...");
  await upgradeProxy("GoodDollarOFTMinterBurner", minterBurnerProxy, minterBurnerImpl.address, true);

  if (pendingProposals.length > 0) {
    console.log("\n=== DAO proposal required (Controller.genericCall(target, data, avatar, 0)) ===");
    console.log("Controller:", controllerAddress, "Avatar:", avatarAddress);
    for (const p of pendingProposals) {
      console.log(
        JSON.stringify({
          ...p,
          genericCall: Controller.interface.encodeFunctionData("genericCall", [p.target, p.data, avatarAddress, 0]),
        })
      );
    }
  }

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
  console.log("GoodDollarOFTMinterBurner:", minterBurnerProxy, "(upgradeable)");
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
    "GoodDollarOFTMinterBurner implementation (no constructor args):\n  npx hardhat verify --network",
    networkName,
    minterBurnerImpl.address
  );
  console.log("========================\n");
};

export default func;
func.tags = ["OFT-Upgrade", "OFT"];
