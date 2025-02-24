import { JsonRpcProvider } from '@ethersproject/providers';
import { Contract, ethers, Signer } from 'ethers';
import { flatten, minBy, pick, random, range, uniqBy, groupBy, maxBy, last, chunk, takeWhile } from 'lodash';
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
  rpcs: Array<{ chainId: number; rpc: string }>;
  logger: typeof Logger;

  constructor(
    registryAddress: string,
    bridges: { [key: string]: string } = {},
    registryBlockFrequency = 10,
    registryRpc = 'https://rpc.fuse.io',
    multicalls: { [key: string]: string } = {},
    rpcs = [],
    logger = Logger,
  ) {
    this.registryContract = new ethers.Contract(registryAddress, RegistryABI, new JsonRpcProvider(registryRpc));
    this.registryBlockFrequency = registryBlockFrequency;
    this.bridges = { ...DEFAULT_BRIDGES, ...bridges };
    Object.entries(multicalls).map((pair) => setMulticallAddress(Number(pair[0]), pair[1]));
    this.logger = logger;
    this.rpcs = rpcs;
  }

  getChainRpc = async (chainId: number) => {
    if (!this.rpcs.length) {
      const blockchains = await this.registryContract.getRPCs();
      this.rpcs = blockchains.map((_) => ({ rpc: _.rpc, chainId: _.chainId.toNumber() }));
      this.logger.info('settings rpcs:', this.rpcs);
    }

    const blockchain = this.rpcs.find((_) => _.chainId === chainId)?.rpc;
    const rpcs = blockchain?.split(',').filter((_) => _.includes('ankr') === false); //currently removing ankr not behaving right with batchprovider
    const randomRpc = rpcs?.[random(0, rpcs.length - 1)];
    return new ethers.providers.JsonRpcProvider(randomRpc);
  };

  getBridgeContract = async (chainId: number, provider?: JsonRpcProvider) => {
    const rpc = provider ?? (await this.getChainRpc(chainId));
    const bridgeAddress = this.bridges[chainId];
    return new ethers.Contract(bridgeAddress, TokenBridgeABI, rpc);
  };

  getCheckpointBlockFromEvents = async (sourceChainId: number, checkpointBlockNumber: number) => {
    const f = this.registryContract.filters['BlockAdded'](null, sourceChainId, checkpointBlockNumber);
    const events = await this.registryContract.queryFilter(f, -1e6);
    if (events.length === 0) {
      const curBlock = await (await this.getChainRpc(sourceChainId)).getBlockNumber();
      const nextCheckpoint = checkpointBlockNumber + this.registryBlockFrequency;
      if (curBlock >= nextCheckpoint) {
        this.logger.warn('getCheckpointBlockFromEvents checkpoint missing trying next one:', {
          sourceChainId,
          checkpointBlockNumber,
          nextCheckpoint,
          curBlock,
        });
        return this.getCheckpointBlockFromEvents(sourceChainId, nextCheckpoint);
      }
      this.logger.warn('getCheckpointBlockFromEvents checkpoint missing but no possible new checkpoints:', {
        sourceChainId,
        checkpointBlockNumber,
        curBlock,
      });
    }
    const bestCheckpoint = maxBy(
      Object.values(
        groupBy(
          uniqBy(events, (_) => _.args?.validator),
          (_) => _.args?.payload,
        ),
      ),
      (_) => _.length,
    );
    this.logger.debug('getCheckpointBlockFromEvents', {
      sourceChainId,
      checkpointBlockNumber,
      bestCheckpoint,
      checkpointArgs: bestCheckpoint?.[0]?.args,
    });
    return {
      signatures: bestCheckpoint?.map((_) => _.args?.signature) || [],
      cycleEnd: bestCheckpoint?.[0]?.args?.cycleEnd || 0,
      validators: bestCheckpoint?.[0]?.args?.validators || [],
      checkpointBlockNumber, //return the actual checkpoint number in case we couldnt find the requested one
    };
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
    let checkpointBlockNumber =
      maxTxBlockNumber + (this.registryBlockFrequency - (maxTxBlockNumber % this.registryBlockFrequency));

    //if doesnt have latest block, then fetch nearest signed checkpoint block from registry
    if (!sourceTxBlockHash || sourceTxBlockHash === ethers.constants.HashZero) {
      //try to get the nearest checkpoint block from the header registry
      // // console.log('getSignedBlock checkpoint:', this.registryContract.address, {
      //   sourceChainId,
      //   checkpointBlockNumber,
      // });

      if (getCheckpointFromEvents) {
        signedCheckPoint = await this.getCheckpointBlockFromEvents(sourceChainId, checkpointBlockNumber).catch((e) => {
          this.logger.warn('getCheckpointBlockFromEvents', e, { sourceChainId, maxTxBlockNumber });
          return undefined;
        });
        checkpointBlockNumber = signedCheckPoint.checkpointBlockNumber;
      } else {
        signedCheckPoint = await this.registryContract
          .getSignedBlock(sourceChainId, checkpointBlockNumber)
          .catch((e) => {
            this.logger.warn('getSignedBlock', e);
            return false;
          });
      }
      this.logger.debug('got checkpoint block:', {
        checkpointBlockNumber,
        getCheckpointFromEvents,
        maxTxBlockNumber,
        signedCheckPoint,
      });
      if (!signedCheckPoint?.signatures?.length)
        throw new Error(`checkpoint block ${checkpointBlockNumber} does not exists yet`);
    } else {
      checkpointBlockNumber = maxTxBlockNumber; //since latest required block is already verified we dont need checkpoint
      this.logger.info('getBlocksToSubmit found verified checkpoint:', {
        minTxBlockNumber,
        checkpointBlockNumber,
        maxTxBlockNumber,
        sourceTxBlockHash,
      });
    }
    //in anycase fetch checkpoint + parent blocks, since we require to submit the block rlp header with proof
    const parentAndCheckpointBlocks = await this.getChainBlockHeaders(
      sourceChainId,
      minTxBlockNumber,
      checkpointBlockNumber,
    );

    parentAndCheckpointBlocks.forEach((b) =>
      this.logger.debug('getBlocksToSubmit parentAndCheckpointBlocks:', b.block.number),
    );
    const checkpointBlock = last(parentAndCheckpointBlocks);

    const signedBlock = {
      chainId: sourceChainId,
      rlpHeader: checkpointBlock?.rlpHeader || '',
      signatures: signedCheckPoint ? signedCheckPoint.signatures : [],
      cycleEnd: signedCheckPoint ? signedCheckPoint.cycleEnd : 0,
      validators: signedCheckPoint ? signedCheckPoint.validators : [],
    };

    return { checkpointBlockNumber, signedBlock, parentAndCheckpointBlocks };
  };

  getChainBlockHeaders = async (sourceChainId: number, startBlock: number, endBlock: number) => {
    this.logger.debug('getChainBlockHeaders fetching...', { sourceChainId, startBlock, endBlock });

    const rpc = await this.getChainRpc(sourceChainId);
    const blocks = await pAll(
      range(startBlock, endBlock + 1).map(
        (i) => () => rpc.send('eth_getBlockByNumber', [ethers.utils.hexValue(i), false]),
      ),
      { concurrency: 50 },
    );
    this.logger.debug('getChainBlockHeaders', { sourceChainId, startBlock, endBlock, fetchedBlocks: blocks.length });
    return blocks.map((_) => SignUtils.prepareBlock(_, sourceChainId));
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

    const { checkpointBlockNumber, signedBlock, parentAndCheckpointBlocks } = await this.getBlocksToSubmit(
      sourceChainId,
      Number(minBlockReceipt.receipt.blockNumber),
      Number(maxBlockReceipt.receipt.blockNumber),
      targetBridgeContract,
    ).catch((e) => {
      throw new Error(`getBlocksToSubmit failed: ${e.message}`);
    });
    this.logger.debug('submitBlocksAndExecute got blocks to submit:', {
      checkpointBlockNumber,
      signedBlock,
      parentAndCheckpointBlocks: parentAndCheckpointBlocks.length,
      receiptProofs,
    });
    const blockToReceipts = groupBy(receiptProofs, (_) => Number(_.receipt.blockNumber));
    const mptProofs = Object.entries(blockToReceipts).map(([k, receiptProofs]) => {
      const txBlock = parentAndCheckpointBlocks.find((_) => Number(_.block.number) === Number(k));

      return {
        blockNumber: Number(k),
        blockHeaderRlp: txBlock?.rlpHeader || '',
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
    //     checkpointBlockNumber,
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

    this.logger.debug('submitBlocksAndExecute data:', { signedBlock, checkpointBlockNumber, parentRlps });
    mptProofs.forEach((proof) => this.logger.debug('submitBlocksAndExecute proof:', JSON.stringify(proof)));
    const options =
      targetChainId === 42220
        ? { maxFeePerGas: 25e9, maxPriorityFeePerGas: 1e8 }
        : { maxFeePerGas: 15e9, maxPriorityFeePerGas: 1e9 };
    this.logger.info('calling submitBlocksAndExecute:', { targetChainId, options, checkpointBlockNumber });
    return targetBridgeContract
      .connect(signer)
      .submitChainBlockParentsAndTxs(signedBlock, checkpointBlockNumber, parentRlps, mptProofs, options);
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
    const bestBlock = maxBy(events, (_) => _.args?.blockNumber);

    if (bestBlock) return bestBlock.args?.blockNumber.toNumber() as number;
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
          return bridge.queryFilter(bridge.filters.BridgeRequest(), startBlock, toBlock).catch((e) => {
            this.logger.warn('fetchPendingBridgeRequests queryFilter failed:', e.message, e, {
              checkpointBlock,
              sourceChainId,
              bridge: bridge.address,
              startBlock,
              toBlock,
              rpc: (bridge.provider as JsonRpcProvider).connection.url,
            });
            throw new Error(
              `queryFilter BridgeRequest failed ${sourceChainId} startBlock=${startBlock} toBlock=${toBlock} rpc:${
                (bridge.provider as JsonRpcProvider).connection.url
              }`,
            );
          });
        }),
        { concurrency: 3 },
      ),
    );

    const targetEvents = events.filter((_) => _.args?.targetChainId.toNumber() === targetChainId);
    const maxEvents = targetEvents.slice(0, maxRequests);
    const lastBlock = last(maxEvents)?.blockNumber || 0;

    //add any events from lastblock so we process all block events
    maxEvents.push(...targetEvents.slice(maxRequests).filter((_) => _.blockNumber === lastBlock));

    const ids = maxEvents.map((_) => _.args?.id);

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
    let validEvents = maxEvents.filter((e) => unexecutedIds.includes(e.args?.id));

    //get events only in range of 50 blocks, since otherwise relay will take too much gas to submit checkpoint blocks
    validEvents = validEvents.filter((_) => _.blockNumber <= validEvents[0].blockNumber + 50);

    //TODO: take only events until bridge balance
    // takeWhile(validEvents, (event) => {
    //   total.add(event.args?.amount);
    //   total <= bridgeBalance;
    // });
    const lastValidBlock = last(validEvents)?.blockNumber || 0;

    lastProcessedBlock = validEvents.length === 0 ? lastProcessedBlock : lastValidBlock;

    return { validEvents, checkpointBlock, lastProcessedBlock, fetchEventsFromBlock };
  };

  // less strict, checks for events further back
  fetchPendingBridgeRequests2 = async (
    sourceChainId: number,
    targetChainId: number,
    fromBlock?: number,
    maxBlocks = 10000,
  ) => {
    const bridge = await this.getBridgeContract(sourceChainId);
    const targetBridge = await this.getBridgeContract(targetChainId);
    const targetToken = new ethers.Contract(
      await targetBridge.bridgedToken(),
      ['function balanceOf(address account) view returns(uint256)', 'function decimals() view returns(uint8)'],
      targetBridge.provider,
    );
    const targetBridgeBalance = await targetBridge.normalizeFromTokenTo18Decimals(
      await targetToken.balanceOf(targetBridge.address),
    );

    const targetMulti = new MultiCallContract(targetBridge.address, [
      'function executedRequests(uint256) view returns(bool)',
    ]);
    const multicallProvider = new Provider(targetBridge.provider, targetChainId);

    const checkpointBlock = await this.fetchLatestCheckpointBlock(sourceChainId).catch((e) => {
      throw new Error(`fetchLatestCheckpointBlock failed ${sourceChainId} ${e.message}`);
    });
    const fetchEventsFromBlock = fromBlock
      ? Math.min(fromBlock, checkpointBlock - maxBlocks)
      : checkpointBlock - maxBlocks;

    const STEP = 5000; //currently unless maxBlocks > 5000 this doesnt have any effect
    let lastProcessedBlock = Math.min(fetchEventsFromBlock + maxBlocks, checkpointBlock);

    const events = flatten(
      await pAll(
        range(fetchEventsFromBlock, lastProcessedBlock + 1, STEP).map((startBlock) => () => {
          const toBlock = Math.min(startBlock + STEP, lastProcessedBlock);
          // console.log('fetching bridgerequests:', { startBlock, toBlock });
          return bridge.queryFilter(bridge.filters.BridgeRequest(), startBlock, toBlock).catch((e) => {
            this.logger.warn('fetchPendingBridgeRequests queryFilter failed:', e.message, e, {
              checkpointBlock,
              sourceChainId,
              bridge: bridge.address,
              startBlock,
              toBlock,
              rpc: (bridge.provider as JsonRpcProvider).connection.url,
            });
            throw new Error(
              `queryFilter BridgeRequest failed ${sourceChainId} startBlock=${startBlock} toBlock=${toBlock} rpc:${
                (bridge.provider as JsonRpcProvider).connection.url
              }`,
            );
          });
        }),
        { concurrency: 3 },
      ),
    );

    const targetEvents = events.filter((_) => _.args?.targetChainId.toNumber() === targetChainId);

    const ids = targetEvents.map((_) => _.args?.id);

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

    const unexecutedIds = ids.filter((v, i) => idsResult[i] === false);
    let validEvents = targetEvents.filter((e) => unexecutedIds.includes(e.args?.id));

    //get events only in range of 50 blocks, since otherwise relay will take too much gas to submit checkpoint blocks
    validEvents = validEvents.filter((_) => _.blockNumber <= validEvents[0].blockNumber + 50);
    let total = ethers.constants.Zero;
    validEvents = takeWhile(validEvents, (e) => {
      total = total.add(e.args?.amount || 0);
      return total.lte(targetBridgeBalance);
    });
    const lastValidBlock = last(validEvents)?.blockNumber - 1 || 0;

    lastProcessedBlock = unexecutedIds.length === 0 ? lastProcessedBlock : lastValidBlock;

    this.logger.info('fetchPendingBridgeRequests', {
      bridge: bridge.address,
      totalBridgedValue: total.toString(),
      targetBridgeBalance: targetBridgeBalance.toString(),
      checkpointBlock,
      lastProcessedBlock,
      fetchEventsFromBlock,
      events: targetEvents.length,
      unexecutedEvents: unexecutedIds.length,
      toExecute: validEvents.length,
    });

    return { validEvents, checkpointBlock, lastProcessedBlock, fetchEventsFromBlock };
  };
}
