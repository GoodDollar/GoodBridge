import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import hre, { ethers, waffle, upgrades } from 'hardhat';
import Contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import CtrlABI from '@gooddollar/goodprotocol/artifacts/abis/Controller.min.json';
import util from 'util';
import { getImplementationAddress } from '@openzeppelin/upgrades-core';
const exec = util.promisify(require('child_process').exec);

const verifyContracts = async (chainData, mpbImplAddress, helperAddress, isTestnet) => {
  console.log('verifying on etherscan...');
  await hre.run('etherscan-verify');
  console.log('verifying on sourcify...');
  await hre.run('sourcify');

  //bug in hardhat-deploy not able to verify with libraries on etherscan
  console.log('verifying on impl+library on etherscan...');
  await hre.run('verify:verify', {
    address: mpbImplAddress,
    constructorArguments: [
      chainData.axlGateway,
      chainData.axlGas,
      chainData.lzEndpoint,
      isTestnet,
      chainData.homeChainId,
    ],
    libraries: {
      BridgeHelperLibrary: helperAddress,
    },
  });
};

const chainsData = {
  hardhat: {
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6',
    lzEndpoint: '0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23',
    nameService: Contracts['hardhat']?.NameService,
    minter: Contracts['hadhat']?.GoodDollarMintBurnWrapper,
    oneToken: ethers.constants.WeiPerEther,
    homeChainId: 31337,
  },
  goerli: {
    name: 'goerli',
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6',
    lzEndpoint: '0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23',
    nameService: Contracts['goerli']?.NameService,
    minter: Contracts['goerli']?.GoodDollarMintBurnWrapper,
    oneToken: ethers.constants.WeiPerEther,
    zkLightClient: '0x55d193eF196Be455c9c178b0984d7F9cE750CCb4',
    homeChainId: 5,
  },
  alfajores: {
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6',
    lzEndpoint: '0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1',
    nameService: Contracts['alfajores']?.NameService,
    minter: Contracts['alfajores']?.GoodDollarMintBurnWrapper || '0x69d9c8d240e282a4ec0058cf0ac4e9d8ac7a11ac',
    oneToken: ethers.constants.WeiPerEther,
    homeChainId: 5,
  },
  mainnet: {
    name: 'production-mainnet',
    axlGateway: '0x4F4495243837681061C4743b74B3eEdf548D56A5',
    axlGas: '0x2d5d7d31F671F86C782533cc367F14109a082712',
    lzEndpoint: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
    nameService: Contracts['production-mainnet']?.NameService,
    minter: Contracts['production-mainnet']?.GoodDollarMintBurnWrapper,
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
    minter: Contracts['production-celo']?.GoodDollarMintBurnWrapper,
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
    minter: Contracts['development-celo']?.GoodDollarMintBurnWrapper,
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
    minter: Contracts['production']?.GoodDollarMintBurnWrapper,
    oneToken: ethers.BigNumber.from(100),
    homeChainId: 42220,
  },
  fuse_testnet: {
    name: 'fuse',
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6',
    lzEndpoint: '0x9740FF91F1985D8d2B71494aE1A2f723bb3Ed9E4',
    nameService: Contracts['fuse']?.NameService,
    minter: Contracts['fuse']?.GoodDollarMintBurnWrapper,
    oneToken: ethers.BigNumber.from(100),
    homeChainId: 42220,
  },
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
  let isTestnet = true;
  if (['celo', 'mainnet', 'fuse', 'fork'].includes(network.name)) isTestnet = false;

  //support simulation on a fork
  const chainData = chainsData[network.name === 'fork' ? 'mainnet' : network.name];
  console.log(chainData, network.name, { isTestnet });

  const proxySalt = ethers.utils.keccak256(
    ethers.utils.arrayify(ethers.utils.toUtf8Bytes('MessagePassingBridge' + (isTestnet ? 'Testnet' : 'V1'))),
  );
  const bridgeProxyDeploy = await deployments.deterministic('MessagePassingBridge', {
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

  const bridgeImpl = await deployments.deploy('MessagePassingBridge_Implementation', {
    contract: 'MessagePassingBridge',
    from: signer.address,
    deterministicDeployment: true,
    log: true,
    args: [chainData.axlGateway, chainData.axlGas, chainData.lzEndpoint, isTestnet, chainData.homeChainId],
    libraries: { BridgeHelperLibrary: bridgeHelperLibrary.address },
  }); //as unknown as MessagePassingBridge;

  const mpb = await ethers.getContractAt('MessagePassingBridge', bridgeProxy.address);
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
      if (isTestnet) {
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
    if (chainData.zkLightClient) {
      if (network.config.chainId != 1)
        await mpb
          .setConfig(0, 101, 6, ethers.utils.defaultAbiCoder.encode(['address'], [chainData.zkLightClient]))
          .then((_) => _.wait()); //eth
      if (isTestnet)
        await mpb
          .setConfig(0, 10121, 6, ethers.utils.defaultAbiCoder.encode(['address'], [chainData.zkLightClient]))
          .then((_) => _.wait()); //goerli
      if (network.config.chainId != 42220)
        await mpb
          .setConfig(0, 125, 6, ethers.utils.defaultAbiCoder.encode(['address'], [chainData.zkLightClient]))
          .then((_) => _.wait()); // celo
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
    console.log('setting zklightclient...');
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

  if (['localhost', 'hardhat', 'fork'].includes(network.name) === false)
    await verifyContracts(chainData, bridgeImpl.address, bridgeHelperLibrary.address, isTestnet);
};
export default func;
