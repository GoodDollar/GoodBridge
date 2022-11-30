import * as ethers from 'ethers';
import * as SigUtils from '../src/utils';

jest.setTimeout(120000);

describe('block merkle patricia tree tests', () => {
  describe('generates receipt proofs', () => {
    it('generate receipt proof for fuse', async () => {
      const proof = await SigUtils.receiptProof(
        '0x2824ac1c95dc8d7ab1dcf8b0d7a483dab3549ee815e406d0d13f54ff7deab909',
        new ethers.providers.JsonRpcBatchProvider('https://rpc.fuse.io'),
        122,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for gnosis', async () => {
      const proof = await SigUtils.receiptProof(
        '0x68f77a4b4eb15550f609fc652008153de13bdb3950b9a04d6fec28d7966f4db2',
        new ethers.providers.JsonRpcBatchProvider('https://rpc.gnosischain.com'),
        100,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for ethereum', async () => {
      const proof = await SigUtils.receiptProof(
        '0xdd6682473931f1c94757199390fcffdf1daf876ff8eb8eeb24afc038e125e876',
        new ethers.providers.JsonRpcBatchProvider('https://eth-rpc.gateway.pokt.network'),
        1,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for bsc', async () => {
      const proof = await SigUtils.receiptProof(
        '0x97dc66a5b4188cceebc9f74ea6f8c948c80597044cc87663a36dba75311ad17e',
        new ethers.providers.JsonRpcBatchProvider('https://bscrpc.com'),
        56,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for celo', async () => {
      const proof = await SigUtils.receiptProof(
        '0x25a5e77f301944de1741355e1f1d710816b88a2f405e32efc69c10bb1b82f45d',
        // '0xd91bdc7527e7210a3a976c95b6e93d2a2ab5305a7d2bf2e5ec1c75fe452d8c7a',
        // '0x4bdb44dcc624fc3c8f99c74f7e24f6227e2109d5b924850cbb1e6f23f0ebd539',
        // '0x88926efc4ce8319c303344986ec8af0a752c7f908ad0de906eaec1fb703670a7',
        new ethers.providers.JsonRpcBatchProvider('https://forno.celo.org'),
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

    it('creates gnosis rlpHeader', async () => {
      const { block, rlpHeader, blockHeader, computedHash } = await SigUtils.getBlockchainHeader(
        '15000000',
        100,
        'https://rpc.gnosischain.com',
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
        'https://bscrpc.com',
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
      expect(Number(ethers.utils.RLP.decode(rlpHeader)[6])).toEqual(Number(block.number));
      expect(rlpHeader).toBeDefined();
      expect(blockHeader).toBeDefined();
      expect(computedHash).toEqual(block.hash);
    });
  });
});
