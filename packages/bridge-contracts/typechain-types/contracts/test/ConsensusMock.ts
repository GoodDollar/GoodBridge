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

export interface ConsensusMockInterface extends utils.Interface {
  functions: {
    "currentValidators(uint256)": FunctionFragment;
    "getCurrentCycleEndBlock()": FunctionFragment;
    "getCurrentCycleStartBlock()": FunctionFragment;
    "getValidators()": FunctionFragment;
    "isValidator(address)": FunctionFragment;
  };

  getFunction(
    nameOrSignatureOrTopic:
      | "currentValidators"
      | "getCurrentCycleEndBlock"
      | "getCurrentCycleStartBlock"
      | "getValidators"
      | "isValidator"
  ): FunctionFragment;

  encodeFunctionData(
    functionFragment: "currentValidators",
    values: [PromiseOrValue<BigNumberish>]
  ): string;
  encodeFunctionData(
    functionFragment: "getCurrentCycleEndBlock",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "getCurrentCycleStartBlock",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "getValidators",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "isValidator",
    values: [PromiseOrValue<string>]
  ): string;

  decodeFunctionResult(
    functionFragment: "currentValidators",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getCurrentCycleEndBlock",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getCurrentCycleStartBlock",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getValidators",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "isValidator",
    data: BytesLike
  ): Result;

  events: {};
}

export interface ConsensusMock extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: ConsensusMockInterface;

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
    currentValidators(
      arg0: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<[string]>;

    getCurrentCycleEndBlock(overrides?: CallOverrides): Promise<[BigNumber]>;

    getCurrentCycleStartBlock(overrides?: CallOverrides): Promise<[BigNumber]>;

    getValidators(overrides?: CallOverrides): Promise<[string[]]>;

    isValidator(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<[boolean]>;
  };

  currentValidators(
    arg0: PromiseOrValue<BigNumberish>,
    overrides?: CallOverrides
  ): Promise<string>;

  getCurrentCycleEndBlock(overrides?: CallOverrides): Promise<BigNumber>;

  getCurrentCycleStartBlock(overrides?: CallOverrides): Promise<BigNumber>;

  getValidators(overrides?: CallOverrides): Promise<string[]>;

  isValidator(
    arg0: PromiseOrValue<string>,
    overrides?: CallOverrides
  ): Promise<boolean>;

  callStatic: {
    currentValidators(
      arg0: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<string>;

    getCurrentCycleEndBlock(overrides?: CallOverrides): Promise<BigNumber>;

    getCurrentCycleStartBlock(overrides?: CallOverrides): Promise<BigNumber>;

    getValidators(overrides?: CallOverrides): Promise<string[]>;

    isValidator(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<boolean>;
  };

  filters: {};

  estimateGas: {
    currentValidators(
      arg0: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getCurrentCycleEndBlock(overrides?: CallOverrides): Promise<BigNumber>;

    getCurrentCycleStartBlock(overrides?: CallOverrides): Promise<BigNumber>;

    getValidators(overrides?: CallOverrides): Promise<BigNumber>;

    isValidator(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    currentValidators(
      arg0: PromiseOrValue<BigNumberish>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getCurrentCycleEndBlock(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getCurrentCycleStartBlock(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getValidators(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    isValidator(
      arg0: PromiseOrValue<string>,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;
  };
}
