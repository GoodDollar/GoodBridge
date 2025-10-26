import * as ethers from 'ethers';
import * as SigUtils from '../src/utils';
import { BridgeSDK } from '../src/sdk';
import release from '../../bridge-contracts/release/deployment.json';

jest.setTimeout(120000);

describe('sign utils', () => {
  it('signs celo block', async () => {
    const signer = ethers.Wallet.fromMnemonic('test test test test test test test test test test test junk');
    const { rlpHeader } = await SigUtils.getBlockchainHeader('latest', 42220, 'https://forno.celo.org');
    const signedBlock = await SigUtils.signBlock(rlpHeader, 42220, signer, 0, []);
    expect(signedBlock).toBeDefined();
  });
});

describe('block merkle patricia tree tests', () => {
  it('encode receipt rlp correctly both versions', async () => {
    const receipt = {
      blockHash: '0x7495e830726ba1fa4127e1082c0b92c07a722d607206590addff5b25d5664f69',
      blockNumber: '0xf4aeb6',
      contractAddress: null,
      cumulativeGasUsed: '0x9bbe9',
      effectiveGasPrice: '0x773594000',
      from: '0x4b4e14a3773ee558b6597070797fd51eb48606e5',
      gasUsed: '0x5208',
      logs: [],
      logsBloom:
        '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      status: '0x1',
      to: '0x383e0bb06db1c75891ed0bc22530b5e3414de01b',
      transactionHash: '0xc67d292c43ec51fcc01c13e3a5daeabeb8fa860b0adc28e7a65dd40e860028fa',
      transactionIndex: '0x6',
      type: '0x0',
    };
    const receipt2 = {
      blockHash: '0x7495e830726ba1fa4127e1082c0b92c07a722d607206590addff5b25d5664f69',
      blockNumber: '0xf4aeb6',
      contractAddress: null,
      cumulativeGasUsed: '0x8eef26',
      effectiveGasPrice: '0x2b9fbabed',
      from: '0x99bef414070992a2403c6712efe52b5dbde8a387',
      gasUsed: '0x5208',
      logs: [],
      logsBloom:
        '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      status: '0x1',
      to: '0x0498dae74157c40035c02fc9836bcd32b813c293',
      transactionHash: '0x10c6ac23cbfb7c5e0d87270309808c9e253ad2350d74057fc2de451c3735b941',
      transactionIndex: '0x61',
      type: '0x2',
    };

    const receipt3 = {
      blockHash: '0x7495e830726ba1fa4127e1082c0b92c07a722d607206590addff5b25d5664f69',
      blockNumber: '0xf4aeb6',
      contractAddress: null,
      cumulativeGasUsed: '0x4f50a',
      effectiveGasPrice: '0x32815d1de',
      from: '0x9995bc5cc0c1a42c0c2939ae7af70353bde1df83',
      gasUsed: '0x1a0b0',
      logs: [
        {
          address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            '0x0000000000000000000000009995bc5cc0c1a42c0c2939ae7af70353bde1df83',
            '0x0000000000000000000000000b9f5cef1ee41f8cccaa8c3b4c922ab406c980cc',
          ],
          data: '0x00000000000000000000000000000000000000000000000002c68af0bb140000',
          blockNumber: '0xf4aeb6',
          transactionHash: '0x208c786ca699a369400a768eb1e4d869b2e372bcc041cdc29e7ac4936dbaf99a',
          transactionIndex: '0x2',
          blockHash: '0x7495e830726ba1fa4127e1082c0b92c07a722d607206590addff5b25d5664f69',
          logIndex: '0x9',
          removed: false,
        },
        {
          address: '0x24da31e7bb182cb2cabfef1d88db19c2ae1f5572',
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            '0x0000000000000000000000000b9f5cef1ee41f8cccaa8c3b4c922ab406c980cc',
            '0x0000000000000000000000009995bc5cc0c1a42c0c2939ae7af70353bde1df83',
          ],
          data: '0x0000000000000000000000000000000000000006ad92728f69827e0b4249d5bb',
          blockNumber: '0xf4aeb6',
          transactionHash: '0x208c786ca699a369400a768eb1e4d869b2e372bcc041cdc29e7ac4936dbaf99a',
          transactionIndex: '0x2',
          blockHash: '0x7495e830726ba1fa4127e1082c0b92c07a722d607206590addff5b25d5664f69',
          logIndex: '0xa',
          removed: false,
        },
        {
          address: '0x0b9f5cef1ee41f8cccaa8c3b4c922ab406c980cc',
          topics: ['0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1'],
          data: '0x00000000000000000000000000000000000005b1914a66d9347ab027684cd1550000000000000000000000000000000000000000000000025ec2e03199922ef1',
          blockNumber: '0xf4aeb6',
          transactionHash: '0x208c786ca699a369400a768eb1e4d869b2e372bcc041cdc29e7ac4936dbaf99a',
          transactionIndex: '0x2',
          blockHash: '0x7495e830726ba1fa4127e1082c0b92c07a722d607206590addff5b25d5664f69',
          logIndex: '0xb',
          removed: false,
        },
        {
          address: '0x0b9f5cef1ee41f8cccaa8c3b4c922ab406c980cc',
          topics: [
            '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
            '0x0000000000000000000000007a250d5630b4cf539739df2c5dacb4c659f2488d',
            '0x0000000000000000000000009995bc5cc0c1a42c0c2939ae7af70353bde1df83',
          ],
          data: '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002c68af0bb1400000000000000000000000000000000000000000006ad92728f69827e0b4249d5bb0000000000000000000000000000000000000000000000000000000000000000',
          blockNumber: '0xf4aeb6',
          transactionHash: '0x208c786ca699a369400a768eb1e4d869b2e372bcc041cdc29e7ac4936dbaf99a',
          transactionIndex: '0x2',
          blockHash: '0x7495e830726ba1fa4127e1082c0b92c07a722d607206590addff5b25d5664f69',
          logIndex: '0xc',
          removed: false,
        },
      ],
      logsBloom:
        '0x00200400000000000000000080004000000000000000000000010000000000000000400000000000000000000000000002000000080000000000000000000000000000000000000004080008000000200000000100000000000000000000000000000000000000000000000000000000080000000000000000000010000000000000000000000800004000000000000000000000000000080000004000000000000000000000000000000000000000000000000000000000000000000000000000100002000000000000000000000000000000000000001000000000000020000000200001000000000000000000000000000000000004000000000000002000',
      status: '0x1',
      to: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d',
      transactionHash: '0x208c786ca699a369400a768eb1e4d869b2e372bcc041cdc29e7ac4936dbaf99a',
      transactionIndex: '0x2',
      type: '0x2',
    };

    const receipt4 = {
      blockHash: '0x7495e830726ba1fa4127e1082c0b92c07a722d607206590addff5b25d5664f69',
      blockNumber: '0xf4aeb6',
      contractAddress: null,
      cumulativeGasUsed: '0x13a9631',
      effectiveGasPrice: '0x2b91c36d0',
      from: '0x0000000df24d1de30e8b5b9be481ecfc35c834f0',
      gasUsed: '0xb7f3',
      logs: [],
      logsBloom:
        '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      status: '0x0',
      to: '0xc8569860fc503d0c590a4e17ab6ab4636c93764e',
      transactionHash: '0xbcd19b452ced60ef599bf0a9483dc9e8ffa500cde56bf5629de91b27968eab09',
      transactionIndex: '0x68',
      type: '0x2',
    };

    let rlp = SigUtils.encodeReceiptRLP(receipt, true);
    let rlp2 = SigUtils.encodeReceiptRLPV2(receipt, true);
    expect(rlp).toEqual(rlp2);

    rlp = SigUtils.encodeReceiptRLP(receipt2, true);
    rlp2 = SigUtils.encodeReceiptRLPV2(receipt2, true);
    expect(rlp).toEqual(rlp2);

    rlp = SigUtils.encodeReceiptRLP(receipt3, true);
    rlp2 = SigUtils.encodeReceiptRLPV2(receipt3, true);
    expect(rlp).toEqual(rlp2);

    rlp = SigUtils.encodeReceiptRLP(receipt4, true);
    rlp2 = SigUtils.encodeReceiptRLPV2(receipt4, true);
    expect(rlp).toEqual(rlp2);
  });
  describe('generates receipt proofs', () => {
    it('generate receipt proof for fuse', async () => {
      const proof = await SigUtils.receiptProof(
        '0xad7dd1bf26cfb69d1b600e1e4e80b0abcec8bcbb6a21526889dbae3195326a45',
        new ethers.providers.JsonRpcProvider('https://rpc.fuse.io'),
        122,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for ethereum', async () => {
      const proof = await SigUtils.receiptProof(
        '0xdd6682473931f1c94757199390fcffdf1daf876ff8eb8eeb24afc038e125e876',
        new ethers.providers.JsonRpcProvider('https://mainnet.gateway.tenderly.co'),
        1,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for ethereum post merge', async () => {
      const proof = await SigUtils.receiptProof(
        '0x66985f0e365a24c32265e2d366191b610536ab0a3eeeebfe927d49de9b273365',
        new ethers.providers.JsonRpcProvider('https://mainnet.gateway.tenderly.co'),
        1,
      );
      expect(proof).toBeTruthy();
    });

    it.skip('generate receipt proof for bsc', async () => {
      const proof = await SigUtils.receiptProof(
        '0x97dc66a5b4188cceebc9f74ea6f8c948c80597044cc87663a36dba75311ad17e',
        new ethers.providers.JsonRpcProvider('https://bscrpc.com'),
        56,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for celo post hardfork', async () => {
      const proof = await SigUtils.receiptProof(
        '0x47eb50a882da447f64547aa0261ddd37ea987cdf2d06ef0d005113970d8b057b',
        new ethers.providers.JsonRpcProvider('https://forno.celo.org'),
        42220,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for celo post hardfork with complex 0x7b tx type', async () => {
      const proof = await SigUtils.receiptProof(
        '0xb336d5f7e08c16ec661696b0f8763ac2fd09f8a2d8f9daf08a9958bf61391675',
        new ethers.providers.JsonRpcProvider('https://forno.celo.org'),
        42220,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for celo post hardfork with 0x7b tx type', async () => {
      const proof = await SigUtils.receiptProof(
        '0xc2596edb3969f030b69db2baed4c83969d7bb38e624e2534736ed283b7f77f09',
        new ethers.providers.JsonRpcProvider('https://forno.celo.org'),
        42220,
      );
      expect(proof).toBeTruthy();
    });

    // not supporting old blocks
    it.skip('generate receipt proof for celo', async () => {
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

    it('generate receipt proof for celo alfajores L2', async () => {
      const proof = await SigUtils.receiptProof(
        '0x3f5c02c2184915db9a238583f05f0c8e6033438c0423ab0cd55846f05df93409',
        new ethers.providers.JsonRpcProvider('https://alfajores-forno.celo-testnet.org'),
        44787,
      );
      expect(proof).toBeTruthy();
    });

    it('generate receipt proof for optimism', async () => {
      const proof = await SigUtils.receiptProof(
        '0x3bbde34aa79a76aedd828418adfd2fa588111205d5c3d152d55471bcdaec5909',
        new ethers.providers.JsonRpcProvider('https://mainnet.optimism.io'),
        44787,
      );
      expect(proof).toBeTruthy();
    });
  });

  describe('parses rlpheaders', () => {
    it('creates ethereum rlpHeader', async () => {
      const { block, rlpHeader, blockHeader, computedHash } = await SigUtils.getBlockchainHeader(
        'latest',
        1,
        'https://mainnet.gateway.tenderly.co',
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

    it.skip('creates gnosis rlpHeader latest', async () => {
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

    it.skip('creates binance rlpHeader', async () => {
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

    // not supporting old blocks
    it.skip('creates celo rlpHeader', async () => {
      const { block, rlpHeader, blockHeader, computedHash } = await SigUtils.getBlockchainHeader(
        '40180000',
        42220,
        'https://forno.celo.org',
      );

      //blocknumber should be at slot 9
      expect(Number(ethers.utils.RLP.decode(rlpHeader)[8])).toEqual(Number(block.number));
      expect(rlpHeader).toBeDefined();
      expect(blockHeader).toBeDefined();
      expect(computedHash).toEqual(block.hash);
    });

    // not supporting old blocks
    it.skip('creates celo rlpHeader 2', async () => {
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

    it('creates celo alfajores L2 rlpHeader', async () => {
      const { block, rlpHeader, blockHeader, computedHash } = await SigUtils.getBlockchainHeader(
        '37126751',
        44787,
        'https://alfajores-forno.celo-testnet.org',
      );
      //blocknumber should be at slot 6 befor 1.8 hardfork
      expect(Number(ethers.utils.RLP.decode(rlpHeader)[8])).toEqual(Number(block.number));
      expect(rlpHeader).toBeDefined();
      expect(blockHeader).toBeDefined();
      expect(computedHash).toEqual(block.hash);
    });

    it('creates optimism rlpHeader', async () => {
      const { block, rlpHeader, blockHeader, computedHash } = await SigUtils.getBlockchainHeader(
        '131270140',
        10,
        'https://mainnet.optimism.io',
      );
      //blocknumber should be at slot 6 befor 1.8 hardfork
      expect(Number(ethers.utils.RLP.decode(rlpHeader)[8])).toEqual(Number(block.number));
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
    const blocks = await sdk.getChainBlockHeaders(42220, 31056502, 31056504);
    expect(blocks.length).toBeGreaterThan(1);
  });

  it('parses celo rlp header', async () => {
    const decoded = ethers.utils.RLP.decode(
      '0xf9025ba0da3ad238e953b53fbff4abf9aca0695fe1d184f7323a13f6dfaf301f86fa024e94a66e834933e2c51542e95477d71f5a0aaf7d4999a05ef9062b21491902565ecc4da5d11840ed39fee113098808bf12fdf48c9ac0f3a03810c781bd05b16d56cacbb3933c92cc337b1a0d69c80047225d4f0cd28ca690a0bb378148b985cbd491bea26a17b17d1cd55dcb4a6625a2f4c2f76b35eea27f0eb901000080000000020000000024004002000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000200020000000000000000084000200400000000000000000000000000000000040000000040000000800800000000000000004081000000000000000000008000000040008000000000080000000000000080000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000010000000200000000000000000000000000040000000000000000000000002000002000000000000000000002000000000000000000084011e1cec830a987a846438756fb8afd983010700846765746889676f312e31372e3133856c696e7578000000000000f88dc0c080b841e87a93c9a5871e405b8d4d63821c0ad490b49a656babce6c07eb4857f58662370c68e0385af96cfb397c75c1513bf7065a8cd89e686e3e804b0fc48d7a2dfa8500c3808080f8418e3fffffffffffffffffffefffffffb0797a8a3efe1aa3717445ab60433dc90070aec61b12306febe4595ceb86cdcb87a2d39e3c112d243906e63bbec87e550180',
    );
    expect(Number(decoded[6])).toEqual(Number('18750700'));
  });
});
