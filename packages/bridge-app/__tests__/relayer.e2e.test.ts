import * as ethers from 'ethers';
import { BridgeSDK } from '../src/sdk';
import release from '../../bridge-contracts/release/deployment.json';
import { Logger } from '../src/logger';
import Log from 'js-logger';

const logger = Logger('Relayer', '');
logger.setLevel(Log.DEBUG);

jest.setTimeout(120000);

// eslint-disable-next-line jest/no-disabled-tests
describe.skip('run a tx relay manually', () => {
  it('relay a tx from celo to fuse', async () => {
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
    const res = await sdk.relayTx(
      42220,
      122,
      '0xc2bbcc0d55961261f5e3b5e0807f0f87553ec161ad077fade6d880325978b136',
      signer.connect(await sdk.getChainRpc(Number(122))),
    );
    await res.relayPromise;
    expect(res.relayTxHash).toBeTruthy();
  });
});
