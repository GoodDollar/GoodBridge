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

const celotemp = {
  'production-celo': {
    ProxyFactory: '0x99C22e78A579e2176311c736C4c9F0b0D5A47806',
    GoodDollar: '0xf2283840cE37DAe0a06B40a9A80603977f36fA3F',
    FeeFormula: '0xb25de92ce16127ebf6659a7a30a9f395c7bbf182',
    Avatar: '0xCD5e8a81B1e02c1837A674f87dF327C14f4e5748',
    Controller: '0x3D0bacBdC06A28971855275D511e6249bE67112d',
    Identity: '0x96B81f82A29e78C5ba9E2034Ce8490fd641a24eb',
    NameService: '0x563a80a452264a9e1aa37c6FA0B46D04C3c71b24',
    GReputation: '0xAC132ECe25217867E318eA8ff63420C90d5a74A6',
    GuardiansSafe: '0xC9D09BA972B4EB6Bb7347F2229FB6d50434fFCa6',
    network: 'production-celo',
    networkId: 42220,
    GoodDollarMintBurnWrapper: '0x5566b6E4962BA83e05a426Ad89031ec18e9CadD3',
    MultichainRouter: '0xf27Ee99622C3C9b264583dACB2cCE056e194494f',
  },
  'development-celo': {
    ProxyFactory: '0xA441cd89b0964B51d23201d65E037DA7aF8F74E9',
    GoodDollar: '0xAB89A70d1Af04ED8badf915Ba1f5b28E9F322624',
    Avatar: '0xE0e3BFb1A1850bdFe36ED1563CC2abB6A8B6De78',
    Controller: '0x6717A1948328C8eCCb5C933Fae90e0631C2486fE',
    Identity: '0xec97ee6d70C626044224998192B96fEF05949De1',
    NameService: '0x266E5a0931E52229CC241376bC701Ab6199Aec4D',
    GReputation: '0x6614823763EAd52aCc4952b9634624439B738683',
    AdminWallet: '0xb7b543bfd9e2E0AD1d0aA68f56c883Dd377E3D24',
    Faucet: '0x256AFcfEcB5C7f62CE46b54492Bb8ac38163672f',
    Invites: '0xdC8F0da3f29A3C419a8EEf36665ba2a3EF737B8f',
    GoodDollarMintBurnWrapper: '0x3fa553a5a044D5c4f5C70878148568410305f953',
    UBIScheme: '0x2d42e6220af2485d1e6E5B4d3661A74671AA9a79',
    ClaimersDistribution: '0x80018e6Dd79f6B892Fca6b592746136a3aa5ef6d',
    CompoundVotingMachine: '0x00e44d746F3931cAB775099F4C6451f893BB9378',
    network: 'development-celo',
    networkId: 42220,
    GoodDollarStaking: '0x0b13807334C1618D71E5FCe792f40A22007c433A',
  },
  'staging-celo': {
    ProxyFactory: '0x7e8292481EA8EbEb49e486B7e99c00C50fBa2689',
    GoodDollar: '0x33265D74abd5ae87cA02A4Fb0C30B7405C8b0682',
    Avatar: '0x2FD18f9de3F581Ca492A485D2b32E361EeAE2e63',
    Controller: '0xa229BdD05436362484b10586dAa79a316e3080C5',
    Identity: '0xc82d50c667F389906aCA4B72D577fA56Bf7F8910',
    NameService: '0x8d0b621796445454180e7DD25f96B1782848338B',
    GReputation: '0x759a03326df90b740f6b8b6D31e12a3F95D64C28',
    FeeFormula: '0xcf08461E5bAd9C508D482329Eae0f1b4c4D4c489',
    DAOCreator: '0xA614d2641c21FEa4c73A2D6e71C6ad341349808B',
    AddFounders: '0x558fA360988601601ac410678963Bf785156076D',
    AdminWallet: '0x822590F8baf606b1e18dC1FA8Ca39D5C66C20981',
    Faucet: '0x9803B5811260Bfd1F5b0b0c9eC9aD4bF96D7ea94',
    Invites: '0x4E094c2e35e57c90667AbD6D8FE25CE63F4ae00B',
    GoodDollarMintBurnWrapper: '0x156Fd9563973EFB94a297B76CFac32CdC92a8d1A',
    UBIScheme: '0x04f2Cf8865e2ddfEf0047FdfA7A1b05ade614288',
    ClaimersDistribution: '0x83186CE77ef296BA6561096447938AE05D1F026e',
    CompoundVotingMachine: '0xEdde78b850a08B6b8AB3E84f61cD6dC70Cc7f156',
    network: 'staging-celo',
    networkId: 42220,
    GoodDollarStaking: '0x1eF9D3Ed46D4B82E7e8089BDdd00a493e9930f46',
  },
};

const allContracts = defaults(contracts, celotemp);
async function main() {
  const deployed = '0x44a1E0A83821E239F9Cef248CECc3AC5b910aeD2';
  // const voting = "0x4c889f137232E827c00710752E86840805A70484"
  const voting = await ethers.getSigners().then((_) => _[0].address);
  console.log({ voting });
  const rf = await ethers.getContractFactory('BlockHeaderRegistry');
  console.log('deploying registery');
  if (deployed) {
    await upgrades.upgradeProxy(deployed, rf, { kind: 'uups' });
  } else {
    const registery = await upgrades.deployProxy(rf, [voting, '0x3014ca10b91cb3D0AD85fEf7A3Cb95BCAc9c0f79', true], {
      kind: 'uups',
    });
    console.log('deployed registery to:', registery.address);

    console.log('adding blockchains');

    await (await registery.addBlockchain(122, 'https://rpc.fuse.io,https://fuse-rpc.gateway.pokt.network')).wait();
    await (
      await registery.addBlockchain(
        42220,
        'https://rpc.ankr.com/celo,https://forno.celo.org,https://celo-hackathon.lavanet.xyz/celo/http',
      )
    ).wait();
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
  const sourceBridge = await tokenBridge
    .connect(fusesigner)
    .deploy(
      reqValidators,
      0,
      reqValidators,
      consensusRatio,
      contracts[network.name].GoodDollar,
      { maxFee: 10000, minFee: 200, fee: 10 },
      { dailyLimit: 1e10, txLimit: 1e8, accountDailyLimit: 1e9, minAmount: 100000, onlyWhitelisted: false },
      contracts[network.name].FuseFaucet,
      contracts[network.name].NameService,
    );

  const targetBridge = await tokenBridge
    .connect(celosigner)
    .deploy(
      reqValidators,
      0,
      reqValidators,
      consensusRatio,
      allContracts[celoNetwork].GoodDollar,
      { maxFee: 10000, minFee: 200, fee: 10 },
      { dailyLimit: 1e10, txLimit: 1e8, accountDailyLimit: 1e9, minAmount: 100000, onlyWhitelisted: false },
      allContracts[celoNetwork].Faucet,
      allContracts[celoNetwork].NameService,
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

      await (await token.connect(fusesigner).mint(fusesigner.address, 100000000)).wait();
      await (await token.connect(fusesigner).mint(sourceBridge.address, 1000000000)).wait();

      console.log('minting target tokens...');
      const targetToken = token.attach(allContracts[celoNetwork].GoodDollar).connect(celosigner);

      await (await targetToken.mint(celosigner.address, 100000000)).wait();
      await (await targetToken.mint(targetBridge.address, 1000000000)).wait();
    } catch (e) {
      console.error('failed minting tokens', e);
    }
  }

  console.log({
    sourceBridge: sourceBridge.address,
    targetBridge: targetBridge.address,
  });
  release[network.name] = {
    ...release[network.name],
    fuseBridge: sourceBridge.address,
    celoBridge: targetBridge.address,
  };

  await fse.writeJSON('release/deployment.json', release);
};

const runPrompt = async () => {
  prompt.start();
  console.log('which deploy? registry/bridge');
  const { deploy } = await prompt.get(['deploy']);

  try {
    if (deploy === 'registry') await main();
    else if (deploy === 'bridge') await deployBridge();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
runPrompt();
