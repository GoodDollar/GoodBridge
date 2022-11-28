import * as ethers from 'ethers';
import * as SigUtils from '../src/utils';
import * as BridgeApp from '../src/blockHeaderRegistry';

const delay = async (milis) => {
  return new Promise((res) => {
    setTimeout(res, milis);
  });
};
jest.setTimeout(120000);

describe('block header registry', () => {
  const localNode = new ethers.providers.JsonRpcProvider('http://localhost:8545');
  const signer = ethers.Wallet.fromMnemonic('test test test test test test test test test test test junk').connect(
    localNode,
  );
  let registry: ethers.Contract;
  // Act before assertions
  beforeAll(async () => {
    // Read more about fake timers
    // http://facebook.github.io/jest/docs/en/timer-mocks.html#content
    // Jest 27 now uses "modern" implementation of fake timers
    // https://jestjs.io/blog/2021/05/25/jest-27#flipping-defaults
    // https://github.com/facebook/jest/pull/5171
    registry = await SigUtils.getRegistryContract('0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9', signer);
    try {
      await registry.voting();
    } catch (e) {
      throw new Error('hardhat node should be running for tests: ' + e.message);
    }
  });

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

  // Assert if setTimeout was called properly
  it('signs and submit fuse block', async () => {
    const { rlpHeader, blockHeader, block } = await SigUtils.getBlockchainHeader('latest', 122, 'https://rpc.fuse.io');
    const cycleEnd = Number((Date.now() / 1000).toFixed(0));
    const validators = [signer.address];
    const signedBlock = await SigUtils.signBlock(rlpHeader, 122, signer, cycleEnd, validators);
    await registry.addSignedBlocks([signedBlock]);
    expect(await registry.blockHashes(122, blockHeader.number, 0)).not.toBeNull();

    const packed = ethers.utils.solidityPack(
      ['bytes32', 'uint256', 'address[]', 'uint256'],
      [block.hash, 122, validators, cycleEnd],
    );
    const payload = ethers.utils.keccak256(packed);
    //validate block data
    const savedBlock = await registry.getBlockHashByPayloadHash(payload);
    expect(savedBlock).toEqual(block.hash);
  });

  it('initializes blockchain', async () => {
    await BridgeApp.initBlockchain(122, 'https://rpc.fuse.io');
    await BridgeApp.initBlockchain(56, 'https://bscrpc.com');
    expect(BridgeApp.blockchains['122'].web3).not.toBeNull();
    expect(BridgeApp.blockchains['122'].lastBlock).toBeUndefined();
    expect(BridgeApp.blockchains['122'].rpc).toBe('https://rpc.fuse.io');
    expect(BridgeApp.blockchains['56'].web3).not.toBeNull();
    expect(BridgeApp.blockchains['56'].lastBlock).toBeUndefined();
    expect(BridgeApp.blockchains['56'].rpc).toBe('https://bscrpc.com');
  });

  it('fetches, signs and submits blocks for registered blockchains', async () => {
    BridgeApp.setStepSize(2);
    BridgeApp.initBlockRegistryContract(
      signer,
      '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
      '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      'http://localhost:8545',
    );

    await BridgeApp.initBlockchain(122, 'https://rpc.fuse.io');
    await BridgeApp.initBlockchain(56, 'https://bscrpc.com');
    await delay(5000);
    const blocks = await BridgeApp.fetchNewBlocks([signer]);
    expect(blocks.length).toEqual(2);
    const fuseBlock = blocks.find((_) => _.chainId === 122);
    const bscBlock = blocks.find((_) => _.chainId === 56);
    await delay(BridgeApp.stepSize * 6000); //wait for stepSize blocks
    const nextBlocks = await BridgeApp.fetchNewBlocks([signer]);
    const fuseBlock2 = nextBlocks.find((_) => _.chainId === 122);
    const bscBlock2 = nextBlocks.find((_) => _.chainId === 56);
    expect(fuseBlock2.rlpHeader).not.toEqual(fuseBlock.rlpHeader);
    expect(bscBlock2.rlpHeader).not.toEqual(bscBlock.rlpHeader);
    const tx = await registry.addSignedBlocks(nextBlocks);
    const r = await tx.wait();
    expect(r).toBeDefined();
  });

  it('bridge app should init blockchains, fetch blocks and add blocks to registry', async () => {
    delete BridgeApp.blockchains['122'];
    delete BridgeApp.blockchains['56'];
    BridgeApp.setStepSize(2);

    BridgeApp.initBlockRegistryContract(
      signer,
      '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
      '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      'http://localhost:8545',
    );

    await BridgeApp.initBlockchain(122, 'https://rpc.fuse.io');
    await BridgeApp._refreshRPCs();
    //should initialize chains from contract as defined in deployDevEnv.ts script
    expect(BridgeApp.blockchains['9999'].web3).not.toBeNull();
    expect(BridgeApp.blockchains['9999'].lastBlock).toBeUndefined();
    expect(BridgeApp.blockchains['9999'].rpc).toBe('http://localhost:8545');

    const blocks = await BridgeApp.emitRegistry();
    expect(blocks.length).toEqual(2);
    const fuseBlock = blocks.find((_) => _.chainId === 122);
    await delay(BridgeApp.stepSize * 6000);
    const nextBlocks = await BridgeApp.emitRegistry();
    const fuseBlock2 = nextBlocks.find((_) => _.chainId === 122);
    expect(fuseBlock2.rlpHeader).not.toEqual(fuseBlock.rlpHeader);
  });

  it('emits multiple blocks', async () => {
    BridgeApp.setStepSize(2);
    await BridgeApp.initBlockchain(122, 'https://rpc.fuse.io');
    await BridgeApp.initBlockchain(56, 'https://bscrpc.com');
    BridgeApp.initBlockRegistryContract(
      signer,
      '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
      '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      'http://localhost:8545',
    );

    //should initialize chains from contract as defined in deployDevEnv.ts script
    const blocks = await BridgeApp.emitRegistry();
    expect(blocks.length).toBeGreaterThan(1);
    await delay(30000);
    const nextBlocks = await BridgeApp.emitRegistry();
    expect(nextBlocks.length).toBeGreaterThan(1);
  });
});
