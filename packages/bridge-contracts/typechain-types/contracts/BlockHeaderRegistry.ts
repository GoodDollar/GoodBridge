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
} from "../common";

export declare namespace BlockHeaderRegistry {
  export type SignatureStruct = {
    r: PromiseOrValue<BytesLike>;
    vs: PromiseOrValue<BytesLike>;
  };

  export type SignatureStructOutput = [string, string] & {
    r: string;
    vs: string;
  };

  export type BlockStruct = {
    rlpHeader: PromiseOrValue<BytesLike>;
    signature: BlockHeaderRegistry.SignatureStruct;
    chainId: PromiseOrValue<BigNumberish>;
    blockHash: PromiseOrValue<BytesLike>;
    cycleEnd: PromiseOrValue<BigNumberish>;
    validators: PromiseOrValue<string>[];
  };

  export type BlockStructOutput = [
    string,
    BlockHeaderRegistry.SignatureStructOutput,
    BigNumber,
    string,
    BigNumber,
    string[]
  ] & {
    rlpHeader: string;
    signature: BlockHeaderRegistry.SignatureStructOutput;
    chainId: BigNumber;
    blockHash: string;
    cycleEnd: BigNumber;
    validators: string[];
  };

  export type BlockchainStruct = {
    rpc: PromiseOrValue<string>;
    chainId: PromiseOrValue<BigNumberish>;
  };

  export type BlockchainStructOutput = [string, BigNumber] & {
    rpc: string;
    chainId: BigNumber;
  };

  export type SignedBlockStruct = {
    signatures: PromiseOrValue<BytesLike>[];
    cycleEnd: PromiseOrValue<BigNumberish>;
    validators: PromiseOrValue<string>[];
    blockHash: PromiseOrValue<BytesLike>;
  };

  export type SignedBlockStructOutput = [
    string[],
    BigNumber,
    string[],
    string
  ] & {
    signatures: string[];
    cycleEnd: BigNumber;
    validators: string[];
    blockHash: string;
  };
}

export interface BlockHeaderRegistryInterface extends utils.Interface {
  functions: {
    "addBlockchain(uint256,string)": FunctionFragment;
    "addSignedBlocks((bytes,(bytes32,bytes32),uint256,bytes32,uint256,address[])[])": FunctionFragment;
    "blockHashes(uint256,uint256,uint256)": FunctionFragment;
    "consensus()": FunctionFragment;
    "enabledBlockchains(uint256)": FunctionFragment;
    "getBlockHashByPayloadHash(bytes32)": FunctionFragment;
    "getRPCs()": FunctionFragment;
    "getSignedBlock(uint256,uint256)": FunctionFragment;
    "hasValidatorSigned(bytes32,address)": FunctionFragment;
    "parseRLPBlockNumber(bytes)": FunctionFragment;
    "signedBlocks(bytes32)": FunctionFragment;
    "voting()": FunctionFragment;
  };

  getFunction(
    nameOrSignatureOrTopic:
      | "addBlockchain"
      | "addSignedBlocks"
      | "blockHashes"
      | "consensus"
      | "enabledBlockchains"
      | "getBlockHashByPayloadHash"
      | "getRPCs"
      | "getSignedBlock"
      | "hasValidatorSigned"
      | "parseRLPBlockNumber"
      | "signedBlocks"
      | "voting"
  ): FunctionFragment;

  encodeFunctionData(
    functionFragment: "addBlockchain",
    values: [PromiseOrValue<BigNumberish>, PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "addSignedBlocks",
    values: [BlockHeaderRegistry.BlockStruct[]]
  ): string;
  encodeFunctionData(
    functionFragment: "blockHashes",
    values: [
      PromiseOrValue<BigNumberish>,
      PromiseOrValue<BigNumberish>,
      PromiseOrValue<BigNumberish>
    ]
  ): string;
  encodeFunctionData(functionFragment: "consensus", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "enabledBlockchains",
    values: [PromiseOrValue<BigNumberish>]
  ): string;
  encodeFunctionData(
    functionFragment: "getBlockHashByPayloadHash",
    values: [PromiseOrValue<BytesLike>]
  ): string;
  encodeFunctionData(functionFragment: "getRPCs", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "getSignedBlock",
    values: [PromiseOrValue<BigNumberish>, PromiseOrValue<BigNumberish>]
  ): string;
  encodeFunctionData(
    functionFragment: "hasValidatorSigned",
    values: [PromiseOrValue<BytesLike>, PromiseOrValue<string>]
  ): string;
  encodeFunctionData(
    functionFragment: "parseRLPBlockNumber",
    values: [PromiseOrValue<BytesLike>]
  ): string;
  encodeFunctionData(
    functionFragment: "signedBlocks",
    values: [PromiseOrValue<BytesLike>]
  ): string;
  encodeFunctionData(functionFragment: "voting", values?: undefined): string;

  decodeFunctionResult(
    functionFragment: "addBlockchain",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "addSignedBlocks",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "blockHashes",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "consensus", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "enabledBlockchains",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getBlockHashByPayloadHash",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "getRPCs", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "getSignedBlock",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "hasValidatorSigned",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "parseRLPBlockNumber",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "signedBlocks",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "voting", data: BytesLike): Result;

  events: {
    "BlockAdded(address,uint256,bytes32,address[],uint256)": EventFragment;
    "BlockchainAdded(uint256,string)": EventFragment;
    "BlockchainRemoved(uint256)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "BlockAdded"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "BlockchainAdded"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "BlockchainRemoved"): EventFragment;
}

export interface BlockAddedEventObject {
  validator: string;
  chainId: BigNumber;
  rlpHeaderHash: string;
  validators: string[];
  cycleEnd: BigNumber;
}
export type BlockAddedEvent = TypedEvent<
  [string, BigNumber, string, string[], BigNumber],
  BlockAddedEventObject
>;

export type BlockAddedEventFilter = TypedEventFilter<BlockAddedEvent>;

export interface BlockchainAddedEventObject {
  chainId: BigNumber;
  rpc: string;
}
export type BlockchainAddedEvent = TypedEvent<
  [BigNumber, string],
  BlockchainAddedEventObject
>;

export type BlockchainAddedEventFilter = TypedEventFilter<BlockchainAddedEvent>;

export interface BlockchainRemovedEventObject {
  chainId: BigNumber;
}
export type BlockchainRemovedEvent = TypedEvent<
  [BigNumber],
  BlockchainRemovedEventObject
>;

export type BlockchainRemovedEventFilter =
  TypedEventFilter<BlockchainRemovedEvent>;

export interface BlockHeaderRegistry extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: BlockHeaderRegistryInterface;

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
    addBlockchain(
      chainId: PromiseOrValue<BigNumberish>,
      rpc: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    addSignedBlocks(
      blocks: BlockHeaderRegistry.BlockStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<ContractTransaction>;

    blockHashes(
      arg0: PromiseOrValue<BigNumberish>,
      arg1: PromiseOrValue<BigNumberish>,
      arg2: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<[string]>;

    consensus(overrides?: CallOverrides): Promise<[string]>;

    enabledBlockchains(
      arg0: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<[string, BigNumber] & { rpc: string; chainId: BigNumber }>;

    getBlockHashByPayloadHash(
      payloadHash: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<[string] & { blockHash: string }>;

    getRPCs(
      overrides?: CallOverrides
    ): Promise<[BlockHeaderRegistry.BlockchainStructOutput[]]>;

    getSignedBlock(
      chainId: PromiseOrValue<BigNumberish>,
      number: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<
      [BlockHeaderRegistry.SignedBlockStructOutput] & {
        signedBlock: BlockHeaderRegistry.SignedBlockStructOutput;
      }
    >;

    hasValidatorSigned(
      arg0: PromiseOrValue<BytesLike>,
      arg1: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<[boolean]>;

    parseRLPBlockNumber(
      rlpHeader: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<[BigNumber] & { blockNumber: BigNumber }>;

    signedBlocks(
      arg0: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<
      [BigNumber, string] & { cycleEnd: BigNumber; blockHash: string }
    >;

    voting(overrides?: CallOverrides): Promise<[string]>;
  };

  addBlockchain(
    chainId: PromiseOrValue<BigNumberish>,
    rpc: PromiseOrValue<string>,
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  addSignedBlocks(
    blocks: BlockHeaderRegistry.BlockStruct[],
    overrides?: Overrides & { from?: PromiseOrValue<string> }
  ): Promise<ContractTransaction>;

  blockHashes(
    arg0: PromiseOrValue<BigNumberish>,
    arg1: PromiseOrValue<BigNumberish>,
    arg2: PromiseOrValue<BigNumberish>,
    overrides?: CallOverrides
  ): Promise<string>;

  consensus(overrides?: CallOverrides): Promise<string>;

  enabledBlockchains(
    arg0: PromiseOrValue<BigNumberish>,
    overrides?: CallOverrides
  ): Promise<[string, BigNumber] & { rpc: string; chainId: BigNumber }>;

  getBlockHashByPayloadHash(
    payloadHash: PromiseOrValue<BytesLike>,
    overrides?: CallOverrides
  ): Promise<string>;

  getRPCs(
    overrides?: CallOverrides
  ): Promise<BlockHeaderRegistry.BlockchainStructOutput[]>;

  getSignedBlock(
    chainId: PromiseOrValue<BigNumberish>,
    number: PromiseOrValue<BigNumberish>,
    overrides?: CallOverrides
  ): Promise<BlockHeaderRegistry.SignedBlockStructOutput>;

  hasValidatorSigned(
    arg0: PromiseOrValue<BytesLike>,
    arg1: PromiseOrValue<string>,
    overrides?: CallOverrides
  ): Promise<boolean>;

  parseRLPBlockNumber(
    rlpHeader: PromiseOrValue<BytesLike>,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  signedBlocks(
    arg0: PromiseOrValue<BytesLike>,
    overrides?: CallOverrides
  ): Promise<[BigNumber, string] & { cycleEnd: BigNumber; blockHash: string }>;

  voting(overrides?: CallOverrides): Promise<string>;

  callStatic: {
    addBlockchain(
      chainId: PromiseOrValue<BigNumberish>,
      rpc: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<void>;

    addSignedBlocks(
      blocks: BlockHeaderRegistry.BlockStruct[],
      overrides?: CallOverrides
    ): Promise<void>;

    blockHashes(
      arg0: PromiseOrValue<BigNumberish>,
      arg1: PromiseOrValue<BigNumberish>,
      arg2: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<string>;

    consensus(overrides?: CallOverrides): Promise<string>;

    enabledBlockchains(
      arg0: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<[string, BigNumber] & { rpc: string; chainId: BigNumber }>;

    getBlockHashByPayloadHash(
      payloadHash: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<string>;

    getRPCs(
      overrides?: CallOverrides
    ): Promise<BlockHeaderRegistry.BlockchainStructOutput[]>;

    getSignedBlock(
      chainId: PromiseOrValue<BigNumberish>,
      number: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<BlockHeaderRegistry.SignedBlockStructOutput>;

    hasValidatorSigned(
      arg0: PromiseOrValue<BytesLike>,
      arg1: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<boolean>;

    parseRLPBlockNumber(
      rlpHeader: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    signedBlocks(
      arg0: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<
      [BigNumber, string] & { cycleEnd: BigNumber; blockHash: string }
    >;

    voting(overrides?: CallOverrides): Promise<string>;
  };

  filters: {
    "BlockAdded(address,uint256,bytes32,address[],uint256)"(
      validator?: PromiseOrValue<string> | null,
      chainId?: PromiseOrValue<BigNumberish> | null,
      rlpHeaderHash?: PromiseOrValue<BytesLike> | null,
      validators?: null,
      cycleEnd?: null
    ): BlockAddedEventFilter;
    BlockAdded(
      validator?: PromiseOrValue<string> | null,
      chainId?: PromiseOrValue<BigNumberish> | null,
      rlpHeaderHash?: PromiseOrValue<BytesLike> | null,
      validators?: null,
      cycleEnd?: null
    ): BlockAddedEventFilter;

    "BlockchainAdded(uint256,string)"(
      chainId?: null,
      rpc?: null
    ): BlockchainAddedEventFilter;
    BlockchainAdded(chainId?: null, rpc?: null): BlockchainAddedEventFilter;

    "BlockchainRemoved(uint256)"(chainId?: null): BlockchainRemovedEventFilter;
    BlockchainRemoved(chainId?: null): BlockchainRemovedEventFilter;
  };

  estimateGas: {
    addBlockchain(
      chainId: PromiseOrValue<BigNumberish>,
      rpc: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    addSignedBlocks(
      blocks: BlockHeaderRegistry.BlockStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<BigNumber>;

    blockHashes(
      arg0: PromiseOrValue<BigNumberish>,
      arg1: PromiseOrValue<BigNumberish>,
      arg2: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    consensus(overrides?: CallOverrides): Promise<BigNumber>;

    enabledBlockchains(
      arg0: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getBlockHashByPayloadHash(
      payloadHash: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getRPCs(overrides?: CallOverrides): Promise<BigNumber>;

    getSignedBlock(
      chainId: PromiseOrValue<BigNumberish>,
      number: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    hasValidatorSigned(
      arg0: PromiseOrValue<BytesLike>,
      arg1: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    parseRLPBlockNumber(
      rlpHeader: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    signedBlocks(
      arg0: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    voting(overrides?: CallOverrides): Promise<BigNumber>;
  };

  populateTransaction: {
    addBlockchain(
      chainId: PromiseOrValue<BigNumberish>,
      rpc: PromiseOrValue<string>,
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    addSignedBlocks(
      blocks: BlockHeaderRegistry.BlockStruct[],
      overrides?: Overrides & { from?: PromiseOrValue<string> }
    ): Promise<PopulatedTransaction>;

    blockHashes(
      arg0: PromiseOrValue<BigNumberish>,
      arg1: PromiseOrValue<BigNumberish>,
      arg2: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    consensus(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    enabledBlockchains(
      arg0: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getBlockHashByPayloadHash(
      payloadHash: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getRPCs(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    getSignedBlock(
      chainId: PromiseOrValue<BigNumberish>,
      number: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    hasValidatorSigned(
      arg0: PromiseOrValue<BytesLike>,
      arg1: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    parseRLPBlockNumber(
      rlpHeader: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    signedBlocks(
      arg0: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    voting(overrides?: CallOverrides): Promise<PopulatedTransaction>;
  };
}
