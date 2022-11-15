// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scopecode.
import { ethers, upgrades } from 'hardhat';

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const cf = await ethers.getContractFactory('ConsensusMock');
  const vf = await ethers.getContractFactory('VotingMock');
  const mockValidators = await ethers.getSigners().then((_) => _.map((_) => _.address));
  const consensus = await cf.deploy(await ethers.getSigners().then((_) => _.map((_) => _.address)));
  const voting = await vf.deploy();

  const rf = await ethers.getContractFactory('BlockHeaderRegistry');
  const registery = await upgrades.deployProxy(rf, [mockValidators[0], consensus.address, false]);

  await deployBridge();

  await registery.addBlockchain(9999, 'http://localhost:8545');

  console.log('deployed to (consensus, voting):', consensus.address, voting.address);
  console.log('deployed registery to:', registery.address);
  console.log('validators:', mockValidators.length);
}

async function deployBridge() {
  const tokenBridge = await ethers.getContractFactory('TokenBridgeTest');
  const mockValidators = await ethers.getSigners().then((_) => _.map((_) => _.address));
  const token = await ethers.getContractFactory('TestToken');
  const sourceToken = await token.deploy();
  const targetToken = await token.deploy();
  const sourceBridge = await tokenBridge.deploy(
    mockValidators,
    10000,
    mockValidators.slice(0, 2),
    25,
    sourceToken.address,
    { maxFee: 10000, minFee: 200, fee: 10 },
    { dailyLimit: 1e10, txLimit: 1e8, accountDailyLimit: 1e9, minAmount: 10000, onlyWhitelisted: false },
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    99,
  );

  const targetBridge = await tokenBridge.deploy(
    mockValidators,
    10000,
    mockValidators.slice(0, 2),
    25,
    targetToken.address,
    { maxFee: 10000, minFee: 200, fee: 10 },
    { dailyLimit: 1e10, txLimit: 1e8, accountDailyLimit: 1e9, minAmount: 10000, onlyWhitelisted: false },
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    100,
  );

  sourceBridge.setSourceBridges([targetBridge.address]);
  targetBridge.setSourceBridges([sourceBridge.address]);
  await sourceToken.transfer(sourceBridge.address, 100000000);
  await targetToken.transfer(targetBridge.address, 100000000);

  console.log({
    sourceBridge: sourceBridge.address,
    targetBridge: targetBridge.address,
    sourceToken: sourceToken.address,
    targetToken: targetToken.address,
  });
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
