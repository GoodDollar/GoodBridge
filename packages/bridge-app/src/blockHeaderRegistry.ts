// import  pino from 'pino'
import fs from 'fs';
import { isObject, random } from 'lodash';
import * as ethers from 'ethers';
import logger from 'js-logger';
import { Wallet, Signer } from 'ethers';
import { JsonRpcBatchProvider, JsonRpcProvider } from '@ethersproject/providers';
import { chunk, filter, flatten, merge, range, throttle } from 'lodash';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import pAll from 'p-all';
import * as SignUtils from './utils';
import ConsensusABI from './abi/ConsensusMock.json';

config({ override: true, debug: true, path: process.env.DOTENV_FILE || './.env' });

const { INDICATIVE_KEY, CONFIG_DIR = './', FUSE_RPC, STEP_SIZE = 10, TEST_MODE = 'false' } = process.env;
let configDir = CONFIG_DIR;
let validatorId;

const consoleHandler = logger.createDefaultHandler();
const errorHandler = (messages: Array<any>, context) => {
  if (!INDICATIVE_KEY || context.level.value !== logger.ERROR.value) return;

  const [eventName, ...rest] = messages;
  const objs: Array<object> = rest.filter((_) => isObject(_));
  const properties = merge({ validatorId }, ...objs);

  fetch(`https://api.indicative.com/service/event/${INDICATIVE_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      eventName,
      eventUniqueId: validatorId,
      properties,
    }),
  });
  console.log('sent error log', {
    eventName,
    eventUniqueId: validatorId,
    properties,
  });
};

const logLevel = logger['info'.toUpperCase()];
logger.setLevel(logLevel);

logger.setHandler((messages, context) => {
  consoleHandler(messages, context);
  errorHandler(messages, context);
});

// eslint-disable-next-line prefer-const
export let stepSize = Number(STEP_SIZE);

type ChainData = {
  lastBlock?: number;
  web3?: JsonRpcProvider;
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
  const rpc = new JsonRpcBatchProvider(registryRpc);
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
  // if (!ETH_RPC) throw 'Missing ETH_RPC in environment';
  // if (!BSC_RPC) throw 'Missing BSC_RPC in environment';
  // initBlockchain(1, ETH_RPC);
  // initBlockchain(56, BSC_RPC);
  // initBlockchain(122, FUSE_RPC || 'https://rpc.fuse.io/');
}

function initLastBlocks(lastBlocks: Array<[string, number]>) {
  lastBlocks.forEach(([key, lastBlock]) => (blockchains[key] = { lastBlock }));
}

async function initBlockchain(chainId: number, rpc: string) {
  //on fuse use the local validator node rpc
  if (chainId === 122) rpc = FUSE_RPC || rpc;
  logger.info('initBlockchain', { chainId, rpc });

  ////// this is a hack for ankr, for some reason this seems to initialize it correctly otherwise the JsonRpcBatchProvider below doesnt work
  const provider = new ethers.providers.JsonRpcProvider(rpc);
  await provider.getBlockNumber();
  /////

  blockchains[String(chainId)] = {
    web3: new ethers.providers.JsonRpcBatchProvider(rpc),
    rpc,
    lastBlock: blockchains[String(chainId)]?.lastBlock,
  };
}

//fetch every step block
async function fetchNewBlocks(signers: Array<Signer>) {
  const ps = Object.entries(blockchains).map(async ([chainId, blockchain]): Promise<SignedBlock[]> => {
    logger.info('starting fetchNewBlocks for', { chainId, lastCheckPoint: blockchain.lastBlock });
    let cycleEnd = 0;
    let cycleStart = 0;
    let validators = [];

    try {
      let curBlockNumber = await blockchain.web3.getBlockNumber();
      curBlockNumber = curBlockNumber - (curBlockNumber % stepSize);

      // const block = await blockchain.web3.eth.getBlock(blockchain.lastBlock ? blockchain.lastBlock + 1 : 'latest')
      const latestCheckpoint = await blockchain.web3.send('eth_getBlockByNumber', [
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
          range(blockchain.lastBlock + stepSize, curBlockNumber, stepSize).map(
            (i) => () => blockchain.web3.send('eth_getBlockByNumber', [ethers.utils.hexValue(i), false]),
          ),
          { concurrency: 50 },
        );
      }
      if (blockchain.lastBlock === curBlockNumber) {
        logger.info('no new blocks to fetch', { chainId });
        return [];
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

      blockchain.lastBlock = curBlockNumber;

      return signedBlocks;
    } catch (e) {
      //dont log twice
      if (e.message !== 'failed signing block')
        logger.error('failed fetching blocks:', {
          message: e.message,
          chainId,
          lastBlock: blockchain.lastBlock,
        });
      return [];
    }
  });

  const blocks = flatten(await Promise.all(ps)).filter((_) => _);
  return blocks;
}

const _refreshRPCs = async () => {
  try {
    const chains = await blockRegistryContract.getRPCs();
    logger.info('got registered rpcs:', chains);
    const randRpc = chains.map(({ chainId, rpc }) => {
      const rpcs = rpc.split(',');
      const randomRpc = rpcs[random(0, rpcs.length - 1)];
      return { chainId: chainId.toNumber(), rpc: randomRpc };
    });

    await Promise.all(
      randRpc
        .filter(({ chainId, rpc }) => !blockchains[chainId] || blockchains[chainId].rpc != rpc)
        .map(({ chainId, rpc }) => initBlockchain(chainId, rpc)),
    );
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

    const blocks = await fetchNewBlocks(signers || [blockRegistryContract.signer]);
    // const blocks : { [hash:string]: SignedBlock} = {};
    // const chainIds : {[ hash:string ]: string} = {};

    logger.info('got blocks:', blocks.map((_) => `${_.chainId}: ${_.blockHash}`).join(', '));
    if (blocks.length === 0) {
      return;
    }
    if (TEST_MODE === 'true') {
      logger.warn('skipping adding signed blocks in test mode');
      return [];
    }
    try {
      //write blocks in chunks of 10
      const chunks = chunk(blocks, 10);
      for (const blocksChunk of chunks) {
        const receipt = await (await blockRegistryContract.addSignedBlocks(blocksChunk)).wait();
        logger.info(`transactionHash: ${receipt.transactionHash} events: ${receipt.logs.length}`);
        logger.debug(`receipt: ${JSON.stringify(receipt)}`);
      }
      if (process.env.NODE_ENV !== 'test')
        fs.writeFileSync(
          configDir + 'lastBlocks.json',
          JSON.stringify(Object.entries(blockchains).map(([key, val]) => [key, val.lastBlock])),
        );
      return blocks;
    } catch (e) {
      logger.error('failed adding blocks to registry:', { message: e.message, blocks });
    }
  } catch (e) {
    logger.error('failed emitRegistry', { message: e.message });
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
