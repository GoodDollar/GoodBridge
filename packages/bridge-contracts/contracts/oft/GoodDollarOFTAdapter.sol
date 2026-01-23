// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import { IERC20, IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { OFTCoreUpgradeable } from "@layerzerolabs/oft-evm-upgradeable/contracts/oft/OFTCoreUpgradeable.sol";
import { IMintableBurnable } from "@layerzerolabs/oft-evm/contracts/interfaces/IMintableBurnable.sol";

/**
 * @title GoodDollarOFTAdapter
 * @notice Upgradeable OFT adapter that uses mint/burn mechanisms for cross-chain transfers
 * @dev Inherits from OFTCoreUpgradeable (which already includes OwnableUpgradeable) and implements mint/burn logic similar to MintBurnOFTAdapter
 */
contract GoodDollarOFTAdapter is OFTCoreUpgradeable {
    /// @dev The underlying ERC20 token
    IERC20 internal innerToken;
    
    /// @dev The contract responsible for minting and burning tokens
    IMintableBurnable public minterBurner;

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
}