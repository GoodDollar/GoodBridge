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
contract GoodDollarOFTAdapter is OFTCoreUpgradeable, UUPSUpgradeable {
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

    /// @dev A mapping for approved requests above limits
    mapping(bytes32 => bool) public approvedRequests;

    /// @dev A boolean for whether the bridge is closed
    bool public isClosed;

    /// @dev NameService for identity checks (optional, can be address(0))
    INameService public nameService;

    /// @dev Error for bridge limits violations
    error BRIDGE_LIMITS(string reason);

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

    /// @dev Event emitted when a request is approved
    event RequestApproved(bytes32 indexed requestId, bool approved);

    /// @dev Event emitted when limits are bypassed by request ID
    event LimitsBypassedByRequestId(address indexed account, bytes32 indexed requestId);

    /**
     * @dev Constructor for the upgradeable contract
     * @param _token The address of the underlying ERC20 token (used to get decimals)
     * @param _lzEndpoint The LayerZero endpoint address
     * @dev The constructor is called when deploying the implementation contract
     * @dev The token address is only used here to get decimals for the parent constructor
     */
    constructor(address _token, address _lzEndpoint) 
        OFTCoreUpgradeable(IERC20Metadata(_token).decimals(), _lzEndpoint) 
    {
        // Disable initialization in the constructor to prevent initialization of the implementation
        _disableInitializers();
    }

    /**
     * @notice Initializes the GoodDollarOFTAdapter contract
     * @param _token The address of the underlying ERC20 token
     * @param _minterBurner The contract responsible for minting and burning tokens
     * @param _owner The contract owner
     * @dev The LayerZero endpoint is set in the constructor and cannot be changed per proxy
     */
    function initialize(
        address _token,
        IMintableBurnable _minterBurner,
        address _owner
    ) public initializer {
        // Initialize parent contracts
        // __OFTCore_init already initializes OwnableUpgradeable through OAppCoreUpgradeable
        __OFTCore_init(_owner);
        
        // Set state variables
        innerToken = IERC20(_token);
        minterBurner = _minterBurner;
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
        
        // Enforce minFee and maxFee bounds
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
     * @notice Function for approving requests above limits
     * @param _requestId The request id to approve
     * @param approved Whether to approve the request or not
     */
    function approveRequest(bytes32 _requestId, bool approved) external onlyOwner {
        approvedRequests[_requestId] = approved;
        emit RequestApproved(_requestId, approved);
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
     * @notice Check if bridging is allowed for a given address and amount
     * @param _from The address of the sender
     * @param _amount The amount to bridge
     * @return isWithinLimit Whether the bridge is within the limit
     * @return error The error message, if any
     */
    function canBridge(address _from, uint256 _amount) public view returns (bool isWithinLimit, string memory error) {
        if (isClosed) return (false, 'closed');

        if (_amount < bridgeLimits.minAmount) return (false, 'minAmount');

        uint256 account24hours = accountsDailyLimit[_from].bridged24Hours;
        if (accountsDailyLimit[_from].lastTransferReset < block.timestamp - 1 days) {
            account24hours = _amount;
        } else {
            account24hours += _amount;
        }

        if (bridgeLimits.onlyWhitelisted && address(nameService) != address(0)) {
            IIdentity id = IIdentity(nameService.getAddress("IDENTITY"));
            if (address(id) != address(0)) {
                if (!id.isWhitelisted(_from)) return (false, 'not whitelisted');
            }
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
     * @notice Enforces transfer limits and checks if the transfer is valid
     * @param _address The address to transfer from
     * @param _amount The amount to transfer
     * @param _requestId The request ID (0 to skip approval check)
     * @dev Limits are enforced on both sending and receiving sides
     */
    function _enforceLimits(address _address, uint256 _amount, bytes32 _requestId) internal {
        if (_requestId != 0 && approvedRequests[_requestId] == true) { 
            emit LimitsBypassedByRequestId(_address, _requestId);
            return; // skip approval check if request is approved
        }
            
        // Reset daily limits if needed
        if (bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days) {
            bridgeDailyLimit.lastTransferReset = block.timestamp;
            bridgeDailyLimit.bridged24Hours = 0;
        }

        if (accountsDailyLimit[_address].lastTransferReset < block.timestamp - 1 days) {
            accountsDailyLimit[_address].lastTransferReset = block.timestamp;
            accountsDailyLimit[_address].bridged24Hours = 0;
        }

        // Check limits
        (bool isValid, string memory reason) = canBridge(_address, _amount);
        if (!isValid) revert BRIDGE_LIMITS(reason);

        // Update counters
        bridgeDailyLimit.bridged24Hours += _amount;
        accountsDailyLimit[_address].bridged24Hours += _amount;
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
        /// TODO: Enforce limits on sending side
        // bytes32 requestId = getRequestId(address(this), _from, _to, _dstEid, 0);
        // _enforceLimits(_from, _amountLD, requestId);
        
        (amountSentLD, amountReceivedLD) = _debitView(_amountLD, _minAmountLD, _dstEid);
        // Burns tokens from the caller
        minterBurner.burn(_from, amountSentLD);
    }

    /**
     * @notice Mints tokens to the specified address upon receiving them
     * @param _to The address to credit the tokens to
     * @param _amountLD The amount of tokens to credit in local decimals
     * @param _srcEid The source chain ID
     * @return amountReceivedLD The amount of tokens actually received in local decimals
     * @dev Fees are deducted on the destination chain
     */
    function _credit(
        address _to,
        uint256 _amountLD,
        uint32 _srcEid
    ) internal virtual override returns (uint256 amountReceivedLD) {
        if (_to == address(0x0)) _to = address(0xdead); // _mint(...) does not support address(0x0)
        
        
        // Calculate fee (fee is deducted on destination chain, matching MessagePassingBridge)
        uint256 fee = _takeFee(_amountLD);
        
        // Mint tokens to recipient (amount minus fee)
        uint256 recipientAmount = _amountLD - fee;
        bool success = minterBurner.mint(_to, recipientAmount);
        require(success, "GoodDollarOFTAdapter: Mint failed");
        
        // Mint fee to fee recipient if set
        if (fee > 0 && feeRecipient != address(0)) {
            bool feeSuccess = minterBurner.mint(feeRecipient, fee);
            require(feeSuccess, "GoodDollarOFTAdapter: Fee mint failed");
            emit FeeCollected(feeRecipient, fee);
        }
        
        return _amountLD;
    }
    
    /**
     * @notice Generates a request ID for a given transaction
     * @param adapterAddress The address of the adapter contract
     * @param sender The address of the sender
     * @param to The address of the recipient
     * @param sourceChainId The ID of the source chain
     * @param id The current ID counter
     * @return The request ID
     */
    function getRequestId(
        address adapterAddress, 
        address sender, 
        address to, 
        uint256 sourceChainId, 
        uint256 id
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                adapterAddress, 
                sender, 
                to, 
                sourceChainId, 
                id
            )
        );
    }

    /**
     * @notice Overrides the default _lzReceive function to enforce limits on receiving side
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal virtual override {
        // TODO: enforce limits on receiving side
        // bytes32 requestId = getRequestId(address(this), _origin.sender, _message.sendTo().bytes32ToAddress(), _origin.srcEid, _origin.nonce);
        // _enforceLimits(_message.sendTo().bytes32ToAddress(), _toLD(_message.amountSD()), requestId);
        super._lzReceive(_origin, _guid, _message, _executor, _extraData);
    }

    /**
     * @dev Only the owner can authorize upgrades (enforced by onlyOwner modifier)
     */
    function _authorizeUpgrade(address impl) internal virtual override onlyOwner {
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}