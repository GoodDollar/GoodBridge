import * as ethers from 'ethers';
import { logger } from './blockHeaderRegistry';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import * as Registry from './blockHeaderRegistry';

const {
  REGISTRY_RPC = 'https://rpc.fuse.io',
  BLOCK_REGISTRY_ADDRESS,
  CONSENSUS_ADDRESS = '0x34B11c3f964F6C001237620126f0402b6e0EC207',
  MNEMONIC = 'test test test test test test test test test test test junk',
  PRIVATE_KEY,
  CONFIG_DIR = './',
} = process.env;

const configDir = CONFIG_DIR;

const run = async () => {
  await Registry.refreshRPCs().catch((e) => {
    logger.warn('failed to fetch rpcs', e.message, e);
  });

  await Registry.emitRegistry().catch((e) => {
    logger.error('failed fetching new blocks', e.message);
  });
};

export const app = async () => {
  let signer = await initWalletFromJson().catch((e) => logger.warn('failed initWalletFromJson', e.message));
  if (!signer) {
    logger.info('not found signer from json store, trying mnemonic/privatekey');
    signer = ethers.Wallet.fromMnemonic(MNEMONIC);
    if (PRIVATE_KEY) signer = new ethers.Wallet(PRIVATE_KEY);
  }
  const signerAddress = await signer.getAddress();
  logger.info('starting:', { signerAddress, BLOCK_REGISTRY_ADDRESS, CONSENSUS_ADDRESS, REGISTRY_RPC });
  await Registry.initBlockRegistryContract(signer, BLOCK_REGISTRY_ADDRESS, CONSENSUS_ADDRESS, REGISTRY_RPC);
  await run();
  setInterval(run, (Registry.stepSize + 1) * 5000);
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

// if (process.argv[1].includes('main')) {
app();
// }
