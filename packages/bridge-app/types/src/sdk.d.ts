import { JsonRpcBatchProvider, JsonRpcProvider } from '@ethersproject/providers';
import { Contract, ethers, Signer } from 'ethers';
import Logger from 'js-logger';
import * as SignUtils from './utils';
export declare class BridgeSDK {
    registryContract: Contract;
    registryBlockFrequency: number;
    bridges: {
        [key: string]: string;
    };
    rpcs: Array<{
        chainId: number;
        rpc: string;
    }>;
    logger: typeof Logger;
    constructor(registryAddress: string, bridges?: {
        [key: string]: string;
    }, registryBlockFrequency?: number, registryRpc?: string, multicalls?: {
        [key: string]: string;
    }, logger?: typeof Logger);
    getChainRpc: (chainId: number) => Promise<JsonRpcBatchProvider>;
    getBridgeContract: (chainId: number, provider?: JsonRpcProvider) => Promise<Contract>;
    getCheckpointBlockFromEvents: (sourceChainId: number, checkpointBlockNumber: number) => Promise<{
        signatures: any[];
        cycleEnd: any;
        validators: any;
    }>;
    getBlocksToSubmit: (sourceChainId: number, minTxBlockNumber: number, maxTxBlockNumber: number, targetBridgeContract: Contract, getCheckpointFromEvents?: boolean) => Promise<{
        checkPointBlockNumber: number;
        signedBlock: {
            chainId: number;
            rlpHeader: string;
            signatures: any;
            cycleEnd: any;
            validators: any;
        };
        parentAndCheckpointBlocks: {
            block: SignUtils.BlockHeader;
            blockHeader: Partial<SignUtils.BlockHeader>;
            rlpHeader: string;
            computedHash: string;
        }[];
    }>;
    getChainBlockHeaders: (sourceChainId: number, startBlock: number, endBlock: number) => Promise<{
        block: SignUtils.BlockHeader;
        blockHeader: Partial<SignUtils.BlockHeader>;
        rlpHeader: string;
        computedHash: string;
    }[]>;
    submitBlocksAndExecute: (sourceChainId: number, targetChainId: number, receiptProofs: Array<any>, signer: Signer) => Promise<any>;
    relayTx: (sourceChainId: number, targetChainId: number, txHash: string, signer: Signer) => Promise<{
        relayTxHash: any;
        relayPromise: any;
        bridgeRequests: Pick<any, string>[];
    }>;
    relayTxs: (sourceChainId: number, targetChainId: number, txHashes: Array<string>, signer: Signer) => Promise<{
        relayTxHash: any;
        relayPromise: any;
        bridgeRequests: Pick<any, string>[];
    }>;
    fetchLatestCheckpointBlock: (sourceChainId: number) => Promise<number>;
    fetchPendingBridgeRequests: (sourceChainId: number, targetChainId: number, fromBlock?: number, maxBlocks?: number, maxRequests?: number) => Promise<{
        validEvents: ethers.Event[];
        checkpointBlock: number;
        lastProcessedBlock: number;
        fetchEventsFromBlock: number;
    }>;
}
