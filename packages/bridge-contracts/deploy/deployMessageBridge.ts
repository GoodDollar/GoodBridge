import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import hre, { ethers, waffle, upgrades } from 'hardhat';
import Contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import CtrlABI from '@gooddollar/goodprotocol/artifacts/abis/Controller.min.json';
import util from 'util';
import { getImplementationAddress } from '@openzeppelin/upgrades-core';
import { MessagePassingBridge } from '../typechain-types';
const exec = util.promisify(require('child_process').exec);

const verifyContracts = async (chainData, mpbImplAddress, helperAddress, proxyAddress) => {
  //bug in hardhat-deploy not able to verify with libraries on etherscan
  console.log('verifying on impl+library on etherscan...');

  try {
    await hre.run('verify:verify', {
      address: mpbImplAddress,
      constructorArguments: [chainData.axlGateway, chainData.axlGas, chainData.lzEndpoint, chainData.homeChainId],
      libraries: {
        BridgeHelperLibrary: helperAddress,
      },
    });
  } catch (e) {
    console.log('implementation verification error:', e);
  }

  try {
    await hre.run('verify:verify', {
      address: proxyAddress,
    });
  } catch (e) {
    console.log('proxy verification error:', e);
  }
  try {
    await hre.run('verify:verify', {
      address: helperAddress,
    });
  } catch (e) {
    console.log('library verification error:', e);
  }

  console.log('verifying on sourcify...');
  const sourcify = hre.run('sourcify');
  await sourcify;
};

const chainsData = {
  hardhat: {
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6',
    lzEndpoint: '0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23',
    nameService: Contracts['hardhat']?.NameService,
    oneToken: ethers.constants.WeiPerEther,
    homeChainId: 31337,
  },
  alfajores: {
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6',
    lzEndpoint: '0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1',
    nameService: Contracts['alfajores']?.NameService,
    oneToken: ethers.constants.WeiPerEther,
    homeChainId: 5,
  },
  mainnet: {
    name: 'production-mainnet',
    axlGateway: '0x4F4495243837681061C4743b74B3eEdf548D56A5',
    axlGas: '0x2d5d7d31F671F86C782533cc367F14109a082712',
    lzEndpoint: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
    nameService: Contracts['production-mainnet']?.NameService,
    oneToken: ethers.BigNumber.from(100),
    zkLightClient: '0x394ee343625B83B5778d6F42d35142bdf26dBAcD',
    homeChainId: 42220,
  },
  celo: {
    name: 'production-celo',
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0x2d5d7d31F671F86C782533cc367F14109a082712',
    lzEndpoint: '0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9',
    nameService: Contracts['production-celo']?.NameService,
    oneToken: ethers.constants.WeiPerEther,
    zkLightClient: '0x1F45c453a91179a32b97623736dF09A552BC4f7f',
    homeChainId: 42220,
  },
  celo_testnet: {
    name: 'development-celo',
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0x2d5d7d31F671F86C782533cc367F14109a082712',
    lzEndpoint: '0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9',
    nameService: Contracts['development-celo']?.NameService,
    oneToken: ethers.constants.WeiPerEther,
    zkLightClient: '0x1F45c453a91179a32b97623736dF09A552BC4f7f',
    homeChainId: 42220,
  },
  fuse: {
    name: 'production',
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6',
    lzEndpoint: '0x9740FF91F1985D8d2B71494aE1A2f723bb3Ed9E4',
    nameService: Contracts['production']?.NameService,
    oneToken: ethers.BigNumber.from(100),
    homeChainId: 42220,
  },
  fuse_testnet: {
    name: 'fuse',
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6',
    lzEndpoint: '0x9740FF91F1985D8d2B71494aE1A2f723bb3Ed9E4',
    nameService: Contracts['fuse']?.NameService,
    oneToken: ethers.BigNumber.from(100),
    homeChainId: 42220,
  },
  xdc_testnet: {
    name: 'development-xdc',
    axlGateway: '0x0000000000000000000000000000000000000001',
    axlGas: '0x0000000000000000000000000000000000000001',
    lzEndpoint: '0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7',
    nameService: Contracts['development-xdc']?.NameService,
    oneToken: ethers.constants.WeiPerEther,
    homeChainId: 42220,
  },
  xdc: {
    name: 'production-xdc',
    axlGateway: '0x0000000000000000000000000000000000000001',
    axlGas: '0x0000000000000000000000000000000000000001',
    lzEndpoint: '0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7',
    nameService: '0x1e5154Bf5e31FF56051bbd45958b879Fb7a290FE',
    oneToken: ethers.constants.WeiPerEther,
    homeChainId: 42220,
  },
};

const simulateUpgrade = async (mpb: MessagePassingBridge, impl: string) => {
  const owner = await mpb.owner();
  const signer = await ethers.getImpersonatedSigner(owner);
  console.log('got owner signer:', signer.address);
  const upgradeResult = await (
    await mpb.connect(signer).upgradeToAndCall(impl, mpb.interface.encodeFunctionData('upgrade', []))
  ).wait();
  console.log('xdc:', await mpb.lzChainIdsMapping(50));
  console.log({ upgradeResult });
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network } = hre;
  const signers = await ethers.getSigners();
  const signer = signers[0];
  console.log('Signer:', {
    address: signer.address,
    balance: await signer.getBalance().then((_) => _.toString()),
  });
  if (network.name === 'hardhat') {
    const ns = await waffle.deployMockContract(signers[0], ['function getAddress(string) returns(address)']);
    const ctrl = await waffle.deployMockContract(signers[0], ['function avatar() returns(address)']);
    await ns.mock.getAddress.withArgs('CONTROLLER').returns(ctrl.address);
    await ns.mock.getAddress.withArgs('UBISCHEME').returns(signers[1].address);

    await ctrl.mock.avatar.returns(signer.address);
    chainsData[network.name].nameService = ns.address;
  }
  let isTestnet = false;
  if (network.name.includes('testnet')) {
    isTestnet = true;
  }

  //support simulation on a fork
  const chainData = chainsData[network.name === 'localhost' ? 'celo' : network.name];

  const proxySalt = ethers.utils.keccak256(
    ethers.utils.arrayify(ethers.utils.toUtf8Bytes(isTestnet ? 'Testnet' : 'MessagePassingBridgeV1')),
  );
  console.log(chainData, network.name, { isTestnet, proxySalt });
  let bridgeProxyDeploy;
  if(!isTestnet)
  {
    // use the old proxy deployment code to deploy the proxy with the same address on all networks via universal deployer, since hardhat-deploy deterministic deployment
    // to get same bytecode when compiling need to checkout commit version 065d62bf1a2bf2ab6bbc3a931601c156656cdbc8 which uses @gooddollar/goodprotocol v2.0.34
    // but this doesnt add it to the list of contracts by hardhat-deploy, so need to manually add it to release/mpb.json
    // other option is to checkout the commit, and deploy there and use the resulting mpb.json
    const exists = await ethers.provider.getCode("0xa3247276DbCC76Dd7705273f766eB3E8a5ecF4a5").then(code => code !== '0x');
    if(!exists)
    {
      await signer.sendTransaction({to: "0x4e59b44847b379578588920cA78FbF26c0B4956C", value: 0, data: "0xb9916d4cd03e95b5f36759704e4ac396b2ff7a9168e76f27770cd8f5db44a00e608060405234801561001057600080fd5b506105ad806100206000396000f3fe6080604052600436106100225760003560e01c8063d1f578941461003957610031565b366100315761002f61004c565b005b61002f61004c565b61002f6100473660046103ea565b61005e565b61005c61005761013d565b61014c565b565b6000610068610170565b6001600160a01b0316146100b15760405162461bcd60e51b815260206004820152600b60248201526a1a5b9a5d1a585b1a5e995960aa1b60448201526064015b60405180910390fd5b6100dc60017f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbd61047a565b600080516020610531833981519152146100f8576100f861049f565b6101388383838080601f0160208091040260200160405190810160405280939291908181526020018383808284376000920182905250925061018c915050565b505050565b6000610147610170565b905090565b3660008037600080366000845af43d6000803e80801561016b573d6000f35b3d6000fd5b600080516020610531833981519152546001600160a01b031690565b610195836101b7565b6000825111806101a25750805b15610138576101b183836101f7565b50505050565b6101c081610223565b6040516001600160a01b038216907fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a250565b606061021c8383604051806060016040528060278152602001610551602791396102bd565b9392505050565b61022c81610335565b61028e5760405162461bcd60e51b815260206004820152602d60248201527f455243313936373a206e657720696d706c656d656e746174696f6e206973206e60448201526c1bdd08184818dbdb9d1c9858dd609a1b60648201526084016100a8565b60008051602061053183398151915280546001600160a01b0319166001600160a01b0392909216919091179055565b6060600080856001600160a01b0316856040516102da91906104e1565b600060405180830381855af49150503d8060008114610315576040519150601f19603f3d011682016040523d82523d6000602084013e61031a565b606091505b509150915061032b86838387610344565b9695505050505050565b6001600160a01b03163b151590565b606083156103ae5782516103a75761035b85610335565b6103a75760405162461bcd60e51b815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e747261637400000060448201526064016100a8565b50816103b8565b6103b883836103c0565b949350505050565b8151156103d05781518083602001fd5b8060405162461bcd60e51b81526004016100a891906104fd565b6000806000604084860312156103ff57600080fd5b83356001600160a01b038116811461041657600080fd5b925060208401356001600160401b038082111561043257600080fd5b818601915086601f83011261044657600080fd5b81358181111561045557600080fd5b87602082850101111561046757600080fd5b6020830194508093505050509250925092565b60008282101561049a57634e487b7160e01b600052601160045260246000fd5b500390565b634e487b7160e01b600052600160045260246000fd5b60005b838110156104d05781810151838201526020016104b8565b838111156101b15750506000910152565b600082516104f38184602087016104b5565b9190910192915050565b602081526000825180602084015261051c8160408501602087016104b5565b601f01601f1916919091016040019291505056fe360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc416464726573733a206c6f772d6c6576656c2064656c65676174652063616c6c206661696c6564a2646970667358221220aee5838a8252d1636189241c7c2619efbaf1b1fe00b0f1d436017a2d9459123764736f6c634300080a0033"}).then(_ => _.wait());
    }
    bridgeProxyDeploy = await ethers.getContractAt("ERC1967Proxy","0xa3247276DbCC76Dd7705273f766eB3E8a5ecF4a5")
  }
  else {
     bridgeProxyDeploy = await deployments.deterministic('MessagePassingBridge', {
    contract: 'ERC1967Proxy',
    from: signer.address,
    salt: proxySalt,
    log: true,
  });

  const bridgeHelperLibrary = await deployments.deterministic('BridgeHelperLibrary', {
    contract: 'BridgeHelperLibrary',
    from: signer.address,
    log: true,
  });

  await bridgeHelperLibrary.deploy();
  console.log('BridgeHelperLibrary', bridgeHelperLibrary.address);
  const bridgeProxy = await bridgeProxyDeploy.deploy();

  console.log('MessagePassingBridge proxy', bridgeProxy.address);
  const bridgeImpl = await deployments.deploy('MessagePassingBridge_Implementation', {
    contract: 'MessagePassingBridge',
    from: signer.address,
    deterministicDeployment: true,
    log: true,
    args: [chainData.axlGateway, chainData.axlGas, chainData.lzEndpoint, chainData.homeChainId],
    libraries: { BridgeHelperLibrary: bridgeHelperLibrary.address },
  }); //as unknown as MessagePassingBridge;
  console.log('MessagePassingBridge implementation', bridgeImpl.address);

  const mpb = await ethers.getContractAt('MessagePassingBridge', bridgeProxy.address);
  // await simulateUpgrade(mpb as unknown as MessagePassingBridge, bridgeImpl.address);
  // return;
  const initialized = await mpb
    .dao()
    .then((_) => _ !== ethers.constants.AddressZero)
    .catch((_) => false);

  const defaultFees = { maxFee: chainData.oneToken.mul(1e6), minFee: chainData.oneToken.mul(10), fee: 10 }; //maxFee = 1M G$, minFee= 10G$, fee 0.1% 10 in bps
  const defaultLimits = {
    dailyLimit: ['production-mainnet', 'goerli'].includes(chainData.name)
      ? ethers.constants.WeiPerEther.mul(300e6)
      : ethers.constants.MaxUint256, //unlimited incoming on sidechains
    txLimit: ethers.constants.WeiPerEther.mul(300e6),
    accountDailyLimit: ethers.constants.WeiPerEther.mul(300e6),
    minAmount: ethers.constants.WeiPerEther.mul(10),
    onlyWhitelisted: false,
  };

  //on side chains bridge needs to be able to mint
  const addAsMinter = async () => {
    console.log('adding bridge as minter');
    const ctrl = new ethers.Contract(Contracts[chainData.name || network.name].Controller, CtrlABI.abi, signer);
    console.log(
      'controller:',
      ctrl.address,
      'signer:',
      signer.address,
      'avatar:',
      Contracts[chainData.name || network.name].Avatar,
    );
    const addMinterResult = await ctrl.registerScheme(
      bridgeProxy.address,
      ethers.constants.HashZero,
      '0x00000001',
      Contracts[chainData.name || network.name].Avatar,
    );
    console.log({ addMinterResult });
  };

  const isUpgraded =
    initialized && (await getImplementationAddress(ethers.provider, mpb.address)) === bridgeImpl.address;
  if (!isUpgraded || bridgeImpl.newlyDeployed || !initialized) {
    //if proxy is new then we initialize, otherwise try to upgrade?
    if (!initialized) {
      console.log('initializing bridge...');
      const encoded = mpb.interface.encodeFunctionData('initialize', [
        chainData.nameService,
        defaultLimits,
        defaultFees,
      ]);

      const initializedTx = await deployments.execute(
        'MessagePassingBridge',
        { from: signer.address },
        'initialize',
        bridgeImpl.address,
        encoded,
      );
      console.log({ initializedTx });
      if (network.name !== 'hardhat') {
        await addAsMinter();
      }
    } else if (isTestnet) {
      console.log('upgrading testnet contract...');
      //testnet upgrade
      let upgradeResult;
      const canUpgrade = await mpb.callStatic
        .upgradeTo(bridgeImpl.address)
        .then((_) => true)
        .catch((_) => false);
      if (canUpgrade) {
        upgradeResult = await mpb.upgradeTo(bridgeImpl.address).then((_) => _.wait());
      } else {
        const ctrl = new ethers.Contract(Contracts[chainData.name || network.name].Controller, CtrlABI.abi, signer);
        const encoded = mpb.interface.encodeFunctionData('upgradeTo', [bridgeImpl.address]);
        upgradeResult = await (
          await ctrl.genericCall(bridgeProxy.address, encoded, Contracts[chainData.name || network.name].Avatar, 0)
        ).wait();
      }
      console.log({ upgradeResult });
    } else {
      console.log('upgrade of bridge not supported here... need to be done via DAO');
    }
  }

  const setLzZKOracle = async () => {
    console.log('setting zklightclient...');
    if (chainData.zkLightClient) {
      if (network.config.chainId != 1) {
        await mpb
          .setConfig(0, 101, 6, ethers.utils.defaultAbiCoder.encode(['address'], [chainData.zkLightClient]))
          .then((_) => _.wait()); //eth
        console.log('set zkLightClient for eth target');
      }
      if (network.config.chainId != 42220) {
        await mpb
          .setConfig(0, 125, 6, ethers.utils.defaultAbiCoder.encode(['address'], [chainData.zkLightClient]))
          .then((_) => _.wait()); // celo
        console.log('set zkLightClient for celo target');
      }
    }
  };

  // helpers
  if (isTestnet) {
    // const ctrl = new ethers.Contract(Contracts[chainData.name || network.name].Controller, CtrlABI.abi, signer);
    // const encoded = mpb.interface.encodeFunctionData('transferOwnership', [signer.address]);
    // const txResult = await (
    //   await ctrl.genericCall(bridgeProxy.address, encoded, Contracts[chainData.name || network.name].Avatar, 0)
    // ).wait();
    // await mpb
    //   .setTrustedRemoteAddress(10001, ethers.utils.solidityPack(['address', 'address'], [mpb.address, mpb.address]))
    //   .then((_) => _.wait());
    // await mpb
    //   .setTrustedRemoteAddress(125, ethers.utils.solidityPack(['address', 'address'], [mpb.address, mpb.address]))
    //   .then((_) => _.wait());
    // await mpb
    //   .setTrustedRemoteAddress(138, ethers.utils.solidityPack(['address', 'address'], [mpb.address, mpb.address]))
    //   .then((_) => _.wait());
    //     console.log('resetting fees/limits on testnet');
    //     await (await mpb.setBridgeLimits(defaultLimits)).wait();
    //     await (await mpb.setBridgeFees(defaultFees)).wait();
    // await addAsMinter();
  }

  if ((await mpb.owner()) === signer.address) {
    await setLzZKOracle();
    if (['production-mainnet', 'goerli'].includes(chainData.name)) {
      console.log('setting fee recipient to null');
      await mpb.setFeeRecipient(ethers.constants.AddressZero);
    }
    if (isTestnet === false) {
      console.log('transfering ownerhsip to DAO...');
      await mpb.transferOwnership(await mpb.avatar()).then((_) => _.wait());
    }
  }

  try {
    if (['localhost', 'hardhat', 'fork'].includes(network.name) === false)
      await verifyContracts(chainData, bridgeImpl.address, bridgeHelperLibrary.address, bridgeProxy.address);
  } catch (e) {
    console.log('verification error:', e);
  }
};
export default func;
