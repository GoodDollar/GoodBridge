import { JsonRpcBatchProvider, JsonRpcProvider } from '@ethersproject/providers';
import { Contract, ethers, Signer } from 'ethers';
import { flatten, minBy, pick, random, range, uniqBy, groupBy, maxBy, last, chunk } from 'lodash';
import pAll from 'p-all';
import Logger from 'js-logger';
import { abi as RegistryABI } from './abi/BlockHeaderRegistry.json';
import { abi as TokenBridgeABI } from './abi/TokenBridge.json';
import * as SignUtils from './utils';
import { Contract as MultiCallContract, Provider, setMulticallAddress } from 'ethers-multicall';

setMulticallAddress(122, '0x3CE6158b7278Bf6792e014FA7B4f3c6c46fe9410');
setMulticallAddress(42220, '0xa27A0C40A0a17485c11d1f342a95c946E9523551');

const DEFAULT_BRIDGES = {
  1: ethers.constants.AddressZero,
};

export class BridgeSDK {
  registryContract: Contract;
  registryBlockFrequency: number;
  bridges: { [key: string]: string };
  rpcs: Array<{ chainId: number; rpc: string }> = undefined;
  logger: typeof Logger;

  constructor(
    registryAddress: string,
    bridges: { [key: string]: string } = {},
    registryBlockFrequency = 10,
    registryRpc = 'https://rpc.fuse.io',
    multicalls: { [key: string]: string } = {},
    logger?: typeof Logger,
  ) {
    this.registryContract = new ethers.Contract(registryAddress, RegistryABI, new JsonRpcBatchProvider(registryRpc));
    this.registryBlockFrequency = registryBlockFrequency;
    this.bridges = { ...DEFAULT_BRIDGES, ...bridges };
    Object.entries(multicalls).map((pair) => setMulticallAddress(Number(pair[0]), pair[1]));
    this.logger = logger;
  }

  getChainRpc = async (chainId: number) => {
    const blockchains = this.rpcs || (await this.registryContract.getRPCs());

    this.rpcs = blockchains;

    const blockchain = blockchains.find((_) => _.chainId.toNumber() === chainId)?.rpc;
    const rpcs = blockchain.split(',').filter((_) => _.includes('ankr') === false); //currently removing ankr not behaving right with batchprovider
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
    return (
      bestCheckpoint && {
        signatures: bestCheckpoint.map((_) => _.args.signature),
        cycleEnd: bestCheckpoint[0].args.cycleEnd,
        validators: bestCheckpoint[0].args.validators,
      }
    );
  };

  getBlocksToSubmit = async (
    sourceChainId: number,
    minTxBlockNumber: number,
    maxTxBlockNumber: number,
    targetBridgeContract: Contract,
    getCheckpointFromEvents = true,
  ) => {
    //check if target bridge has latest required block
    const sourceTxBlockHash = await targetBridgeContract.chainVerifiedBlocks(sourceChainId, maxTxBlockNumber);
    // // console.log({ sourceTxBlockHash }, txBlockNumber, this.registryBlockFrequency);
    let signedCheckPoint;
    const checkPointBlockNumber =
      maxTxBlockNumber + (this.registryBlockFrequency - (maxTxBlockNumber % this.registryBlockFrequency));

    //if doesnt have latest block, then fetch nearest signed checkpoint block from registry
    if (!sourceTxBlockHash || sourceTxBlockHash === ethers.constants.HashZero) {
      //try to get the nearest checkpoint block from the header registry
      // // console.log('getSignedBlock checkpoint:', this.registryContract.address, {
      //   sourceChainId,
      //   checkPointBlockNumber,
      // });

      if (getCheckpointFromEvents) {
        signedCheckPoint = await this.getCheckpointBlockFromEvents(sourceChainId, checkPointBlockNumber).catch((e) => {
          console.warn('getCheckpointBlockFromEvents', e);
          return undefined;
        });
      } else {
        signedCheckPoint = await this.registryContract
          .getSignedBlock(sourceChainId, checkPointBlockNumber)
          .catch((e) => {
            console.warn('getSignedBlock', e);
            return false;
          });
      }
      if (!signedCheckPoint) throw new Error(`checkpoint block ${checkPointBlockNumber} does not exists yet`);
    }
    //in anycase fetch checkpoint + parent blocks, since we require to submit the block rlp header with proof
    const parentAndCheckpointBlocks = await this.getChainBlockHeaders(
      sourceChainId,
      minTxBlockNumber,
      checkPointBlockNumber,
    );
    const checkpointBlock = last(parentAndCheckpointBlocks);

    const signedBlock = {
      chainId: sourceChainId,
      rlpHeader: checkpointBlock.rlpHeader,
      signatures: signedCheckPoint ? signedCheckPoint.signatures : [],
      cycleEnd: signedCheckPoint ? signedCheckPoint.cycleEnd : 0,
      validators: signedCheckPoint ? signedCheckPoint.validators : [],
    };

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
    const maxBlockReceipt = maxBy(receiptProofs, (_) => Number(_.receipt.blockNumber));

    const { checkPointBlockNumber, signedBlock, parentAndCheckpointBlocks } = await this.getBlocksToSubmit(
      sourceChainId,
      Number(minBlockReceipt.receipt.blockNumber),
      Number(maxBlockReceipt.receipt.blockNumber),
      targetBridgeContract,
    ).catch((e) => {
      throw new Error(`getBlocksToSubmit failed: ${e.message}`);
    });

    const blockToReceipts = groupBy(receiptProofs, (_) => Number(_.receipt.blockNumber));
    const mptProofs = Object.entries(blockToReceipts).map(([k, receiptProofs]) => {
      const txBlock = parentAndCheckpointBlocks.find((_) => Number(_.block.number) === Number(k));

      return {
        blockNumber: Number(k),
        blockHeaderRlp: txBlock.rlpHeader,
        receiptProofs: receiptProofs.map((receiptProof) => ({
          expectedRoot: receiptProof.receiptsRoot,
          expectedValue: receiptProof.receiptRlp,
          proof: receiptProof.receiptProof,
          key: SignUtils.index2key(receiptProof.txIndex, receiptProof.receiptProof.length),
          keyIndex: 0,
          proofIndex: 0,
        })),
      };
    });

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
  };

  relayTx = async (sourceChainId: number, targetChainId: number, txHash: string, signer: Signer) => {
    return await this.relayTxs(sourceChainId, targetChainId, [txHash], signer);
  };

  relayTxs = async (sourceChainId: number, targetChainId: number, txHashes: Array<string>, signer: Signer) => {
    const rpc = await this.getChainRpc(sourceChainId);
    const sourceBridgeContract = await this.getBridgeContract(sourceChainId, rpc);
    const receiptProofs = await Promise.all(
      txHashes.map((txHash) => SignUtils.receiptProof(txHash, rpc, sourceChainId)),
    ).catch((e) => {
      throw new Error(`receiptProof failed: ${e.message}`);
    });

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
    const tx = await this.submitBlocksAndExecute(sourceChainId, targetChainId, receiptProofs, signer).catch((e) => {
      throw new Error(`submitBlocksAndExecute failed: ${e.message}`);
    });
    return {
      relayTxHash: tx.hash,
      relayPromise: tx.wait(),
      bridgeRequests,
    };
  };

  fetchLatestCheckpointBlock = async (sourceChainId: number) => {
    /// get the latest added block as checkpoint
    //TODO: need to verify latest checkpoint has enough signers according to the bridge contract requirements
    const latestCheckpointFilter = this.registryContract.filters.BlockAdded(null, sourceChainId);
    const events = await this.registryContract.queryFilter(latestCheckpointFilter, -(this.registryBlockFrequency * 10));
    const bestBlock = maxBy(events, (_) => _.args.blockNumber);

    if (bestBlock) return bestBlock.args.blockNumber.toNumber() as number;
    throw new Error(`no recent checkpoint block for chain ${sourceChainId}`);
  };

  fetchPendingBridgeRequests = async (
    sourceChainId: number,
    targetChainId: number,
    fromBlock?: number,
    maxBlocks = 10000,
    maxRequests = 100,
  ) => {
    const bridge = await this.getBridgeContract(sourceChainId);
    const targetBridge = await this.getBridgeContract(targetChainId);

    const targetMulti = new MultiCallContract(targetBridge.address, [
      'function executedRequests(uint256) view returns(bool)',
    ]);
    const multicallProvider = new Provider(targetBridge.provider, targetChainId);

    const checkpointBlock = await this.fetchLatestCheckpointBlock(sourceChainId).catch((e) => {
      throw new Error(`fetchLatestCheckpointBlock failed ${sourceChainId} ${e.message}`);
    });
    const fetchEventsFromBlock = fromBlock || Math.max(checkpointBlock - 20000, 0);
    const STEP = 5000; //currently unless maxBlocks > 5000 this doesnt have any effect
    let lastProcessedBlock = Math.min(fetchEventsFromBlock + maxBlocks, checkpointBlock);

    const events = flatten(
      await pAll(
        range(fetchEventsFromBlock, lastProcessedBlock + 1, STEP).map((startBlock) => () => {
          const toBlock = Math.min(startBlock + STEP, lastProcessedBlock);
          // console.log('fetching bridgerequests:', { startBlock, toBlock });
          return bridge.queryFilter('BridgeRequest', startBlock, toBlock).catch(() => {
            throw new Error(
              `queryFilter BridgeRequest failed ${sourceChainId} startBlock=${startBlock} toBlock=${toBlock}`,
            );
          });
        }),
        { concurrency: 5 },
      ),
    );

    const targetEvents = events.filter((_) => _.args.targetChainId.toNumber() === targetChainId);
    const maxEvents = targetEvents.slice(0, maxRequests);
    const lastBlock = last(maxEvents)?.blockNumber || 0;

    //add any events from lastblock so we process all block events
    maxEvents.push(...targetEvents.slice(maxRequests).filter((_) => _.blockNumber === lastBlock));

    const ids = maxEvents.map((_) => _.args.id);

    const idsResult = flatten(
      await pAll(
        chunk(ids, 500).map((idsChunk) => () => {
          const calls = idsChunk.map((id) => targetMulti.executedRequests(id));
          return multicallProvider.all(calls).catch(() => {
            throw new Error(
              `multicallProvider failed ${calls.length} multicall=${targetMulti.address} sample ids:${idsChunk.slice(
                0,
                10,
              )}`,
            );
          });
        }),
        { concurrency: 5 },
      ),
    );

    // console.log('fetchPendingBridgeRequests', {
    //   checkpointBlock,
    //   lastProcessedBlock,
    //   fetchEventsFromBlock,
    //   events: events.length,
    // });

    const unexecutedIds = ids.filter((v, i) => idsResult[i] === false);
    let validEvents = maxEvents.filter((e) => unexecutedIds.includes(e.args.id));

    //get events only in range of 50 blocks, since otherwise relay will take too much gas to submit checkpoint blocks
    validEvents = validEvents.filter((_) => _.blockNumber <= validEvents[0].blockNumber + 50);
    const lastValidBlock = last(validEvents)?.blockNumber || 0;

    lastProcessedBlock = validEvents.length === 0 ? lastProcessedBlock : lastValidBlock;

    return { validEvents, checkpointBlock, lastProcessedBlock, fetchEventsFromBlock };
  };
}
