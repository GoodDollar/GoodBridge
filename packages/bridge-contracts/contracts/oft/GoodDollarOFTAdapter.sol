// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { IERC20, IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { OFTCoreUpgradeable } from "@layerzerolabs/oft-evm-upgradeable/contracts/oft/OFTCoreUpgradeable.sol";
import { IMintableBurnable } from "@layerzerolabs/oft-evm/contracts/interfaces/IMintableBurnable.sol";

/**
 * @title GoodDollarOFTAdapter
 * @notice Upgradeable OFT adapter that uses mint/burn mechanisms for cross-chain transfers
 * @dev Inherits from OFTCoreUpgradeable and implements mint/burn logic similar to MintBurnOFTAdapter
 */
contract GoodDollarOFTAdapter is OFTCoreUpgradeable, OwnableUpgradeable {
    /// @dev Struct for storing bridge fees
    struct BridgeFees {
        uint256 minFee;
        uint256 maxFee;
        uint256 fee; // Fee in basis points (0-10000, where 10000 = 100%)
    }

    /// @dev The underlying ERC20 token
    IERC20 internal innerToken;
    
    /// @dev The contract responsible for minting and burning tokens
    IMintableBurnable public minterBurner;

    /// @dev Bridge fees configuration
    BridgeFees public bridgeFees;

    /// @dev Address to receive bridge fees
    address public feeRecipient;

    /// @dev Event emitted when bridge fees are updated
    event BridgeFeesSet(uint256 minFee, uint256 maxFee, uint256 fee);

    /// @dev Event emitted when fee recipient is updated
    event FeeRecipientSet(address indexed feeRecipient);

    /// @dev Event emitted when fees are collected
    event FeeCollected(address indexed recipient, uint256 amount);

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
     * @param _lzEndpoint The LayerZero endpoint address (must match constructor)
     * @param _owner The contract owner
     * @param _feeRecipient The address to receive bridge fees (can be address(0) to disable fees)
     */
    function initialize(
        address _token,
        IMintableBurnable _minterBurner,
        address _lzEndpoint,
        address _owner,
        address _feeRecipient
    ) public initializer {
        // Initialize parent contracts
        __OFTCore_init(_owner);
        __Ownable_init(_owner);
        
        // Set state variables
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
     * @return fee The calculated fee amount
     */
    function _takeFee(uint256 amount) internal view returns (uint256 fee) {
        fee = (amount * bridgeFees.fee) / 10000;
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
     * @dev Takes fees similar to MessagePassingBridge: mint (amount - fee) to recipient, mint fee to fee recipient
     */
    function _credit(
        address _to,
        uint256 _amountLD,
        uint32 /* _srcEid */
    ) internal virtual override returns (uint256 amountReceivedLD) {
        if (_to == address(0x0)) _to = address(0xdead); // _mint(...) does not support address(0x0)
        
        // Calculate fee if fee recipient is set and fee is configured
        uint256 fee = 0;
        if (feeRecipient != address(0) && bridgeFees.fee > 0) {
            fee = _takeFee(_amountLD);
        }
        
        // Mint tokens to recipient (amount minus fee)
        uint256 amountToRecipient = _amountLD - fee;
        minterBurner.mint(_to, amountToRecipient);
        
        // Mint fee to fee recipient if fee exists
        if (fee > 0) {
            minterBurner.mint(feeRecipient, fee);
            emit FeeCollected(feeRecipient, fee);
        }
        
        // Return the actual amount received by the recipient (amount minus fee)
        return amountToRecipient;
    }
}