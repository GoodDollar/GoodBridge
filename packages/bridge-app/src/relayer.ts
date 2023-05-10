/* eslint-disable @typescript-eslint/no-explicit-any */
import * as ethers from 'ethers';
import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';
import { merge } from 'lodash';
import { BridgeSDK } from './sdk';
import { Logger } from './logger';
import bridges from '@gooddollar/bridge-contracts/release/deployment.json';
import { version } from './package.json';
config({ override: true, debug: true, path: process.env.DOTENV_FILE || './.env' });

let relayer;

//1. better logger
//2. better fetchpendingbridgerequests not dependant on latest checkpoint if old blocks

const defaultBridges = Object.values(bridges).map((bridge) => ({
  '122': bridge.fuseBridge,
  '42220': bridge.celoBridge,
}));

const defaultRpcs = [
  {
    chainId: 122,
    rpc: 'https://rpc.fuse.io',
  },
  { chainId: 42220, rpc: 'https://forno.celo.org' },
];
const {
  REGISTRY_RPC = 'https://rpc.fuse.io',
  BLOCK_REGISTRY_ADDRESS = (bridges['production'] || bridges['staging']).registry,
  MNEMONIC = 'test test test test test test test test test test test junk',
  BRIDGES = JSON.stringify(defaultBridges),
  PRIVATE_KEY,
  CONFIG_DIR = './',
  INDICATIVE_KEY,
} = process.env;

let logger = Logger(`${version} Relayer`, '', INDICATIVE_KEY);

const configDir = CONFIG_DIR;

const lastProcessed: { [key: string]: number } = {};

let shouldRun = true;
const timeouts = [];

export const stop = () => {
  shouldRun = false;
  timeouts.forEach(clearTimeout);
};

const runBridgeSide = async (
  sdk: BridgeSDK,
  bridgeContracts: { [chainId: string]: string },
  chainA: string,
  chainB: string,
  signer: ethers.Signer,
) => {
  let hasMore = true;
  while (hasMore) {
    const bridge = `${chainA}_${chainB}_${bridgeContracts[chainA]}`;

    const {
      validEvents: events = [],
      lastProcessedBlock,
      checkpointBlock: checkpointBlock,
      fetchEventsFromBlock: fetchEventsFromBlock,
    } = await sdk.fetchPendingBridgeRequests(Number(chainA), Number(chainB), lastProcessed[bridge]).catch((e) => {
      logger.error('fetchPendingBridgeRequests', { bridge }, e.message);
      throw e;
    });

    if (lastProcessedBlock && lastProcessedBlock < checkpointBlock) hasMore = true;
    else hasMore = false;

    const txs = events.map((_) => _.transactionHash);
    const ids = events.map((_) => _.args?.id.toString());

    let result;
    if (txs.length > 0) {
      const relay = await sdk
        .relayTxs(Number(chainA), Number(chainB), txs, signer.connect(await sdk.getChainRpc(Number(chainB))))
        .catch((e) => {
          logger.error('relayTxs', { bridge, txs }, e.message.slice(0, 1000));
          throw e;
        });

      logger.info('relaying:', { bridge, relayHash: relay?.relayTxHash, txs: txs.length, ids });

      result =
        relay?.relayPromise &&
        (await relay.relayPromise.catch((e) => {
          logger.error('relayTxs promise failed', { bridge, transactionHash: relay.relayTxHash }, e.message);
          throw e;
        }));
    }

    if (lastProcessedBlock && (result?.status === 1 || txs.length === 0)) {
      lastProcessed[bridge] = lastProcessedBlock;
      logger.info('relay success updating last processed block:', { bridge, lastProcessedBlock, fetchEventsFromBlock });
    }

    result &&
      logger.info('relay result:', {
        bridge,
        fetchEventsFromBlock,
        newLastProcessedBlock: lastProcessedBlock,
        checkpointBlock,
        relayHash: result?.transactionHash,
        status: result?.status,
        error: result?.error,
        hasMore,
      });

    fs.writeFileSync(path.join(configDir, 'lastprocessed.json'), JSON.stringify(lastProcessed));
  }
};

const runBridge = async (
  idx: number,
  bridge: { [chainId: string]: string },
  signer: ethers.Signer,
  interval = 60000,
) => {
  const sdk = new BridgeSDK(BLOCK_REGISTRY_ADDRESS, bridge, 10, REGISTRY_RPC, {}, defaultRpcs, logger as any);
  const chains = Object.keys(bridge);

  for (let i = 0; i < chains.length - 1; i++)
    for (let j = i + 1; j < chains.length; j++) {
      const chainA = chains[i];
      const chainB = chains[j];
      const bridgeA = `${chainA}_${chainB}_${bridge[chainA]}`;
      const bridgeB = `${chainB}_${chainA}_${bridge[chainB]}`;

      await Promise.all([
        runBridgeSide(sdk, bridge, chainA, chainB, signer).catch((e) =>
          logger.error('failed runBridgeSide', e.message, { bridgeA }),
        ),
        runBridgeSide(sdk, bridge, chainB, chainA, signer).catch((e) =>
          logger.error('failed runBridgeSide', e.message, { bridgeB }),
        ),
      ]);
    }

  //if one of the bridges has possibly more requests we didnt process run again immediatly, otherwise wait for interval
  if (shouldRun) {
    timeouts[idx] = setTimeout(() => runBridge(idx, bridge, signer), interval);
  }
};

const updateLastProcessed = () => {
  merge(lastProcessed, JSON.parse(fs.readFileSync(path.join(configDir, 'lastprocessed.json')).toString() || '{}'));

  logger.info('updateLastProcessed:', { lastProcessed });
};

export const relayerApp = async (bridges?: Array<{ [key: string]: string }>, interval = 60000) => {
  bridges = bridges || JSON.parse(BRIDGES);
  try {
    updateLastProcessed();
  } catch (e) {
    logger.warn('missing lastprocessed. creating...');
    fs.writeFileSync(path.join(configDir, 'lastprocessed.json'), JSON.stringify(lastProcessed));
  }
  let signer = await initWalletFromJson().catch((e) => logger.warn('failed initWalletFromJson', e.message));
  if (!signer) {
    logger.info('not found signer from json store, trying mnemonic/privatekey');
    signer = ethers.Wallet.fromMnemonic(MNEMONIC);
    if (PRIVATE_KEY) signer = new ethers.Wallet(PRIVATE_KEY);
  }
  const signerAddress = await signer.getAddress();
  relayer = signerAddress;
  logger = Logger(`${version} Relayer`, relayer, INDICATIVE_KEY);

  logger.info('starting:', { signerAddress, BLOCK_REGISTRY_ADDRESS, bridges, REGISTRY_RPC, CONFIG_DIR });
  bridges.map((_, idx) => runBridge(idx, _, signer as ethers.Signer, interval));
  return bridges;
};

const initWalletFromJson = async () => {
  logger.info(`initWalletProvider`);
  const keystoreDir = path.join(configDir, 'keys/FuseNetwork');
  let keystore;
  fs.readdirSync(keystoreDir).forEach((file) => {
    if (file.startsWith('UTC')) {
      keystore = fs.readFileSync(path.join(keystoreDir, file)).toString();
    }
  });
  const password = fs.readFileSync(path.join(configDir, 'pass.pwd')).toString().trim();
  if (keystore && password) return ethers.Wallet.fromEncryptedJson(keystore, password);
};
