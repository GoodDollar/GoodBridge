// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import { IERC20, IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { OFTCoreUpgradeable } from "@layerzerolabs/oft-evm-upgradeable/contracts/oft/OFTCoreUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { IMintableBurnable } from "@layerzerolabs/oft-evm/contracts/interfaces/IMintableBurnable.sol";
import { INameService } from "@gooddollar/goodprotocol/contracts/utils/DAOUpgradeableContract.sol";

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
    mapping(uint256 => bool) public approvedRequests;

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

    /// @dev Event emitted when the contract is authorized to be upgraded
    event AuthorizedUpgrade(address indexed newImplementation);
    
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
    event RequestApproved(uint256 indexed requestId);

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
     * @param _minterBurner The contract responsible for minting and burning tokens
     * @param _owner The contract owner
     * @param _feeRecipient The address to receive bridge fees (can be address(0) to disable fees)
     * @param _nameService The NameService contract for identity checks (can be address(0))
     */
    /// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable missing-initializer
    function initialize(
        IMintableBurnable _minterBurner,
        address /* _lzEndpoint */,
        address _owner,
        address _feeRecipient,
        INameService _nameService
    ) public initializer {
        // Initialize OwnableUpgradeable first
        __Ownable_init();
            
        // Transfer ownership to the specified owner (since __Ownable_init sets it to msg.sender)
        __OFTCore_init(_owner);
        _transferOwnership(_owner);
        
        // Set state variables
        innerToken = IERC20(_nameService.getAddress("GOODDOLLAR"));
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
     * @return fee The calculated fee amount
     */
    function _takeFee(uint256 amount) internal view returns (uint256 fee) {
        fee = (amount * bridgeFees.fee) / 10000;
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
     */
    function approveRequest(uint256 _requestId) external onlyOwner {
        approvedRequests[_requestId] = true;
        emit RequestApproved(_requestId);
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
     * @param _from The address to transfer from
     * @param _to The address to transfer to
     * @param _amount The amount to transfer
     * @param _requestId The request ID (0 to skip approval check)
     * @dev Limits are enforced on the receiving side (minting), matching MessagePassingBridge behavior
     */
    function _enforceLimits(address _from, address _to, uint256 _amount, uint256 _requestId) internal {
        if (_to == address(0)) revert BRIDGE_LIMITS('invalid recipient');

        // Reset daily limits if needed
        if (bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days) {
            bridgeDailyLimit.lastTransferReset = block.timestamp;
            bridgeDailyLimit.bridged24Hours = 0;
        }

        if (accountsDailyLimit[_from].lastTransferReset < block.timestamp - 1 days) {
            accountsDailyLimit[_from].lastTransferReset = block.timestamp;
            accountsDailyLimit[_from].bridged24Hours = 0;
        }

        // Skip limits for manually approved requests
        if (_requestId > 0 && approvedRequests[_requestId]) {
            // Approved request, skip limit checks but still update counters
            bridgeDailyLimit.bridged24Hours += _amount;
            accountsDailyLimit[_from].bridged24Hours += _amount;
            return;
        }

        // Check limits
        (bool isValid, string memory reason) = canBridge(_from, _amount);
        if (!isValid) revert BRIDGE_LIMITS(reason);

        // Update counters
        bridgeDailyLimit.bridged24Hours += _amount;
        accountsDailyLimit[_from].bridged24Hours += _amount;
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
        // Burns tokens from the caller
        minterBurner.burn(_from, amountSentLD);
    }

    /**
     * @notice Mints tokens to the specified address upon receiving them
     * @param _to The address to credit the tokens to
     * @param _amountLD The amount of tokens to credit in local decimals
     * @param _srcEid The source chain ID
     * @return amountReceivedLD The amount of tokens actually received in local decimals
     */
    function _credit(
        address _to,
        uint256 _amountLD,
        uint32 _srcEid
    ) internal virtual override returns (uint256 amountReceivedLD) {
        if (_to == address(0x0)) _to = address(0xdead); // _mint(...) does not support address(0x0)
        
        // Mint tokens to recipient
        bool success = minterBurner.mint(_to, _amountLD);
        require(success, "GoodDollarOFTAdapter: Mint failed");
        
        return _amountLD;
    }

    /**
     * @dev Authorizes the upgrade of the contract to a new implementation
     * @param newImplementation The address of the new implementation contract
     * @dev Only the owner can authorize upgrades (enforced by onlyOwner modifier)
     * @dev This function is required for UUPS upgradeable pattern
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // Authorization is handled by onlyOwner modifier
        // Additional checks can be added here if needed
        emit AuthorizedUpgrade(newImplementation);
    }
    
    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}