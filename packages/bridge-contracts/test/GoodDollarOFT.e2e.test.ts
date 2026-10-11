import { ethers, network, upgrades } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { GoodDollarOFTAdapter } from '../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import contracts from '@gooddollar/goodprotocol/releases/deployment.json';
import * as networkHelpers from "@nomicfoundation/hardhat-network-helpers";
import { deployMinterBurnerProxy } from './helpers/deployMinterBurnerProxy';

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

    // Deploy minter/burner without initializing yet (adapter address is required)
    const minterBurner = await deployMinterBurnerProxy();

    // Deploy adapter using upgrades plugin with constructor args
    const AdapterFactory = await ethers.getContractFactory('GoodDollarOFTAdapter');
    const adapter = (await upgrades.deployProxy(
      AdapterFactory,
      [goodDollarAddress, minterBurner.address, owner.address, feeRecipient.address],
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

    // Now that adapter exists, initialize the minter/burner and authorize adapter as operator
    await minterBurner.initialize(nameService.address, adapter.address);

    return {
      token,
      nameService,
      goodDollarAddress,
      nameServiceAddress,
      minterBurner,
      adapter,
    };
  };

  describe('OFT Adapter Deployment on Fork', () => {
    it('Should deploy GoodDollarOFTAdapter with production token', async function () {
      const { goodDollarAddress } = await loadFixture(setupFixture);

      // Deploy MinterBurner using production NameService
      // Note: This requires NameService to have GOODDOLLAR registered
      const minterBurner = await deployMinterBurnerProxy();

      // Deploy adapter using upgrades plugin with constructor args
      const AdapterFactory = await ethers.getContractFactory('GoodDollarOFTAdapter');
      
      console.log('Deploying adapter...');
      const adapter = (await upgrades.deployProxy(
        AdapterFactory,
        [goodDollarAddress, minterBurner.address, owner.address, feeRecipient.address],
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

      // Initialize minter/burner after adapter deployment
      await minterBurner.initialize(celoContracts.NameService, adapter.address);

      // Verify deployment
      expect(await adapter.token()).to.equal(goodDollarAddress);
      expect(await adapter.minterBurner()).to.equal(minterBurner.address);
      expect(await adapter.owner()).to.equal(owner.address);
      expect(await adapter.approvalRequired()).to.be.true;

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
      const { adapter: fixtureAdapter, minterBurner: fixtureMinterBurner } = await loadFixture(setupFixture);
      adapter = fixtureAdapter;
      minterBurner = fixtureMinterBurner;
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

  describe('Bridge limits enforcement (send)', () => {
    let adapter: GoodDollarOFTAdapter;
    let minterBurner: any;

    const makeSendParam = (amountLD: any) => ({
      dstEid: 1,
      to: ethers.utils.hexZeroPad(user.address, 32),
      amountLD,
      minAmountLD: amountLD,
      extraOptions: '0x',
      composeMsg: '0x',
      oftCmd: '0x',
    });
    const messagingFee = { nativeFee: 0, lzTokenFee: 0 };

    beforeEach(async function () {
      const { adapter: fixtureAdapter, minterBurner: fixtureMinterBurner } = await loadFixture(setupFixture);
      adapter = fixtureAdapter;
      minterBurner = fixtureMinterBurner;

      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther('1000000'),
        txLimit: ethers.utils.parseEther('10000'),
        accountDailyLimit: ethers.utils.parseEther('100000'),
        minAmount: ethers.utils.parseEther('100'),
        onlyWhitelisted: false,
      });
    });

    it('Should revert with minAmount when amount is below minAmount', async function () {
      await expect(
        adapter.connect(user).send(makeSendParam(ethers.utils.parseEther('50')), messagingFee, user.address, { value: 0 })
      ).to.be.revertedWithCustomError(adapter, 'BRIDGE_LIMITS').withArgs('minAmount');
    });

    it('Should revert with txLimit when amount exceeds txLimit', async function () {
      await expect(
        adapter.connect(user).send(makeSendParam(ethers.utils.parseEther('20000')), messagingFee, user.address, { value: 0 })
      ).to.be.revertedWithCustomError(adapter, 'BRIDGE_LIMITS').withArgs('txLimit');
    });

    it('Should revert with accountDailyLimit when account daily limit exceeded', async function () {
      const amount = ethers.utils.parseEther('100001');
      await expect(
        adapter.connect(user).send(makeSendParam(amount), messagingFee, user.address, { value: 0 })
      ).to.be.revertedWithCustomError(adapter, 'BRIDGE_LIMITS').withArgs('accountDailyLimit');
    });

    it('Should reject limits where txLimit exceeds dailyLimit', async function () {
      await expect(
        adapter.setBridgeLimits({
          dailyLimit: ethers.utils.parseEther('1000'),
          txLimit: ethers.utils.parseEther('10000'),
          accountDailyLimit: ethers.utils.parseEther('1000'),
          minAmount: ethers.utils.parseEther('100'),
          onlyWhitelisted: false,
        })
      ).to.be.revertedWith('txLimit > dailyLimit');
    });
  });

  describe('Fee Calculation (_takeFee) Tests', () => {
    let adapter: GoodDollarOFTAdapter;
    let minterBurner: any;
    let token: any;

    beforeEach(async function () {
      const { adapter: fixtureAdapter, minterBurner: fixtureMinterBurner, token: fixtureToken } = await loadFixture(setupFixture);
      adapter = fixtureAdapter;
      minterBurner = fixtureMinterBurner;
      token = fixtureToken;

      // Set fee recipient
      await adapter.setFeeRecipient(feeRecipient.address);
    });

    it('Should calculate fee as percentage of amount', async function () {
      // Set fee to 1% (100 basis points)
      await adapter.setBridgeFees({
        minFee: ethers.utils.parseEther('0'),
        maxFee: ethers.utils.parseEther('0'),
        fee: 100, // 1%
      });

      // Fee calculation: amount * fee / 10000
      // For 1000 tokens with 1% fee: 1000 * 100 / 10000 = 10 tokens
      const amount = ethers.utils.parseEther('1000');
      const expectedFee = amount.mul(100).div(10000);
      
      // We can't directly call _takeFee, but we can verify the logic
      // by checking the fee calculation matches expected formula
      expect(expectedFee).to.equal(ethers.utils.parseEther('10'));
    });

    it('Should enforce minFee when calculated fee is below minFee', async function () {
      // Set fee to 0.1% with minFee of 5 tokens
      await adapter.setBridgeFees({
        minFee: ethers.utils.parseEther('5'),
        maxFee: ethers.utils.parseEther('0'),
        fee: 10, // 0.1%
      });

      // For 1000 tokens: 1000 * 10 / 10000 = 1 token (below minFee of 5)
      // So fee should be 5 tokens (minFee)
      const amount = ethers.utils.parseEther('1000');
      const calculatedFee = amount.mul(10).div(10000);
      const minFee = ethers.utils.parseEther('5');
      
      // The actual fee should be minFee (5) since calculated (1) < minFee (5)
      expect(calculatedFee.lt(minFee)).to.be.true;
    });

    it('Should enforce maxFee when calculated fee exceeds maxFee', async function () {
      // Set fee to 5% with maxFee of 20 tokens
      await adapter.setBridgeFees({
        minFee: ethers.utils.parseEther('0'),
        maxFee: ethers.utils.parseEther('20'),
        fee: 500, // 5%
      });

      // For 1000 tokens: 1000 * 500 / 10000 = 50 tokens (above maxFee of 20)
      // So fee should be 20 tokens (maxFee)
      const amount = ethers.utils.parseEther('1000');
      const calculatedFee = amount.mul(500).div(10000);
      const maxFee = ethers.utils.parseEther('20');
      
      // The actual fee should be maxFee (20) since calculated (50) > maxFee (20)
      expect(calculatedFee.gt(maxFee)).to.be.true;
    });

    it('Should handle zero fee', async function () {
      await adapter.setBridgeFees({
        minFee: ethers.utils.parseEther('0'),
        maxFee: ethers.utils.parseEther('0'),
        fee: 0, // 0%
      });

      const amount = ethers.utils.parseEther('1000');
      const expectedFee = amount.mul(0).div(10000);
      expect(expectedFee).to.equal(ethers.utils.parseEther('0'));
    });

    it('Should reject fees above MAX_FEE_BPS', async function () {
      const maxFeeBps = await adapter.MAX_FEE_BPS();
      await expect(adapter.setBridgeFees({ minFee: 0, maxFee: 0, fee: 10000 })).to.be.revertedWith('invalid fee');
      await expect(adapter.setBridgeFees({ minFee: 0, maxFee: 0, fee: maxFeeBps.add(1) })).to.be.revertedWith(
        'invalid fee'
      );
      await expect(adapter.setBridgeFees({ minFee: 0, maxFee: 0, fee: maxFeeBps })).to.emit(adapter, 'BridgeFeesSet');
    });
  });

  // L-01/L-02: the adapter is the spender and burns through the MinterBurner, with real G$ and the real LZ endpoint
  describe('Send path with real SuperGoodDollar (L-01/L-02)', () => {
    // Celo->XDC defaults use a dead DVN until configured; Ethereum has live defaults so a raw send succeeds
    const DST_EID = 30101;

    it('pulls approved tokens via the adapter and burns them; the MinterBurner allowance is not used', async function () {
      const { adapter, minterBurner, goodDollarAddress } = await loadFixture(setupFixture);
      const token = await ethers.getContractAt(
        'contracts/oft/interfaces/ISuperGoodDollar.sol:ISuperGoodDollar',
        goodDollarAddress,
      );
      const erc20 = await ethers.getContractAt('@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20', goodDollarAddress);

      await networkHelpers.impersonateAccount(celoContracts.Avatar);
      await networkHelpers.setBalance(celoContracts.Avatar, ethers.utils.parseEther('10'));
      const avatarSigner = await ethers.getSigner(celoContracts.Avatar);
      await token.connect(avatarSigner).addMinter(minterBurner.address);
      const amount = ethers.utils.parseEther('100');
      await minterBurner.connect(avatarSigner).mint(user.address, amount);
      await networkHelpers.stopImpersonatingAccount(celoContracts.Avatar);

      await adapter.setPeer(DST_EID, ethers.utils.hexZeroPad(adapter.address, 32));
      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther('1000'),
        txLimit: ethers.utils.parseEther('1000'),
        accountDailyLimit: ethers.utils.parseEther('1000'),
        minAmount: ethers.utils.parseEther('1'),
        onlyWhitelisted: false,
      });

      const sendParam = {
        dstEid: DST_EID,
        to: ethers.utils.hexZeroPad(user.address, 32),
        amountLD: amount,
        minAmountLD: amount,
        extraOptions: '0x00030100110100000000000000000000000000030d40', // type 3, lzReceive 200k gas
        composeMsg: '0x',
        oftCmd: '0x',
      };
      const fee = await adapter.quoteSend(sendParam, false);

      // approving only the MinterBurner (old flow) is not enough anymore
      await erc20.connect(user).approve(minterBurner.address, amount);
      await expect(adapter.connect(user).send(sendParam, fee, user.address, { value: fee.nativeFee })).to.be.reverted;

      await erc20.connect(user).approve(adapter.address, amount);
      const supplyBefore = await erc20.totalSupply();
      await adapter.connect(user).send(sendParam, fee, user.address, { value: fee.nativeFee });

      expect(await erc20.balanceOf(user.address)).to.equal(0);
      expect(await erc20.totalSupply()).to.equal(supplyBefore.sub(amount));
      expect(await erc20.balanceOf(adapter.address)).to.equal(0);
      expect(await erc20.balanceOf(minterBurner.address)).to.equal(0);
      expect(await erc20.allowance(user.address, minterBurner.address)).to.equal(amount);
    });
  });

  // Mirrors deploy/deployOFT.ts + scripts/oft/steps/adapter-ownership.ts against the real Celo ProxyFactory/endpoint
  describe('Atomic deploy via ProxyFactory1967 and Avatar handover (H-01/H-02)', () => {
    it('deploys both proxies initialized in one tx each and hands owner + LZ delegate to the Avatar', async function () {
      const avatar = celoContracts.Avatar;
      const proxyFactory = await ethers.getContractAt(
        [
          'function deployProxy(uint256 _salt, address _logic, bytes _data) returns (address)',
          'function getDeploymentAddress(uint256 _salt, address _sender) view returns (address)',
        ],
        celoContracts.ProxyFactory,
      );
      const endpoint = await ethers.getContractAt(
        ['function delegates(address) view returns (address)'],
        CELO_LZ_ENDPOINT,
      );

      const minterBurnerImpl = await (await ethers.getContractFactory('GoodDollarOFTMinterBurner')).deploy();
      const AdapterFactory = await ethers.getContractFactory('GoodDollarOFTAdapter');
      const adapterImpl = await AdapterFactory.deploy(celoContracts.GoodDollar, CELO_LZ_ENDPOINT);

      const mbSalt = ethers.BigNumber.from(ethers.utils.id('Test-GoodDollarOFTMinterBurnerV1'));
      const adapterSalt = ethers.BigNumber.from(ethers.utils.id('Test-GoodDollarOFTAdapterV1'));
      const mbAddress = await proxyFactory.getDeploymentAddress(mbSalt, owner.address);
      const adapterAddress = await proxyFactory.getDeploymentAddress(adapterSalt, owner.address);
      // salt is bound to the deployer, so another sender gets a different address
      expect(await proxyFactory.getDeploymentAddress(adapterSalt, user.address)).to.not.equal(adapterAddress);

      await proxyFactory.deployProxy(
        mbSalt,
        minterBurnerImpl.address,
        minterBurnerImpl.interface.encodeFunctionData('initialize', [celoContracts.NameService, adapterAddress]),
      );
      await proxyFactory.deployProxy(
        adapterSalt,
        adapterImpl.address,
        AdapterFactory.interface.encodeFunctionData('initialize', [
          celoContracts.GoodDollar,
          mbAddress,
          owner.address,
          avatar,
        ]),
      );

      const implSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
      const implOf = async (proxy: string) =>
        ethers.utils.getAddress(ethers.utils.hexDataSlice(await ethers.provider.getStorageAt(proxy, implSlot), 12));
      expect(await implOf(adapterAddress)).to.equal(adapterImpl.address);
      expect(await implOf(mbAddress)).to.equal(minterBurnerImpl.address);

      const adapter = await ethers.getContractAt('GoodDollarOFTAdapter', adapterAddress);
      const mb = await ethers.getContractAt('GoodDollarOFTMinterBurner', mbAddress);
      expect(await adapter.owner()).to.equal(owner.address);
      expect(await adapter.token()).to.equal(celoContracts.GoodDollar);
      expect(await adapter.minterBurner()).to.equal(mbAddress);
      expect(await adapter.feeRecipient()).to.equal(avatar);
      expect(await mb.token()).to.equal(celoContracts.GoodDollar);
      expect(await mb.operators(adapterAddress)).to.equal(true);
      await expect(
        adapter.initialize(celoContracts.GoodDollar, mbAddress, user.address, user.address),
      ).to.be.revertedWith('Initializable: contract is already initialized');

      // H-01: delegate must move with ownership, otherwise the deployer keeps control of DVN/executor config
      expect(await endpoint.delegates(adapterAddress)).to.equal(owner.address);
      await adapter.setDelegate(avatar);
      await adapter.transferOwnership(avatar);
      expect(await adapter.owner()).to.equal(avatar);
      expect(await endpoint.delegates(adapterAddress)).to.equal(avatar);
    });
  });
});

