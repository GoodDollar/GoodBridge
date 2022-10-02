import * as ethers from 'ethers';
export interface BlockHeader {
    number: number;
    hash: string;
    parentHash: string;
    nonce: string;
    sha3Uncles: string;
    logsBloom: string;
    transactionsRoot: string;
    stateRoot: string;
    receiptsRoot: string;
    miner: string;
    extraData: string;
    gasLimit: number;
    gasUsed: number;
    timestamp: number | string;
    baseFeePerGas?: number;
    size: number;
    difficulty: number;
    totalDifficulty: number;
    uncles: string[];
    transactions: string[];
}
export declare function getRlpHeader(web3Header: Partial<BlockHeader>): string;
export declare function signBlock(rlpHeader: string, chainId: number, signer: ethers.Signer, cycleEnd: number, validators: Array<string>): Promise<{
    rlpHeader: string;
    blockHash: string;
    chainId: number;
    signature: {
        r: string;
        vs: string;
    };
    cycleEnd: number;
    validators: string[];
}>;
export declare const getRegistryContract: (address: string, signer: ethers.Signer) => ethers.ethers.Contract;
export declare const getBlockchainHeader: (blockTag: string, chainId: number, rpc: string) => Promise<{
    block: BlockHeader;
    blockHeader: Partial<BlockHeader>;
    rlpHeader: string;
    computedHash: string;
}>;
export declare const prepareBlock: (block: BlockHeader, chainId?: number) => {
    block: BlockHeader;
    blockHeader: Partial<BlockHeader>;
    rlpHeader: string;
    computedHash: string;
};
export declare const index2key: (index: any, proofLength: any) => string;
export declare const receiptProof: (txHash: string, provider: ethers.providers.JsonRpcProvider, chainId?: number) => Promise<{
    receiptsRoot: string;
    headerRlp: string;
    receiptProof: any;
    txIndex: any;
    receiptRlp: string;
}>;
