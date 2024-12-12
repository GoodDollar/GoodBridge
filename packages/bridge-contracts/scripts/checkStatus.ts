import * as ethers from 'ethers';
import { difference, range } from 'lodash';
import bridges from '../release/deployment.json';
import { TokenBridge } from '../typechain-types';
import { ExecutedTransferEvent } from '../typechain-types/contracts/test/TokenBridgeTest';
const TokenBridgeABI = [
  'event BridgeRequest(address indexed,address indexed,uint256,uint256,bool,uint256,uint256 indexed)',
  'event ExecutedTransfer(address indexed,address indexed,address,uint256,uint256,uint256,uint256,uint256 indexed)',
];
const fuseRpc = new ethers.providers.JsonRpcProvider('https://rpc.fuse.io');
const celoRpc = new ethers.providers.JsonRpcProvider('https://forno.celo.org');

const handleError = async (bridge, celoNotExecuted, fuseNotExecuted) => { };
const blocksAgo = -150000;
const checkStaleRequests = async () => {
  const ps = Object.values(bridges).map(async (bridge) => {
    const bridgeA = new ethers.Contract(bridge.fuseBridge, TokenBridgeABI, fuseRpc);
    const bridgeB = new ethers.Contract(bridge.celoBridge, TokenBridgeABI, celoRpc);
    const bridgeARequests = await bridgeA.queryFilter(bridgeA.filters.BridgeRequest(), blocksAgo, -60);
    const bridgeAExecuted = await bridgeA.queryFilter(bridgeA.filters.ExecutedTransfer(), blocksAgo);
    bridgeAExecuted.push(...(await bridgeA.queryFilter(bridgeA.filters.ExecutedTransfer(), blocksAgo * 2, blocksAgo)));
    const bridgeBRequests = await bridgeB.queryFilter(bridgeB.filters.BridgeRequest(), blocksAgo, -60);
    const bridgeBExecuted = await bridgeB.queryFilter(bridgeB.filters.ExecutedTransfer(), blocksAgo);
    bridgeBExecuted.push(...(await bridgeB.queryFilter(bridgeB.filters.ExecutedTransfer(), blocksAgo * 2, blocksAgo)));

    const aRequests = bridgeARequests.map((e) => e.args?.[6].toString());
    const aExecuted = bridgeAExecuted.map((e) => e.args?.[7].toString());
    const bRequests = bridgeBRequests.map((e) => e.args?.[6].toString());
    const bExecuted = bridgeBExecuted.map((e) => e.args?.[7].toString());

    const fuseNotExecuted = difference(aRequests, bExecuted).map(
      (id) => bridgeARequests.find((_) => _.args?.[6].toString() == id)?.transactionHash,
    );
    const celoNotExecuted = difference(bRequests, aExecuted).map(
      (id) => bridgeBRequests.find((_) => _.args?.[6].toString() == id)?.transactionHash,
    );

    console.log('found on fuse:', bridge.fuseBridge, {
      aRequests,
      aExecuted,
      fuseNotExecuted,
    });
    console.log('found requests celo:', bridge.celoBridge, {
      bRequests,
      bExecuted,
      celoNotExecuted,
    });
    if (celoNotExecuted.length || fuseNotExecuted.length) {
      await handleError(bridge, celoNotExecuted, fuseNotExecuted);
    }
  });
  await Promise.all(ps);
};

const checkFees = async () => {
  const bridge = bridges.production;

  const bridgeA = new ethers.Contract(bridge.fuseBridge, TokenBridgeABI, fuseRpc) as TokenBridge;
  const bridgeB = new ethers.Contract(bridge.celoBridge, TokenBridgeABI, celoRpc) as TokenBridge;

  const bridgeBExecuted: Array<ExecutedTransferEvent> = [];
  const bridgeAExecuted: Array<ExecutedTransferEvent> = [];

  let hasEvents = true;
  let step = 100000;
  let curStep = 22800000;
  let curBlock = await fuseRpc.getBlockNumber();
  while (hasEvents && curStep < curBlock) {
    const events = await bridgeA.queryFilter(
      bridgeA.filters.ExecutedTransfer(),
      curStep,
      Math.min(curBlock, curStep + step),
    );
    console.log(events.length);
    bridgeAExecuted.push(...events);
    curStep += step;
    hasEvents = events.length > 0;
  }

  hasEvents = true;
  curStep = 18800000;
  curBlock = await celoRpc.getBlockNumber();
  while (hasEvents && curStep < curBlock) {
    const events = await bridgeB.queryFilter(
      bridgeB.filters.ExecutedTransfer(),
      curStep,
      Math.min(curBlock, curStep + step),
    );
    console.log(events.length);
    bridgeBExecuted.push(...events);
    curStep += step;
    hasEvents = events.length > 0;
  }

  const resultA = bridgeAExecuted.reduce(
    (acc: { relayers: any; bridgeFees: ethers.BigNumber }, cur) => {
      acc.relayers[cur.args[2]] = (acc.relayers[cur.args[2]] || ethers.BigNumber.from(0)).add(cur.args[4].div(2));
      acc.bridgeFees = acc.bridgeFees.add(cur.args[4].div(2));
      return acc;
    },
    { relayers: {}, bridgeFees: ethers.BigNumber.from(0) },
  );

  const resultB = bridgeBExecuted.reduce(
    (acc: { relayers: any; bridgeFees: ethers.BigNumber }, cur) => {
      acc.relayers[cur.args[2]] = (acc.relayers[cur.args[2]] || ethers.BigNumber.from(0)).add(cur.args[4].div(2));
      acc.bridgeFees = acc.bridgeFees.add(cur.args[4].div(2));
      return acc;
    },
    { relayers: {}, bridgeFees: ethers.BigNumber.from(0) },
  );
  console.log('Fuse:', resultA);
  console.log('Celo:', resultB);
};

checkStaleRequests();

// checkFees();
