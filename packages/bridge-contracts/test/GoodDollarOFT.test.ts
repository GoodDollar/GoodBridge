import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("OFT (unit, no fork)", () => {
  async function fixture() {
    const [owner, user, feeRecipient, avatar] = await ethers.getSigners();

    // Mocks for DAO stack used by GoodDollarOFTMinterBurner
    const NameService = await ethers.getContractFactory("NameServiceMock");
    const nameService = await NameService.deploy();
    await nameService.deployed();

    const Controller = await ethers.getContractFactory("ControllerMock");
    const controller = await Controller.deploy(avatar.address);
    await controller.deployed();

    const Token = await ethers.getContractFactory("MockGoodDollar");
    const token = await Token.deploy("GoodDollar", "G$");
    await token.deployed();

    // Wire NameService keys expected by DAOContract
    await nameService.setAddress("CONTROLLER", controller.address);
    await nameService.setAddress("GOODDOLLAR", token.address);

    const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
    const endpoint = await Endpoint.deploy();
    await endpoint.deployed();

    // Deploy minter/burner (do not initialize yet; adapter address is required)
    const MinterBurner = await ethers.getContractFactory("GoodDollarOFTMinterBurner");
    const minterBurner = await MinterBurner.deploy();
    await minterBurner.deployed();

    // Deploy adapter via UUPS proxy (implementation disables initializers)
    const Adapter = await ethers.getContractFactory("GoodDollarOFTAdapter");
    const adapter = await upgrades.deployProxy(
      Adapter,
      [token.address, minterBurner.address, owner.address, feeRecipient.address],
      {
        kind: "uups",
        constructorArgs: [token.address, endpoint.address],
        unsafeAllow: ["constructor", "state-variable-immutable", "duplicate-initializer-call"],
      }
    );

    // Now that adapter exists, initialize the minter/burner and authorize adapter as operator
    await minterBurner.initialize(nameService.address, adapter.address);

    return { owner, user, feeRecipient, avatar, nameService, controller, token, endpoint, minterBurner, adapter };
  }

  describe("GoodDollarOFTMinterBurner", () => {
    it("initializes token from NameService GOODDOLLAR", async () => {
      const { minterBurner, token } = await loadFixture(fixture);
      expect(await minterBurner.token()).to.equal(token.address);
    });

    it("authorizes the adapter as operator on initialize", async () => {
      const { minterBurner, adapter } = await loadFixture(fixture);
      expect(await minterBurner.operators(adapter.address)).to.equal(true);
    });

    it("only avatar can setOperator", async () => {
      const { minterBurner, user, avatar, adapter } = await loadFixture(fixture);

      await expect(minterBurner.connect(user).setOperator(adapter.address, true)).to.be.revertedWith(
        "only avatar can call this method"
      );

      await expect(minterBurner.connect(avatar).setOperator(adapter.address, true))
        .to.emit(minterBurner, "OperatorSet")
        .withArgs(adapter.address, true);
    });

    it("operators can mint/burn; burn requires allowance", async () => {
      const { minterBurner, token, user, avatar, owner } = await loadFixture(fixture);

      await minterBurner.connect(avatar).setOperator(owner.address, true);

      const amount = ethers.utils.parseEther("10");

      await expect(minterBurner.connect(owner).mint(user.address, amount)).to.emit(
        minterBurner,
        "TokensMinted"
      );

      await token.connect(user).approve(minterBurner.address, amount);

      await expect(minterBurner.connect(owner).burn(user.address, amount)).to.emit(
        minterBurner,
        "TokensBurned"
      );
    });

    it("pause blocks operator mint/burn", async () => {
      const { minterBurner, token, user, avatar, owner } = await loadFixture(fixture);

      await minterBurner.connect(avatar).setOperator(owner.address, true);
      await minterBurner.connect(avatar).pause();

      await expect(minterBurner.connect(owner).mint(user.address, 1)).to.be.revertedWith(
        "Contract is paused"
      );

      await token.connect(user).approve(minterBurner.address, 1);
      await expect(minterBurner.connect(owner).burn(user.address, 1)).to.be.revertedWith(
        "Contract is paused"
      );
    });
  });

  describe("GoodDollarOFTAdapter basic config", () => {
    it("deploys and initializes", async () => {
      const { adapter, token, minterBurner, feeRecipient, owner } = await loadFixture(fixture);
      expect(await adapter.token()).to.equal(token.address);
      expect(await adapter.minterBurner()).to.equal(minterBurner.address);
      expect(await adapter.owner()).to.equal(owner.address);
      expect(await adapter.feeRecipient()).to.equal(feeRecipient.address);
      expect(await adapter.approvalRequired()).to.equal(false);
    });

    it("sets bridge fees / feeRecipient / limits / pause", async () => {
      const { adapter, feeRecipient } = await loadFixture(fixture);

      const fees = {
        minFee: ethers.utils.parseEther("1"),
        maxFee: ethers.utils.parseEther("100"),
        fee: 100,
      };
      await expect(adapter.setBridgeFees(fees))
        .to.emit(adapter, "BridgeFeesSet")
        .withArgs(fees.minFee, fees.maxFee, fees.fee);

      await expect(adapter.setFeeRecipient(feeRecipient.address))
        .to.emit(adapter, "FeeRecipientSet")
        .withArgs(feeRecipient.address);

      const limits = {
        dailyLimit: ethers.utils.parseEther("1000000"),
        txLimit: ethers.utils.parseEther("10000"),
        accountDailyLimit: ethers.utils.parseEther("100000"),
        minAmount: ethers.utils.parseEther("100"),
        onlyWhitelisted: false,
      };
      await expect(adapter.setBridgeLimits(limits))
        .to.emit(adapter, "BridgeLimitsSet")
        .withArgs(
          limits.dailyLimit,
          limits.txLimit,
          limits.accountDailyLimit,
          limits.minAmount,
          limits.onlyWhitelisted
        );

      await expect(adapter.pauseBridge(true)).to.emit(adapter, "BridgePaused").withArgs(true);
      expect(await adapter.isClosed()).to.equal(true);
    });

    it("reverts when setting zero feeRecipient", async () => {
      const { adapter } = await loadFixture(fixture);

      await expect(adapter.setFeeRecipient(ethers.constants.AddressZero)).to.be.revertedWith("feeRecipient required");
    });

    it("reverts initialize when feeRecipient is zero", async () => {
      const [owner, , , avatar] = await ethers.getSigners();

      const NameService = await ethers.getContractFactory("NameServiceMock");
      const nameService = await NameService.deploy();
      await nameService.deployed();

      const Controller = await ethers.getContractFactory("ControllerMock");
      const controller = await Controller.deploy(avatar.address);
      await controller.deployed();

      const Token = await ethers.getContractFactory("MockGoodDollar");
      const token = await Token.deploy("GoodDollar", "G$");
      await token.deployed();

      await nameService.setAddress("CONTROLLER", controller.address);
      await nameService.setAddress("GOODDOLLAR", token.address);

      const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
      const endpoint = await Endpoint.deploy();
      await endpoint.deployed();

      const MinterBurner = await ethers.getContractFactory("GoodDollarOFTMinterBurner");
      const minterBurner = await MinterBurner.deploy();
      await minterBurner.deployed();

      const Adapter = await ethers.getContractFactory("GoodDollarOFTAdapter");
      await expect(
        upgrades.deployProxy(
          Adapter,
          [token.address, minterBurner.address, owner.address, ethers.constants.AddressZero],
          {
            kind: "uups",
            constructorArgs: [token.address, endpoint.address],
            unsafeAllow: ["constructor", "state-variable-immutable", "duplicate-initializer-call"],
          }
        )
      ).to.be.revertedWith("feeRecipient required");
    });
  });

  describe("Bridge limits enforcement (send) - reverts before LZ", () => {
    const messagingFee = { nativeFee: 0, lzTokenFee: 0 };

    const makeSendParam = (to: string, amountLD: any) => ({
      dstEid: 1,
      to: ethers.utils.hexZeroPad(to, 32),
      amountLD,
      minAmountLD: amountLD,
      extraOptions: "0x",
      composeMsg: "0x",
      oftCmd: "0x",
    });

    it("reverts with minAmount / txLimit / accountDailyLimit / dailyLimit", async () => {
      const { adapter, user } = await loadFixture(fixture);

      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("100"),
        accountDailyLimit: ethers.utils.parseEther("200"),
        minAmount: ethers.utils.parseEther("10"),
        onlyWhitelisted: false,
      });

      await expect(
        adapter
          .connect(user)
          .send(makeSendParam(user.address, ethers.utils.parseEther("1")), messagingFee, user.address, { value: 0 })
      ).to.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS").withArgs("minAmount");

      await expect(
        adapter
          .connect(user)
          .send(makeSendParam(user.address, ethers.utils.parseEther("101")), messagingFee, user.address, { value: 0 })
      ).to.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS").withArgs("txLimit");

      await expect(
        adapter
          .connect(user)
          .send(makeSendParam(user.address, ethers.utils.parseEther("201")), messagingFee, user.address, { value: 0 })
      ).to.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS").withArgs("accountDailyLimit");

      // dailyLimit check on new window: amount > dailyLimit (raise other limits so dailyLimit is the first failure)
      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("10000"),
        accountDailyLimit: ethers.utils.parseEther("10000"),
        minAmount: ethers.utils.parseEther("10"),
        onlyWhitelisted: false,
      });
      await expect(
        adapter
          .connect(user)
          .send(makeSendParam(user.address, ethers.utils.parseEther("1001")), messagingFee, user.address, { value: 0 })
      ).to.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS").withArgs("dailyLimit");
    });

    it("resets daily windows after 24h", async () => {
      const { adapter, user } = await loadFixture(fixture);

      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("1000"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      // First send passes limits but will likely revert deeper in LayerZero.
      // We only care that it does NOT revert with BRIDGE_LIMITS before LZ.
      await expect(
        adapter
          .connect(user)
          .send(makeSendParam(user.address, ethers.utils.parseEther("10")), messagingFee, user.address, { value: 0 })
      ).to.not.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS");

      await time.increase(24 * 60 * 60 + 1);

      await expect(
        adapter
          .connect(user)
          .send(makeSendParam(user.address, ethers.utils.parseEther("10")), messagingFee, user.address, { value: 0 })
      ).to.not.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS");
    });
  });
});

