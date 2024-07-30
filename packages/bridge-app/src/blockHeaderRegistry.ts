// import  pino from 'pino'
import fs from 'fs';
import * as ethers from 'ethers';
import { Wallet, Signer } from 'ethers';
import { JsonRpcProvider, FallbackProvider } from '@ethersproject/providers';
import { chunk, filter, flatten, merge, range, throttle, shuffle } from 'lodash';
import { config } from 'dotenv';
import pAll from 'p-all';
import * as SignUtils from './utils';
import { Logger } from './logger';
import ConsensusABI from './abi/ConsensusMock.json';

config({ override: true, debug: true, path: process.env.DOTENV_FILE || './.env' });

const {
  INDICATIVE_KEY,
  CONFIG_DIR = './',
  FUSE_RPC,
  STEP_SIZE = 10,
  TEST_MODE = 'false',
  BLOCKS_CHUNK = '100',
} = process.env;
const configDir = CONFIG_DIR;

let validatorId;

let logger = Logger('BlockRegistry', '', INDICATIVE_KEY);
// eslint-disable-next-line prefer-const
export let stepSize = Number(STEP_SIZE);

type ChainData = {
  lastBlock?: number;
  web3?: FallbackProvider;
  rpc?: string;
};

type SignedBlock = {
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
const blockchains: { [chainId: string]: ChainData } = {};

let blockRegistryContract: ethers.Contract, consensusContract: ethers.Contract;

function setStepSize(step: number) {
  stepSize = step;
}

async function initBlockRegistryContract(signer: Wallet, registry: string, consensus: string, registryRpc: string) {
  logger.info(`initBlockRegistryContract`, registry);
  const rpc = new JsonRpcProvider(registryRpc);
  signer = signer.connect(rpc);
  blockRegistryContract = SignUtils.getRegistryContract(registry, signer);
  consensusContract = new ethers.Contract(consensus, ConsensusABI.abi, rpc);

  try {
    if (process.env.NODE_ENV !== 'test') {
      const lastBlocks = JSON.parse(fs.readFileSync(configDir + 'lastBlocks.json').toString('utf8'));
      initLastBlocks(lastBlocks);
    }
  } catch (e) {
    logger.warn('unable to read lastBlocks.json', e.message);
  }
  validatorId = await signer.getAddress();
  logger = Logger('BlockRegistry', validatorId, INDICATIVE_KEY);
  // if (!ETH_RPC) throw 'Missing ETH_RPC in environment';
  // if (!BSC_RPC) throw 'Missing BSC_RPC in environment';
  // initBlockchain(1, ETH_RPC);
  // initBlockchain(56, BSC_RPC);
  // initBlockchain(122, FUSE_RPC || 'https://rpc.fuse.io/');
}

function initLastBlocks(lastBlocks: Array<[string, number]>) {
  lastBlocks.forEach(([key, lastBlock]) => (blockchains[key] = { lastBlock }));
}

async function initBlockchain(chainId: number, rpcs: Array<string>) {
  logger.info('initBlockchain', { chainId, rpcs });

  // ////// this is a hack for ankr, for some reason this seems to initialize it correctly otherwise the JsonRpcBatchProvider below doesnt work
  // const provider = new ethers.providers.JsonRpcProvider(rpc);
  // await provider.getBlockNumber();
  // /////
  const providers = rpcs.map((_) => new ethers.providers.JsonRpcProvider(_));

  blockchains[String(chainId)] = {
    web3: new ethers.providers.FallbackProvider(providers, 1),
    lastBlock: blockchains[String(chainId)]?.lastBlock,
  };
}

//fetch every step block
async function fetchNewBlocks(signers: Array<Signer>) {
  const ps = Object.entries(blockchains).map(
    async ([chainId, blockchain]): Promise<{
      signedBlocks: SignedBlock[];
      lastBlock: { [chainId: string]: number };
    }> => {
      logger.info('starting fetchNewBlocks for', { chainId, lastCheckPoint: blockchain.lastBlock });
      let cycleEnd = 0;
      let cycleStart = 0;
      let validators = [];
      let curBlockNumber = -1;
      try {
        const randProvider = shuffle(blockchain.web3.providerConfigs)[0].provider as JsonRpcProvider;
        logger.info('randProvider:', { chainId, rpc: randProvider.connection.url });
        curBlockNumber = await randProvider.getBlockNumber();
        curBlockNumber = curBlockNumber - (curBlockNumber % stepSize);
        logger.info('current block:', { chainId, curBlockNumber });
        // const block = await blockchain.web3.eth.getBlock(blockchain.lastBlock ? blockchain.lastBlock + 1 : 'latest')

        const latestCheckpoint = await randProvider.send('eth_getBlockByNumber', [
          '0x' + curBlockNumber.toString(16),
          false,
        ]);
        logger.info('current checkpoint block:', { chainId, curBlockNumber });

        let blocks = [];
        if (blockchain.lastBlock && blockchain.lastBlock < curBlockNumber) {
          logger.info('fetching missing blocks', {
            chainId,
            lastFetchedBlock: blockchain.lastBlock,
            curBlockNumber,
          });
          blocks = await pAll(
            range(blockchain.lastBlock + stepSize, curBlockNumber, stepSize).map((i) => () => {
              return randProvider.send('eth_getBlockByNumber', [ethers.utils.hexValue(i), false]);
            }),
            { concurrency: 50 },
          );
        }
        if (blockchain.lastBlock === curBlockNumber) {
          logger.info('no new blocks to fetch', { chainId });
          return { signedBlocks: [], lastBlock: { [String(chainId)]: curBlockNumber } };
        }

        blocks = filter(blocks);
        blocks.push(latestCheckpoint);

        logger.info('got blocks for chain:', {
          chainId,
          blocks: blocks.map((_) => Number(_.number)),
          latestCheckpoint: Number(latestCheckpoint.number),
        });

        if (chainId == '122') {
          [cycleStart, cycleEnd, validators] = await Promise.all([
            consensusContract.getCurrentCycleStartBlock().then((_) => _.toNumber()),
            consensusContract.getCurrentCycleEndBlock().then((_) => _.toNumber()),
            consensusContract.getValidators(),
          ]);
          logger.info('fuse consensus:', { cycleStart, cycleEnd, validators });
        }
        let wroteCycle = false;

        const signedBlocksPromises = blocks.map(async (block) => {
          let signedBlocks = [];
          try {
            logger.debug('before SignUtils.prepareBlock block:', { block, chainId });
            const { rlpHeader } = SignUtils.prepareBlock(block, Number(chainId));
            // rlpHeader,signature:{r: signature.r, vs: signature._vs },chainId:122,blockHash: block.hash,cycleEnd, validators
            if (chainId == '122') {
              //set validators only on change to save gas/storage
              if (!wroteCycle && blockchain.lastBlock < cycleStart && Number(block.number) >= cycleStart) {
                logger.info('writing fuse validators cycle:', { block: Number(block.number), cycleStart, cycleEnd });
                wroteCycle = true;
              } else {
                cycleEnd = 0;
                validators = [];
              }

              signedBlocks = await Promise.all(
                signers.map((signer) => SignUtils.signBlock(rlpHeader, 122, signer, cycleEnd, validators)),
              );
            } else {
              signedBlocks = await Promise.all(
                signers.map((signer) => SignUtils.signBlock(rlpHeader, Number(chainId), signer, 0, [])),
              );
            }
            return signedBlocks;
          } catch (e) {
            logger.error('failed signing block:', { message: e.message, block, chainId });
            throw new Error('failed signing block');
          }
        });
        const signedBlocks = flatten(filter(await Promise.all(signedBlocksPromises)));

        logger.info('got signed blocks:', signedBlocks.length, 'out of', blocks.length);

        return { signedBlocks, lastBlock: { [String(chainId)]: curBlockNumber } };
      } catch (e) {
        //dont log twice
        if (e.message !== 'failed signing block')
          logger.error('error fetching blocks:', {
            message: e.message,
            chainId,
            lastBlock: curBlockNumber,
            e,
          });
        return { signedBlocks: [], lastBlock: { [String(chainId)]: blockchain.lastBlock } };
      }
    },
  );

  const result = await Promise.all(ps);
  const blocks = flatten(result.map((_) => _.signedBlocks)).filter((_) => _);
  const lastBlocks: { [chainId: string]: number } = merge({}, ...result.map((_) => _.lastBlock));
  return { blocks, lastBlocks };
}

const _refreshRPCs = async () => {
  try {
    await initBlockchain(122, ['https://rpc.fuse.io', 'https://fuse.liquify.com']);
    await initBlockchain(42220, ['https://forno.celo.org', 'https://celo.drpc.org']);

    // const chains = await blockRegistryContract.getRPCs();
    // logger.info('got registered rpcs:', chains);
    // await Promise.all(
    //   chains.map(({ chainId, rpc }) => {
    //     const rpcs = rpc.split(',').filter((_) => _.includes('ankr') === false);
    //     if (chainId.toNumber() === 122 && FUSE_RPC) {
    //       //on fuse use the local validator node rpc
    //       rpcs.push(FUSE_RPC);
    //     }
    //     return initBlockchain(chainId.toNumber(), rpcs);
    //   }),
    // );

    // const randRpc = chains.map(({ chainId, rpc }) => {
    //   const rpcs = rpc.split(',').filter((_) => _.includes('ankr') === false); //currently removing ankr not behaving right with batchprovider
    //   if (chainId.toNumber() === 122 && FUSE_RPC) {
    //     //on fuse use the local validator node rpc
    //     rpcs.push(FUSE_RPC);
    //   }
    //   const randomRpc = rpcs[random(0, rpcs.length - 1)];
    //   return { chainId: chainId.toNumber(), rpc: randomRpc };
    // });

    // logger.info('selected rpcs:', { randRpc });
    // await Promise.all(
    //   randRpc
    //     .filter(({ chainId, rpc }) => !blockchains[chainId] || blockchains[chainId].rpc != rpc)
    //     .map(({ chainId, rpc }) => initBlockchain(chainId, rpc)),
    // );
  } catch (e) {
    logger.error('failed fetching rpcs:', { message: e.message });
  }
};

const refreshRPCs = throttle(_refreshRPCs, 1000 * 60 * 60);
/**
 * runs periodically
 */
async function emitRegistry(signers?: Array<Signer>) {
  try {
    logger.info('emitRegistry');

    const { blocks, lastBlocks } = await fetchNewBlocks(signers || [blockRegistryContract.signer]);
    // const blocks : { [hash:string]: SignedBlock} = {};
    // const chainIds : {[ hash:string ]: string} = {};

    logger.info('got blocks:', blocks.map((_) => `${_.chainId}: ${_.blockHash}`).join(', '), { lastBlocks });
    if (blocks.length === 0) {
      return;
    }
    if (TEST_MODE === 'true') {
      logger.warn('skipping adding signed blocks in test mode');
      return [];
    }
    try {
      //write blocks in chunks
      const chunks = chunk(blocks, Number(BLOCKS_CHUNK));
      for (const blocksChunk of chunks) {
        const receipt = await (await blockRegistryContract.addSignedBlocks(blocksChunk)).wait();
        logger.info(`transactionHash: ${receipt.transactionHash} events: ${receipt.logs.length}`);
        logger.debug(`receipt: ${JSON.stringify(receipt)}`);
      }
      // update last blocks written successfully
      Object.entries(lastBlocks).forEach(
        (kv) => (blockchains[kv[0]].lastBlock = Math.max(kv[1], blockchains[kv[0]].lastBlock)),
      );

      if (process.env.NODE_ENV !== 'test')
        fs.writeFileSync(
          configDir + 'lastBlocks.json',
          JSON.stringify(Object.entries(blockchains).map(([key, val]) => [key, val.lastBlock])),
        );
      return blocks;
    } catch (e) {
      logger.error('failed adding blocks to registry:', { message: e.message, blocks, lastBlocks });
      //recycle rpcs on error
      refreshRPCs();
    }
  } catch (e) {
    logger.error('failed emitRegistry', { message: e.message });
    //recycle rpcs on error
    refreshRPCs();
  }
}

export {
  initBlockRegistryContract,
  initBlockchain,
  emitRegistry,
  blockchains,
  fetchNewBlocks,
  refreshRPCs,
  _refreshRPCs,
  setStepSize,
  logger,
};
