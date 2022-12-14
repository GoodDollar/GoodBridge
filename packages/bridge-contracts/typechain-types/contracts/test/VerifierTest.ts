/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  BaseContract,
  BigNumber,
  BigNumberish,
  BytesLike,
  CallOverrides,
  PopulatedTransaction,
  Signer,
  utils,
} from "ethers";
import type { FunctionFragment, Result } from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type {
  TypedEventFilter,
  TypedEvent,
  TypedListener,
  OnEvent,
  PromiseOrValue,
} from "../../common";

export declare namespace RLPParser {
  export type LogStruct = {
    contractAddress: PromiseOrValue<string>;
    topics: PromiseOrValue<BytesLike>[];
    data: PromiseOrValue<BytesLike>;
  };

  export type LogStructOutput = [string, string[], string] & {
    contractAddress: string;
    topics: string[];
    data: string;
  };

  export type TransactionReceiptStruct = {
    status: PromiseOrValue<BigNumberish>;
    gasUsed: PromiseOrValue<BigNumberish>;
    logsBloom: PromiseOrValue<BytesLike>;
    logs: RLPParser.LogStruct[];
  };

  export type TransactionReceiptStructOutput = [
    number,
    BigNumber,
    string,
    RLPParser.LogStructOutput[]
  ] & {
    status: number;
    gasUsed: BigNumber;
    logsBloom: string;
    logs: RLPParser.LogStructOutput[];
  };
}

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

export interface VerifierTestInterface extends utils.Interface {
  functions: {
    "parseReceipt(bytes)": FunctionFragment;
    "verifyReceipt((bytes32,bytes,bytes[],uint256,uint256,bytes))": FunctionFragment;
  };

  getFunction(
    nameOrSignatureOrTopic: "parseReceipt" | "verifyReceipt"
  ): FunctionFragment;

  encodeFunctionData(
    functionFragment: "parseReceipt",
    values: [PromiseOrValue<BytesLike>]
  ): string;
  encodeFunctionData(
    functionFragment: "verifyReceipt",
    values: [MPT.MerkleProofStruct]
  ): string;

  decodeFunctionResult(
    functionFragment: "parseReceipt",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "verifyReceipt",
    data: BytesLike
  ): Result;

  events: {};
}

export interface VerifierTest extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: VerifierTestInterface;

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
    parseReceipt(
      receiptRlp: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<
      [RLPParser.TransactionReceiptStructOutput] & {
        receipt: RLPParser.TransactionReceiptStructOutput;
      }
    >;

    verifyReceipt(
      proof: MPT.MerkleProofStruct,
      overrides?: CallOverrides
    ): Promise<[boolean] & { ok: boolean }>;
  };

  parseReceipt(
    receiptRlp: PromiseOrValue<BytesLike>,
    overrides?: CallOverrides
  ): Promise<RLPParser.TransactionReceiptStructOutput>;

  verifyReceipt(
    proof: MPT.MerkleProofStruct,
    overrides?: CallOverrides
  ): Promise<boolean>;

  callStatic: {
    parseReceipt(
      receiptRlp: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<RLPParser.TransactionReceiptStructOutput>;

    verifyReceipt(
      proof: MPT.MerkleProofStruct,
      overrides?: CallOverrides
    ): Promise<boolean>;
  };

  filters: {};

  estimateGas: {
    parseReceipt(
      receiptRlp: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    verifyReceipt(
      proof: MPT.MerkleProofStruct,
      overrides?: CallOverrides
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    parseReceipt(
      receiptRlp: PromiseOrValue<BytesLike>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    verifyReceipt(
      proof: MPT.MerkleProofStruct,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;
  };
}
