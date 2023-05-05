import * as ethers from 'ethers';
import { difference } from 'lodash';
import bridges from '../release/deployment.json';

const TokenBridgeABI = [
  'event BridgeRequest(address indexed,address indexed,uint256,uint256,bool,uint256,uint256 indexed)',
  'event ExecutedTransfer(address indexed,address indexed,address,uint256,uint256,uint256,uint256,uint256 indexed)',
];
const fuseRpc = new ethers.providers.JsonRpcProvider('https://rpc.fuse.io');
const celoRpc = new ethers.providers.JsonRpcProvider('https://forno.celo.org');

const handleError = async (bridge, celoNotExecuted, fuseNotExecuted) => {};
const blocksAgo = -20000;
const checkStaleRequests = async () => {
  const ps = Object.values(bridges).map(async (bridge) => {
    const bridgeA = new ethers.Contract(bridge.fuseBridge, TokenBridgeABI, fuseRpc);
    const bridgeB = new ethers.Contract(bridge.celoBridge, TokenBridgeABI, celoRpc);
    const bridgeARequests = await bridgeA.queryFilter(bridgeA.filters.BridgeRequest(), blocksAgo, -60);
    const bridgeAExecuted = await bridgeA.queryFilter(bridgeA.filters.ExecutedTransfer(), blocksAgo);
    const bridgeBRequests = await bridgeB.queryFilter(bridgeB.filters.BridgeRequest(), blocksAgo, -60);
    const bridgeBExecuted = await bridgeB.queryFilter(bridgeB.filters.ExecutedTransfer(), blocksAgo);

    const aRequests = bridgeARequests.map((e) => e.args?.[6].toString());
    const aExecuted = bridgeAExecuted.map((e) => e.args?.[7].toString());
    const bRequests = bridgeBRequests.map((e) => e.args?.[6].toString());
    const bExecuted = bridgeBExecuted.map((e) => e.args?.[7].toString());

    const fuseNotExecuted = difference(aRequests, bExecuted);
    const celoNotExecuted = difference(bRequests, aExecuted);
    console.log('found on fuse:', bridge.fuseBridge, { aRequests, aExecuted, fuseNotExecuted });
    console.log('found requests celo:', bridge.celoBridge, { bRequests, bExecuted, celoNotExecuted });
    if (celoNotExecuted.length || fuseNotExecuted.length) {
      await handleError(bridge, celoNotExecuted, fuseNotExecuted);
    }
  });
  await Promise.all(ps);
};

checkStaleRequests();
