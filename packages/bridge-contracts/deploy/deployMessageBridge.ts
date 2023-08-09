import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, waffle } from 'hardhat';
import Contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import CtrlABI from '@gooddollar/goodprotocol/artifacts/abis/Controller.min.json';
import util from 'util';

const exec = util.promisify(require('child_process').exec);

const verifyContracts = async (network) => {
  let cmd = `npx hardhat etherscan-verify --network ${network}`;
  console.log('running...:', cmd);
  await exec(cmd).then(({ stdout, stderr }) => {
    console.log('Result for:', cmd);
    console.log(stdout);
    console.log(stderr);
  });
  cmd = `npx hardhat sourcify --network ${network}`;
  console.log('running...:', cmd);
  await exec(cmd).then(({ stdout, stderr }) => {
    console.log('Result for:', cmd);
    console.log(stdout);
    console.log(stderr);
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
  },
  goerli: {
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6',
    lzEndpoint: '0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23',
    nameService: Contracts['goerli']?.NameService,
    minter: Contracts['goerli']?.GoodDollarMintBurnWrapper,
    oneToken: ethers.constants.WeiPerEther,
  },
  alfajores: {
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6',
    lzEndpoint: '0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1',
    nameService: Contracts['alfajores']?.NameService,
    minter: Contracts['alfajores']?.GoodDollarMintBurnWrapper || '0x69d9c8d240e282a4ec0058cf0ac4e9d8ac7a11ac',
    oneToken: ethers.constants.WeiPerEther,
  },
  mainnet: {
    name: 'production-mainnet',
    axlGateway: '0x4F4495243837681061C4743b74B3eEdf548D56A5',
    axlGas: '0x2d5d7d31F671F86C782533cc367F14109a082712',
    lzEndpoint: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
    nameService: Contracts['production-mainnet']?.NameService,
    minter: Contracts['production-mainnet']?.GoodDollarMintBurnWrapper,
    oneToken: ethers.BigNumber.from(100),
  },
  celo: {
    name: 'production-celo',
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0x2d5d7d31F671F86C782533cc367F14109a082712',
    lzEndpoint: '0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9',
    nameService: Contracts['production-celo']?.NameService,
    minter: Contracts['production-celo']?.GoodDollarMintBurnWrapper,
    oneToken: ethers.constants.WeiPerEther,
  },
  fuse: {
    name: 'production',
    axlGateway: '0xe432150cce91c13a887f7D836923d5597adD8E31',
    axlGas: '0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6',
    lzEndpoint: '0x9740FF91F1985D8d2B71494aE1A2f723bb3Ed9E4',
    nameService: Contracts['production']?.NameService,
    minter: Contracts['production']?.GoodDollarMintBurnWrapper,
    oneToken: ethers.BigNumber.from(100),
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
  console.log(chainData, network.name);

  const bridgeProxyDeploy = await deployments.deterministic('MessagePassingBridge', {
    contract: 'ERC1967Proxy',
    from: signer.address,
    salt: ethers.utils.keccak256(ethers.utils.arrayify(ethers.utils.toUtf8Bytes('MessagePassingBridge'))),
    log: true,
  });
  const bridgeProxy = await bridgeProxyDeploy.deploy();

  const bridgeImpl = await deployments.deploy('MessagePassingBridge_Implementation', {
    contract: 'MessagePassingBridge',
    from: signer.address,
    deterministicDeployment: true,
    log: true,
    args: [chainData.axlGateway, chainData.axlGas, chainData.lzEndpoint, isTestnet],
  }); //as unknown as MessagePassingBridge;

  const mpb = await ethers.getContractAt('MessagePassingBridge', bridgeProxy.address);
  const initialized = await mpb
    .dao()
    .then((_) => _ !== ethers.constants.AddressZero)
    .catch((_) => false);

  const defaultFees = { maxFee: chainData.oneToken.mul(1e6), minFee: chainData.oneToken.mul(10), fee: 10 }; //maxFee = txLimit, minFee= 10G$ to cover some gas fees, fee 0.15% to cover multichain 0.1% + gas fees
  const defaultLimits = {
    dailyLimit: chainData.oneToken.mul(5e8),
    txLimit: chainData.oneToken.mul(2.5e8),
    accountDailyLimit: chainData.oneToken.mul(3e8),
    minAmount: chainData.oneToken.mul(1),
    onlyWhitelisted: false,
  };

  //on side chains bridge needs to be able to mint
  const addAsMinter = async () => {
    console.log('adding bridge as minter');
    const ctrl = new ethers.Contract(Contracts[chainData.name || network.name].Controller, CtrlABI.abi, signer);
    const encodedInput = ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'uint32', 'uint256', 'uint256', 'uint32', 'bool'],
      [bridgeProxy.address, 0, 0, 5000, 0, 0, 0, false],
    ); //function addMinter(
    const sigHash = ethers.utils
      .keccak256(ethers.utils.toUtf8Bytes('addMinter(address,uint256,uint256,uint32,uint256,uint256,uint32,bool)'))
      .slice(0, 10);
    const encoded = ethers.utils.solidityPack(['bytes4', 'bytes'], [sigHash, encodedInput]);
    const addMinterResult = await ctrl
      .genericCall(chainData.minter, encoded, Contracts[chainData.name || network.name].Avatar, 0)
      .then((_) => _.wait());
    console.log({ addMinterResult });
  };

  if (bridgeImpl.newlyDeployed || !initialized) {
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
      if (isTestnet && chainData.minter) {
        await addAsMinter();
      }
    } else if (isTestnet) {
      //testnet upgrade
      const ctrl = new ethers.Contract(Contracts[chainData.name || network.name].Controller, CtrlABI.abi, signer);
      const encoded = mpb.interface.encodeFunctionData('upgradeTo', [bridgeImpl.address]);
      const upgradeResult = await (
        await ctrl.genericCall(bridgeProxy.address, encoded, Contracts[chainData.name || network.name].Avatar, 0)
      ).wait();
      console.log({ upgradeResult });
    } else {
      console.log('upgrade of bridge not supported here... need to be done via DAO');
    }
  }

  // helpers
  if (isTestnet) {
    //     console.log('resetting fees/limits on testnet');
    //     await (await mpb.setBridgeLimits(defaultLimits)).wait();
    //     await (await mpb.setBridgeFees(defaultFees)).wait();
    //     await addAsMinter();
  }

  if (['localhost', 'hardhat', 'fork'].includes(network.name) === false) await verifyContracts(network.name);
};
export default func;
