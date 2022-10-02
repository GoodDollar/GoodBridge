import * as Registry from './blockHeaderRegistry';
import * as ethers from 'ethers';
import logger from 'js-logger';
import { config } from 'dotenv';
config();

const {
  REGISTRY_RPC = 'https://rpc.fuse.io',
  BLOCK_REGISTRY_ADDRESS,
  CONSENSUS_ADDRESS = '0x34B11c3f964F6C001237620126f0402b6e0EC207',
  MNEMONIC = 'test test test test test test test test test test test junk',
  PRIVATE_KEY,
  LOG_LEVEL = 'info',
} = process.env;

logger.useDefaults();

const logLevel = logger[LOG_LEVEL.toUpperCase()];
logger.setLevel(logLevel);

const run = async () => {
  await Registry.refreshRPCs().catch((e) => {
    logger.warn('failed to fetch rpcs', e.message, e);
  });

  await Registry.emitRegistry().catch((e) => {
    logger.error('failed fetching new blocks', e.message, e);
  });
};

export const app = async (signer?: ethers.Wallet) => {
  if (!signer) {
    signer = ethers.Wallet.fromMnemonic(MNEMONIC);
    if (PRIVATE_KEY) signer = new ethers.Wallet(PRIVATE_KEY);
  }

  logger.info('starting:', { BLOCK_REGISTRY_ADDRESS, CONSENSUS_ADDRESS, REGISTRY_RPC });
  Registry.initBlockRegistryContract(signer, BLOCK_REGISTRY_ADDRESS, CONSENSUS_ADDRESS, REGISTRY_RPC);
  await run();
  setInterval(run, (Registry.stepSize + 1) * 5000);
};

if(process.argv[1].includes("main.ts")) {
  app();
}
