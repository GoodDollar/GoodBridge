// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import { IERC20, IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@layerzerolabs/oft-evm-upgradeable/contracts/oft/OFTCoreUpgradeable.sol";
import { IMintableBurnable } from "@layerzerolabs/oft-evm/contracts/interfaces/IMintableBurnable.sol";
import { INameService } from "@gooddollar/goodprotocol/contracts/utils/DAOUpgradeableContract.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IIdentity {
    function isWhitelisted(address) external view returns (bool);
}

/**
 * @title GoodDollarOFTAdapter
 * @notice Upgradeable OFT adapter that uses mint/burn mechanisms for cross-chain transfers
 * @dev Inherits from OFTCoreUpgradeable (which already includes OwnableUpgradeable) and implements mint/burn logic similar to MintBurnOFTAdapter
 */
contract GoodDollarOFTAdapter is UUPSUpgradeable, OFTCoreUpgradeable {
    using OFTMsgCodec for bytes;
    using OFTMsgCodec for bytes32;
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

    /// @dev Struct for storing bridge limits
    struct BridgeLimits {
        uint256 dailyLimit;
        uint256 txLimit;
        uint256 accountDailyLimit;
        uint256 minAmount;
        bool onlyWhitelisted;
    }

    /// @dev The underlying ERC20 token
    IERC20 internal innerToken;
    
    /// @dev The contract responsible for minting and burning tokens
    IMintableBurnable public minterBurner;

    /// @dev Bridge fees configuration
    BridgeFees public bridgeFees;

    /// @dev Address to receive bridge fees
    address public feeRecipient;

    /// @dev Bridge limits structure
    BridgeLimits public bridgeLimits;

    /// @dev Bridge daily limit tracking
    BridgeDailyLimit public bridgeDailyLimit;

    /// @dev Account-specific daily limit tracking
    mapping(address => AccountLimit) public accountsDailyLimit;

    struct FailedReceiveRequest {
        bool failed;
        address toAddress;
        uint64 timestamp;
        uint256 amount;
        uint32 srcEid;
    }
    /// @dev A mapping for failed requests
    mapping(bytes32 => FailedReceiveRequest) public failedReceiveRequests;

    uint64 public constant OPTIMISTIC_WINDOW = 3 days;

    /// @dev A boolean for whether the bridge is closed
    bool public isClosed;

    /// @dev NameService for identity checks (optional, can be address(0))
    INameService public nameService;

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

    /// @dev Event emitted when a failed receive request is made
    event ReceiveRequestFailed(bytes32 indexed guid, address toAddress, uint256 amount, uint32 srcEid);

    /// @dev Event emitted when a failed receive request is approved
    event FailedReceiveRequestApproved(bytes32 indexed guid);

    /**
     * @dev Constructor for the upgradeable implementation; token is used for decimals, init is disabled.
     * @param _token The underlying ERC20 token (used to get decimals for parent)
     * @param _lzEndpoint The LayerZero endpoint address
     */
    constructor(address _token, address _lzEndpoint) 
        OFTCoreUpgradeable(IERC20Metadata(_token).decimals(), _lzEndpoint) 
    {
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
        __UUPSUpgradeable_init();
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
     * @return requiresApproval False because this adapter uses mint and burn privileges
     */
    function approvalRequired() external pure returns (bool) {
        return false;
    }

    /**
     * @notice Sets the bridge fees configuration
     * @param _fees The bridge fees struct containing minFee, maxFee, and fee (in basis points)
     */
    function setBridgeFees(BridgeFees memory _fees) external onlyOwner {
        require(_fees.fee <= 10000, 'invalid fee');
        bridgeFees = _fees;
        emit BridgeFeesSet(_fees.minFee, _fees.maxFee, _fees.fee);
    }

    /**
     * @notice Sets the fee recipient address
     * @param _feeRecipient The address to receive bridge fees
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
        emit FeeRecipientSet(_feeRecipient);
    }

    /**
     * @notice Calculates the fee amount from the given amount
     * @param amount The amount to calculate fee from
     * @return fee The calculated fee amount (enforced to be between minFee and maxFee if set)
     */
    function _takeFee(uint256 amount) internal view returns (uint256 fee) {
        fee = (amount * bridgeFees.fee) / 10000;
        if (bridgeFees.minFee > 0 && fee < bridgeFees.minFee) {
            fee = bridgeFees.minFee;
        }
        if (bridgeFees.maxFee > 0 && fee > bridgeFees.maxFee) {
            fee = bridgeFees.maxFee;
        }
    }

    /**
     * @notice Sets the bridge limits configuration
     * @param _limits The bridge limits struct
     */
    function setBridgeLimits(BridgeLimits memory _limits) external onlyOwner {
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
    }

    /**
     * @notice Function for pausing/unpausing the bridge
     * @param _isPaused Whether to pause the bridge or not
     */
    function pauseBridge(bool _isPaused) external onlyOwner {
        isClosed = _isPaused;
        emit BridgePaused(_isPaused);
    }

    function approveFailedRequest(bytes32 _guid) external onlyOwner {
        FailedReceiveRequest memory request = failedReceiveRequests[_guid];
        require(request.timestamp + OPTIMISTIC_WINDOW < block.timestamp, 'optimistic period not ended');
        require(request.failed, 'request not failed');
        _credit(request.toAddress, request.amount, request.srcEid);
        delete failedReceiveRequests[_guid];
        emit FailedReceiveRequestApproved(_guid);
    }

    /**
     * @notice Bridge closed / whitelist check only (no limit checks).
     * @dev Revert on this path does not store to failedReceiveRequests.
     */
    function _checkBridgeClosedAndWhitelisted(address _from) internal view returns (bool ok, string memory reason) {
        if (isClosed) return (false, 'closed');
        if (bridgeLimits.onlyWhitelisted && address(nameService) != address(0)) {
            IIdentity id = IIdentity(nameService.getAddress("IDENTITY"));
            if (address(id) != address(0) && !id.isWhitelisted(_from)) {
                return (false, 'not whitelisted');
            }
        }
        return (true, '');
    }

    /**
     * @notice Bridge limits check only (minAmount, accountDailyLimit, txLimit, dailyLimit).
     * @dev Assumes daily limit resets have already been applied. Failure on receive is stored in failedReceiveRequests.
     */
    function _checkBridgeLimits(address _from, uint256 _amount) internal view returns (bool ok, string memory reason) {
        if (_amount < bridgeLimits.minAmount) return (false, 'minAmount');

        uint256 account24hours = accountsDailyLimit[_from].bridged24Hours;
        if (accountsDailyLimit[_from].lastTransferReset < block.timestamp - 1 days) {
            account24hours = _amount;
        } else {
            account24hours += _amount;
        }
        if (account24hours > bridgeLimits.accountDailyLimit) return (false, 'accountDailyLimit');

        if (_amount > bridgeLimits.txLimit) return (false, 'txLimit');

        if (bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days) {
            if (_amount > bridgeLimits.dailyLimit) return (false, 'dailyLimit');
        } else {
            if (bridgeDailyLimit.bridged24Hours + _amount > bridgeLimits.dailyLimit) return (false, 'dailyLimit');
        }
        return (true, '');
    }

    /**
     * @notice Resets bridge and account daily limit counters if the 24h window has elapsed.
     * @param _address The account address for which to reset account daily limit.
     */
    function _resetDailyLimitsIfNeeded(address _address) internal {
        if (bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days) {
            bridgeDailyLimit.lastTransferReset = block.timestamp;
            bridgeDailyLimit.bridged24Hours = 0;
        }

        if (accountsDailyLimit[_address].lastTransferReset < block.timestamp - 1 days) {
            accountsDailyLimit[_address].lastTransferReset = block.timestamp;
            accountsDailyLimit[_address].bridged24Hours = 0;
        }
    }

    /**
     * @notice Enforces transfer limits: bridge closed/whitelisted check then bridge limits check.
     * @dev Used on send path. Resets daily windows, then checks; on success updates counters.
     */
    function _enforceLimits(address _address, uint256 _amount) internal returns (bool isValid, string memory reason) {
        _resetDailyLimitsIfNeeded(_address);
        (isValid, reason) = _checkBridgeClosedAndWhitelisted(_address);
        if (!isValid) return (false, reason);
        (isValid, reason) = _checkBridgeLimits(_address, _amount);
        if (!isValid) return (false, reason);

        bridgeDailyLimit.bridged24Hours += _amount;
        accountsDailyLimit[_address].bridged24Hours += _amount;
        return (true, '');
    }
    
    /**
     * @notice Overrides the default _send function to enforce limits on sending side
     */
    function _send(
        SendParam calldata _sendParam,
        MessagingFee calldata _fee,
        address _refundAddress
    ) internal virtual override returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt) {
        (bool isValid, string memory reason) = _enforceLimits(_sendParam.to.bytes32ToAddress(), _sendParam.amountLD);
        if (!isValid) {
            revert BRIDGE_LIMITS(reason);
        }
        (msgReceipt, oftReceipt) = super._send(_sendParam, _fee, _refundAddress);
    }

    /**
     * @notice Overrides the default _lzReceive function to enforce limits on receiving side.
     * @dev Bridge closed/whitelisted check: revert only. Bridge limits check: store in failedReceiveRequests then revert.
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal virtual override {
        address toAddress = _message.sendTo().bytes32ToAddress();
        uint256 amountLD = _toLD(_message.amountSD());

        (bool ok, string memory reason) = _checkBridgeClosedAndWhitelisted(toAddress);
        if (!ok) {
            revert BRIDGE_NOT_ALLOWED(reason);
        }

        _resetDailyLimitsIfNeeded(toAddress);

        (ok, reason) = _checkBridgeLimits(toAddress, amountLD);
        if (!ok) {
            failedReceiveRequests[_guid] = FailedReceiveRequest(
                true,
                toAddress,
                uint64(block.timestamp),
                amountLD,
                _origin.srcEid
            );
            emit ReceiveRequestFailed(_guid, toAddress, amountLD, _origin.srcEid);
            revert BRIDGE_LIMITS(reason);
        }
        bridgeDailyLimit.bridged24Hours += amountLD;
        accountsDailyLimit[toAddress].bridged24Hours += amountLD;
        super._lzReceive(_origin, _guid, _message, _executor, _extraData);
    }
    /**
     * @notice Mints tokens to the specified address upon receiving them
     * @param _to The address to credit the tokens to
     * @param _amountLD The amount of tokens to credit in local decimals
     * @return amountReceivedLD The amount of tokens actually received in local decimals
     * @dev Fees are deducted on the destination chain
     */
    function _credit(
        address _to,
        uint256 _amountLD,
        uint32 /* _srcEid */
    ) internal virtual override returns (uint256 amountReceivedLD) {
        uint256 fee = _takeFee(_amountLD);
        uint256 recipientAmount = _amountLD - fee;
        bool success = minterBurner.mint(_to, recipientAmount);
        require(success, "GoodDollarOFTAdapter: Mint failed");

        if (fee > 0 && feeRecipient != address(0)) {
            bool feeSuccess = minterBurner.mint(feeRecipient, fee);
            require(feeSuccess, "GoodDollarOFTAdapter: Fee mint failed");
            emit FeeCollected(feeRecipient, fee);
        }
        
        return _amountLD;
    }
    
    /**
     * @notice Burns tokens from the sender's balance to prepare for sending
     * @param _from The address to debit the tokens from
     * @param _amountLD The amount of tokens to send in local decimals
     * @param _minAmountLD The minimum amount to send in local decimals
     * @param _dstEid The destination chain ID
     * @return amountSentLD The amount sent in local decimals
     * @return amountReceivedLD The amount received in local decimals on the remote
     */
    function _debit(
        address _from,
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal virtual override returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        (amountSentLD, amountReceivedLD) = _debitView(_amountLD, _minAmountLD, _dstEid);
        minterBurner.burn(_from, amountSentLD);
    }

    /**
     * @notice Predicts the GUID that will be used for the next message to a destination
     */
    function predictNextGuid(uint32 _dstEid, address _sender, address _receiver) public view returns (bytes32) {
        bytes32 receiverBytes32 = _toBytes32(_receiver);
        return generateGuid(
            endpoint.outboundNonce(_sender, _dstEid, receiverBytes32) + 1, 
            endpoint.eid(), 
            _sender, 
            _dstEid, 
            receiverBytes32
        );
    }

    function generateGuid(
        uint64 _nonce,
        uint32 _srcEid,
        address _sender,
        uint32 _dstEid,
        bytes32 _receiver
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_nonce, _srcEid, _toBytes32(_sender), _dstEid, _receiver));
    }

    function _toBytes32(address _address) internal pure returns (bytes32 result) {
        result = bytes32(uint256(uint160(_address)));
    }

    function _authorizeUpgrade(address) internal virtual override onlyOwner {}


    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}