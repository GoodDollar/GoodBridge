import * as ethers from 'ethers';
import * as SigUtils from '../src/utils';
import * as BridgeApp from '../src/blockHeaderRegistry';
import { BridgeSDK } from '../src/sdk';
import { abi as TokenABI } from '../src/abi/TestToken.json';
import { range } from 'lodash';
import { relayerApp, stop } from '../src/relayer';
import release from '../../bridge-contracts/release/deployment.json';

const delay = async (milis) => {
  return new Promise((res) => {
    setTimeout(res, milis);
  });
};
jest.setTimeout(120000);

describe('relayer app', () => {
  let intervalId;

  const sourceBridgeAddr = release['test'].sourceBridge;
  const targetBridgeAddr = release['test'].targetBridge;
  const localNode = new ethers.providers.JsonRpcProvider('http://localhost:8545');
  const sdk = new BridgeSDK(
    release['test'].registery,
    { 99: sourceBridgeAddr, 100: targetBridgeAddr },
    10,
    'http://localhost:8545',
    { 99: release['test'].multicall, 100: release['test'].multicall },
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

  const sourceToken = new ethers.Contract(release['test'].sourceToken, TokenABI, signer);

  const recipient = ethers.Wallet.createRandom().connect(localNode);
  const sender = ethers.Wallet.createRandom().connect(localNode);

  // Act before assertions
  beforeAll(async () => {
    await signer.sendTransaction({ to: recipient.address, value: ethers.constants.WeiPerEther });
    await signer.sendTransaction({ to: sender.address, value: ethers.constants.WeiPerEther });

    await sourceToken.transfer(sender.address, 1000000);
    registry = await SigUtils.getRegistryContract(release['test'].registery, signer);
    await registry.addBlockchain(99, 'http://localhost:8545');
    await registry.addBlockchain(100, 'http://localhost:8545');
    await BridgeApp.initBlockRegistryContract(
      signer,
      release['test'].registery,
      release['test'].consensus,
      'http://localhost:8545',
    );
    await BridgeApp._refreshRPCs();
    await BridgeApp.emitRegistry(validators);
    // intervalId = setInterval(() => BridgeApp.emitRegistry(validators), 2000);
    try {
      await registry.voting();
    } catch (e) {
      throw new Error('hardhat node should be running for tests: ' + e.message);
    }
  });

  it('starts a relayer', async () => {
    const bridges = await relayerApp([{ 99: sourceBridgeAddr, 100: targetBridgeAddr }], 5000);
    expect(bridges).toBeTruthy();
  });

  it('relayer executes requests', async () => {
    const sourceBridge = await (await sdk.getBridgeContract(99, localNode)).connect(signer);
    await (await sourceToken.connect(sender).approve(sourceBridgeAddr, 100000)).wait();
    const bridgeTx = await (await sourceBridge.connect(sender).bridgeTo(recipient.address, 100, 100000)).wait();
    const id = bridgeTx.events?.find((_) => _.event === 'BridgeRequest')?.args?.id;
    for (let i = 0; i < 10; i++) {
      await localNode.send('evm_mine', []);
    }
    await BridgeApp.emitRegistry(validators);

    await delay(5000); //wait for relayer

    const targetBridge = await (await sdk.getBridgeContract(100, localNode)).connect(signer);
    const events = await targetBridge.queryFilter(targetBridge.filters.ExecutedTransfer(), -50);

    const executedEvent = events.find((_) => _.args.id.toString() === id.toString());

    expect(executedEvent).toBeTruthy();
  });

  // eslint-disable-next-line jest/expect-expect
  it('shutsdown relayer', () => {
    stop();
    clearInterval(intervalId);
  });
});
