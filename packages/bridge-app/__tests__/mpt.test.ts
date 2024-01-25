import * as ethers from 'ethers';
import * as SigUtils from '../src/utils';
import { BridgeSDK } from '../src/sdk';
import release from '../../bridge-contracts/release/deployment.json';

jest.setTimeout(120000);

describe('block merkle patricia tree tests', () => {
  describe('generates receipt proofs', () => {
    it('generate receipt proof for fuse', async () => {
      const proof = await SigUtils.receiptProof(
        '0x2824ac1c95dc8d7ab1dcf8b0d7a483dab3549ee815e406d0d13f54ff7deab909',
        new ethers.providers.JsonRpcProvider('https://rpc.fuse.io'),
        122,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for gnosis', async () => {
      const proof = await SigUtils.receiptProof(
        '0x68f77a4b4eb15550f609fc652008153de13bdb3950b9a04d6fec28d7966f4db2',
        new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/gnosis'),
        100,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for ethereum', async () => {
      const proof = await SigUtils.receiptProof(
        '0xdd6682473931f1c94757199390fcffdf1daf876ff8eb8eeb24afc038e125e876',
        new ethers.providers.JsonRpcProvider('https://cloudflare-eth.com'),
        1,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for bsc', async () => {
      const proof = await SigUtils.receiptProof(
        '0x97dc66a5b4188cceebc9f74ea6f8c948c80597044cc87663a36dba75311ad17e',
        new ethers.providers.JsonRpcProvider('https://bscrpc.com'),
        56,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for celo', async () => {
      const proof = await SigUtils.receiptProof(
        '0x25a5e77f301944de1741355e1f1d710816b88a2f405e32efc69c10bb1b82f45d',
        new ethers.providers.JsonRpcProvider('https://forno.celo.org'),
        42220,
      );
      expect(proof).toBeTruthy();
    });
    it('generate receipt proof for celo after fork', async () => {
      const proof = await SigUtils.receiptProof(
        '0xa31152574444d2b437abd0a952e6c964a1069ffd3bf5a6094b4e4febf6efbdc2',
        new ethers.providers.JsonRpcProvider('https://forno.celo.org'),
        42220,
      );
      expect(proof).toBeTruthy();
    });
    it('generate receipt proof for celo epoch block 22982400', async () => {
      const proof = await SigUtils.receiptProof(
        '0x26f0c56acbd2f903c12fb3431e0b832c071c1173256f4f64fedd920ee363897a',
        new ethers.providers.JsonRpcProvider('https://forno.celo.org'),
        42220,
      );
      expect(proof).toBeTruthy();
    });
  });

  describe('parses rlpheaders', () => {
    it('creates ethereum rlpHeader', async () => {
      const { block, rlpHeader, blockHeader, computedHash } = await SigUtils.getBlockchainHeader(
        'latest',
        1,
        'https://cloudflare-eth.com/',
      );
      //blocknumber should be at slot 9
      expect(Number(ethers.utils.RLP.decode(rlpHeader)[8])).toEqual(Number(block.number));
      expect(rlpHeader).toBeDefined();
      expect(blockHeader).toBeDefined();
      expect(computedHash).toEqual(block.hash);
    });

    it('creates fuse rlpHeader', async () => {
      const { block, rlpHeader, blockHeader, computedHash } = await SigUtils.getBlockchainHeader(
        'latest',
        122,
        'https://rpc.fuse.io',
      );

      //blocknumber should be at slot 9
      expect(Number(ethers.utils.RLP.decode(rlpHeader)[8])).toEqual(Number(block.number));
      expect(rlpHeader).toBeDefined();
      expect(blockHeader).toBeDefined();
      expect(computedHash).toEqual(block.hash);
    });

    it('creates gnosis rlpHeader latest', async () => {
      const { block, rlpHeader, blockHeader, computedHash } = await SigUtils.getBlockchainHeader(
        'latest',
        100,
        'https://rpc.ankr.com/gnosis',
      );

      //blocknumber should be at slot 9
      expect(Number(ethers.utils.RLP.decode(rlpHeader)[8])).toEqual(Number(block.number));
      expect(rlpHeader).toBeDefined();
      expect(blockHeader).toBeDefined();
      expect(computedHash).toEqual(block.hash);
    });

    it('creates binance rlpHeader', async () => {
      const { block, rlpHeader, blockHeader, computedHash } = await SigUtils.getBlockchainHeader(
        'latest',
        56,
        'https://rpc.ankr.com/bsc',
      );

      //blocknumber should be at slot 9
      expect(Number(ethers.utils.RLP.decode(rlpHeader)[8])).toEqual(Number(block.number));
      expect(rlpHeader).toBeDefined();
      expect(blockHeader).toBeDefined();
      expect(computedHash).toEqual(block.hash);
    });

    it('creates celo rlpHeader', async () => {
      const { block, rlpHeader, blockHeader, computedHash } = await SigUtils.getBlockchainHeader(
        'latest',
        42220,
        'https://forno.celo.org',
      );

      //blocknumber should be at slot 9
      expect(Number(ethers.utils.RLP.decode(rlpHeader)[8])).toEqual(Number(block.number));
      expect(rlpHeader).toBeDefined();
      expect(blockHeader).toBeDefined();
      expect(computedHash).toEqual(block.hash);
    });

    it('creates celo rlpHeader 2', async () => {
      const { block, rlpHeader, blockHeader, computedHash } = await SigUtils.getBlockchainHeader(
        '18756992',
        42220,
        'https://forno.celo.org',
      );
      //blocknumber should be at slot 6 befor 1.8 hardfork
      expect(Number(ethers.utils.RLP.decode(rlpHeader)[6])).toEqual(Number(block.number));
      expect(rlpHeader).toBeDefined();
      expect(blockHeader).toBeDefined();
      expect(computedHash).toEqual(block.hash);
    });
  });

  it('creates multiple celo rlpHeaders', async () => {
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
    );
    const blocks = await sdk.getChainBlockHeaders(42220, 18756990, 18756992);
    expect(blocks.length).toBeGreaterThan(1);
  });

  it('parses celo rlp header', async () => {
    const decoded = ethers.utils.RLP.decode(
      '0xf9025ba0da3ad238e953b53fbff4abf9aca0695fe1d184f7323a13f6dfaf301f86fa024e94a66e834933e2c51542e95477d71f5a0aaf7d4999a05ef9062b21491902565ecc4da5d11840ed39fee113098808bf12fdf48c9ac0f3a03810c781bd05b16d56cacbb3933c92cc337b1a0d69c80047225d4f0cd28ca690a0bb378148b985cbd491bea26a17b17d1cd55dcb4a6625a2f4c2f76b35eea27f0eb901000080000000020000000024004002000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000200020000000000000000084000200400000000000000000000000000000000040000000040000000800800000000000000004081000000000000000000008000000040008000000000080000000000000080000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000010000000200000000000000000000000000040000000000000000000000002000002000000000000000000002000000000000000000084011e1cec830a987a846438756fb8afd983010700846765746889676f312e31372e3133856c696e7578000000000000f88dc0c080b841e87a93c9a5871e405b8d4d63821c0ad490b49a656babce6c07eb4857f58662370c68e0385af96cfb397c75c1513bf7065a8cd89e686e3e804b0fc48d7a2dfa8500c3808080f8418e3fffffffffffffffffffefffffffb0797a8a3efe1aa3717445ab60433dc90070aec61b12306febe4595ceb86cdcb87a2d39e3c112d243906e63bbec87e550180',
    );
    expect(Number(decoded[6])).toEqual(Number('18750700'));
  });
});
