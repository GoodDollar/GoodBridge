import * as ethers from 'ethers';
import * as SigUtils from '../src/utils';
import * as BridgeApp from '../src/blockHeaderRegistry';
import { BridgeSDK } from '../src/sdk';
import { abi as TokenABI } from '../src/abi/TestToken.json';
import { range } from 'lodash';

const delay = async (milis) => {
  return new Promise((res) => {
    setTimeout(res, milis);
  });
};
jest.setTimeout(120000);

describe('bridge sdk', () => {
  let intervalId;

  const sourceBridgeAddr = '0x0165878A594ca255338adfa4d48449f69242Eb8F';
  const targetBridgeAddr = '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853';
  const localNode = new ethers.providers.JsonRpcProvider('http://localhost:8545');
  const sdk = new BridgeSDK(
    '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    { 99: sourceBridgeAddr, 100: targetBridgeAddr },
    10,
    'http://localhost:8545',
    { 99: '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0', 100: '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0' },
  );

  const validators = range(0, 7).map((i) =>
    ethers.Wallet.fromMnemonic(
      'test test test test test test test test test test test junk',
      `m/44'/60'/0'/0/${i}`,
    ).connect(localNode),
  );
  const signer = ethers.Wallet.fromMnemonic('test test test test test test test test test test test junk').connect(
    localNode,
  );
  let registry: ethers.Contract;

  const sourceToken = new ethers.Contract('0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9', TokenABI, signer);
  const targetToken = new ethers.Contract('0x5FC8d32690cc91D4c39d9d3abcBD16989F875707', TokenABI, signer);
  const recipient = ethers.Wallet.createRandom().connect(localNode);
  const sender = ethers.Wallet.createRandom().connect(localNode);

  // Act before assertions
  beforeAll(async () => {
    await signer.sendTransaction({ to: recipient.address, value: ethers.constants.WeiPerEther });
    await signer.sendTransaction({ to: sender.address, value: ethers.constants.WeiPerEther });

    await sourceToken.transfer(sender.address, 1000000);
    registry = await SigUtils.getRegistryContract('0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9', signer);
    await registry.addBlockchain(99, 'http://localhost:8545');
    await registry.addBlockchain(100, 'http://localhost:8545');
    await BridgeApp.initBlockRegistryContract(
      signer,
      '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
      '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      'http://localhost:8545',
    );
    await BridgeApp._refreshRPCs();
    await BridgeApp.emitRegistry(validators);
    intervalId = setInterval(() => BridgeApp.emitRegistry(validators), 2000);
    try {
      await registry.voting();
    } catch (e) {
      throw new Error('hardhat node should be running for tests: ' + e.message);
    }
  });

  it('relays a tx', async () => {
    const bridgeBalance = await sourceToken.balanceOf(sourceBridgeAddr);
    await (await sourceToken.connect(sender).approve(sourceBridgeAddr, 100000)).wait();
    const sourceBridge = await (await sdk.getBridgeContract(99, localNode)).connect(signer);
    const bridgeTx = await (await sourceBridge.connect(sender).bridgeTo(recipient.address, 100, 100000)).wait();
    const bridgeBalanceAfter = await sourceToken.balanceOf(sourceBridgeAddr);
    expect(bridgeBalanceAfter).toEqual(bridgeBalance.add(100000));
    for (let i = 0; i < 10; i++) {
      await localNode.send('evm_mine', []);
    }
    await delay(3000); //wait for checkpoint to be registered
    const relayResult = await sdk.relayTx(99, 100, bridgeTx.transactionHash, recipient);
    await relayResult.relayPromise;
    expect(relayResult.relayTxHash).toBeDefined();
    expect(relayResult.relayPromise).toBeDefined();
    expect(relayResult.bridgeRequests).toMatchObject([
      { to: recipient.address, from: sender.address, amount: ethers.BigNumber.from(100000) },
    ]);
    expect((await targetToken.balanceOf(recipient.address)).toNumber()).toEqual(99900);
  });

  it('fetches unexecuted requests', async () => {
    const recipient = ethers.Wallet.createRandom().connect(localNode);

    const events = await sdk.fetchPendingBridgeRequests(99, 100);

    const sourceBridge = await (await sdk.getBridgeContract(99, localNode)).connect(signer);
    await (await sourceToken.connect(sender).approve(sourceBridgeAddr, 100000)).wait();
    await (await sourceBridge.connect(sender).bridgeTo(recipient.address, 100, 100000)).wait();

    for (let i = 0; i < 10; i++) {
      await localNode.send('evm_mine', []);
    }

    await delay(3000); //wait for checkpoint to be registered

    await sdk.fetchPendingBridgeRequests(99, 100, events.fetchEventsFromBlock); //hardhat bug requires reading events twice for them to appear
    const events2 = await sdk.fetchPendingBridgeRequests(99, 100, events.fetchEventsFromBlock);

    expect(events2.validEvents.length).toBeGreaterThan(0);
    expect(events2.validEvents.length).toEqual(events.validEvents.length + 1);
    expect(events2.validEvents[events2.validEvents.length - 1].args.to).toEqual(recipient.address);
    expect(events.checkpointBlock).toEqual(events.lastProcessedBlock);
    expect(events2.checkpointBlock).toEqual(events2.lastProcessedBlock);
    expect(events.checkpointBlock).toBeGreaterThan(0);
    expect(events2.checkpointBlock).toBeGreaterThan(0);
  });

  it('executes fetched requests', async () => {
    const sourceBridge = await (await sdk.getBridgeContract(99, localNode)).connect(signer);
    await (await sourceToken.connect(sender).approve(sourceBridgeAddr, 100000)).wait();
    await (await sourceBridge.connect(sender).bridgeTo(recipient.address, 100, 100000)).wait();
    for (let i = 0; i < 10; i++) {
      await localNode.send('evm_mine', []);
    }
    await delay(3000); //wait for checkpoint to be registered

    await sdk.fetchPendingBridgeRequests(99, 100); //hardhat bug requires fetching events twice
    const events = await sdk.fetchPendingBridgeRequests(99, 100);

    expect(events.validEvents.length).toBeGreaterThan(0);
    const txs = events.validEvents.map((_) => _.transactionHash);
    await sdk.relayTxs(99, 100, txs, recipient);
    const events2 = await sdk.fetchPendingBridgeRequests(99, 100, events.fetchEventsFromBlock);
    expect(events2.validEvents.length).toEqual(0);
  });

  // eslint-disable-next-line jest/expect-expect
  it('shutsdown interval', () => {
    clearInterval(intervalId);
  });
});
