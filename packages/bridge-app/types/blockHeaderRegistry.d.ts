/// <reference types="lodash" />
import logger from 'js-logger';
import { Wallet, Signer } from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
export declare let stepSize: number;
declare type ChainData = {
    lastBlock?: number;
    web3?: JsonRpcProvider;
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
declare function initBlockRegistryContract(signer: Wallet, registry: string, consensus: string, registryRpc: string): Promise<void>;
declare function initBlockchain(chainId: number, rpc: string): Promise<void>;
declare function fetchNewBlocks(signers: Array<Signer>): Promise<SignedBlock[]>;
declare const _refreshRPCs: () => Promise<void>;
declare const refreshRPCs: import("lodash").DebouncedFunc<() => Promise<void>>;
declare function emitRegistry(signers?: Array<Signer>): Promise<SignedBlock[]>;
export { initBlockRegistryContract, initBlockchain, emitRegistry, blockchains, fetchNewBlocks, refreshRPCs, _refreshRPCs, setStepSize, logger, };
