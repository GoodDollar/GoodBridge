/* eslint-disable @typescript-eslint/no-explicit-any */
import * as ethers from 'ethers';
import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';
import { BridgeSDK } from './sdk';
import { Logger } from './logger';
import { merge } from 'lodash';

config({ override: true, debug: true, path: process.env.DOTENV_FILE || './.env' });

let relayer;

//1. better logger
//2. better fetchpendingbridgerequests not dependant on latest checkpoint if old blocks

const {
  REGISTRY_RPC = 'https://rpc.fuse.io',
  BLOCK_REGISTRY_ADDRESS,
  MNEMONIC = 'test test test test test test test test test test test junk',
  BRIDGES = '[{"122":"0x00D6017Bf36Cb32B3Fc5C1c91EfAF958096Eb285","42220":"0x4865aFc4a6Ccf36415dC5c012AE23F31fD70Ee70"}]',
  PRIVATE_KEY,
  CONFIG_DIR = './',
  INDICATIVE_KEY,
} = process.env;

let logger = Logger('Relayer', '', INDICATIVE_KEY);

const configDir = CONFIG_DIR;

const lastProcessed: { [key: string]: number } = {};

let shouldRun = true;
const timeouts = [];

export const stop = () => {
  shouldRun = false;
  timeouts.forEach(clearTimeout);
};

const runBridge = async (
  idx: number,
  bridge: { [chainId: string]: string },
  signer: ethers.Signer,
  interval = 60000,
) => {
  const sdk = new BridgeSDK(BLOCK_REGISTRY_ADDRESS, bridge, 10, REGISTRY_RPC);
  const chains = Object.keys(bridge);
  let hasMore = false;
  for (let i = 0; i < chains.length - 1; i++)
    for (let j = i + 1; j < chains.length; j++) {
      const chainA = chains[i];
      const chainB = chains[j];
      const bridgeA = `${chainA}_${chainB}_${bridge[chainA]}`;
      const bridgeB = `${chainB}_${chainA}_${bridge[chainB]}`;
      const [
        {
          validEvents: eventsA = [],
          lastProcessedBlock: lastProcessedA,
          checkpointBlock: checkpointBlockA,
          fetchEventsFromBlock: fetchEventsFromBlockA,
        },
        {
          validEvents: eventsB = [],
          lastProcessedBlock: lastProcessedB,
          checkpointBlock: checkpointBlockB,
          fetchEventsFromBlock: fetchEventsFromBlockB,
        },
      ] = await Promise.all([
        sdk.fetchPendingBridgeRequests(Number(chainA), Number(chainB), lastProcessed[bridgeA]).catch((e) => {
          logger.error('fetchPendingBridgeRequests', { bridgeA }, e.message);
          return {} as any;
        }),
        sdk.fetchPendingBridgeRequests(Number(chainB), Number(chainA), lastProcessed[bridgeB]).catch((e) => {
          logger.error('fetchPendingBridgeRequests', { bridgeB }, e.message);
          return {} as any;
        }),
      ]);

      if (lastProcessedA < checkpointBlockA || lastProcessedB < checkpointBlockB) hasMore = true;

      const txsA = eventsA.map((_) => _.transactionHash);
      const txsB = eventsB.map((_) => _.transactionHash);

      const relays = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        txsA.length > 0 &&
          sdk
            .relayTxs(Number(chainA), Number(chainB), txsA, signer.connect(await sdk.getChainRpc(Number(chainB))))
            .catch((e) => {
              logger.error('relayTxs', { bridgeA, txsA }, e.message);
              return undefined;
            }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        txsB.length > 0 &&
          sdk
            .relayTxs(Number(chainB), Number(chainA), txsB, signer.connect(await sdk.getChainRpc(Number(chainA))))
            .catch((e) => {
              logger.error('relayTxs', { bridgeB, txsB }, e.message);
              return undefined;
            }),
      ]);
      logger.info('relaying:', { bridgeA, relayHash: relays?.[0]?.relayTxHash, txs: txsA.length });
      logger.info('relaying:', { bridgeB, relayHash: relays?.[1]?.relayTxHash, txs: txsB.length });
      const results = await Promise.all(
        relays.map(
          (_) =>
            _ &&
            _.relayPromise &&
            _.relayPromise.catch((e) => {
              logger.error('relayTxs promise failed', { bridgeA, transactionHash: _.relayTxHash }, e.message);
              return { transactionHash: _.relayTxHash, status: 0, error: e.message };
            }),
        ),
      );

      if (lastProcessedA && (relays[0]?.status === 1 || txsA.length === 0)) {
        lastProcessed[bridgeA] = lastProcessedA;
        logger.info('relay success updating last processed block:', { bridgeA, lastProcessedA });
      }
      if (lastProcessedB && (relays[1]?.status === 1 || txsB.length === 0)) {
        lastProcessed[bridgeB] = lastProcessedB;
        logger.info('relay success updating last processed block:', { bridgeB, lastProcessedB });
      }

      logger.info('relay result:', {
        bridgeA,
        fetchEventsFromBlockA,
        lastProcessedA,
        checkpointBlockA,
        relayHash: results?.[0]?.transactionHash,
        status: results?.[0]?.status,
        error: results?.[1]?.error,
        hasMore,
      });
      logger.info('relay result:', {
        bridgeB,
        fetchEventsFromBlockB,
        lastProcessedB,
        checkpointBlockB,
        relayHash: results?.[1]?.transactionHash,
        status: results?.[1]?.status,
        error: results?.[1]?.error,
        hasMore,
      });
    }

  fs.writeFileSync(path.join(configDir, 'lastprocessed.json'), JSON.stringify(lastProcessed));
  //if one of the bridges has possibly more requests we didnt process run again immediatly, otherwise wait for interval
  if (shouldRun) {
    timeouts[idx] = setTimeout(() => runBridge(idx, bridge, signer), hasMore ? 0 : interval);
  }
};

const updateLastProcessed = () => {
  merge(lastProcessed, JSON.parse(fs.readFileSync(path.join(configDir, 'lastprocessed.json')).toString() || '{}'));
  logger.info('updateLastProcessed:', { lastProcessed });
};

export const relayerApp = async (bridges?: Array<{ [key: string]: string }>, interval = 60000) => {
  bridges = bridges || JSON.parse(BRIDGES);
  updateLastProcessed();
  let signer = await initWalletFromJson().catch((e) => logger.warn('failed initWalletFromJson', e.message));
  if (!signer) {
    logger.info('not found signer from json store, trying mnemonic/privatekey');
    signer = ethers.Wallet.fromMnemonic(MNEMONIC);
    if (PRIVATE_KEY) signer = new ethers.Wallet(PRIVATE_KEY);
  }
  const signerAddress = await signer.getAddress();
  relayer = signerAddress;
  logger = Logger('Relayer', relayer, INDICATIVE_KEY);

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
