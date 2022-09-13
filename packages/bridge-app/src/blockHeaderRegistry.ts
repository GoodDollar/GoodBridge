// import  pino from 'pino'
import fs from "fs"
import * as ethers from "ethers"
import logger from 'js-logger'
import * as SignUtils from './utils'
import ConsensusABI from './abi/ConsensusMock.json'

import { Wallet, Signer } from 'ethers'
import { JsonRpcBatchProvider } from '@ethersproject/providers'
import { chunk, flatten, forEach, range, throttle } from 'lodash'


const { ETH_RPC, BSC_RPC, FUSE_RPC, REGISTRY_RPC, BLOCK_REGISTRY_ADDRESS, CONSENSUS_ADDRESS } = process.env

logger.useDefaults();

// const logLevel = logger['debug'.toUpperCase()]

// logger.setLevel(logLevel)

type ChainData = {
  lastBlock?: number,
  web3: JsonRpcBatchProvider,
  rpc: string
}

type SignedBlock = {
  rlpHeader: string,
  blockHash: string,
  chainId: number,
  signature: {
    r: string,
    vs: string
  },
  cycleEnd?: number,
  validators?: Array<string>,
}
const blockchains: { [chainId: string]: ChainData } = {}

let blockRegistryContract: ethers.Contract, consensusContract: ethers.Contract;

function initBlockRegistryContract(signer: Wallet, registry, consensus, registryRpc) {
  logger.info(`initBlockRegistryContract`, registry);
  const rpc = new JsonRpcBatchProvider(registryRpc)
  signer = signer.connect(rpc)
  blockRegistryContract = SignUtils.getRegistryContract(registry, signer)
  consensusContract = new ethers.Contract("0x3014ca10b91cb3D0AD85fEf7A3Cb95BCAc9c0f79", ConsensusABI.abi)

  // if (!ETH_RPC) throw 'Missing ETH_RPC in environment';
  // if (!BSC_RPC) throw 'Missing BSC_RPC in environment';
  // initBlockchain(1, ETH_RPC);
  // initBlockchain(56, BSC_RPC);
  // initBlockchain(122, FUSE_RPC || 'https://rpc.fuse.io/');
}

function initBlockchain(chainId: number, rpc: string) {
  logger.info('initBlockchain', { chainId, rpc });
  blockchains[String(chainId)] = {
    web3: new JsonRpcBatchProvider(rpc),
    rpc,
    lastBlock: null //todo persistance
  };
}



async function fetchNewBlocks(signer: Signer) {
  const ps = Object.entries(blockchains).map(async ([chainId, blockchain]): Promise<SignedBlock[]> => {
    let cycleEnd = 0
    let cycleStart = 0;
    let validators = []
    let signedBlock

    try {
      // const block = await blockchain.web3.eth.getBlock(blockchain.lastBlock ? blockchain.lastBlock + 1 : 'latest')
      const latestBlock = await blockchain.web3.send(
        'eth_getBlockByNumber',
        ['latest', true]
      );
      const curBlockNumber = Number(latestBlock.number)
      let blocks = []
      if (blockchain.lastBlock && blockchain.lastBlock < curBlockNumber - 1) {
        logger.info("fetching missing blocks", { chainId, lastFetchedBlock: blockchain.lastBlock, curBlockNumber })
        blocks = await Promise.all(range(blockchain.lastBlock + 1, curBlockNumber).map(i =>
          blockchain.web3.send(
            'eth_getBlockByNumber',
            [ethers.utils.hexValue(i), true]
          )))
      }
      if (blockchain.lastBlock === curBlockNumber) {
        logger.info("no new blocks to fetch", { chainId })
        return []
      }

      blocks.push(latestBlock)

      const signedBlocksPromises = blocks.map(async (block) => {
        const { rlpHeader } = SignUtils.prepareBlock(block, Number(chainId))
        // rlpHeader,signature:{r: signature.r, vs: signature._vs },chainId:122,blockHash: block.hash,cycleEnd, validators
        if (chainId == '122') {
          [cycleStart,cycleEnd, validators] = await Promise.all([consensusContract.connect(blockchain.web3).getCurrentCycleStartBlock({blockTag: block.number}),consensusContract.connect(blockchain.web3).getCurrentCycleEndBlock({blockTag: block.number}), consensusContract.connect(blockchain.web3).getValidators({blockTag: block.number})])
          //set validators only on change to save gas/storage
          if(cycleStart !== block.number)
          {
            cycleEnd = 0
            validators = []
          }
          signedBlock = await SignUtils.signBlock(rlpHeader, 122, signer, cycleEnd, validators)
        } else {
          signedBlock = await SignUtils.signBlock(rlpHeader, Number(chainId), signer,0,[])
        }

        blockchain.lastBlock = Number(block.number)
        return signedBlock

      })
      const signedBlocks = await Promise.all(signedBlocksPromises)
      return signedBlocks
    }
    catch (e) {
      console.log("failed fetching block:", { chainId, e, lastBlock: blockchain.lastBlock })
      return []      
    }
  })

  const blocks = flatten(await Promise.all(ps)).filter(_ => _)
  return blocks
}

const refreshRPCs = throttle(() => blockRegistryContract.getRPCs(),1000*60*60)
/**
 * runs periodically
 */
async function emitRegistry() {
  try {
    logger.info('emitRegistry');
    const chains = await refreshRPCs()
    logger.info("got registered rpcs:", chains.length)
    chains
      .filter(
        ({ chainId, rpc }) =>
          !blockchains[chainId] || blockchains[chainId].rpc != rpc
      )
      .map(({ chainId, rpc }) =>
        initBlockchain(
          chainId,
          rpc,
        )
      )

    const blocks = await fetchNewBlocks(blockRegistryContract.signer)
    // const blocks : { [hash:string]: SignedBlock} = {};
    // const chainIds : {[ hash:string ]: string} = {};

    logger.info("got blocks:", blocks.map(_ => `${_.chainId}: ${_.blockHash}`).join(", "))
    if (blocks.length === 0) {
      return
    }
    try {
      //write blocks in chunks of 10
      const chunks = chunk(blocks,10)
      for(const blocksChunk of chunks) {
        const receipt = await (await blockRegistryContract
          .addSignedBlocks(blocksChunk)).wait()
        logger.info(`transactionHash: ${receipt.transactionHash}`);
        logger.debug(`receipt: ${JSON.stringify(receipt)}`);
      }
      
      fs.writeFileSync("./lastBlocks.json",JSON.stringify(Object.entries(blockchains).map(([key,val]) => [key,val.lastBlock])))
      return blocks
    } catch (e) {
      logger.error("failed adding blocks to registry:", { blocks, e })
    }
  } catch (e) {
    logger.error("failed emitRegistry", { e })
  }

}

export { initBlockRegistryContract, initBlockchain, emitRegistry, blockchains, fetchNewBlocks }