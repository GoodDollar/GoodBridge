import { ethers, network, upgrades } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { GoodDollarOFTAdapter } from '../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import * as networkHelpers from "@nomicfoundation/hardhat-network-helpers";

const CELO_CHAIN_URL = 'https://forno.celo.org';
/**
 * Fork tests for GoodDollarOFTAdapter on Celo production
 * 
 * These tests fork the Celo mainnet and test against real deployed contracts.
 * Run with: npx hardhat test test/GoodDollarOFTAdapter.fork.test.ts --network celo_fork
 * 
 * Make sure to set FORK_BLOCK_NUMBER in .env if you want to fork from a specific block
 */
describe('GoodDollarOFTAdapter Fork Tests (Celo Production)', () => {
  let signers: SignerWithAddress[];
  let celoContracts: any;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let feeRecipient: SignerWithAddress;

  // Production Celo addresses from goodprotocol
  const PRODUCTION_CELO = 'production-celo';
  const CELO_LZ_ENDPOINT = '0x1a44076050125825900e736c501f859c50fE728c'; // From deployMessageBridge.ts

  after(async function () {
    await networkHelpers.reset();
  });
  before(async function () {
    await networkHelpers.reset(CELO_CHAIN_URL);

    signers = await ethers.getSigners();
    [owner, user, feeRecipient] = signers;

    // Load Celo production contracts from goodprotocol deployment.json
    celoContracts = contracts[PRODUCTION_CELO];
    if (!celoContracts) {
      throw new Error(`${PRODUCTION_CELO} contracts not found in deployment.json`);
    }

    console.log('GoodDollar token:', celoContracts.GoodDollar);
    console.log('NameService:', celoContracts.NameService);
  });

  const setupFixture = async () => {
    // Get deployed contracts on Celo
    const goodDollarAddress = celoContracts.GoodDollar;
    const nameServiceAddress = celoContracts.NameService;

    // Get token contract
    const tokenAbi = [
      'function decimals() external view returns (uint8)',
      'function balanceOf(address) external view returns (uint256)',
      'function totalSupply() external view returns (uint256)',
      'function symbol() external view returns (string)',
      'function name() external view returns (string)',
    ];
    const token = await ethers.getContractAt(tokenAbi, goodDollarAddress);

    // Get NameService contract
    const nameServiceAbi = [
      'function getAddress(string) external view returns (address)',
      'function avatar() external view returns (address)',
    ];
    const nameService = await ethers.getContractAt(nameServiceAbi, nameServiceAddress);

    return {
      token,
      nameService,
      goodDollarAddress,
      nameServiceAddress,
    };
  };

  describe('OFT Adapter Deployment on Fork', () => {
    it('Should deploy GoodDollarOFTAdapter with production token', async function () {
      const { goodDollarAddress } = await loadFixture(setupFixture);

      // Deploy MinterBurner using production NameService
      // Note: This requires NameService to have GOODDOLLAR registered
      const MinterBurnerFactory = await ethers.getContractFactory('GoodDollarMinterBurner');
      const minterBurner = await upgrades.deployProxy(
        MinterBurnerFactory,
        [celoContracts.NameService],
        { kind: 'uups' }
      );

      // Deploy adapter using upgrades plugin with constructor args
      const AdapterFactory = await ethers.getContractFactory('GoodDollarOFTAdapter');
      
      console.log('Deploying adapter...');
      const adapter = (await upgrades.deployProxy(
        AdapterFactory,
        [goodDollarAddress, minterBurner.address, owner.address],
        {
          kind: 'uups',
          constructorArgs: [goodDollarAddress, CELO_LZ_ENDPOINT],
          unsafeAllow: [
            'constructor', 
            'state-variable-immutable',
            'duplicate-initializer-call',
          ],
        }
      )) as GoodDollarOFTAdapter;
      console.log('Adapter deployed:', adapter.address);

      // Verify deployment
      expect(await adapter.token()).to.equal(goodDollarAddress);
      expect(await adapter.minterBurner()).to.equal(minterBurner.address);
      expect(await adapter.owner()).to.equal(owner.address);
      expect(await adapter.approvalRequired()).to.be.false;

      console.log('Adapter deployed:', {
        address: adapter.address,
        token: await adapter.token(),
        minterBurner: await adapter.minterBurner(),
      });
    });
  });

  describe('OFT Adapter Configuration', () => {
    let adapter: GoodDollarOFTAdapter;
    let minterBurner: any;

    beforeEach(async function () {
      const { goodDollarAddress } = await loadFixture(setupFixture);

      // Deploy mock MinterBurner
      const MinterBurnerFactory = await ethers.getContractFactory('GoodDollarMinterBurner');
      minterBurner = await upgrades.deployProxy(
        MinterBurnerFactory,
        [celoContracts.NameService],
        { kind: 'uups' }
      );

      // Deploy adapter using upgrades plugin with constructor args
      const AdapterFactory = await ethers.getContractFactory('GoodDollarOFTAdapter');
      
      adapter = (await upgrades.deployProxy(
        AdapterFactory,
        [goodDollarAddress, minterBurner.address, owner.address],
        {
          kind: 'uups',
          constructorArgs: [goodDollarAddress, CELO_LZ_ENDPOINT],
          unsafeAllow: [
            'constructor', 
            'state-variable-immutable', 
            'duplicate-initializer-call',
          ],
        }
      )) as GoodDollarOFTAdapter;
    });

    it('Should set bridge fees', async function () {
      const fees = {
        minFee: ethers.utils.parseEther('1'),
        maxFee: ethers.utils.parseEther('100'),
        fee: 100, // 1% in basis points
      };

      await expect(adapter.setBridgeFees(fees))
        .to.emit(adapter, 'BridgeFeesSet')
        .withArgs(fees.minFee, fees.maxFee, fees.fee);

      const storedFees = await adapter.bridgeFees();
      expect(storedFees.minFee).to.equal(fees.minFee);
      expect(storedFees.maxFee).to.equal(fees.maxFee);
      expect(storedFees.fee).to.equal(fees.fee);
    });

    it('Should set fee recipient', async function () {
      await expect(adapter.setFeeRecipient(feeRecipient.address))
        .to.emit(adapter, 'FeeRecipientSet')
        .withArgs(feeRecipient.address);

      expect(await adapter.feeRecipient()).to.equal(feeRecipient.address);
    });

    it('Should set bridge limits', async function () {
      const limits = {
        dailyLimit: ethers.utils.parseEther('1000000'),
        txLimit: ethers.utils.parseEther('10000'),
        accountDailyLimit: ethers.utils.parseEther('100000'),
        minAmount: ethers.utils.parseEther('100'),
        onlyWhitelisted: false,
      };

      await expect(adapter.setBridgeLimits(limits))
        .to.emit(adapter, 'BridgeLimitsSet')
        .withArgs(
          limits.dailyLimit,
          limits.txLimit,
          limits.accountDailyLimit,
          limits.minAmount,
          limits.onlyWhitelisted
        );

      const storedLimits = await adapter.bridgeLimits();
      expect(storedLimits.dailyLimit).to.equal(limits.dailyLimit);
      expect(storedLimits.txLimit).to.equal(limits.txLimit);
      expect(storedLimits.accountDailyLimit).to.equal(limits.accountDailyLimit);
      expect(storedLimits.minAmount).to.equal(limits.minAmount);
      expect(storedLimits.onlyWhitelisted).to.equal(limits.onlyWhitelisted);
    });

    it('Should pause/unpause bridge', async function () {
      await expect(adapter.pauseBridge(true))
        .to.emit(adapter, 'BridgePaused')
        .withArgs(true);

      expect(await adapter.isClosed()).to.be.true;

      await expect(adapter.pauseBridge(false))
        .to.emit(adapter, 'BridgePaused')
        .withArgs(false);

      expect(await adapter.isClosed()).to.be.false;
    });
  });

});

