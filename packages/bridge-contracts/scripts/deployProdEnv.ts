// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scopecode.
import { ethers, upgrades, network } from 'hardhat';
import release from '../release/deployment.json';
import contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import prompt from 'prompt';
import { defaults } from 'lodash';
import fse from 'fs-extra';
import { BigNumber } from 'ethers';

const allContracts = defaults(contracts, {});
async function main() {
  const deployed = '0x44a1E0A83821E239F9Cef248CECc3AC5b910aeD2';
  // const voting = "0x4c889f137232E827c00710752E86840805A70484"
  const voting = await ethers.getSigners().then((_) => _[0].address);
  console.log({ voting });
  console.log('deploying registery');
  if (deployed) {
    const upgrade = await ethers.deployContract('BlockHeaderRegistry');
    const cur = await ethers.getContractAt('BlockHeaderRegistry', deployed);
    console.log('deployed upgrade', upgrade.address);
    await cur.upgradeTo(upgrade.address, { gasLimit: 10000000, gasPrice: 11e9 });
  } else {
    const registery = await upgrades.deployProxy(rf, [voting, '0x3014ca10b91cb3D0AD85fEf7A3Cb95BCAc9c0f79', true], {
      kind: 'uups',
    });
    console.log('deployed registery to:', registery.address);

    console.log('adding blockchains');

    await (await registery.addBlockchain(122, 'https://rpc.fuse.io')).wait();
    await (await registery.addBlockchain(42220, 'https://forno.celo.org')).wait();
  }
}

const deployBridge = async () => {
  if (!process.env.PRIVATE_KEY) throw new Error('missing private key');

  const celosigner = new ethers.Wallet(process.env.PRIVATE_KEY || '').connect(
    new ethers.providers.JsonRpcProvider('https://forno.celo.org'),
  );
  const fusesigner = celosigner.connect(ethers.provider);
  let reqValidators = ['0x9C10a508bF2a18749DbC492185C39bc66EfEa479'];
  let consensusRatio = 0;
  if (network.name.includes('production')) {
    //TODO: add more trusted validators
    reqValidators = ['0x9C10a508bF2a18749DbC492185C39bc66EfEa479'];
    consensusRatio = 0; //this will stay 0 and rely on trusted validators until all validators run the bridge-app
  }

  let celoNetwork;

  switch (network.name) {
    case 'fuse':
      celoNetwork = 'development-celo';
      break;

    default:
      celoNetwork = network.name + '-celo';
      break;
  }
  const tokenBridge = await ethers.getContractFactory('TokenBridge');
  const sourceToken = await ethers.getContractAt('IERC20Metadata', contracts[network.name].GoodDollar);
  const sourceDecimals = await sourceToken.decimals();
  let multiplier = BigNumber.from('10').pow(sourceDecimals);
  console.log('deploying source bridge...', { sourceDecimals, sourceToken: sourceToken.address });
  const sourceBridge = await upgrades.deployProxy(
    tokenBridge.connect(fusesigner),
    [
      reqValidators,
      0,
      reqValidators,
      consensusRatio,
      contracts[network.name].GoodDollar,
      { maxFee: multiplier.mul(1e6), minFee: multiplier.mul(10), fee: 15 }, //maxFee = txLimit, minFee= 10G$ to cover some gas fees, fee 0.15% to cover multichain 0.1% + gas fees
      {
        dailyLimit: multiplier.mul(1e8),
        txLimit: multiplier.mul(1e6),
        accountDailyLimit: multiplier.mul(1e7),
        minAmount: multiplier.mul(1000),
        onlyWhitelisted: false,
      },
      contracts[network.name].FuseFaucet,
      contracts[network.name].NameService,
    ],
    { kind: 'uups' },
  );

  const targetToken = await (
    await ethers.getContractAt('IERC20Metadata', allContracts[celoNetwork].GoodDollar, celosigner)
  ).connect(celosigner);

  const targetDecimals = await targetToken.decimals();
  console.log('deploying target bridge...', { targetDecimals, sourceToken: targetToken.address });
  const celomultiplier = BigNumber.from('10').pow(targetDecimals);

  //this is required to trick openzeppelin deployer to use the celo provider to estimate gas
  network.provider = celosigner.provider as any;
  const targetBridge = await upgrades.deployProxy(
    tokenBridge.connect(celosigner),
    [
      reqValidators,
      0,
      reqValidators,
      consensusRatio,
      allContracts[celoNetwork].GoodDollar,
      { maxFee: celomultiplier.mul(1e6), minFee: celomultiplier.mul(10), fee: 15 }, //maxFee = txLimit, minFee= 10G$ to cover some gas fees, fee 0.15% to cover multichain 0.1% + gas fees
      {
        dailyLimit: celomultiplier.mul(1e8),
        txLimit: celomultiplier.mul(1e6),
        accountDailyLimit: celomultiplier.mul(1e7),
        minAmount: celomultiplier.mul(1000),
        onlyWhitelisted: false,
      },
      allContracts[celoNetwork].Faucet,
      allContracts[celoNetwork].NameService,
    ],
    { kind: 'uups' },
  );

  console.log('deployed bridges...');
  await (
    await sourceBridge.setSourceBridges([targetBridge.address], [await celosigner.provider.getBlockNumber()])
  ).wait();
  await (
    await targetBridge.setSourceBridges([sourceBridge.address], [await fusesigner.provider.getBlockNumber()])
  ).wait();
  console.log('done set source bridges...');
  if (network.name != 'production') {
    try {
      const token = new ethers.Contract(contracts[network.name].GoodDollar, [
        'function mint(address,uint) returns (bool)',
      ]);
      console.log('minting tokens...');

      await (await token.connect(fusesigner).mint(fusesigner.address, multiplier.mul(1000000))).wait();
      await (await token.connect(fusesigner).mint(sourceBridge.address, multiplier.mul(10000000))).wait();

      console.log('minting target tokens...');
      const targetToken = token.attach(allContracts[celoNetwork].GoodDollar).connect(celosigner);

      await (await targetToken.mint(celosigner.address, celomultiplier.mul(1000000))).wait();
      await (await targetToken.mint(targetBridge.address, celomultiplier.mul(1000000))).wait();
    } catch (e) {
      console.error('failed minting tokens', e);
    }
  }

  console.log({
    sourceBridge: sourceBridge.address,
    targetBridge: targetBridge.address,
    sourceToken: sourceToken.address,
    targetToken: targetToken.address,
  });
  release[network.name] = {
    ...release[network.name],
    fuseBridge: sourceBridge.address,
    celoBridge: targetBridge.address,
  };

  await fse.writeJSON('release/deployment.json', release);
};

let env = 'fuse';
const upgradeBridge = async (impl: string) => {
  if (env === 'production') {
    return console.log('needs to run via defender relayer');
  }
  const signer = await ethers.getSigner();
  const deployed = release[env][network.name + 'Bridge'];
  console.log({ deployed, signer: signer.address });
  if (!deployed) console.log('existing bridge not found');

  const cur = await ethers.getContractAt('TokenBridge', deployed);
  const upgrade = impl ? { address: impl } : await ethers.deployContract('TokenBridge');
  console.log('deployed upgrade', upgrade.address);
  const tx = await (await cur.upgradeTo(upgrade.address, { gasLimit: 10000000, gasPrice: 11e9 })).wait();
  console.log('upgrade done:', tx.transactionHash);
};

const runPrompt = async () => {
  prompt.start();
  console.log('which deploy? registry/bridge/upgrade');
  const { deploy } = await prompt.get(['deploy']);

  console.log('which env? fuse/staging/production');

  const { env: contractsEnv } = await prompt.get(['env']);
  env = contractsEnv;
  try {
    if (deploy === 'registry') await main();
    else if (deploy === 'bridge') await deployBridge();
    else if (deploy === 'upgrade') {
      const { implementation } = await prompt.get(['implementation']);
      await upgradeBridge(implementation);
    }
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
runPrompt();
