import * as ethers from 'ethers';
import { uniq } from 'lodash';
import * as SigUtils from '../src/utils';
import * as BridgeApp from '../src/blockHeaderRegistry';
import release from '../../bridge-contracts/release/deployment.json';

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
    registry = await SigUtils.getRegistryContract(release['test'].registery, signer);
    try {
      await registry.voting();
    } catch (e) {
      throw new Error('hardhat node should be running for tests: ' + e.message);
    }
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
    await BridgeApp.initBlockchain(122, ['https://rpc.fuse.io']);
    await BridgeApp.initBlockchain(56, ['https://bscrpc.com']);
    expect(BridgeApp.blockchains['122'].web3).not.toBeNull();
    expect(BridgeApp.blockchains['122'].lastBlock).toBeUndefined();
    // expect(BridgeApp.blockchains['122'].rpc).toBe('https://rpc.fuse.io');
    expect(BridgeApp.blockchains['56'].web3).not.toBeNull();
    expect(BridgeApp.blockchains['56'].lastBlock).toBeUndefined();
    // expect(BridgeApp.blockchains['56'].rpc).toBe('https://bscrpc.com');
  });

  it('fetches, signs and submits blocks for registered blockchains', async () => {
    BridgeApp.setStepSize(2);
    BridgeApp.initBlockRegistryContract(
      signer,
      release['test'].registery,
      release['test'].consensus,
      'http://localhost:8545',
    );

    await BridgeApp.initBlockchain(122, ['https://rpc.fuse.io']);
    await BridgeApp.initBlockchain(56, ['https://bscrpc.com']);
    await delay(5000);
    const { blocks, lastBlocks } = await BridgeApp.fetchNewBlocks([signer]);
    expect(Object.entries(lastBlocks).length).toEqual(2);
    expect(blocks.length).toEqual(2);
    const fuseBlock = blocks.find((_) => _.chainId === 122);
    const bscBlock = blocks.find((_) => _.chainId === 56);
    await delay(BridgeApp.stepSize * 6000); //wait for stepSize blocks
    const { blocks: nextBlocks } = await BridgeApp.fetchNewBlocks([signer]);
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
      release['test'].registery,
      release['test'].consensus,
      'http://localhost:8545',
    );

    await BridgeApp.initBlockchain(122, ['https://rpc.fuse.io']);
    await BridgeApp._refreshRPCs();
    //should initialize chains from contract as defined in deployDevEnv.ts script
    expect(BridgeApp.blockchains['9999'].web3).not.toBeNull();
    expect(BridgeApp.blockchains['9999'].lastBlock).toBeUndefined();
    // expect(BridgeApp.blockchains['9999'].rpc).toBe('http://localhost:8545');

    const blocks = await BridgeApp.emitRegistry();
    expect(uniq(blocks.map((_) => _.chainId)).length).toBeGreaterThanOrEqual(2);
    const fuseBlock = blocks.find((_) => _.chainId === 122);
    await delay(BridgeApp.stepSize * 6000);
    const nextBlocks = await BridgeApp.emitRegistry();
    const fuseBlock2 = nextBlocks.find((_) => _.chainId === 122);
    expect(fuseBlock2.rlpHeader).not.toEqual(fuseBlock.rlpHeader);
  });

  it('emits multiple blocks', async () => {
    BridgeApp.setStepSize(2);
    await BridgeApp.initBlockchain(122, ['https://rpc.fuse.io']);
    await BridgeApp.initBlockchain(56, ['https://bscrpc.com']);
    BridgeApp.initBlockRegistryContract(
      signer,
      release['test'].registery,
      release['test'].consensus,
      'http://localhost:8545',
    );

    //should initialize chains from contract as defined in deployDevEnv.ts script
    const blocks = await BridgeApp.emitRegistry();
    expect(blocks.length).toBeGreaterThan(1);
    await delay(10000);
    const nextBlocks = await BridgeApp.emitRegistry();
    expect(nextBlocks.length).toBeGreaterThan(1);
  });
});
