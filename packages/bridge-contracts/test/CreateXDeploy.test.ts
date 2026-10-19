import { artifacts, ethers, network } from 'hardhat';
import { expect } from 'chai';
import { loadFixture, takeSnapshot } from '@nomicfoundation/hardhat-network-helpers';
import {
  CREATEX_ADDRESS,
  CREATEX_RUNTIME_CODE_HASH,
  computeCreate2Address,
  computeCreate3Address,
  createXSalt,
  deployCreate2IfMissing,
  deployCreate3AndInitIfMissing,
  getCreateX,
  guardCreateXSalt,
} from '../deploy/utils/createX';
import { oftProxySalts, oftSaltLabels } from '../deploy/utils/oftSalts';
import { ERC1967_PROXY_FQN } from '../deploy/deployOFT';

// The deploy scripts put the OFT proxies behind CreateX so that their address is derived from
// (CreateX, deployer, salt) only - identical on every chain, and independent of the implementation.
describe('CreateX deterministic deployment', () => {
  async function fixture() {
    const [deployer, other] = await ethers.getSigners();

    // getCreateX etches the real CreateX runtime code at its canonical address on local networks
    const createX = await getCreateX(deployer);

    const nameService = await (await ethers.getContractFactory('NameServiceMock')).deploy();
    const controller = await (await ethers.getContractFactory('ControllerMock')).deploy(other.address);
    const token = await (await ethers.getContractFactory('MockGoodDollar')).deploy('GoodDollar', 'G$');
    await nameService.setAddress('CONTROLLER', controller.address);
    await nameService.setAddress('GOODDOLLAR', token.address);

    const minterBurnerFactory = await ethers.getContractFactory('GoodDollarOFTMinterBurner');
    const minterBurnerInitCode = minterBurnerFactory.getDeployTransaction().data as string;

    const proxyArtifact = await artifacts.readArtifact(ERC1967_PROXY_FQN);
    const proxyInterface = new ethers.utils.Interface(proxyArtifact.abi);

    return {
      deployer,
      other,
      createX,
      nameService,
      token,
      minterBurnerFactory,
      minterBurnerInitCode,
      proxyBytecode: proxyArtifact.bytecode,
      proxyInterface,
    };
  }

  describe('salt', () => {
    it('is permissioned for the deployer and leaves out the chain id', async () => {
      const { deployer } = await loadFixture(fixture);
      const salt = createXSalt(deployer.address, 'Production-GoodDollarOFTAdapterV1');

      expect(ethers.utils.hexDataLength(salt)).to.equal(32);
      // bytes20(salt) == deployer makes CreateX reserve the resulting address for that deployer
      expect(ethers.utils.getAddress(ethers.utils.hexDataSlice(salt, 0, 20))).to.equal(deployer.address);
      // flag byte 0x00 == no cross-chain redeploy protection, so block.chainid stays out of the guarded salt
      expect(ethers.utils.hexDataSlice(salt, 20, 21)).to.equal('0x00');
      // guarded salt is keccak256(bytes32(deployer) ++ salt): deployer and salt only, no chain id
      expect(guardCreateXSalt(deployer.address, salt)).to.equal(
        ethers.utils.keccak256(ethers.utils.hexConcat([ethers.utils.hexZeroPad(deployer.address, 32), salt])),
      );
    });

    it('gives production and development deployments different addresses', async () => {
      const { deployer, createX } = await loadFixture(fixture);
      const production = oftProxySalts('production-celo', deployer.address);
      const development = oftProxySalts('development-celo', deployer.address);

      expect(oftSaltLabels('production-xdc')).to.deep.equal(oftSaltLabels('production-celo'));
      expect(production.adapter).to.not.equal(development.adapter);
      expect(computeCreate3Address(deployer.address, production.adapter)).to.not.equal(
        computeCreate3Address(deployer.address, development.adapter),
      );
      // our local derivation agrees with CreateX's own
      expect(await createX.computeCreate3Address(guardCreateXSalt(deployer.address, production.adapter))).to.equal(
        computeCreate3Address(deployer.address, production.adapter),
      );
    });
  });

  describe('CREATE3 proxy deployment', () => {
    it('lands on the address predicted before the implementation exists', async () => {
      const {
        deployer,
        createX,
        nameService,
        token,
        minterBurnerFactory,
        minterBurnerInitCode,
        proxyBytecode,
        proxyInterface,
      } = await loadFixture(fixture);
      const salt = oftProxySalts('production-celo', deployer.address).minterBurner;

      // predicted with nothing deployed yet - no implementation, no init data
      const predicted = computeCreate3Address(deployer.address, salt);
      expect(await ethers.provider.getCode(predicted)).to.equal('0x');

      const impl = await deployCreate2IfMissing(
        createX,
        deployer.address,
        createXSalt(deployer.address, ethers.utils.keccak256(minterBurnerInitCode)),
        minterBurnerInitCode,
      );
      const adapterPlaceholder = ethers.Wallet.createRandom().address;
      const proxy = await deployCreate3AndInitIfMissing(
        createX,
        deployer.address,
        salt,
        proxyBytecode,
        proxyInterface.encodeFunctionData('initialize', [
          impl.address,
          minterBurnerFactory.interface.encodeFunctionData('initialize', [nameService.address, adapterPlaceholder]),
        ]),
      );

      expect(proxy.address).to.equal(predicted);
      expect(proxy.reused).to.equal(false);

      // deployed and initialized in a single transaction
      const minterBurner = await ethers.getContractAt('GoodDollarOFTMinterBurner', proxy.address);
      expect(await minterBurner.token()).to.equal(token.address);
      expect(await minterBurner.operators(adapterPlaceholder)).to.equal(true);
      const implSlot = await ethers.provider.getStorageAt(
        proxy.address,
        '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
      );
      expect(ethers.utils.getAddress(ethers.utils.hexDataSlice(implSlot, 12))).to.equal(impl.address);
    });

    it('keeps the same address for a different implementation, unlike CREATE2', async () => {
      const { deployer, createX, minterBurnerInitCode, proxyBytecode, proxyInterface } = await loadFixture(fixture);
      const salt = oftProxySalts('production-celo', deployer.address).adapter;

      // a plain ERC1967 proxy as "other implementation": different init code, same salt
      const otherInitCode = proxyBytecode;
      expect(computeCreate2Address(deployer.address, salt, minterBurnerInitCode)).to.not.equal(
        computeCreate2Address(deployer.address, salt, otherInitCode),
      );
      // and CreateX agrees on the CREATE2 address we compute locally
      expect(
        await createX.computeCreate2Address(
          guardCreateXSalt(deployer.address, salt),
          ethers.utils.keccak256(minterBurnerInitCode),
        ),
      ).to.equal(computeCreate2Address(deployer.address, salt, minterBurnerInitCode));

      // CREATE3 takes no init code at all, so the predicted address survives an implementation swap
      const predicted = computeCreate3Address(deployer.address, salt);
      const logic = await deployCreate2IfMissing(
        createX,
        deployer.address,
        createXSalt(deployer.address, ethers.utils.keccak256(otherInitCode)),
        otherInitCode,
      );
      const proxy = await deployCreate3AndInitIfMissing(
        createX,
        deployer.address,
        salt,
        proxyBytecode,
        proxyInterface.encodeFunctionData('initialize', [logic.address, '0x']),
      );
      expect(proxy.address).to.equal(predicted);
    });

    it('is re-runnable: an existing deployment is reused instead of redeployed', async () => {
      const { deployer, createX, minterBurnerInitCode, proxyBytecode, proxyInterface } = await loadFixture(fixture);
      const implSalt = createXSalt(deployer.address, ethers.utils.keccak256(minterBurnerInitCode));
      const proxySalt = oftProxySalts('development-celo', deployer.address).adapter;
      const initData = proxyInterface.encodeFunctionData('initialize', [
        (await deployCreate2IfMissing(createX, deployer.address, implSalt, minterBurnerInitCode)).address,
        '0x',
      ]);

      const implAgain = await deployCreate2IfMissing(createX, deployer.address, implSalt, minterBurnerInitCode);
      expect(implAgain.reused).to.equal(true);
      expect(implAgain.transactionHash).to.equal(undefined);

      const first = await deployCreate3AndInitIfMissing(createX, deployer.address, proxySalt, proxyBytecode, initData);
      const second = await deployCreate3AndInitIfMissing(createX, deployer.address, proxySalt, proxyBytecode, initData);
      expect(second.address).to.equal(first.address);
      expect(second.reused).to.equal(true);
    });

    it('reserves the address for its deployer: another signer with the same salt lands elsewhere', async () => {
      const { deployer, createX, other, proxyBytecode } = await loadFixture(fixture);
      const salt = createXSalt(other.address, 'Production-GoodDollarOFTAdapterV1');
      const reserved = computeCreate3Address(other.address, salt);

      // a foreign signer passing the same salt gets the unpermissioned guarded salt, not ours
      await (await createX.connect(deployer).deployCreate3(salt, proxyBytecode)).wait();
      expect(await ethers.provider.getCode(reserved)).to.equal('0x');

      // the address is still there for the deployer the salt belongs to
      await (await createX.connect(other).deployCreate3(salt, proxyBytecode)).wait();
      expect(await ethers.provider.getCode(reserved)).to.not.equal('0x');
    });
  });

  describe('CreateX itself', () => {
    it('matches the runtime code hash published by the CreateX project', async () => {
      const { createX } = await loadFixture(fixture);
      expect(createX.address).to.equal(CREATEX_ADDRESS);
      expect(ethers.utils.keccak256(await ethers.provider.getCode(CREATEX_ADDRESS))).to.equal(
        CREATEX_RUNTIME_CODE_HASH,
      );
    });

    it('refuses to deploy against foreign code at the CreateX address', async () => {
      await loadFixture(fixture);
      const snapshot = await takeSnapshot();
      await network.provider.send('hardhat_setCode', [CREATEX_ADDRESS, '0x6001600101']);

      await expect(getCreateX()).to.be.rejectedWith(/is not CreateX/);

      await snapshot.restore();
    });
  });
});
