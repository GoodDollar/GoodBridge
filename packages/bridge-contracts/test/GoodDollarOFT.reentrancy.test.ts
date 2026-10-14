import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import * as networkHelpers from '@nomicfoundation/hardhat-network-helpers';
import contracts from '@gooddollar/goodprotocol/releases/deployment.json';

// Regression for C-01: G$ (SuperGoodDollar) calls the recipient's ERC777 tokensReceived hook on mint,
// so approveFailedRequest must not be re-enterable from inside _credit.
const DECIMAL_CONVERSION_RATE = ethers.BigNumber.from(10).pow(12);
const OPTIMISTIC_WINDOW = 3 * 24 * 60 * 60;
const CELO_CHAIN_URL = 'https://forno.celo.org';

function encodeOFTMessage(toAddress: string, amountLD: ethers.BigNumber): string {
  const toBytes32 = ethers.utils.hexZeroPad(toAddress, 32);
  const amountHex = ethers.utils.hexZeroPad(amountLD.div(DECIMAL_CONVERSION_RATE).toHexString(), 8);
  return toBytes32 + amountHex.slice(2);
}

async function deployHarness(tokenAddress: string, nameServiceAddress: string, endpointAddress: string) {
  const [owner, feeRecipient] = await ethers.getSigners();
  const minterBurner = await (await ethers.getContractFactory('GoodDollarOFTMinterBurner')).deploy();
  const harness = await upgrades.deployProxy(
    await ethers.getContractFactory('GoodDollarOFTAdapterHarness'),
    [tokenAddress, minterBurner.address, owner.address, feeRecipient.address],
    {
      kind: 'uups',
      constructorArgs: [tokenAddress, endpointAddress],
      unsafeAllow: ['constructor', 'state-variable-immutable', 'duplicate-initializer-call', 'missing-initializer'],
    },
  );
  await minterBurner.initialize(nameServiceAddress, harness.address);

  // production limits from scripts/oft/oft.config.json
  await harness.setBridgeLimits({
    dailyLimit: ethers.utils.parseEther('1000000'),
    txLimit: ethers.utils.parseEther('100000'),
    accountDailyLimit: ethers.utils.parseEther('50000'),
    minAmount: ethers.utils.parseEther('10'),
    onlyWhitelisted: false,
  });
  return { harness, minterBurner };
}

// Parks a transfer above accountDailyLimit for a hook-enabled recipient, then tries to re-enter on approval
async function assertReentrancyBlocked(harness: any, token: any) {
  const attacker = await (await ethers.getContractFactory('FailedRequestReentrancyAttacker')).deploy(harness.address);

  const amountLD = ethers.utils.parseEther('60000');
  const guid = ethers.utils.formatBytes32String('reentrancy-guid');
  const origin = { srcEid: 1, sender: ethers.constants.HashZero, nonce: 1 };
  await harness.exposed_lzReceive(origin, guid, encodeOFTMessage(attacker.address, amountLD), ethers.constants.AddressZero, '0x');
  expect((await harness.failedReceiveRequests(guid)).failed).to.equal(true);

  await networkHelpers.time.increase(OPTIMISTIC_WINDOW + 1);

  await expect(attacker.attack(guid, 30)).to.be.revertedWith('ReentrancyGuard: reentrant call');
  expect(await token.balanceOf(attacker.address)).to.equal(0);
  expect((await harness.failedReceiveRequests(guid)).failed).to.equal(true);

  // the hook still runs on a legitimate approval, but the request is credited exactly once
  await attacker.attack(guid, 0);
  expect(await token.balanceOf(attacker.address)).to.equal(amountLD);
  expect((await harness.failedReceiveRequests(guid)).failed).to.equal(false);
  await expect(harness.approveFailedRequest(guid)).to.be.revertedWith('request not failed');
}

describe('GoodDollarOFTAdapter approveFailedRequest reentrancy (C-01)', () => {
  it('blocks re-entry through a mint hook (mock token)', async () => {
    const [, , avatar] = await ethers.getSigners();
    const nameService = await (await ethers.getContractFactory('NameServiceMock')).deploy();
    const controller = await (await ethers.getContractFactory('ControllerMock')).deploy(avatar.address);
    const token = await (await ethers.getContractFactory('MockGoodDollarWithMintHook')).deploy();
    await nameService.setAddress('CONTROLLER', controller.address);
    await nameService.setAddress('GOODDOLLAR', token.address);
    const endpoint = await (await ethers.getContractFactory('LayerZeroEndpointMock')).deploy();

    const { harness } = await deployHarness(token.address, nameService.address, endpoint.address);
    await assertReentrancyBlocked(harness, token);
  });

  describe('Celo fork (real SuperGoodDollar + ERC1820)', () => {
    const celo = (contracts as any)['production-celo'];

    before(async () => {
      await networkHelpers.reset(CELO_CHAIN_URL);
    });

    after(async () => {
      await networkHelpers.reset();
    });

    it('blocks re-entry through the ERC777 tokensReceived hook', async () => {
      const token = await ethers.getContractAt(
        'contracts/oft/interfaces/ISuperGoodDollar.sol:ISuperGoodDollar',
        celo.GoodDollar,
      );
      const endpoint = await (await ethers.getContractFactory('LayerZeroEndpointMock')).deploy();
      const { harness, minterBurner } = await deployHarness(celo.GoodDollar, celo.NameService, endpoint.address);

      await networkHelpers.impersonateAccount(celo.Avatar);
      await networkHelpers.setBalance(celo.Avatar, ethers.utils.parseEther('10'));
      await token.connect(await ethers.getSigner(celo.Avatar)).addMinter(minterBurner.address);
      await networkHelpers.stopImpersonatingAccount(celo.Avatar);

      const erc20 = await ethers.getContractAt('@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20', celo.GoodDollar);
      await assertReentrancyBlocked(harness, erc20);
    });
  });
});
