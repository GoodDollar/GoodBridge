/* eslint-disable jest/no-disabled-tests */
import * as ethers from 'ethers';
import { BridgeSDK } from '../src/sdk';
import release from '../../bridge-contracts/release/deployment.json';
import { Logger } from '../src/logger';
import Log from 'js-logger';

const logger = Logger('Relayer', '');
logger.setLevel(Log.DEBUG);

jest.setTimeout(120000);
const txs = [
  '0xa31152574444d2b437abd0a952e6c964a1069ffd3bf5a6094b4e4febf6efbdc2',
  '0xca329a227977145452005b439a29ce8d6d41e1b72b0b6eac3645697ad65d81c3',
];
describe('run a tx relay manually', () => {
  it.skip('relay a tx from celo to fuse', async () => {
    const sdk = new BridgeSDK(
      release['fuse'].registry,
      { 122: release['fuse'].fuseBridge, 42220: release.fuse.celoBridge },
      10,
      'https://rpc.fuse.io',
      undefined,
      [
        { chainId: 122, rpc: 'https://rpc.fuse.io' },
        { chainId: 42220, rpc: 'https://forno.celo.org' },
      ],
      logger,
    );
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY);
    const res = await sdk.relayTx(42220, 122, txs[0], signer.connect(await sdk.getChainRpc(Number(122))));
    await res.relayPromise;
    expect(res.relayTxHash).toBeTruthy();
  });

  it.skip('relay a tx from fuse to celo', async () => {
    const sdk = new BridgeSDK(
      release['production'].registry,
      { 122: release.production.fuseBridge, 42220: release.production.celoBridge },
      10,
      'https://rpc.fuse.io',
      undefined,
      [
        { chainId: 122, rpc: 'https://rpc.fuse.io' },
        { chainId: 42220, rpc: 'https://forno.celo.org' },
      ],
      logger,
    );
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY);
    const res = await sdk.relayTxs(122, 42220, txs, signer.connect(await sdk.getChainRpc(Number(42220))));
    await res.relayPromise;
    expect(res.relayTxHash).toBeTruthy();
  });
});
