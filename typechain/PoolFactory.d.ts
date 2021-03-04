/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import {
  ethers,
  EventFilter,
  Signer,
  BigNumber,
  BigNumberish,
  PopulatedTransaction,
} from "ethers";
import {
  Contract,
  ContractTransaction,
  Overrides,
  CallOverrides,
} from "@ethersproject/contracts";
import { BytesLike } from "@ethersproject/bytes";
import { Listener, Provider } from "@ethersproject/providers";
import { FunctionFragment, EventFragment, Result } from "@ethersproject/abi";
import { TypedEventFilter, TypedEvent, TypedListener } from "./commons";

interface PoolFactoryInterface extends ethers.utils.Interface {
  functions: {
    "POOL_BYTECODE_HASH()": FunctionFragment;
    "calculatePoolAddress(address,address)": FunctionFragment;
    "createPool(address,address)": FunctionFragment;
    "getPool(address,address)": FunctionFragment;
    "nextFYToken()": FunctionFragment;
    "nextToken()": FunctionFragment;
  };

  encodeFunctionData(
    functionFragment: "POOL_BYTECODE_HASH",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "calculatePoolAddress",
    values: [string, string]
  ): string;
  encodeFunctionData(
    functionFragment: "createPool",
    values: [string, string]
  ): string;
  encodeFunctionData(
    functionFragment: "getPool",
    values: [string, string]
  ): string;
  encodeFunctionData(
    functionFragment: "nextFYToken",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "nextToken", values?: undefined): string;

  decodeFunctionResult(
    functionFragment: "POOL_BYTECODE_HASH",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "calculatePoolAddress",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "createPool", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "getPool", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "nextFYToken",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "nextToken", data: BytesLike): Result;

  events: {
    "PoolCreated(address,address,address)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "PoolCreated"): EventFragment;
}

export class PoolFactory extends Contract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  listeners(eventName?: string): Array<Listener>;
  off(eventName: string, listener: Listener): this;
  on(eventName: string, listener: Listener): this;
  once(eventName: string, listener: Listener): this;
  removeListener(eventName: string, listener: Listener): this;
  removeAllListeners(eventName?: string): this;

  listeners<T, G>(
    eventFilter?: TypedEventFilter<T, G>
  ): Array<TypedListener<T, G>>;
  off<T, G>(
    eventFilter: TypedEventFilter<T, G>,
    listener: TypedListener<T, G>
  ): this;
  on<T, G>(
    eventFilter: TypedEventFilter<T, G>,
    listener: TypedListener<T, G>
  ): this;
  once<T, G>(
    eventFilter: TypedEventFilter<T, G>,
    listener: TypedListener<T, G>
  ): this;
  removeListener<T, G>(
    eventFilter: TypedEventFilter<T, G>,
    listener: TypedListener<T, G>
  ): this;
  removeAllListeners<T, G>(eventFilter: TypedEventFilter<T, G>): this;

  queryFilter<T, G>(
    event: TypedEventFilter<T, G>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEvent<T & G>>>;

  interface: PoolFactoryInterface;

  functions: {
    POOL_BYTECODE_HASH(overrides?: CallOverrides): Promise<[string]>;

    "POOL_BYTECODE_HASH()"(overrides?: CallOverrides): Promise<[string]>;

    calculatePoolAddress(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<[string]>;

    "calculatePoolAddress(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<[string]>;

    createPool(
      baseToken: string,
      fyToken: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "createPool(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    getPool(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<[string] & { pool: string }>;

    "getPool(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<[string] & { pool: string }>;

    nextFYToken(overrides?: CallOverrides): Promise<[string]>;

    "nextFYToken()"(overrides?: CallOverrides): Promise<[string]>;

    nextToken(overrides?: CallOverrides): Promise<[string]>;

    "nextToken()"(overrides?: CallOverrides): Promise<[string]>;
  };

  POOL_BYTECODE_HASH(overrides?: CallOverrides): Promise<string>;

  "POOL_BYTECODE_HASH()"(overrides?: CallOverrides): Promise<string>;

  calculatePoolAddress(
    baseToken: string,
    fyToken: string,
    overrides?: CallOverrides
  ): Promise<string>;

  "calculatePoolAddress(address,address)"(
    baseToken: string,
    fyToken: string,
    overrides?: CallOverrides
  ): Promise<string>;

  createPool(
    baseToken: string,
    fyToken: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "createPool(address,address)"(
    baseToken: string,
    fyToken: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  getPool(
    baseToken: string,
    fyToken: string,
    overrides?: CallOverrides
  ): Promise<string>;

  "getPool(address,address)"(
    baseToken: string,
    fyToken: string,
    overrides?: CallOverrides
  ): Promise<string>;

  nextFYToken(overrides?: CallOverrides): Promise<string>;

  "nextFYToken()"(overrides?: CallOverrides): Promise<string>;

  nextToken(overrides?: CallOverrides): Promise<string>;

  "nextToken()"(overrides?: CallOverrides): Promise<string>;

  callStatic: {
    POOL_BYTECODE_HASH(overrides?: CallOverrides): Promise<string>;

    "POOL_BYTECODE_HASH()"(overrides?: CallOverrides): Promise<string>;

    calculatePoolAddress(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<string>;

    "calculatePoolAddress(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<string>;

    createPool(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<string>;

    "createPool(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<string>;

    getPool(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<string>;

    "getPool(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<string>;

    nextFYToken(overrides?: CallOverrides): Promise<string>;

    "nextFYToken()"(overrides?: CallOverrides): Promise<string>;

    nextToken(overrides?: CallOverrides): Promise<string>;

    "nextToken()"(overrides?: CallOverrides): Promise<string>;
  };

  filters: {
    PoolCreated(
      baseToken: string | null,
      fyToken: string | null,
      pool: null
    ): TypedEventFilter<
      [string, string, string],
      { baseToken: string; fyToken: string; pool: string }
    >;
  };

  estimateGas: {
    POOL_BYTECODE_HASH(overrides?: CallOverrides): Promise<BigNumber>;

    "POOL_BYTECODE_HASH()"(overrides?: CallOverrides): Promise<BigNumber>;

    calculatePoolAddress(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "calculatePoolAddress(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    createPool(
      baseToken: string,
      fyToken: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "createPool(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    getPool(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPool(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    nextFYToken(overrides?: CallOverrides): Promise<BigNumber>;

    "nextFYToken()"(overrides?: CallOverrides): Promise<BigNumber>;

    nextToken(overrides?: CallOverrides): Promise<BigNumber>;

    "nextToken()"(overrides?: CallOverrides): Promise<BigNumber>;
  };

  populateTransaction: {
    POOL_BYTECODE_HASH(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "POOL_BYTECODE_HASH()"(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    calculatePoolAddress(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "calculatePoolAddress(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    createPool(
      baseToken: string,
      fyToken: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "createPool(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    getPool(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getPool(address,address)"(
      baseToken: string,
      fyToken: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    nextFYToken(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "nextFYToken()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    nextToken(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "nextToken()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;
  };
}