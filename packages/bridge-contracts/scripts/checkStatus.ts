import * as ethers from 'ethers';
import { difference } from 'lodash';

const bridges = {
  fuse: {
    fuseBridge: '0x5B7cEfD0e7d952F7E400416F9c98fE36F1043822',
    celoBridge: '0x165aEb4184A0cc4eFb96Cb6035341Ba2265bA564',
    registry: '0x44a1E0A83821E239F9Cef248CECc3AC5b910aeD2',
  },
  staging: {
    fuseBridge: '0x1CD7a472FF2c6826252932CC8aC40473898d90E8',
    celoBridge: '0x0A6538C9DAc037f5313CaAEb42b19081993e3183',
    registry: '0x44a1E0A83821E239F9Cef248CECc3AC5b910aeD2',
  },
};
const TokenBridgeABI = [
  'event BridgeRequest(address indexed,address indexed,uint256,uint256,bool,uint256,uint256 indexed)',
  'event ExecutedTransfer(address indexed,address indexed,address,uint256,uint256,uint256,uint256,uint256 indexed)',
];
const fuseRpc = new ethers.providers.JsonRpcProvider('https://rpc.fuse.io');
const celoRpc = new ethers.providers.JsonRpcProvider('https://forno.celo.org');

const handleError = async (bridge, celoNotExecuted, fuseNotExecuted) => {};
const checkStaleRequests = async () => {
  const ps = Object.values(bridges).map(async (bridge) => {
    const bridgeA = new ethers.Contract(bridge.fuseBridge, TokenBridgeABI, fuseRpc);
    const bridgeB = new ethers.Contract(bridge.celoBridge, TokenBridgeABI, celoRpc);
    const bridgeARequests = await bridgeA.queryFilter(bridgeA.filters.BridgeRequest(), -120, -60);
    const bridgeAExecuted = await bridgeA.queryFilter(bridgeA.filters.ExecutedTransfer(), -120);
    const bridgeBRequests = await bridgeB.queryFilter(bridgeB.filters.BridgeRequest(), -120, -60);
    const bridgeBExecuted = await bridgeB.queryFilter(bridgeB.filters.ExecutedTransfer(), -120);

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
