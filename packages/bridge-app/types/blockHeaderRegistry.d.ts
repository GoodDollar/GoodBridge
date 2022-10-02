/// <reference types="lodash" />
import { Wallet, Signer } from 'ethers';
import { JsonRpcBatchProvider } from '@ethersproject/providers';
export declare let stepSize: number;
declare type ChainData = {
    lastBlock?: number;
    web3?: JsonRpcBatchProvider;
    rpc?: string;
};
declare type SignedBlock = {
    rlpHeader: string;
    blockHash: string;
    chainId: number;
    signature: {
        r: string;
        vs: string;
    };
    cycleEnd?: number;
    validators?: Array<string>;
};
declare const blockchains: {
    [chainId: string]: ChainData;
};
declare function setStepSize(step: number): void;
declare function initBlockRegistryContract(signer: Wallet, registry: string, consensus: string, registryRpc: string): void;
declare function initBlockchain(chainId: number, rpc: string): void;
declare function fetchNewBlocks(signer: Signer): Promise<SignedBlock[]>;
declare const refreshRPCs: import("lodash").DebouncedFunc<() => Promise<void>>;
declare function emitRegistry(): Promise<SignedBlock[]>;
export { initBlockRegistryContract, initBlockchain, emitRegistry, blockchains, fetchNewBlocks, refreshRPCs, setStepSize, };
