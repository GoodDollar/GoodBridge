// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import { IERC20, IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@layerzerolabs/oft-evm-upgradeable/contracts/oft/OFTCoreUpgradeable.sol";
import { IMintableBurnable } from "@layerzerolabs/oft-evm/contracts/interfaces/IMintableBurnable.sol";
import { INameService } from "@gooddollar/goodprotocol/contracts/utils/DAOUpgradeableContract.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

interface IIdentity {
    function isWhitelisted(address) external view returns (bool);
}

/**
 * @title GoodDollarOFTAdapter
 * @notice Upgradeable OFT adapter that uses mint/burn mechanisms for cross-chain transfers
 * @dev Inherits from OFTCoreUpgradeable (which already includes OwnableUpgradeable) and implements mint/burn logic similar to MintBurnOFTAdapter
 */
contract GoodDollarOFTAdapter is UUPSUpgradeable, ReentrancyGuardUpgradeable, OFTCoreUpgradeable {
    using OFTMsgCodec for bytes;
    using OFTMsgCodec for bytes32;
    using SafeERC20 for IERC20;

    /// @dev Upper bound for bridgeFees.fee (5%)
    uint256 public constant MAX_FEE_BPS = 500;

    /// @dev Struct for storing bridge fees
    struct BridgeFees {
        uint256 minFee;
        uint256 maxFee;
        uint256 fee; // Fee in basis points (0-10000, where 10000 = 100%)
    }

    /// @dev Struct for storing account limits
    struct AccountLimit {
        uint256 lastTransferReset;
        uint256 bridged24Hours;
    }

    /// @dev Struct for storing bridge daily limits
    struct BridgeDailyLimit {
        uint256 lastTransferReset;
        uint256 bridged24Hours;
    }

    /// @dev Struct for storing bridge limits. Windows are tumbling (not sliding), so up to 2x a limit can pass around a reset
    struct BridgeLimits {
        uint256 dailyLimit;
        uint256 txLimit;
        uint256 accountDailyLimit;
        uint256 minAmount;
        bool onlyWhitelisted;
    }

    /// @dev The underlying ERC20 token
    IERC20 internal innerToken;
    
    /// @dev innerToken decimals
    uint8 public immutable innerTokenDecimals;

    /// @dev The contract responsible for minting and burning tokens
    IMintableBurnable public minterBurner;

    /// @dev Bridge fees configuration
    BridgeFees public bridgeFees;

    /// @dev Address to receive bridge fees
    address public feeRecipient;

    /// @dev Bridge limits structure
    BridgeLimits public bridgeLimits;

    /// @dev Outbound (send) bridge daily limit tracking
    BridgeDailyLimit public bridgeDailyLimit;

    /// @dev Outbound (send) account daily limit tracking
    mapping(address => AccountLimit) public accountsDailyLimit;

    /**
     * @dev Holds only what the replay needs: the message, the Origin to replay it under, whether the request
     *      is still outstanding, and the clock for the optimistic window.
     * @dev toAddress and amount are deliberately absent - both are pure functions of the message, and
     *      ReceiveRequestFailed already carries them for off-chain consumers. _executor and _extraData are
     *      absent too: OFTCore._lzReceive ignores both, and _extraData is not covered by the verified payload
     *      hash, so it is unauthenticated data not worth a slot.
     * @dev Origin is flattened rather than nested because its bytes32 sender cannot share a slot: a nested
     *      Origin would occupy three slots, where this packs failed/timestamp/srcEid/nonce into one (21 of 32
     *      bytes) and leaves sender its own. Parking a plain message therefore writes 5 slots, not 7, which
     *      is what keeps it inside the executor's gas allowance.
     * @dev UPGRADE NOTE: this layout is NOT compatible with the previous one. Only the mapping's value layout
     *      changed - every other state variable keeps its slot - so an upgrade is safe for limits, fees and
     *      counters, but pre-existing failedReceiveRequests entries are misread: `failed` still decodes
     *      correctly, while timestamp/srcEid/nonce come from the old toAddress bytes, `sender` from old `amount`,
     *      and `message` from the old `srcEid` slot (for odd EIDs, decoding as a large zero-filled bytes array).
     *      Such a record cannot be approved (it either overflows the optimistic check or reverts crediting a
     *      zero recipient), so it is inert rather than dangerous. Only testnets have ever been deployed; a
     *      mainnet deployment carrying parked requests would need them drained before this upgrade.
     */
    struct FailedReceiveRequest {
        bool failed;
        uint64 timestamp;
        uint32 srcEid;
        uint64 nonce;
        bytes32 sender;
        bytes message;
    }
    /// @dev A mapping for failed requests, keyed by the LayerZero message guid
    mapping(bytes32 => FailedReceiveRequest) public failedReceiveRequests;

    uint64 public constant OPTIMISTIC_WINDOW = 7 days;

    /// @dev A boolean for whether the bridge is closed
    bool public isClosed;

    /// @dev NameService for identity checks (optional, can be address(0))
    INameService public nameService;

    /// @dev Inbound (receive) bridge daily limit tracking, separate so sends can't exhaust the receive budget
    BridgeDailyLimit public bridgeReceiveDailyLimit;

    /// @dev Inbound (receive) account daily limit tracking
    mapping(address => AccountLimit) public accountsReceiveDailyLimit;

    /// @dev Error for bridge limits violations
    error BRIDGE_LIMITS(string reason);

    /// @dev Error for bridge limits violations
    error BRIDGE_NOT_ALLOWED(string reason);

    /// @dev Event emitted when bridge fees are updated
    event BridgeFeesSet(uint256 minFee, uint256 maxFee, uint256 fee);

    /// @dev Event emitted when fee recipient is updated
    event FeeRecipientSet(address indexed feeRecipient);

    /// @dev Event emitted when fees are collected
    event FeeCollected(address indexed recipient, uint256 amount);

    /// @dev Event emitted when a send destroys the sender's tokens at the MinterBurner.
    event SenderTokensBurned(address indexed from, uint256 amount);

    /// @dev Event emitted when bridge limits are updated
    event BridgeLimitsSet(
        uint256 dailyLimit,
        uint256 txLimit,
        uint256 accountDailyLimit,
        uint256 minAmount,
        bool onlyWhitelisted
    );

    /// @dev Event emitted when bridge pause status changes
    event BridgePaused(bool isPaused);

    /// @dev Event emitted when a limit-blocked receive is registered for recovery
    event ReceiveRequestFailed(bytes32 indexed guid, address toAddress, uint256 amount, uint32 srcEid);

    /// @dev Event emitted when a failed receive request is approved
    event FailedReceiveRequestApproved(bytes32 indexed guid);

    /// @dev Event emitted when a failed receive request is rejected by the owner
    event FailedReceiveRequestRejected(bytes32 indexed guid);

    /// @dev Event emitted when the NameService is updated
    event NameServiceSet(address indexed nameService);

    /**
     * @dev Constructor for the upgradeable implementation; token is used for decimals, init is disabled.
     * @param _token The underlying ERC20 token (used to get decimals for parent)
     * @param _lzEndpoint The LayerZero endpoint address
     */
    constructor(address _token, address _lzEndpoint) 
        OFTCoreUpgradeable(IERC20Metadata(_token).decimals(), _lzEndpoint) 
    {
        innerTokenDecimals = IERC20Metadata(_token).decimals();
        _disableInitializers();
    }

    /**
     * @notice Initializes the GoodDollarOFTAdapter contract
     * @param _token The underlying ERC20 token
     * @param _minterBurner The contract responsible for minting and burning tokens
     * @param _owner The contract owner
     * @param _feeRecipient The address to receive bridge fees
     */
    function initialize(
        address _token,
        IMintableBurnable _minterBurner,
        address _owner,
        address _feeRecipient
    ) public initializer {
        require(_token != address(0), "token required");
        require(address(_minterBurner) != address(0), "minterBurner required");
        require(_owner != address(0), "owner required");
        require(_feeRecipient != address(0), "feeRecipient required");
        require(IERC20Metadata(_token).decimals() == innerTokenDecimals, 'token decimals mismatch');

        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Ownable_init();
        __OAppSender_init(_owner);
        __OAppReceiver_init(_owner);
        __OFTCore_init(_owner);
        _transferOwnership(_owner);

        innerToken = IERC20(_token);
        minterBurner = _minterBurner;
        feeRecipient = _feeRecipient;
    }

    /**
     * @notice Retrieves the address of the underlying ERC20 token
     * @return The address of the adapted ERC20 token
     */
    function token() public view returns (address) {
        return address(innerToken);
    }

    /**
     * @notice Indicates whether the OFT contract requires approval of the underlying token to send
     * @return requiresApproval True: the adapter pulls tokens from the sender before burning them
     */
    function approvalRequired() external pure returns (bool) {
        return true;
    }

    /**
     * @notice Sets the bridge fees configuration
     * @dev Fees are deducted on the source chain in `_debitView`/`_debit` (so `minAmountLD`, `quoteOFT`,
     *      and `OFTSent` reflect the net bridged amount). `fee` is capped at `MAX_FEE_BPS`, while `minFee`
     *      is owner-governed and clamped to the transfer amount in `_takeFee` if `minFee > amount`.
     * @param _fees The bridge fees struct containing minFee, maxFee (0 = no cap), and fee (in basis points)
     */
    function setBridgeFees(BridgeFees memory _fees) external onlyOwner {
        require(_fees.fee <= MAX_FEE_BPS, 'invalid fee');
        require(_fees.maxFee == 0 || _fees.minFee <= _fees.maxFee, 'minFee > maxFee');
        bridgeFees = _fees;
        emit BridgeFeesSet(_fees.minFee, _fees.maxFee, _fees.fee);
    }

    /**
     * @notice Sets the fee recipient address
     * @param _feeRecipient The address to receive bridge fees
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "feeRecipient required");
        feeRecipient = _feeRecipient;
        emit FeeRecipientSet(_feeRecipient);
    }

    /**
     * @notice Calculates the fee amount from the given amount
     * @param amount The amount to calculate fee from
     * @return fee The calculated fee amount (enforced to be between minFee and maxFee if set, never above amount)
     */
    function _takeFee(uint256 amount) internal view returns (uint256 fee) {
        fee = (amount * bridgeFees.fee) / 10000;
        if (bridgeFees.minFee > 0 && fee < bridgeFees.minFee) {
            fee = bridgeFees.minFee;
        }
        if (bridgeFees.maxFee > 0 && fee > bridgeFees.maxFee) {
            fee = bridgeFees.maxFee;
        }
        // a minFee above the amount must not underflow and brick the message
        if (fee > amount) {
            fee = amount;
        }
    }

    /**
     * @notice Sets the bridge limits configuration
     * @param _limits The bridge limits struct
     */
    function setBridgeLimits(BridgeLimits memory _limits) external onlyOwner {
        require(_limits.minAmount <= _limits.txLimit, 'minAmount > txLimit');
        require(_limits.minAmount <= _limits.accountDailyLimit, 'minAmount > accountDailyLimit');
        require(_limits.txLimit <= _limits.dailyLimit, 'txLimit > dailyLimit');
        require(_limits.accountDailyLimit <= _limits.dailyLimit, 'accountDailyLimit > dailyLimit');
        bridgeLimits = _limits;
        emit BridgeLimitsSet(
            _limits.dailyLimit,
            _limits.txLimit,
            _limits.accountDailyLimit,
            _limits.minAmount,
            _limits.onlyWhitelisted
        );
    }

    /**
     * @notice Sets the NameService contract for identity checks
     * @param _nameService The NameService contract address (can be address(0))
     */
    function setNameService(INameService _nameService) external onlyOwner {
        nameService = _nameService;
        emit NameServiceSet(address(_nameService));
    }

    /**
     * @notice Function for pausing/unpausing the bridge
     * @param _isPaused Whether to pause the bridge or not
     */
    function pauseBridge(bool _isPaused) external onlyOwner {
        isClosed = _isPaused;
        emit BridgePaused(_isPaused);
    }

    /**
     * @notice Approves a failed receive request with optimistic window or by owner
     * @dev Replays the parked message through the inherited OFT receive logic rather than only crediting it,
     *      so a compose payload is still dispatched. That is what lets composed and plain messages share one
     *      failure path: parking is no longer lossy.
     * @dev Approved amounts intentionally skip the daily limit counters.
     * @dev Intentionally does not re-check `bridgeLimits.onlyWhitelisted`: whitelist eligibility was already
     *      enforced when `_lzReceive` parked the request, and only `isClosed` gates approval. If a parked
     *      recipient should no longer receive funds, the owner can call `rejectFailedRequest`.
     */
    function approveFailedRequest(bytes32 _guid) external nonReentrant {
        require(!isClosed, 'closed');
        FailedReceiveRequest memory request = failedReceiveRequests[_guid];
        require(request.failed, 'request not failed');
        require(request.timestamp + OPTIMISTIC_WINDOW < block.timestamp || msg.sender == owner(), 'optimistic period not ended or not owner');
        // G$ mint calls the recipient's ERC777 hook, so state must be final before the replay
        // Delete the parked request to reclaim storage and prevent leaving approved messages readable.
        // `request` is already loaded into memory, so replay can still use `request.message`.
        delete failedReceiveRequests[_guid];
        emit FailedReceiveRequestApproved(_guid);
        this.replayFailedRequest(Origin(request.srcEid, request.sender, request.nonce), _guid, request.message);
    }

    /**
     * @notice Replays an approved request's message through the inherited OFT receive logic
     * @dev Self-call only. OFTCore._lzReceive takes the message as calldata while the parked copy lives in
     *      storage, so the replay has to cross an ABI boundary to re-encode it. It deliberately bypasses this
     *      contract's _lzReceive override: the limits were already adjudicated by the approval, and the
     *      endpoint consumed the message when it was parked, so this is the only way it can ever execute.
     */
    function replayFailedRequest(Origin calldata _origin, bytes32 _guid, bytes calldata _message) external {
        require(msg.sender == address(this), 'only self');
        // _message[:0] is an empty calldata slice: OFTCore._lzReceive ignores _executor and _extraData,
        // and a literal cannot be passed where calldata is expected
        super._lzReceive(_origin, _guid, _message, address(0), _message[:0]);
    }

    /**
     * @notice Decodes a parked request into the values the struct does not store
     * @dev failedReceiveRequests already returns the raw message - bytes members are included in an
     *      autogenerated struct getter, only mappings and non-byte arrays are omitted - but toAddress and
     *      amount are derived rather than stored, so this saves callers decoding the OFT payload themselves.
     * @param _guid The guid of the parked request
     * @return toAddress The recipient the replay will credit
     * @return amountLD The amount in local decimals that the replay will credit
     * @return isComposed Whether the replay will also dispatch a compose payload
     */
    function failedRequestDetails(
        bytes32 _guid
    ) external view returns (address toAddress, uint256 amountLD, bool isComposed) {
        FailedReceiveRequest storage request = failedReceiveRequests[_guid];
        require(request.failed && request.message.length >= 40, 'no parked message');
        return this.decodeOftMessage(request.message);
    }

    /**
     * @notice Decodes an OFT payload with the same codec the receive path uses
     * @dev Takes calldata because OFTMsgCodec slices calldata, so failedRequestDetails reaches it through a
     *      static self-call - the same ABI-boundary step replayFailedRequest needs, and the reason this is
     *      a separate function rather than inlined.
     */
    function decodeOftMessage(
        bytes calldata _message
    ) external view returns (address toAddress, uint256 amountLD, bool isComposed) {
        return (_message.sendTo().bytes32ToAddress(), _toLD(_message.amountSD()), _message.isComposed());
    }

    /**
     * @notice Rejects a failed receive request so it can never be approved (e.g. a forged or suspicious message)
     */
    function rejectFailedRequest(bytes32 _guid) external onlyOwner {
        require(failedReceiveRequests[_guid].failed, 'request not failed');
        delete failedReceiveRequests[_guid];
        emit FailedReceiveRequestRejected(_guid);
    }

    /**
     * @notice Bridge closed / whitelist check only (no limit checks).
     * @dev Revert on this path does not store to failedReceiveRequests, so the message stays retryable
     *      at the endpoint instead of becoming a parked request.
     */
    function _checkBridgeClosedAndWhitelisted(address _from) internal view returns (bool ok, string memory reason) {
        if (isClosed) return (false, 'closed');
        if (bridgeLimits.onlyWhitelisted) {
            // fail closed: whitelist mode without a resolvable Identity blocks transfers
            if (address(nameService) == address(0)) return (false, 'identity not set');
            IIdentity id = IIdentity(nameService.getAddress("IDENTITY"));
            if (address(id) == address(0)) return (false, 'identity not set');
            if (!id.isWhitelisted(_from)) return (false, 'not whitelisted');
        }
        return (true, '');
    }

    /**
     * @notice Bridge limits check only (minAmount, accountDailyLimit, txLimit, dailyLimit).
     * @dev Assumes daily limit resets have already been applied. Failure on receive is stored in
     *      failedReceiveRequests, for composed and plain messages alike.
     */
    function _checkBridgeLimits(
        uint256 _amount,
        BridgeDailyLimit storage _daily,
        AccountLimit storage _account
    ) internal view returns (bool ok, string memory reason) {
        if (_amount < bridgeLimits.minAmount) return (false, 'minAmount');

        uint256 account24hours = _account.bridged24Hours;
        if (_account.lastTransferReset < block.timestamp - 1 days) {
            account24hours = _amount;
        } else {
            account24hours += _amount;
        }
        if (account24hours > bridgeLimits.accountDailyLimit) return (false, 'accountDailyLimit');

        if (_amount > bridgeLimits.txLimit) return (false, 'txLimit');

        if (_daily.lastTransferReset < block.timestamp - 1 days) {
            if (_amount > bridgeLimits.dailyLimit) return (false, 'dailyLimit');
        } else {
            if (_daily.bridged24Hours + _amount > bridgeLimits.dailyLimit) return (false, 'dailyLimit');
        }
        return (true, '');
    }

    /**
     * @notice Resets bridge and account daily limit counters if the 24h window has elapsed.
     */
    function _resetDailyLimitsIfNeeded(BridgeDailyLimit storage _daily, AccountLimit storage _account) internal {
        if (_daily.lastTransferReset < block.timestamp - 1 days) {
            _daily.lastTransferReset = block.timestamp;
            _daily.bridged24Hours = 0;
        }

        if (_account.lastTransferReset < block.timestamp - 1 days) {
            _account.lastTransferReset = block.timestamp;
            _account.bridged24Hours = 0;
        }
    }

    /**
     * @notice Enforces transfer limits: bridge closed/whitelisted check then bridge limits check.
     * @dev Used on send path. Resets daily windows, then checks; on success updates outbound counters.
     */
    function _enforceLimits(address _address, uint256 _amount) internal returns (bool isValid, string memory reason) {
        AccountLimit storage account = accountsDailyLimit[_address];
        _resetDailyLimitsIfNeeded(bridgeDailyLimit, account);
        (isValid, reason) = _checkBridgeClosedAndWhitelisted(_address);
        if (!isValid) return (false, reason);
        (isValid, reason) = _checkBridgeLimits(_amount, bridgeDailyLimit, account);
        if (!isValid) return (false, reason);

        bridgeDailyLimit.bridged24Hours += _amount;
        account.bridged24Hours += _amount;
        return (true, '');
    }

    /**
     * @notice Quotes the OFT send with the real bridge limits for msg.sender
     * @dev maxAmountLD = min(txLimit, remaining daily, remaining account daily); 0 when closed
     */
    function quoteOFT(
        SendParam calldata _sendParam
    )
        external
        view
        virtual
        override
        returns (OFTLimit memory oftLimit, OFTFeeDetail[] memory oftFeeDetails, OFTReceipt memory oftReceipt)
    {
        uint256 maxAmount;
        (bool allowed, ) = _checkBridgeClosedAndWhitelisted(msg.sender);
        if (allowed) {
            BridgeLimits memory limits = bridgeLimits;
            uint256 dailyUsed = bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days
                ? 0
                : bridgeDailyLimit.bridged24Hours;
            AccountLimit memory account = accountsDailyLimit[msg.sender];
            uint256 accountUsed = account.lastTransferReset < block.timestamp - 1 days ? 0 : account.bridged24Hours;

            maxAmount = limits.txLimit;
            uint256 dailyLeft = limits.dailyLimit > dailyUsed ? limits.dailyLimit - dailyUsed : 0;
            uint256 accountLeft = limits.accountDailyLimit > accountUsed ? limits.accountDailyLimit - accountUsed : 0;
            if (dailyLeft < maxAmount) maxAmount = dailyLeft;
            if (accountLeft < maxAmount) maxAmount = accountLeft;
            maxAmount = _removeDust(maxAmount);
        }
        oftLimit = OFTLimit(bridgeLimits.minAmount, maxAmount);

        (uint256 amountSentLD, uint256 amountReceivedLD) = _debitView(
            _sendParam.amountLD,
            _sendParam.minAmountLD,
            _sendParam.dstEid
        );
        uint256 fee = amountSentLD - amountReceivedLD;
        if (fee > 0) {
            oftFeeDetails = new OFTFeeDetail[](1);
            oftFeeDetails[0] = OFTFeeDetail({ feeAmountLD: int256(fee), description: 'Bridge fee' });
        } else {
            oftFeeDetails = new OFTFeeDetail[](0);
        }
        oftReceipt = OFTReceipt(amountSentLD, amountReceivedLD);
    }
    
    /**
     * @notice Overrides the default _send function to enforce limits on sending side
     */
    function _send(
        SendParam calldata _sendParam,
        MessagingFee calldata _fee,
        address _refundAddress
    ) internal virtual override nonReentrant returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt) {
        /// @dev revert if sending to zero address
        require(_sendParam.to.bytes32ToAddress() != address(0), 'GoodDollarOFTAdapter: sending to zero address');
        // limits apply to the dust-free net amount that is actually burned and bridged
        uint256 amountSentLD = _removeDust(_sendParam.amountLD);
        uint256 amountReceivedLD = _removeDust(amountSentLD - _takeFee(amountSentLD));
        (bool isValid, string memory reason) = _enforceLimits(msg.sender, amountReceivedLD);
        if (!isValid) {
            revert BRIDGE_LIMITS(reason);
        }
        (msgReceipt, oftReceipt) = super._send(_sendParam, _fee, _refundAddress);
    }

    /**
     * @notice Overrides the default _lzReceive function to enforce limits on receiving side.
     * @dev Closed/not whitelisted: revert. Limits exceeded: park in failedReceiveRequests, whatever the
     *      message type. The whole message is parked, so approveFailedRequest can replay it in full and a
     *      compose payload survives - which is why the message type no longer changes the failure handling.
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal virtual override nonReentrant {
        address toAddress = _message.sendTo().bytes32ToAddress();
        uint256 amountLD = _toLD(_message.amountSD());

        (bool ok, string memory reason) = _checkBridgeClosedAndWhitelisted(toAddress);
        if (!ok) {
            revert BRIDGE_NOT_ALLOWED(reason);
        }

        AccountLimit storage account = accountsReceiveDailyLimit[toAddress];

        (ok, reason) = _checkBridgeLimits(amountLD, bridgeReceiveDailyLimit, account);
        if (!ok) {
            failedReceiveRequests[_guid] = FailedReceiveRequest(
                true,
                uint64(block.timestamp),
                _origin.srcEid,
                _origin.nonce,
                _origin.sender,
                _message
            );
            emit ReceiveRequestFailed(_guid, toAddress, amountLD, _origin.srcEid);
        } else {
            _resetDailyLimitsIfNeeded(bridgeReceiveDailyLimit, account);
            bridgeReceiveDailyLimit.bridged24Hours += amountLD;
            account.bridged24Hours += amountLD;
            super._lzReceive(_origin, _guid, _message, _executor, _extraData);
        }
    }
    /**
     * @notice Mints tokens to the specified address upon receiving them
     * @param _to The address to credit the tokens to
     * @param _amountLD The amount of tokens to credit in local decimals
     * @return amountReceivedLD The amount of tokens actually received in local decimals
     * @dev Bridge fees are deducted on the source chain in `_debit`, so the full `_amountLD` is minted here.
     */
    function _credit(
        address _to,
        uint256 _amountLD,
        uint32 /* _srcEid */
    ) internal virtual override returns (uint256 amountReceivedLD) {
        if (_amountLD > 0) {
            bool success = minterBurner.mint(_to, _amountLD);
            require(success, "GoodDollarOFTAdapter: Mint failed");
        }
        return _amountLD;
    }

    /**
     * @notice Calculates the dust-free debited amount and net bridged amount after source-chain bridge fees
     * @dev Any sub-shared-decimal dust from the fee calculation stays in `amountSentLD - amountReceivedLD`
     *      (collected by `feeRecipient`), ensuring `amountReceivedLD` is dust-free and conserved 1:1 across chains.
     */
    function _debitView(
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 /* _dstEid */
    ) internal view virtual override returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        amountSentLD = _removeDust(_amountLD);
        uint256 fee = _takeFee(amountSentLD);
        amountReceivedLD = _removeDust(amountSentLD - fee);

        if (amountReceivedLD < _minAmountLD) {
            revert SlippageExceeded(amountReceivedLD, _minAmountLD);
        }
    }
    
    /**
     * @notice Moves the net bridged tokens straight to the MinterBurner and burns them, and transfers
     *         the source-chain bridge fee to `feeRecipient`
     * @dev One transfer per destination rather than pulling into the adapter and pushing on: the adapter never
     *      custodies user funds and needs no allowance to the MinterBurner. The burn itself debits the
     *      MinterBurner, so SenderTokensBurned is emitted here to record whose tokens funded it.
     * @param _from The address to debit the tokens from
     * @param _amountLD The amount of tokens to send in local decimals
     * @param _minAmountLD The minimum net amount to receive on the destination chain in local decimals
     * @param _dstEid The destination chain ID
     * @return amountSentLD The total amount debited from the sender in local decimals
     * @return amountReceivedLD The net amount burned and bridged to the destination chain in local decimals
     */
    function _debit(
        address _from,
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal virtual override returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        (amountSentLD, amountReceivedLD) = _debitView(_amountLD, _minAmountLD, _dstEid);
        uint256 fee = amountSentLD - amountReceivedLD;

        if (amountReceivedLD > 0) {
            uint256 balanceBefore = innerToken.balanceOf(address(minterBurner));
            innerToken.safeTransferFrom(_from, address(minterBurner), amountReceivedLD);
            require(
                innerToken.balanceOf(address(minterBurner)) - balanceBefore == amountReceivedLD,
                'received amount mismatch'
            );
            require(minterBurner.burn(_from, amountReceivedLD), 'GoodDollarOFTAdapter: Burn failed');
            emit SenderTokensBurned(_from, amountReceivedLD);
        }

        if (fee > 0 && feeRecipient != address(0)) {
            uint256 feeBalanceBefore = innerToken.balanceOf(feeRecipient);
            innerToken.safeTransferFrom(_from, feeRecipient, fee);
            require(
                innerToken.balanceOf(feeRecipient) - feeBalanceBefore == fee,
                'fee received amount mismatch'
            );
            emit FeeCollected(feeRecipient, fee);
        }
    }

    /**
     * @notice Transfers contract ownership and updates the LayerZero Endpoint delegate to match
     * @dev Keeps owner and endpoint delegate in sync so the previous owner cannot retain endpoint config control.
     */
    function transferOwnership(address newOwner) public virtual override onlyOwner {
        super.transferOwnership(newOwner);
        endpoint.setDelegate(newOwner);
    }

    /**
     * @notice Disabled to prevent permanently locking upgrades, pause controls, and failed-request rejection.
     */
    function renounceOwnership() public virtual override onlyOwner {
        revert('renounceOwnership disabled');
    }

    function _authorizeUpgrade(address) internal virtual override onlyOwner {}
    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}