/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  BaseContract,
  BigNumber,
  BigNumberish,
  BytesLike,
  CallOverrides,
  ContractTransaction,
  Overrides,
  PopulatedTransaction,
  Signer,
  utils,
} from "ethers";
import type {
  FunctionFragment,
  Result,
  EventFragment,
} from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type {
  TypedEventFilter,
  TypedEvent,
  TypedListener,
  OnEvent,
  PromiseOrValue,
} from "../../common";

export declare namespace MPT {
  export type MerkleProofStruct = {
    expectedRoot: PromiseOrValue<BytesLike>;
    key: PromiseOrValue<BytesLike>;
    proof: PromiseOrValue<BytesLike>[];
    keyIndex: PromiseOrValue<BigNumberish>;
    proofIndex: PromiseOrValue<BigNumberish>;
    expectedValue: PromiseOrValue<BytesLike>;
  };

  export type MerkleProofStructOutput = [
    string,
    string,
    string[],
    BigNumber,
    BigNumber,
    string
  ] & {
    expectedRoot: string;
    key: string;
    proof: string[];
    keyIndex: BigNumber;
    proofIndex: BigNumber;
    expectedValue: string;
  };
}

export declare namespace BridgeCore {
  export type BlockSignedTxsStruct = {
    receiptProofs: MPT.MerkleProofStruct[];
    blockHeaderRlp: PromiseOrValue<BytesLike>;
    blockNumber: PromiseOrValue<BigNumberish>;
  };

  export type BlockSignedTxsStructOutput = [
    MPT.MerkleProofStructOutput[],
    string,
    BigNumber
  ] & {
    receiptProofs: MPT.MerkleProofStructOutput[];
    blockHeaderRlp: string;
    blockNumber: BigNumber;
  };

  export type BlockHeaderStruct = {
    parentHash: PromiseOrValue<BytesLike>;
    number: PromiseOrValue<BigNumberish>;
  };

  export type BlockHeaderStructOutput = [string, BigNumber] & {
    parentHash: string;
    number: BigNumber;
  };

  export type SignedBlockStruct = {
    chainId: PromiseOrValue<BigNumberish>;
    rlpHeader: PromiseOrValue<BytesLike>;
    signatures: PromiseOrValue<BytesLike>[];
    cycleEnd: PromiseOrValue<BigNumberish>;
    validators: PromiseOrValue<string>[];
  };

  export type SignedBlockStructOutput = [
    BigNumber,
    string,
    string[],
    BigNumber,
    string[]
  ] & {
    chainId: BigNumber;
    rlpHeader: string;
    signatures: string[];
    cycleEnd: BigNumber;
    validators: string[];
  };
}

export interface BridgeMixedConsensusInterface extends utils.Interface {
  functions: {
    "bridgeStartBlock()": FunctionFragment;
    "chainVerifiedBlocks(uint256,uint256)": FunctionFragment;
    "consensusRatio()": FunctionFragment;
    "currentValidators(address)": FunctionFragment;
    "executeReceipts(uint256,((bytes32,bytes,bytes[],uint256,uint256,bytes)[],bytes,uint256)[])": FunctionFragment;
    "isValidConsensus(address[])": FunctionFragment;
    "numRequiredValidators()": FunctionFragment;
    "numValidators()": FunctionFragment;
    "owner()": FunctionFragment;
    "parseRLPToHeader(bytes)": FunctionFragment;
    "renounceOwnership()": FunctionFragment;
    "requiredValidators(address)": FunctionFragment;
    "setRequiredValidators(address[],uint256)": FunctionFragment;
    "submitBlocks((uint256,bytes,bytes[],uint256,address[])[])": FunctionFragment;
    "submitChainBlockParentsAndTxs((uint256,bytes,bytes[],uint256,address[]),uint256,uint256,bytes[],bytes,((bytes32,bytes,bytes[],uint256,uint256,bytes)[],bytes,uint256)[])": FunctionFragment;
    "transferOwnership(address)": FunctionFragment;
    "usedReceipts(bytes32)": FunctionFragment;
    "validatorsCycleEnd()": FunctionFragment;
    "verifyParentBlocks(uint256,uint256,bytes[],bytes)": FunctionFragment;
  };

  getFunction(
    nameOrSignatureOrTopic:
      | "bridgeStartBlock"
      | "chainVerifiedBlocks"
      | "consensusRatio"
      | "currentValidators"
      | "executeReceipts"
      | "isValidConsensus"
      | "numRequiredValidators"
      | "numValidators"
      | "owner"
      | "parseRLPToHeader"
      | "renounceOwnership"
      | "requiredValidators"
      | "setRequiredValidators"
      | "submitBlocks"
      | "submitChainBlockParentsAndTxs"
      | "transferOwnership"
      | "usedReceipts"
      | "validatorsCycleEnd"
      | "verifyParentBlocks"
  ): FunctionFragment;

  encodeFunctionData(
    functionFragment: "bridgeStartBlock",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "chainVerifiedBlocks",
    values: [PromiseOrValue<BigNumberish>, PromiseOrValue<BigNumberish>]
  ): string;
  encodeFunctionData(
    functionFragment: "consensusRatio",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "currentValidators",
    values: [PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "executeReceipts",
    values: [PromiseOrValue<BigNumberish>, BridgeCore.BlockSignedTxsStruct[]]
  ): string;
  encodeFunctionData(
    functionFragment: "isValidConsensus",
    values: [PromiseOrValue<string>[]]
  ): string;
  encodeFunctionData(
    functionFragment: "numRequiredValidators",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "numValidators",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "owner", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "parseRLPToHeader",
    values: [PromiseOrValue<BytesLike>]
  ): string;
  encodeFunctionData(
    functionFragment: "renounceOwnership",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "requiredValidators",
    values: [PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "setRequiredValidators",
    values: [PromiseOrValue<string>[], PromiseOrValue<BigNumberish>]
  ): string;
  encodeFunctionData(
    functionFragment: "submitBlocks",
    values: [BridgeCore.SignedBlockStruct[]]
  ): string;
  encodeFunctionData(
    functionFragment: "submitChainBlockParentsAndTxs",
    values: [
      BridgeCore.SignedBlockStruct,
      PromiseOrValue<BigNumberish>,
      PromiseOrValue<BigNumberish>,
      PromiseOrValue<BytesLike>[],
      PromiseOrValue<BytesLike>,
      BridgeCore.BlockSignedTxsStruct[]
    ]
  ): string;
  encodeFunctionData(
    functionFragment: "transferOwnership",
    values: [PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "usedReceipts",
    values: [PromiseOrValue<BytesLike>]
  ): string;
  encodeFunctionData(
    functionFragment: "validatorsCycleEnd",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "verifyParentBlocks",
    values: [
      PromiseOrValue<BigNumberish>,
      PromiseOrValue<BigNumberish>,
      PromiseOrValue<BytesLike>[],
      PromiseOrValue<BytesLike>
    ]
  ): string;

  decodeFunctionResult(
    functionFragment: "bridgeStartBlock",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "chainVerifiedBlocks",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "consensusRatio",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "currentValidators",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "executeReceipts",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "isValidConsensus",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "numRequiredValidators",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "numValidators",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "owner", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "parseRLPToHeader",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "renounceOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "requiredValidators",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setRequiredValidators",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "submitBlocks",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "submitChainBlockParentsAndTxs",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "transferOwnership",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "usedReceipts",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "validatorsCycleEnd",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "verifyParentBlocks",
    data: BytesLike
  ): Result;

  events: {
    "OwnershipTransferred(address,address)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "OwnershipTransferred"): EventFragment;
}

export interface OwnershipTransferredEventObject {
  previousOwner: string;
  newOwner: string;
}
export type OwnershipTransferredEvent = TypedEvent<
  [string, string],
  OwnershipTransferredEventObject
>;

export type OwnershipTransferredEventFilter =
  TypedEventFilter<OwnershipTransferredEvent>;

export interface BridgeMixedConsensus extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: BridgeMixedConsensusInterface;

  queryFilter<TEvent extends TypedEvent>(
    event: TypedEventFilter<TEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TEvent>>;

  listeners<TEvent extends TypedEvent>(
    eventFilter?: TypedEventFilter<TEvent>
  ): Array<TypedListener<TEvent>>;
  listeners(eventName?: string): Array<Listener>;
  removeAllListeners<TEvent extends TypedEvent>(
    eventFilter: TypedEventFilter<TEvent>
  ): this;
  removeAllListeners(eventName?: string): this;
  off: OnEvent<this>;
  on: OnEvent<this>;
  once: OnEvent<this>;
  removeListener: OnEvent<this>;

  functions: {
    bridgeStartBlock(overrides?: CallOverrides): Promise<[BigNumber]>;

    chainVerifiedBlocks(
      arg0: PromiseOrValue<BigNumberish>,
      arg1: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<[string]>;

    consensusRatio(overrides?: CallOverrides): Promise<[number]>;

    currentValidators(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    executeReceipts(
      chainId: PromiseOrValue<BigNumberish>,
      blocks: BridgeCore.BlockSignedTxsStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    isValidConsensus(
      signers: PromiseOrValue<string>[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    numRequiredValidators(overrides?: CallOverrides): Promise<[number]>;

    numValidators(overrides?: CallOverrides): Promise<[BigNumber]>;

    owner(overrides?: CallOverrides): Promise<[string]>;

    parseRLPToHeader(
      rlpHeader: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<
      [BridgeCore.BlockHeaderStructOutput] & {
        header: BridgeCore.BlockHeaderStructOutput;
      }
    >;

    renounceOwnership(
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    requiredValidators(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    setRequiredValidators(
      validators: PromiseOrValue<string>[],
      expirationBlock: PromiseOrValue<BigNumberish>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    submitBlocks(
      signedBlocks: BridgeCore.SignedBlockStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    submitChainBlockParentsAndTxs(
      blockData: BridgeCore.SignedBlockStruct,
      chainId: PromiseOrValue<BigNumberish>,
      childBlockNumber: PromiseOrValue<BigNumberish>,
      parentRlpHeaders: PromiseOrValue<BytesLike>[],
      childRlpHeader: PromiseOrValue<BytesLike>,
      txs: BridgeCore.BlockSignedTxsStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    transferOwnership(
      newOwner: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    usedReceipts(
      arg0: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<[boolean]>;

    validatorsCycleEnd(overrides?: CallOverrides): Promise<[BigNumber]>;

    verifyParentBlocks(
      chainId: PromiseOrValue<BigNumberish>,
      childBlockNumber: PromiseOrValue<BigNumberish>,
      parentRlpHeaders: PromiseOrValue<BytesLike>[],
      childRlpHeader: PromiseOrValue<BytesLike>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;
  };

  bridgeStartBlock(overrides?: CallOverrides): Promise<BigNumber>;

  chainVerifiedBlocks(
    arg0: PromiseOrValue<BigNumberish>,
    arg1: PromiseOrValue<BigNumberish>,
    overrides?: CallOverrides
  ): Promise<string>;

  consensusRatio(overrides?: CallOverrides): Promise<number>;

  currentValidators(
    arg0: PromiseOrValue<string>,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  executeReceipts(
    chainId: PromiseOrValue<BigNumberish>,
    blocks: BridgeCore.BlockSignedTxsStruct[],
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  isValidConsensus(
    signers: PromiseOrValue<string>[],
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  numRequiredValidators(overrides?: CallOverrides): Promise<number>;

  numValidators(overrides?: CallOverrides): Promise<BigNumber>;

  owner(overrides?: CallOverrides): Promise<string>;

  parseRLPToHeader(
    rlpHeader: PromiseOrValue<BytesLike>,
    overrides?: CallOverrides
  ): Promise<BridgeCore.BlockHeaderStructOutput>;

  renounceOwnership(
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  requiredValidators(
    arg0: PromiseOrValue<string>,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  setRequiredValidators(
    validators: PromiseOrValue<string>[],
    expirationBlock: PromiseOrValue<BigNumberish>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  submitBlocks(
    signedBlocks: BridgeCore.SignedBlockStruct[],
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  submitChainBlockParentsAndTxs(
    blockData: BridgeCore.SignedBlockStruct,
    chainId: PromiseOrValue<BigNumberish>,
    childBlockNumber: PromiseOrValue<BigNumberish>,
    parentRlpHeaders: PromiseOrValue<BytesLike>[],
    childRlpHeader: PromiseOrValue<BytesLike>,
    txs: BridgeCore.BlockSignedTxsStruct[],
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  transferOwnership(
    newOwner: PromiseOrValue<string>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  usedReceipts(
    arg0: PromiseOrValue<BytesLike>,
    overrides?: CallOverrides
  ): Promise<boolean>;

  validatorsCycleEnd(overrides?: CallOverrides): Promise<BigNumber>;

  verifyParentBlocks(
    chainId: PromiseOrValue<BigNumberish>,
    childBlockNumber: PromiseOrValue<BigNumberish>,
    parentRlpHeaders: PromiseOrValue<BytesLike>[],
    childRlpHeader: PromiseOrValue<BytesLike>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  callStatic: {
    bridgeStartBlock(overrides?: CallOverrides): Promise<BigNumber>;

    chainVerifiedBlocks(
      arg0: PromiseOrValue<BigNumberish>,
      arg1: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<string>;

    consensusRatio(overrides?: CallOverrides): Promise<number>;

    currentValidators(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    executeReceipts(
      chainId: PromiseOrValue<BigNumberish>,
      blocks: BridgeCore.BlockSignedTxsStruct[],
      overrides?: CallOverrides
    ): Promise<void>;

    isValidConsensus(
      signers: PromiseOrValue<string>[],
      overrides?: CallOverrides
    ): Promise<boolean>;

    numRequiredValidators(overrides?: CallOverrides): Promise<number>;

    numValidators(overrides?: CallOverrides): Promise<BigNumber>;

    owner(overrides?: CallOverrides): Promise<string>;

    parseRLPToHeader(
      rlpHeader: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<BridgeCore.BlockHeaderStructOutput>;

    renounceOwnership(overrides?: CallOverrides): Promise<void>;

    requiredValidators(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    setRequiredValidators(
      validators: PromiseOrValue<string>[],
      expirationBlock: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<void>;

    submitBlocks(
      signedBlocks: BridgeCore.SignedBlockStruct[],
      overrides?: CallOverrides
    ): Promise<void>;

    submitChainBlockParentsAndTxs(
      blockData: BridgeCore.SignedBlockStruct,
      chainId: PromiseOrValue<BigNumberish>,
      childBlockNumber: PromiseOrValue<BigNumberish>,
      parentRlpHeaders: PromiseOrValue<BytesLike>[],
      childRlpHeader: PromiseOrValue<BytesLike>,
      txs: BridgeCore.BlockSignedTxsStruct[],
      overrides?: CallOverrides
    ): Promise<void>;

    transferOwnership(
      newOwner: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<void>;

    usedReceipts(
      arg0: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<boolean>;

    validatorsCycleEnd(overrides?: CallOverrides): Promise<BigNumber>;

    verifyParentBlocks(
      chainId: PromiseOrValue<BigNumberish>,
      childBlockNumber: PromiseOrValue<BigNumberish>,
      parentRlpHeaders: PromiseOrValue<BytesLike>[],
      childRlpHeader: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<void>;
  };

  filters: {
    "OwnershipTransferred(address,address)"(
      previousOwner?: PromiseOrValue<string> | null,
      newOwner?: PromiseOrValue<string> | null
    ): OwnershipTransferredEventFilter;
    OwnershipTransferred(
      previousOwner?: PromiseOrValue<string> | null,
      newOwner?: PromiseOrValue<string> | null
    ): OwnershipTransferredEventFilter;
  };

  estimateGas: {
    bridgeStartBlock(overrides?: CallOverrides): Promise<BigNumber>;

    chainVerifiedBlocks(
      arg0: PromiseOrValue<BigNumberish>,
      arg1: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    consensusRatio(overrides?: CallOverrides): Promise<BigNumber>;

    currentValidators(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    executeReceipts(
      chainId: PromiseOrValue<BigNumberish>,
      blocks: BridgeCore.BlockSignedTxsStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    isValidConsensus(
      signers: PromiseOrValue<string>[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    numRequiredValidators(overrides?: CallOverrides): Promise<BigNumber>;

    numValidators(overrides?: CallOverrides): Promise<BigNumber>;

    owner(overrides?: CallOverrides): Promise<BigNumber>;

    parseRLPToHeader(
      rlpHeader: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    renounceOwnership(
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    requiredValidators(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    setRequiredValidators(
      validators: PromiseOrValue<string>[],
      expirationBlock: PromiseOrValue<BigNumberish>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    submitBlocks(
      signedBlocks: BridgeCore.SignedBlockStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    submitChainBlockParentsAndTxs(
      blockData: BridgeCore.SignedBlockStruct,
      chainId: PromiseOrValue<BigNumberish>,
      childBlockNumber: PromiseOrValue<BigNumberish>,
      parentRlpHeaders: PromiseOrValue<BytesLike>[],
      childRlpHeader: PromiseOrValue<BytesLike>,
      txs: BridgeCore.BlockSignedTxsStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    transferOwnership(
      newOwner: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    usedReceipts(
      arg0: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    validatorsCycleEnd(overrides?: CallOverrides): Promise<BigNumber>;

    verifyParentBlocks(
      chainId: PromiseOrValue<BigNumberish>,
      childBlockNumber: PromiseOrValue<BigNumberish>,
      parentRlpHeaders: PromiseOrValue<BytesLike>[],
      childRlpHeader: PromiseOrValue<BytesLike>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    bridgeStartBlock(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    chainVerifiedBlocks(
      arg0: PromiseOrValue<BigNumberish>,
      arg1: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    consensusRatio(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    currentValidators(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    executeReceipts(
      chainId: PromiseOrValue<BigNumberish>,
      blocks: BridgeCore.BlockSignedTxsStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    isValidConsensus(
      signers: PromiseOrValue<string>[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    numRequiredValidators(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    numValidators(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    owner(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    parseRLPToHeader(
      rlpHeader: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    renounceOwnership(
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    requiredValidators(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    setRequiredValidators(
      validators: PromiseOrValue<string>[],
      expirationBlock: PromiseOrValue<BigNumberish>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    submitBlocks(
      signedBlocks: BridgeCore.SignedBlockStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    submitChainBlockParentsAndTxs(
      blockData: BridgeCore.SignedBlockStruct,
      chainId: PromiseOrValue<BigNumberish>,
      childBlockNumber: PromiseOrValue<BigNumberish>,
      parentRlpHeaders: PromiseOrValue<BytesLike>[],
      childRlpHeader: PromiseOrValue<BytesLike>,
      txs: BridgeCore.BlockSignedTxsStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    transferOwnership(
      newOwner: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    usedReceipts(
      arg0: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    validatorsCycleEnd(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    verifyParentBlocks(
      chainId: PromiseOrValue<BigNumberish>,
      childBlockNumber: PromiseOrValue<BigNumberish>,
      parentRlpHeaders: PromiseOrValue<BytesLike>[],
      childRlpHeader: PromiseOrValue<BytesLike>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;
  };
}
