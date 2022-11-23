/* eslint-disable @typescript-eslint/no-explicit-any */
import * as ethers from 'ethers';
import logger, { ILogLevel } from 'js-logger';
import path from 'path';
import fs from 'fs';
import { merge, isObject } from 'lodash';
import { config } from 'dotenv';

import { BridgeSDK } from './sdk';

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

const consoleHandler = logger.createDefaultHandler();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const errorHandler = async (messages: Array<any>, context) => {
  if (!INDICATIVE_KEY || context.level.value !== logger.ERROR.value) return;
  const [eventName, ...rest] = messages;
  const objs: Array<object> = rest.filter((_) => isObject(_));
  const properties = merge({ relayer }, ...objs);

  try {
    await fetch(`https://api.indicative.com/service/event/${INDICATIVE_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventName,
        eventUniqueId: relayer,
        properties,
      }),
    });
    logger.info('sent error log', {
      eventName,
      eventUniqueId: relayer,
      properties,
    });
  } catch (e) {
    logger.error('failed sending error log', e.message, e);
  }
};

const logLevel = logger['info'.toUpperCase()];
logger.setLevel(logLevel);

const logColors = {
  [logger.ERROR.name]: '\x1b[31m%s\x1b[0m',
  [logger.WARN.name]: '\x1b[33m%s\x1b[0m',
  [logger.INFO.name]: '\x1b[36m%s\x1b[0m',
  [logger.DEBUG.name]: '\x1b[32m%s\x1b[0m',
};

logger.setHandler((messages, context) => {
  const msgs = Array.from(messages);
  msgs.unshift(logColors[context.level.name], `${new Date().toLocaleString()} ${context.level.name}:`);
  consoleHandler(msgs, context);
  errorHandler(msgs, context);
});

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
        { validEvents: eventsA = [], lastProcessedBlock: lastProcessedA, checkpointBlock: checkpointBlockA },
        { validEvents: eventsB = [], lastProcessedBlock: lastProcessedB, checkpointBlock: checkpointBlockB },
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
          sdk.relayTxs(Number(chainA), Number(chainB), txsA, signer).catch((e) => {
            logger.error('relayTxs', { bridgeA, txsA }, e.message);
            return undefined;
          }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        txsB.length > 0 &&
          sdk.relayTxs(Number(chainB), Number(chainA), txsB, signer).catch((e) => {
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
        lastProcessed[chainA + '_' + chainB] = lastProcessedA;
        logger.info('relay success updating last processed block:', { bridgeA, lastProcessedA });
      }
      if (lastProcessedB && (relays[1]?.status === 1 || txsB.length === 0)) {
        lastProcessed[chainB + '_' + chainA] = lastProcessedB;
        logger.info('relay success updating last processed block:', { bridgeB, lastProcessedB });
      }

      logger.info('relay result:', {
        bridgeA,
        relayHash: results?.[0]?.transactionHash,
        status: results?.[0]?.status,
        error: results?.[1]?.error,
        lastProcessedA,
        hasMore,
      });
      logger.info('relay result:', {
        bridgeB,
        relayHash: results?.[1]?.transactionHash,
        status: results?.[1]?.status,
        error: results?.[1]?.error,
        lastProcessedB,
        hasMore,
      });
    }

  fs.writeFileSync(`${CONFIG_DIR}/lastprocessed.json`, JSON.stringify(lastProcessed));
  //if one of the bridges has possibly more requests we didnt process run again immediatly, otherwise wait for interval
  if (shouldRun) {
    timeouts[idx] = setTimeout(() => runBridge(idx, bridge, signer), hasMore ? 0 : interval);
  }
};

const updateLastProcessed = () => {
  merge(lastProcessed, JSON.parse(fs.readFileSync(`${CONFIG_DIR}/lastprocessed.json`).toString() || '{}'));
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
  logger.info('starting:', { signerAddress, BLOCK_REGISTRY_ADDRESS, bridges, REGISTRY_RPC });
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