import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

// OFT message encoding helpers (mirrors OFTMsgCodec library)
// message = abi.encodePacked(bytes32(to), uint64(amountSD))
function encodeOFTMessage(toAddress: string, amountSD: ethers.BigNumber): string {
  const toBytes32 = ethers.utils.hexZeroPad(toAddress, 32);
  // uint64 is 8 bytes; pack as big-endian
  const amountHex = ethers.utils.hexZeroPad(amountSD.toHexString(), 8);
  return toBytes32 + amountHex.slice(2); // strip leading 0x from second segment
}

// Convert local-decimal amount to shared-decimal amount (sharedDecimals=6)
// For MockGoodDollar (18 decimals): decimalConversionRate = 10^(18-6) = 10^12
const DECIMAL_CONVERSION_RATE = ethers.BigNumber.from(10).pow(12);
function toSD(amountLD: ethers.BigNumber): ethers.BigNumber {
  return amountLD.div(DECIMAL_CONVERSION_RATE);
}

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

    it("reverts sending to address(0)", async () => {
      const { adapter, user } = await loadFixture(fixture);

      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("1000"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const zeroSendParam = {
        dstEid: 1,
        to: ethers.constants.HashZero, // address(0) encoded as bytes32
        amountLD: ethers.utils.parseEther("10"),
        minAmountLD: ethers.utils.parseEther("10"),
        extraOptions: "0x",
        composeMsg: "0x",
        oftCmd: "0x",
      };

      await expect(
        adapter.connect(user).send(zeroSendParam, messagingFee, user.address, { value: 0 })
      ).to.be.revertedWith("GoodDollarOFTAdapter: sending to zero address");
    });

    it("reverts when bridge is closed (send side)", async () => {
      const { adapter, user } = await loadFixture(fixture);

      await adapter.pauseBridge(true);

      await expect(
        adapter
          .connect(user)
          .send(makeSendParam(user.address, ethers.utils.parseEther("10")), messagingFee, user.address, { value: 0 })
      ).to.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS").withArgs("closed");
    });

    it("reverts when onlyWhitelisted and sender not whitelisted (send side)", async () => {
      const { adapter, user, nameService } = await loadFixture(fixture);

      // Deploy identity mock and wire it into NameService
      const Identity = await ethers.getContractFactory("IdentityMock");
      const identity = await Identity.deploy();
      await identity.deployed();
      await nameService.setAddress("IDENTITY", identity.address);
      await adapter.setNameService(nameService.address);

      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("1000"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: true,
      });

      // user is NOT whitelisted — send should revert
      await expect(
        adapter
          .connect(user)
          .send(makeSendParam(user.address, ethers.utils.parseEther("10")), messagingFee, user.address, { value: 0 })
      ).to.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS").withArgs("not whitelisted");

      // Whitelist the user — send should pass limits (may revert deeper in LZ)
      await identity.setWhitelisted(user.address, true);
      await expect(
        adapter
          .connect(user)
          .send(makeSendParam(user.address, ethers.utils.parseEther("10")), messagingFee, user.address, { value: 0 })
      ).to.not.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tests that exercise the receive path via the GoodDollarOFTAdapterHarness
  // ─────────────────────────────────────────────────────────────────────────
  describe("Receive path (via harness)", () => {
    // Deploy a harness instead of the plain adapter so we can call _lzReceive directly
    async function harnessFixture() {
      const [owner, user, feeRecipient, avatar] = await ethers.getSigners();

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

      // Deploy harness via UUPS proxy
      const Harness = await ethers.getContractFactory("GoodDollarOFTAdapterHarness");
      const harness = await upgrades.deployProxy(
        Harness,
        [token.address, minterBurner.address, owner.address, feeRecipient.address],
        {
          kind: "uups",
          constructorArgs: [token.address, endpoint.address],
          unsafeAllow: ["constructor", "state-variable-immutable", "duplicate-initializer-call"],
        }
      );

      await minterBurner.initialize(nameService.address, harness.address);

      return { owner, user, feeRecipient, avatar, nameService, token, endpoint, minterBurner, harness };
    }

    // Helper: build an Origin struct for testing
    const origin = (srcEid = 1) => ({
      srcEid,
      sender: ethers.utils.hexZeroPad(ethers.constants.AddressZero, 32),
      nonce: 1,
    });

    it("stores failedReceiveRequest when bridge limits exceeded on receive", async () => {
      const { harness, user } = await loadFixture(harnessFixture);

      await harness.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("100"),
        accountDailyLimit: ethers.utils.parseEther("200"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const amountLD = ethers.utils.parseEther("500"); // exceeds txLimit
      const guid = ethers.utils.formatBytes32String("test-guid-1");
      const message = encodeOFTMessage(user.address, toSD(amountLD));

      await expect(harness.exposed_lzReceive(origin(), guid, message, ethers.constants.AddressZero, "0x"))
        .to.emit(harness, "ReceiveRequestFailed")
        .withArgs(guid, user.address, amountLD, 1);

      const req = await harness.failedReceiveRequests(guid);
      expect(req.failed).to.equal(true);
      expect(req.toAddress).to.equal(user.address);
      expect(req.amount).to.equal(amountLD);
      expect(req.srcEid).to.equal(1);
    });

    it("reverts with BRIDGE_NOT_ALLOWED when bridge is closed on receive", async () => {
      const { harness, user } = await loadFixture(harnessFixture);

      await harness.pauseBridge(true);

      const amountLD = ethers.utils.parseEther("10");
      const guid = ethers.utils.formatBytes32String("test-guid-closed");
      const message = encodeOFTMessage(user.address, toSD(amountLD));

      await expect(
        harness.exposed_lzReceive(origin(), guid, message, ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(harness, "BRIDGE_NOT_ALLOWED").withArgs("closed");
    });

    it("credits tokens on successful receive (within limits)", async () => {
      const { harness, user, token } = await loadFixture(harnessFixture);

      await harness.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("1000"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const amountLD = ethers.utils.parseEther("100");
      const guid = ethers.utils.formatBytes32String("test-guid-ok");
      const message = encodeOFTMessage(user.address, toSD(amountLD));

      const balBefore = await token.balanceOf(user.address);
      await harness.exposed_lzReceive(origin(), guid, message, ethers.constants.AddressZero, "0x");
      const balAfter = await token.balanceOf(user.address);

      // No fee configured → full amount credited
      expect(balAfter.sub(balBefore)).to.equal(amountLD);
    });

    it("approveFailedRequest: owner can approve before optimistic window", async () => {
      const { harness, user, token } = await loadFixture(harnessFixture);

      await harness.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("50"), // will cause receive to fail
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const amountLD = ethers.utils.parseEther("100"); // exceeds txLimit
      const guid = ethers.utils.formatBytes32String("test-guid-owner-approve");
      const message = encodeOFTMessage(user.address, toSD(amountLD));

      await harness.exposed_lzReceive(origin(), guid, message, ethers.constants.AddressZero, "0x");

      // Confirm it's stored
      expect((await harness.failedReceiveRequests(guid)).failed).to.be.true;

      // Raise limits so _credit succeeds
      await harness.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("10000"),
        txLimit: ethers.utils.parseEther("10000"),
        accountDailyLimit: ethers.utils.parseEther("10000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const balBefore = await token.balanceOf(user.address);

      // Owner approves immediately (before OPTIMISTIC_WINDOW elapses)
      await expect(harness.approveFailedRequest(guid))
        .to.emit(harness, "FailedReceiveRequestApproved")
        .withArgs(guid);

      expect((await harness.failedReceiveRequests(guid)).failed).to.be.false;
      expect((await token.balanceOf(user.address)).sub(balBefore)).to.equal(amountLD);
    });

    it("approveFailedRequest: anyone can approve after optimistic window", async () => {
      const { harness, user, token } = await loadFixture(harnessFixture);

      await harness.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("50"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const amountLD = ethers.utils.parseEther("100");
      const guid = ethers.utils.formatBytes32String("test-guid-optimistic");
      const message = encodeOFTMessage(user.address, toSD(amountLD));

      await harness.exposed_lzReceive(origin(), guid, message, ethers.constants.AddressZero, "0x");

      // Non-owner cannot approve before optimistic window
      await expect(
        harness.connect(user).approveFailedRequest(guid)
      ).to.be.revertedWith("optimistic period not ended or not owner");

      // Advance past OPTIMISTIC_WINDOW (3 days)
      await time.increase(3 * 24 * 60 * 60 + 1);

      const balBefore = await token.balanceOf(user.address);

      // Now anyone can approve
      await expect(harness.connect(user).approveFailedRequest(guid))
        .to.emit(harness, "FailedReceiveRequestApproved")
        .withArgs(guid);

      expect((await token.balanceOf(user.address)).sub(balBefore)).to.equal(amountLD);
    });

    it("approveFailedRequest: reverts for non-existent request", async () => {
      const { harness } = await loadFixture(harnessFixture);
      const fakeGuid = ethers.utils.formatBytes32String("nonexistent");

      await expect(harness.approveFailedRequest(fakeGuid)).to.be.revertedWith("request not failed");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Fee collection tests via exposed_credit harness
  // ─────────────────────────────────────────────────────────────────────────
  describe("Fee collection (_credit)", () => {
    async function feeHarnessFixture() {
      const [owner, user, feeRecipient, avatar] = await ethers.getSigners();

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

      const Harness = await ethers.getContractFactory("GoodDollarOFTAdapterHarness");
      const harness = await upgrades.deployProxy(
        Harness,
        [token.address, minterBurner.address, owner.address, feeRecipient.address],
        {
          kind: "uups",
          constructorArgs: [token.address, endpoint.address],
          unsafeAllow: ["constructor", "state-variable-immutable", "duplicate-initializer-call"],
        }
      );

      await minterBurner.initialize(nameService.address, harness.address);

      return { owner, user, feeRecipient, token, harness };
    }

    it("mints full amount to recipient when no fee is configured", async () => {
      const { harness, user, token, feeRecipient } = await loadFixture(feeHarnessFixture);

      const amount = ethers.utils.parseEther("100");
      const userBefore = await token.balanceOf(user.address);
      const feeBefore = await token.balanceOf(feeRecipient.address);

      await harness.exposed_credit(user.address, amount, 1);

      expect((await token.balanceOf(user.address)).sub(userBefore)).to.equal(amount);
      expect((await token.balanceOf(feeRecipient.address)).sub(feeBefore)).to.equal(0);
    });

    it("deducts fee and mints to feeRecipient", async () => {
      const { harness, user, token, feeRecipient } = await loadFixture(feeHarnessFixture);

      // 1% fee (100 basis points)
      await harness.setBridgeFees({
        minFee: 0,
        maxFee: 0,
        fee: 100,
      });

      const amount = ethers.utils.parseEther("1000");
      const expectedFee = amount.mul(100).div(10000); // 10 tokens
      const expectedRecipient = amount.sub(expectedFee); // 990 tokens

      await expect(harness.exposed_credit(user.address, amount, 1))
        .to.emit(harness, "FeeCollected")
        .withArgs(feeRecipient.address, expectedFee);

      expect(await token.balanceOf(user.address)).to.equal(expectedRecipient);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(expectedFee);
    });

    it("enforces minFee when calculated fee is below minimum", async () => {
      const { harness, user, token, feeRecipient } = await loadFixture(feeHarnessFixture);

      const minFee = ethers.utils.parseEther("5");
      await harness.setBridgeFees({
        minFee,
        maxFee: 0,
        fee: 10, // 0.1%
      });

      const amount = ethers.utils.parseEther("1000"); // calculated: 1 token, below minFee of 5
      await harness.exposed_credit(user.address, amount, 1);

      expect(await token.balanceOf(feeRecipient.address)).to.equal(minFee);
      expect(await token.balanceOf(user.address)).to.equal(amount.sub(minFee));
    });

    it("enforces maxFee when calculated fee exceeds maximum", async () => {
      const { harness, user, token, feeRecipient } = await loadFixture(feeHarnessFixture);

      const maxFee = ethers.utils.parseEther("50");
      await harness.setBridgeFees({
        minFee: 0,
        maxFee,
        fee: 1000, // 10%
      });

      const amount = ethers.utils.parseEther("1000"); // calculated: 100 tokens, above maxFee of 50
      await harness.exposed_credit(user.address, amount, 1);

      expect(await token.balanceOf(feeRecipient.address)).to.equal(maxFee);
      expect(await token.balanceOf(user.address)).to.equal(amount.sub(maxFee));
    });
  });
});
