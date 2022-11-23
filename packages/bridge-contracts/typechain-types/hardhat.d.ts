/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { ethers } from "ethers";
import {
  FactoryOptions,
  HardhatEthersHelpers as HardhatEthersHelpersBase,
} from "@nomiclabs/hardhat-ethers/types";

import * as Contracts from ".";

declare module "hardhat/types/runtime" {
  interface HardhatEthersHelpers extends HardhatEthersHelpersBase {
    getContractFactory(
      name: "IERC1822ProxiableUpgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC1822ProxiableUpgradeable__factory>;
    getContractFactory(
      name: "IBeaconUpgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IBeaconUpgradeable__factory>;
    getContractFactory(
      name: "ERC1967UpgradeUpgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC1967UpgradeUpgradeable__factory>;
    getContractFactory(
      name: "Initializable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Initializable__factory>;
    getContractFactory(
      name: "UUPSUpgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.UUPSUpgradeable__factory>;
    getContractFactory(
      name: "Ownable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Ownable__factory>;
    getContractFactory(
      name: "ERC20",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ERC20__factory>;
    getContractFactory(
      name: "IERC20Metadata",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC20Metadata__factory>;
    getContractFactory(
      name: "IERC20",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IERC20__factory>;
    getContractFactory(
      name: "BlockHeaderRegistry",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.BlockHeaderRegistry__factory>;
    getContractFactory(
      name: "BridgeCore",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.BridgeCore__factory>;
    getContractFactory(
      name: "BridgeMixedConsensus",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.BridgeMixedConsensus__factory>;
    getContractFactory(
      name: "IFaucet",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IFaucet__factory>;
    getContractFactory(
      name: "IIdentity",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IIdentity__factory>;
    getContractFactory(
      name: "INameService",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.INameService__factory>;
    getContractFactory(
      name: "TokenBridge",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TokenBridge__factory>;
    getContractFactory(
      name: "IConsensus",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IConsensus__factory>;
    getContractFactory(
      name: "ConsensusMock",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ConsensusMock__factory>;
    getContractFactory(
      name: "Multicall",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Multicall__factory>;
    getContractFactory(
      name: "TestToken",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TestToken__factory>;
    getContractFactory(
      name: "TokenBridgeTest",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TokenBridgeTest__factory>;
    getContractFactory(
      name: "VerifierTest",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.VerifierTest__factory>;
    getContractFactory(
      name: "IBlockHeaderRegistry",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IBlockHeaderRegistry__factory>;
    getContractFactory(
      name: "VotingMock",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.VotingMock__factory>;

    getContractAt(
      name: "IERC1822ProxiableUpgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC1822ProxiableUpgradeable>;
    getContractAt(
      name: "IBeaconUpgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IBeaconUpgradeable>;
    getContractAt(
      name: "ERC1967UpgradeUpgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC1967UpgradeUpgradeable>;
    getContractAt(
      name: "Initializable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Initializable>;
    getContractAt(
      name: "UUPSUpgradeable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.UUPSUpgradeable>;
    getContractAt(
      name: "Ownable",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Ownable>;
    getContractAt(
      name: "ERC20",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ERC20>;
    getContractAt(
      name: "IERC20Metadata",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC20Metadata>;
    getContractAt(
      name: "IERC20",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IERC20>;
    getContractAt(
      name: "BlockHeaderRegistry",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.BlockHeaderRegistry>;
    getContractAt(
      name: "BridgeCore",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.BridgeCore>;
    getContractAt(
      name: "BridgeMixedConsensus",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.BridgeMixedConsensus>;
    getContractAt(
      name: "IFaucet",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IFaucet>;
    getContractAt(
      name: "IIdentity",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IIdentity>;
    getContractAt(
      name: "INameService",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.INameService>;
    getContractAt(
      name: "TokenBridge",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.TokenBridge>;
    getContractAt(
      name: "IConsensus",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IConsensus>;
    getContractAt(
      name: "ConsensusMock",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.ConsensusMock>;
    getContractAt(
      name: "Multicall",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.Multicall>;
    getContractAt(
      name: "TestToken",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.TestToken>;
    getContractAt(
      name: "TokenBridgeTest",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.TokenBridgeTest>;
    getContractAt(
      name: "VerifierTest",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.VerifierTest>;
    getContractAt(
      name: "IBlockHeaderRegistry",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.IBlockHeaderRegistry>;
    getContractAt(
      name: "VotingMock",
      address: string,
      signer?: ethers.Signer
    ): Promise<Contracts.VotingMock>;

    // default types
    getContractFactory(
      name: string,
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<ethers.ContractFactory>;
    getContractFactory(
      abi: any[],
      bytecode: ethers.utils.BytesLike,
      signer?: ethers.Signer
    ): Promise<ethers.ContractFactory>;
    getContractAt(
      nameOrAbi: string | any[],
      address: string,
      signer?: ethers.Signer
    ): Promise<ethers.Contract>;
  }
}
