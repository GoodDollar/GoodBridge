import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployMinterBurnerProxy } from "./helpers/deployMinterBurnerProxy";

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

    // Deploy minter/burner proxy (do not initialize yet; adapter address is required)
    const minterBurner = await deployMinterBurnerProxy();

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

      await expect(minterBurner.connect(user).mint(user.address, 1)).to.be.revertedWith("Not authorized");
      await expect(minterBurner.connect(user).burn(user.address, 1)).to.be.revertedWith("Not authorized");

      await minterBurner.connect(avatar).setOperator(owner.address, true);

      const amount = ethers.utils.parseEther("10");

      await expect(minterBurner.connect(owner).mint(owner.address, amount)).to.emit(
        minterBurner,
        "TokensMinted"
      );

      await expect(minterBurner.connect(owner).burn(owner.address, amount)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );

      await token.connect(owner).approve(minterBurner.address, amount);

      const supplyBefore = await token.totalSupply();
      await expect(minterBurner.connect(owner).burn(owner.address, amount)).to.emit(
        minterBurner,
        "TokensBurned"
      );
      expect(await token.totalSupply()).to.equal(supplyBefore.sub(amount));
    });

    // L-01: an operator can no longer burn tokens of an arbitrary approver
    it("operator cannot burn another account's tokens even with allowance", async () => {
      const { minterBurner, token, user, avatar, owner } = await loadFixture(fixture);

      await minterBurner.connect(avatar).setOperator(owner.address, true);
      const amount = ethers.utils.parseEther("10");
      await minterBurner.connect(owner).mint(user.address, amount);
      await token.connect(user).approve(minterBurner.address, amount);

      await expect(minterBurner.connect(owner).burn(user.address, amount)).to.be.revertedWith(
        "can only burn own tokens"
      );
      expect(await token.balanceOf(user.address)).to.equal(amount);
    });

    it("pause blocks operator mint/burn", async () => {
      const { minterBurner, token, user, avatar, owner } = await loadFixture(fixture);

      await minterBurner.connect(avatar).setOperator(owner.address, true);
      await minterBurner.connect(avatar).pause();

      await expect(minterBurner.connect(owner).mint(user.address, 1)).to.be.revertedWith(
        "Contract is paused"
      );

      await token.connect(owner).approve(minterBurner.address, 1);
      await expect(minterBurner.connect(owner).burn(owner.address, 1)).to.be.revertedWith(
        "Contract is paused"
      );
    });

    // L-03: authorization follows the live Controller avatar
    it("onlyOperators uses the current Controller avatar", async () => {
      const { minterBurner, controller, user, avatar } = await loadFixture(fixture);
      const [, , , , newAvatar] = await ethers.getSigners();

      await controller.setAvatar(newAvatar.address);

      await expect(minterBurner.connect(avatar).mint(user.address, 1)).to.be.revertedWith("Not authorized");
      await expect(minterBurner.connect(newAvatar).mint(user.address, 1)).to.emit(minterBurner, "TokensMinted");
    });

    // L-04: the implementation cannot be initialized directly
    it("implementation has initializers disabled", async () => {
      const { nameService, adapter } = await loadFixture(fixture);
      const MinterBurner = await ethers.getContractFactory("GoodDollarOFTMinterBurner");
      const impl = await MinterBurner.deploy();
      await impl.deployed();

      await expect(impl.initialize(nameService.address, adapter.address)).to.be.revertedWith(
        "Initializable: contract is already initialized"
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
      expect(await adapter.approvalRequired()).to.equal(true);
    });

    // M-01: fee configuration bounds
    it("rejects fee above MAX_FEE_BPS and minFee above maxFee", async () => {
      const { adapter } = await loadFixture(fixture);
      const maxBps = await adapter.MAX_FEE_BPS();

      await expect(adapter.setBridgeFees({ minFee: 0, maxFee: 0, fee: maxBps.add(1) })).to.be.revertedWith(
        "invalid fee"
      );
      await expect(adapter.setBridgeFees({ minFee: 0, maxFee: 0, fee: 10000 })).to.be.revertedWith("invalid fee");
      await expect(adapter.setBridgeFees({ minFee: 10, maxFee: 5, fee: 100 })).to.be.revertedWith("minFee > maxFee");

      await expect(adapter.setBridgeFees({ minFee: 10, maxFee: 0, fee: maxBps })).to.emit(adapter, "BridgeFeesSet");
      await expect(adapter.setBridgeFees({ minFee: 5, maxFee: 5, fee: 100 })).to.emit(adapter, "BridgeFeesSet");
    });

    // L-07: limits must be internally consistent
    it("rejects inconsistent bridge limits", async () => {
      const { adapter } = await loadFixture(fixture);
      const base = {
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("100"),
        accountDailyLimit: ethers.utils.parseEther("500"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      };

      await expect(adapter.setBridgeLimits({ ...base, minAmount: ethers.utils.parseEther("101") })).to.be.revertedWith(
        "minAmount > txLimit"
      );
      await expect(adapter.setBridgeLimits({ ...base, txLimit: ethers.utils.parseEther("1001") })).to.be.revertedWith(
        "txLimit > dailyLimit"
      );
      await expect(
        adapter.setBridgeLimits({ ...base, accountDailyLimit: ethers.utils.parseEther("1001") })
      ).to.be.revertedWith("accountDailyLimit > dailyLimit");
      await expect(adapter.setBridgeLimits(base)).to.emit(adapter, "BridgeLimitsSet");
    });

    // L-06: setNameService emits an event
    it("emits NameServiceSet", async () => {
      const { adapter, nameService } = await loadFixture(fixture);
      await expect(adapter.setNameService(nameService.address))
        .to.emit(adapter, "NameServiceSet")
        .withArgs(nameService.address);
    });

    // L-09: quoteOFT reports the real limits for msg.sender
    it("quoteOFT returns min/max from bridge limits and dust-free receipt", async () => {
      const { adapter, user } = await loadFixture(fixture);
      const sendParam = (amountLD: any) => ({
        dstEid: 1,
        to: ethers.utils.hexZeroPad(user.address, 32),
        amountLD,
        minAmountLD: 0,
        extraOptions: "0x",
        composeMsg: "0x",
        oftCmd: "0x",
      });

      let [limit] = await adapter.connect(user).quoteOFT(sendParam(ethers.utils.parseEther("10")));
      expect(limit.minAmountLD).to.equal(0);
      expect(limit.maxAmountLD).to.equal(0);

      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("100"),
        accountDailyLimit: ethers.utils.parseEther("50"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const dust = DECIMAL_CONVERSION_RATE.sub(1);
      const amount = ethers.utils.parseEther("10").add(dust);
      const [limit2, feeDetails, receipt] = await adapter.connect(user).quoteOFT(sendParam(amount));
      expect(limit2.minAmountLD).to.equal(ethers.utils.parseEther("1"));
      expect(limit2.maxAmountLD).to.equal(ethers.utils.parseEther("50"));
      expect(feeDetails.length).to.equal(0);
      expect(receipt.amountSentLD).to.equal(ethers.utils.parseEther("10"));
      expect(receipt.amountReceivedLD).to.equal(ethers.utils.parseEther("10"));

      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("100"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });
      [limit] = await adapter.connect(user).quoteOFT(sendParam(amount));
      expect(limit.maxAmountLD).to.equal(ethers.utils.parseEther("100"));

      await adapter.pauseBridge(true);
      [limit] = await adapter.connect(user).quoteOFT(sendParam(amount));
      expect(limit.maxAmountLD).to.equal(0);
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

    it("reverts with minAmount / txLimit / accountDailyLimit", async () => {
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
    });

    // L-08: limits are checked on the dust-free amount
    it("does not count dust against txLimit", async () => {
      const { adapter, user } = await loadFixture(fixture);

      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("100"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const amount = ethers.utils.parseEther("100").add(DECIMAL_CONVERSION_RATE.sub(1));
      await expect(
        adapter
          .connect(user)
          .send({ ...makeSendParam(user.address, amount), minAmountLD: 0 }, messagingFee, user.address, { value: 0 })
      ).to.not.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS");

      await expect(
        adapter
          .connect(user)
          .send(
            { ...makeSendParam(user.address, amount.add(DECIMAL_CONVERSION_RATE)), minAmountLD: 0 },
            messagingFee,
            user.address,
            { value: 0 }
          )
      ).to.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS").withArgs("txLimit");
    });

    // L-06: whitelist mode fails closed when Identity cannot be resolved
    it("reverts with 'identity not set' when onlyWhitelisted and no NameService/IDENTITY", async () => {
      const { adapter, user, nameService } = await loadFixture(fixture);

      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("1000"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: true,
      });

      const send = () =>
        adapter
          .connect(user)
          .send(makeSendParam(user.address, ethers.utils.parseEther("10")), messagingFee, user.address, { value: 0 });

      await expect(send()).to.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS").withArgs("identity not set");

      // NameService set but IDENTITY missing
      await adapter.setNameService(nameService.address);
      await expect(send()).to.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS").withArgs("identity not set");
    });

    it("bridging failed when bridge limits exceeded on send", async () => {
      const { adapter, user } = await loadFixture(fixture);

      await adapter.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("100"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const guid = ethers.utils.formatBytes32String("send-limit-guid");

      await expect(
        adapter
          .connect(user)
          .send(makeSendParam(user.address, ethers.utils.parseEther("500")), messagingFee, user.address, { value: 0 })
      ).to.be.revertedWithCustomError(adapter, "BRIDGE_LIMITS").withArgs("txLimit");
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

      const minterBurner = await deployMinterBurnerProxy();

      // Deploy harness via UUPS proxy
      const Harness = await ethers.getContractFactory("GoodDollarOFTAdapterHarness");
      const harness = await upgrades.deployProxy(
        Harness,
        [token.address, minterBurner.address, owner.address, feeRecipient.address],
        {
          kind: "uups",
          constructorArgs: [token.address, endpoint.address],
          unsafeAllow: ["constructor", "state-variable-immutable", "duplicate-initializer-call", "missing-initializer"],
        }
      );

      await minterBurner.initialize(nameService.address, harness.address);

      return { owner, user, feeRecipient, avatar, nameService, token, endpoint, minterBurner, harness };
    }

    // Helper: build an Origin struct for testing. A non-zero sender/nonce keeps the parked Origin meaningful.
    const PEER = ethers.utils.hexZeroPad("0x00000000000000000000000000000000000000aa", 32);
    const origin = (srcEid = 1, nonce = 1) => ({ srcEid, sender: PEER, nonce });

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

      // only what the replay needs is parked: the message plus the Origin to replay it under.
      // recipient and amount are not stored - the event above carries them, and they are derivable
      // from the message anyway
      const req = await harness.failedReceiveRequests(guid);
      expect(req.failed).to.equal(true);
      expect(req.message).to.equal(message.toLowerCase());
      expect(req.srcEid).to.equal(1);
      expect(req.nonce).to.equal(1);
      expect(req.sender).to.equal(PEER);
      expect(req.timestamp).to.be.gt(0);

      // the replay still credits the right recipient the right amount, decoded from the parked message
      await expect(harness.approveFailedRequest(guid))
        .to.emit(harness, "OFTReceived")
        .withArgs(guid, 1, user.address, amountLD);
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
      expect((await harness.failedReceiveRequests(guid)).failed).to.equal(true);

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

      expect((await harness.failedReceiveRequests(guid)).failed).to.equal(false);
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

    // H-03: a paused bridge must stop failed-request approvals, and the owner must be able to reject them
    async function parkFailedRequest(harness: any, to: string, label: string) {
      await harness.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("50"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });
      const guid = ethers.utils.formatBytes32String(label);
      const message = encodeOFTMessage(to, toSD(ethers.utils.parseEther("100")));
      await harness.exposed_lzReceive(origin(), guid, message, ethers.constants.AddressZero, "0x");
      expect((await harness.failedReceiveRequests(guid)).failed).to.equal(true);
      return guid;
    }

    it("approveFailedRequest: reverts while the bridge is closed, even for the owner", async () => {
      const { harness, user, token } = await loadFixture(harnessFixture);
      const guid = await parkFailedRequest(harness, user.address, "guid-closed-approve");

      await harness.pauseBridge(true);
      await time.increase(3 * 24 * 60 * 60 + 1);

      await expect(harness.approveFailedRequest(guid)).to.be.revertedWith("closed");
      await expect(harness.connect(user).approveFailedRequest(guid)).to.be.revertedWith("closed");
      expect(await token.balanceOf(user.address)).to.equal(0);

      await harness.pauseBridge(false);
      await harness.connect(user).approveFailedRequest(guid);
      expect(await token.balanceOf(user.address)).to.equal(ethers.utils.parseEther("100"));
    });

    it("rejectFailedRequest: owner can reject, and a rejected request cannot be approved", async () => {
      const { harness, user, token } = await loadFixture(harnessFixture);
      const guid = await parkFailedRequest(harness, user.address, "guid-reject");

      await expect(harness.rejectFailedRequest(guid))
        .to.emit(harness, "FailedReceiveRequestRejected")
        .withArgs(guid);
      expect((await harness.failedReceiveRequests(guid)).failed).to.equal(false);

      await time.increase(3 * 24 * 60 * 60 + 1);
      await expect(harness.connect(user).approveFailedRequest(guid)).to.be.revertedWith("request not failed");
      await expect(harness.approveFailedRequest(guid)).to.be.revertedWith("request not failed");
      expect(await token.balanceOf(user.address)).to.equal(0);
    });

    it("rejectFailedRequest: non-owner cannot reject", async () => {
      const { harness, user } = await loadFixture(harnessFixture);
      const guid = await parkFailedRequest(harness, user.address, "guid-reject-non-owner");

      await expect(harness.connect(user).rejectFailedRequest(guid)).to.be.revertedWith("Ownable: caller is not the owner");
      expect((await harness.failedReceiveRequests(guid)).failed).to.equal(true);
    });

    it("rejectFailedRequest: reverts for non-existent or already approved request", async () => {
      const { harness, user } = await loadFixture(harnessFixture);
      await expect(harness.rejectFailedRequest(ethers.utils.formatBytes32String("nonexistent"))).to.be.revertedWith(
        "request not failed"
      );

      const guid = await parkFailedRequest(harness, user.address, "guid-reject-approved");
      await harness.approveFailedRequest(guid);
      await expect(harness.rejectFailedRequest(guid)).to.be.revertedWith("request not failed");
    });

    it("emits OFTReceived with the net amount after fees", async () => {
      const { harness, user, token } = await loadFixture(harnessFixture);
      await harness.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("1000"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });
      await harness.setBridgeFees({ minFee: 0, maxFee: 0, fee: 100 });

      const amountLD = ethers.utils.parseEther("100");
      const netAmount = amountLD.sub(amountLD.mul(100).div(10000));
      const guid = ethers.utils.formatBytes32String("guid-net-received");
      const message = encodeOFTMessage(user.address, toSD(amountLD));

      await expect(harness.exposed_lzReceive(origin(), guid, message, ethers.constants.AddressZero, "0x"))
        .to.emit(harness, "OFTReceived")
        .withArgs(guid, 1, user.address, netAmount);
      expect(await token.balanceOf(user.address)).to.equal(netAmount);
    });

    // M-02: a composed message parks like any other, and approval replays it compose payload included
    it("parks a composed message that exceeds limits and dispatches the compose on approval", async () => {
      const { harness, endpoint, user, token } = await loadFixture(harnessFixture);
      await harness.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("50"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const amountLD = ethers.utils.parseEther("100");
      const guid = ethers.utils.formatBytes32String("guid-composed");
      const composeFrom = ethers.utils.hexZeroPad(user.address, 32);
      const message = encodeOFTMessage(user.address, toSD(amountLD)) + composeFrom.slice(2) + "deadbeef";

      await expect(harness.exposed_lzReceive(origin(), guid, message, ethers.constants.AddressZero, "0x"))
        .to.emit(harness, "ReceiveRequestFailed")
        .withArgs(guid, user.address, amountLD, 1);

      const req = await harness.failedReceiveRequests(guid);
      expect(req.failed).to.equal(true);
      expect(req.message).to.equal(message.toLowerCase());

      // the replay goes through the full OFT receive path, so the compose payload is dispatched
      // rather than silently dropped the way a credit-only approval would
      await expect(harness.approveFailedRequest(guid))
        .to.emit(endpoint, "ComposeSent")
        .withArgs(harness.address, user.address, guid, 0, (composed: string) => composed.endsWith("deadbeef"));
      expect(await token.balanceOf(user.address)).to.equal(amountLD);
    });

    it("an approved replay emits OFTReceived, so it is indistinguishable from a normal receive", async () => {
      const { harness, user } = await loadFixture(harnessFixture);
      const guid = await parkFailedRequest(harness, user.address, "guid-replay-event");

      await expect(harness.approveFailedRequest(guid))
        .to.emit(harness, "OFTReceived")
        .withArgs(guid, 1, user.address, ethers.utils.parseEther("100"));
    });

    it("replayFailedRequest cannot be called from outside", async () => {
      const { harness, user } = await loadFixture(harnessFixture);
      const message = encodeOFTMessage(user.address, toSD(ethers.utils.parseEther("100")));

      await expect(
        harness.replayFailedRequest(origin(), ethers.utils.formatBytes32String("guid-direct"), message)
      ).to.be.revertedWith("only self");
      await expect(
        harness.connect(user).replayFailedRequest(origin(), ethers.utils.formatBytes32String("guid-direct"), message)
      ).to.be.revertedWith("only self");
    });

    // M-03: inbound and outbound traffic use separate counters
    it("receive updates only the inbound counters", async () => {
      const { harness, user } = await loadFixture(harnessFixture);
      await harness.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("1000"),
        txLimit: ethers.utils.parseEther("1000"),
        accountDailyLimit: ethers.utils.parseEther("1000"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const amountLD = ethers.utils.parseEther("100");
      const guid = ethers.utils.formatBytes32String("guid-counters");
      await harness.exposed_lzReceive(
        origin(),
        guid,
        encodeOFTMessage(user.address, toSD(amountLD)),
        ethers.constants.AddressZero,
        "0x"
      );

      expect((await harness.bridgeReceiveDailyLimit()).bridged24Hours).to.equal(amountLD);
      expect((await harness.accountsReceiveDailyLimit(user.address)).bridged24Hours).to.equal(amountLD);
      expect((await harness.bridgeDailyLimit()).bridged24Hours).to.equal(0);
      expect((await harness.accountsDailyLimit(user.address)).bridged24Hours).to.equal(0);
    });

    it("parks a receive that exceeds the inbound dailyLimit", async () => {
      const { harness, user, owner } = await loadFixture(harnessFixture);
      await harness.setBridgeLimits({
        dailyLimit: ethers.utils.parseEther("150"),
        txLimit: ethers.utils.parseEther("100"),
        accountDailyLimit: ethers.utils.parseEther("150"),
        minAmount: ethers.utils.parseEther("1"),
        onlyWhitelisted: false,
      });

      const amountLD = ethers.utils.parseEther("100");
      const guid1 = ethers.utils.formatBytes32String("guid-daily-1");
      const guid2 = ethers.utils.formatBytes32String("guid-daily-2");
      await harness.exposed_lzReceive(
        origin(),
        guid1,
        encodeOFTMessage(user.address, toSD(amountLD)),
        ethers.constants.AddressZero,
        "0x"
      );
      await expect(
        harness.exposed_lzReceive(
          origin(),
          guid2,
          encodeOFTMessage(owner.address, toSD(amountLD)),
          ethers.constants.AddressZero,
          "0x"
        )
      ).to.emit(harness, "ReceiveRequestFailed");

      expect((await harness.failedReceiveRequests(guid1)).failed).to.equal(false);
      expect((await harness.failedReceiveRequests(guid2)).failed).to.equal(true);
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

      const minterBurner = await deployMinterBurnerProxy();

      const Harness = await ethers.getContractFactory("GoodDollarOFTAdapterHarness");
      const harness = await upgrades.deployProxy(
        Harness,
        [token.address, minterBurner.address, owner.address, feeRecipient.address],
        {
          kind: "uups",
          constructorArgs: [token.address, endpoint.address],
          unsafeAllow: ["constructor", "state-variable-immutable", "duplicate-initializer-call", "missing-initializer"],
        }
      );

      await minterBurner.initialize(nameService.address, harness.address);

      return { owner, user, feeRecipient, token, harness, minterBurner };
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

    it("returns the net amount credited to the recipient", async () => {
      const { harness, user } = await loadFixture(feeHarnessFixture);
      const amount = ethers.utils.parseEther("1000");

      expect(await harness.callStatic.exposed_credit(user.address, amount, 1)).to.equal(amount);

      await harness.setBridgeFees({ minFee: 0, maxFee: 0, fee: 100 });
      expect(await harness.callStatic.exposed_credit(user.address, amount, 1)).to.equal(
        amount.sub(amount.mul(100).div(10000))
      );
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

      const maxFee = ethers.utils.parseEther("20");
      await harness.setBridgeFees({
        minFee: 0,
        maxFee,
        fee: 500, // 5%
      });

      const amount = ethers.utils.parseEther("1000"); // calculated: 50 tokens, above maxFee of 20
      await harness.exposed_credit(user.address, amount, 1);

      expect(await token.balanceOf(feeRecipient.address)).to.equal(maxFee);
      expect(await token.balanceOf(user.address)).to.equal(amount.sub(maxFee));
    });

    // M-01: minFee above the amount is clamped so the credit cannot underflow
    it("clamps the fee to the amount when minFee exceeds it", async () => {
      const { harness, user, token, feeRecipient } = await loadFixture(feeHarnessFixture);

      await harness.setBridgeFees({ minFee: ethers.utils.parseEther("5"), maxFee: 0, fee: 10 });

      const amount = ethers.utils.parseEther("2");
      expect(await harness.callStatic.exposed_credit(user.address, amount, 1)).to.equal(0);
      await harness.exposed_credit(user.address, amount, 1);

      expect(await token.balanceOf(user.address)).to.equal(0);
      expect(await token.balanceOf(feeRecipient.address)).to.equal(amount);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // L-01/L-02: the adapter is the spender and burns through the MinterBurner
  // ─────────────────────────────────────────────────────────────────────────
  describe("Debit (_debit)", () => {
    async function debitFixture() {
      const [owner, user, feeRecipient, avatar] = await ethers.getSigners();

      const NameService = await ethers.getContractFactory("NameServiceMock");
      const nameService = await NameService.deploy();
      const Controller = await ethers.getContractFactory("ControllerMock");
      const controller = await Controller.deploy(avatar.address);
      const Token = await ethers.getContractFactory("MockGoodDollar");
      const token = await Token.deploy("GoodDollar", "G$");
      await nameService.setAddress("CONTROLLER", controller.address);
      await nameService.setAddress("GOODDOLLAR", token.address);
      const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
      const endpoint = await Endpoint.deploy();

      const minterBurner = await deployMinterBurnerProxy();
      const Harness = await ethers.getContractFactory("GoodDollarOFTAdapterHarness");
      const harness = await upgrades.deployProxy(
        Harness,
        [token.address, minterBurner.address, owner.address, feeRecipient.address],
        {
          kind: "uups",
          constructorArgs: [token.address, endpoint.address],
          unsafeAllow: ["constructor", "state-variable-immutable", "duplicate-initializer-call", "missing-initializer"],
        }
      );
      await minterBurner.initialize(nameService.address, harness.address);

      return { user, token, harness, minterBurner };
    }

    it("pulls approved tokens into the adapter and burns them", async () => {
      const { user, token, harness, minterBurner } = await loadFixture(debitFixture);
      const amount = ethers.utils.parseEther("10");
      await token.mint(user.address, amount);

      await token.connect(user).approve(harness.address, amount);
      const supplyBefore = await token.totalSupply();
      await expect(harness.exposed_debit(user.address, amount, amount, 1))
        .to.emit(minterBurner, "TokensBurned")
        .withArgs(harness.address, amount, harness.address);

      expect(await token.balanceOf(user.address)).to.equal(0);
      expect(await token.balanceOf(harness.address)).to.equal(0);
      expect(await token.balanceOf(minterBurner.address)).to.equal(0);
      expect(await token.totalSupply()).to.equal(supplyBefore.sub(amount));
      expect(await token.allowance(harness.address, minterBurner.address)).to.equal(0);
    });

    it("reverts without an allowance to the adapter (MinterBurner allowance is not enough)", async () => {
      const { user, token, harness, minterBurner } = await loadFixture(debitFixture);
      const amount = ethers.utils.parseEther("10");
      await token.mint(user.address, amount);

      await token.connect(user).approve(minterBurner.address, amount);
      await expect(harness.exposed_debit(user.address, amount, amount, 1)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );
      expect(await token.balanceOf(user.address)).to.equal(amount);
    });
  });
});
