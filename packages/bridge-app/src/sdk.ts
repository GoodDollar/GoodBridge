import { JsonRpcBatchProvider, JsonRpcProvider, TransactionReceipt } from '@ethersproject/providers';
import { Contract, ethers, Signer } from 'ethers';
import { flatten, minBy, pick, random, range, uniqBy, groupBy, maxBy, last } from 'lodash';
import pAll from 'p-all';
import { abi as RegistryABI } from './abi/BlockHeaderRegistry.json';
import { abi as TokenBridgeABI } from './abi/TokenBridge.json';

import * as SignUtils from './utils';

const DEFAULT_BRIDGES = {
  1: ethers.constants.AddressZero,
};

export class BridgeSDK {
  registryContract: Contract;
  registryBlockFrequency: number;
  bridges: { [key: string]: string };
  rpcs: Array<{ chainId: number; rpc: string }> = undefined;

  constructor(
    registryAddress: string,
    bridges: { [key: string]: string } = {},
    registryBlockFrequency = 10,
    registryRpc = 'https://rpc.fuse.io',
  ) {
    this.registryContract = new ethers.Contract(registryAddress, RegistryABI, new JsonRpcBatchProvider(registryRpc));
    this.registryBlockFrequency = registryBlockFrequency;
    this.bridges = { ...DEFAULT_BRIDGES, ...bridges };
  }

  getChainRpc = async (chainId: number) => {
    const blockchains = this.rpcs || (await this.registryContract.getRPCs());
    this.rpcs = blockchains;
    // console.log(blockchains, { chainId });
    const blockchain = blockchains.find((_) => _.chainId.toNumber() === chainId);
    const rpcs = blockchain.rpc.split(',');
    const randomRpc = rpcs[random(0, rpcs.length - 1)];
    return new ethers.providers.JsonRpcBatchProvider(randomRpc);
  };

  getBridgeContract = async (chainId: number, provider?: JsonRpcProvider) => {
    const rpc = provider ?? (await this.getChainRpc(chainId));
    const bridgeAddress = this.bridges[chainId];
    return new ethers.Contract(bridgeAddress, TokenBridgeABI, rpc);
  };

  getCheckpointBlockFromEvents = async (sourceChainId: number, checkpointBlockNumber: number) => {
    const f = this.registryContract.filters['BlockAdded'](null, sourceChainId, checkpointBlockNumber);
    const events = await this.registryContract.queryFilter(f, -1e6);
    // console.log('found events:', events.length, { sourceChainId, checkpointBlockNumber });
    const bestCheckpoint = maxBy(
      Object.values(
        groupBy(
          uniqBy(events, (_) => _.args.validator),
          (_) => _.args.payload,
        ),
      ),
      (_) => _.length,
    );
    // console.log({ bestCheckpoint });
    return {
      signatures: bestCheckpoint.map((_) => _.args.signature),
      cycleEnd: bestCheckpoint[0].args.cycleEnd,
      validators: bestCheckpoint[0].args.validators,
    };
  };

  getBlocksToSubmit = async (
    sourceChainId: number,
    txBlockNumber: number,
    targetBridgeContract: Contract,
    getCheckpointFromEvents = true,
  ) => {
    //check if target bridge has required block
    const sourceTxBlockHash = await targetBridgeContract.chainVerifiedBlocks(sourceChainId, txBlockNumber);
    // // console.log({ sourceTxBlockHash }, txBlockNumber, this.registryBlockFrequency);
    let signedCheckPoint;
    const checkPointBlockNumber =
      txBlockNumber + (this.registryBlockFrequency - (txBlockNumber % this.registryBlockFrequency));
    if (!sourceTxBlockHash || sourceTxBlockHash === ethers.constants.HashZero) {
      //try to get the nearest checkpoint block from the header registry
      // // console.log('getSignedBlock checkpoint:', this.registryContract.address, {
      //   sourceChainId,
      //   checkPointBlockNumber,
      // });

      if (getCheckpointFromEvents) {
        signedCheckPoint = await this.getCheckpointBlockFromEvents(sourceChainId, checkPointBlockNumber).catch(
          (_) => undefined,
        );
      } else {
        signedCheckPoint = await this.registryContract
          .getSignedBlock(sourceChainId, checkPointBlockNumber)
          .catch((_) => false);
      }
      if (!signedCheckPoint) throw new Error(`checkpoint block ${checkPointBlockNumber} does not exists yet`);
    }
    //in anycase fetch checkpoint + parent blocks, since we require to submit the block rlp header with proof
    const parentAndCheckpointBlocks = await this.getChainBlockHeaders(
      sourceChainId,
      txBlockNumber,
      checkPointBlockNumber,
    );
    const checkpointBlock = last(parentAndCheckpointBlocks);

    const signedBlock = signedCheckPoint
      ? {
          chainId: sourceChainId,
          rlpHeader: checkpointBlock.rlpHeader,
          signatures: signedCheckPoint.signatures,
          cycleEnd: signedCheckPoint.cycleEnd,
          validators: signedCheckPoint.validators,
        }
      : undefined;

    return { checkPointBlockNumber, signedBlock, parentAndCheckpointBlocks };
  };

  getChainBlockHeaders = async (sourceChainId: number, startBlock: number, endBlock: number) => {
    const rpc = await this.getChainRpc(sourceChainId);
    const blocks = await pAll(
      range(startBlock, endBlock + 1).map(
        (i) => () => rpc.send('eth_getBlockByNumber', [ethers.utils.hexValue(i), false]),
      ),
      { concurrency: 50 },
    );
    return blocks.map((_) => SignUtils.prepareBlock(_));
  };

  submitBlocksAndExecute = async (
    sourceChainId: number,
    targetChainId: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    receiptProofs: Array<any>,
    signer: Signer,
  ) => {
    const targetBridgeContract = await this.getBridgeContract(targetChainId);

    const minBlockReceipt = minBy(receiptProofs, (_) => Number(_.receipt.blockNumber));
    const { checkPointBlockNumber, signedBlock, parentAndCheckpointBlocks } = await this.getBlocksToSubmit(
      sourceChainId,
      Number(minBlockReceipt.receipt.blockNumber),
      targetBridgeContract,
    );

    const mptProofs = receiptProofs.map((receiptProof) => {
      const txBlock = parentAndCheckpointBlocks.find(
        (_) => Number(_.block.number) === Number(receiptProof.receipt.blockNumber),
      );

      return {
        blockNumber: Number(receiptProof.receipt.blockNumber),
        blockHeaderRlp: txBlock.rlpHeader,
        receiptProofs: [
          {
            expectedRoot: receiptProof.receiptsRoot,
            expectedValue: receiptProof.receiptRlp,
            proof: receiptProof.receiptProof,
            key: SignUtils.index2key(receiptProof.txIndex, receiptProof.receiptProof.length),
            keyIndex: 0,
            proofIndex: 0,
          },
        ],
      };
    });

    if (signedBlock) {
      parentAndCheckpointBlocks.pop(); //remove the checkpoint block from parents we are submiting
      const parentRlps = parentAndCheckpointBlocks.map((_) => _.rlpHeader).reverse();

      //   const parentsChain = [
      //     checkpointBlock.block.parentHash,
      //     parentBlocks.map((_) => [_.block.hash, _.block.parentHash]),
      //   ];
      // console.log('parents chain:', parentsChain);
      // console.log({
      //     parentsChain,
      //     signedBlock,
      //     sourceChainId,
      //     checkPointBlockNumber,
      //     parentRlps,
      //     childHeader: checkpointBlock.rlpHeader,
      //     proofs: [
      //       {
      //         blockNumber: Number(receiptProof.receipt.blockNumber),
      //         blockHeaderRlp: receiptBlockHeaderRlp,
      //         receiptProofs: [mptProof],
      //       },
      //     ],
      //   });
      return targetBridgeContract
        .connect(signer)
        .submitChainBlockParentsAndTxs(signedBlock, checkPointBlockNumber, parentRlps, mptProofs);
    }
    // console.log({ sourceChainId, mptProof });
    return targetBridgeContract.connect(signer).executeReceipts(sourceChainId, mptProofs);
  };

  relayTx = async (sourceChainId: number, targetChainId: number, txHash: string, signer: Signer) => {
    return this.relayTxs(sourceChainId, targetChainId, [txHash], signer);
  };
  relayTxs = async (sourceChainId: number, targetChainId: number, txHashes: Array<string>, signer: Signer) => {
    const rpc = await this.getChainRpc(sourceChainId);
    const sourceBridgeContract = await this.getBridgeContract(sourceChainId, rpc);
    const receiptProofs = await Promise.all(
      txHashes.map((txHash) => SignUtils.receiptProof(txHash, rpc, sourceChainId)),
    );

    const logs = flatten(
      receiptProofs.map((receiptProof) => {
        receiptProof['logs'] = receiptProof.receipt.logs.map((log) => {
          try {
            return sourceBridgeContract.interface.parseLog(log);
          } catch (e) {
            return {};
          }
        });
        return receiptProof['logs'];
      }),
    );
    // const { from, to, targetChainId, amount } = logs.find((_) => _.name === 'BridgeRequest')?.args || {};
    const bridgeRequests = logs
      .filter((_) => _.name === 'BridgeRequest')
      .map((_) => pick(_.args, ['from', 'to', 'amount']));
    const tx = await this.submitBlocksAndExecute(sourceChainId, targetChainId, receiptProofs, signer);
    return {
      relayTxHash: tx.hash,
      relayPromise: tx.wait(),
      bridgeRequests,
    };
  };
}
