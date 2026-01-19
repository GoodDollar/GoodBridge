// SPDX-License-Identifier: MIT
pragma solidity >=0.8;

import {ISuperGoodDollar} from "../superfluid/ISuperGoodDollar.sol";
import "../../utils/DAOUpgradeableContract.sol";

interface IIdentity {
    function isWhitelisted(address) external view returns (bool);
}

/**
 * @title GoodDollarMinterBurner
 * @dev DAO-upgradeable contract that handles minting and burning of GoodDollar tokens for OFT
 * 
 * This contract is used by the GoodDollarOFTAdapter to mint and burn tokens during
 * cross-chain transfers via LayerZero. It is upgradeable and controlled by the DAO.
 * 
 * Key functionalities:
 * - Mint tokens when receiving cross-chain transfers
 * - Burn tokens when sending cross-chain transfers
 * - Manage operators (like OFT adapter) that can mint/burn
 * - Pause functionality for emergency situations
 * - Bridge limits enforcement on receiving side only (minting)
 *   - Limits are enforced when minting tokens (receiving), not when burning (sending)
 *   - This matches MessagePassingBridge behavior where limits are enforced on target minting side
 * - Upgradeable via DAO governance
 */
contract GoodDollarMinterBurner is DAOUpgradeableContract {
    ISuperGoodDollar public token;
    mapping(address => bool) public operators;
    
    bool public paused;

    // Bridge limits structure
    struct BridgeLimits {
        uint256 dailyLimit;
        uint256 txLimit;
        uint256 accountDailyLimit;
        uint256 minAmount;
        bool onlyWhitelisted;
    }

    // Bridge daily limit tracking
    struct BridgeDailyLimit {
        uint256 lastTransferReset;
        uint256 bridged24Hours;
    }

    // Account-specific daily limit tracking
    struct AccountLimit {
        uint256 lastTransferReset;
        uint256 bridged24Hours;
    }

    BridgeLimits public bridgeLimits;
    BridgeDailyLimit public bridgeDailyLimit;
    mapping(address => AccountLimit) public accountsDailyLimit;

    // A mapping for approved requests above limits
    mapping(uint256 => bool) public approvedRequests;

    error BRIDGE_LIMITS(string reason);

    event OperatorSet(address indexed operator, bool status);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event TokensMinted(address indexed to, uint256 amount, address indexed operator);
    event TokensBurned(address indexed from, uint256 amount, address indexed operator);
    event BridgeLimitsSet(
        uint256 dailyLimit,
        uint256 txLimit,
        uint256 accountDailyLimit,
        uint256 minAmount,
        bool onlyWhitelisted
    );
    event RequestApproved(uint256 indexed requestId);
    
    modifier onlyOperators() {
        require(operators[msg.sender] || msg.sender == avatar, "Not authorized");
        require(!paused, "Contract is paused");
        _;
    }
    
    /**
     * @dev Initialize the MinterBurner contract
     * @param _token The address of the GoodDollar token contract
     * @param _nameService The NameService contract for DAO integration
     * @param _limits The initial bridge limits to set
     */
    function initialize(
        ISuperGoodDollar _token,
        INameService _nameService,
        BridgeLimits memory _limits
    ) public initializer {
        require(address(_token) != address(0), "Token address cannot be zero");
        token = _token;
        setDAO(_nameService);
        bridgeLimits = _limits;
    }

    /**
     * @dev Set or remove an operator that can mint/burn tokens
     * @param _operator The address of the operator (e.g., OFT adapter)
     * @param _status True to enable, false to disable
     * 
     * Only the DAO avatar can call this function.
     */
    function setOperator(address _operator, bool _status) external {
        _onlyAvatar();
        operators[_operator] = _status;
        emit OperatorSet(_operator, _status);
    }

    /**
     * @dev Function for setting the bridge limits
     * @param _limits The bridge limits to set
     * 
     * Only the DAO avatar can call this function.
     */
    function setBridgeLimits(BridgeLimits memory _limits) external {
        _onlyAvatar();
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
     * @dev Function for approving requests above limits
     * @param _requestId The request id to approve
     * 
     * Only the DAO avatar can call this function.
     */
    function approveRequest(uint256 _requestId) external {
        _onlyAvatar();
        approvedRequests[_requestId] = true;
        emit RequestApproved(_requestId);
    }

    /**
     * @dev Check if minting is allowed for a given address and amount
     * @param _to The address to mint tokens to
     * @param _amount The amount of tokens to mint
     * @return isWithinLimit Whether the mint is within the limit
     * @return error The error message, if any
     * 
     * Note: Limits are only enforced on the receiving side (minting), not on the sending side (burning).
     */
    function canMint(address _to, uint256 _amount) public view returns (bool isWithinLimit, string memory error) {
        return BridgeHelperLibrary.canBridge(
            bridgeLimits,
            accountsDailyLimit[_to],
            bridgeDailyLimit,
            nameService,
            paused,
            _to,
            _amount
        );
    }

    /**
     * @dev Enforces transfer limits for minting (receiving tokens)
     * @param _to The address to mint tokens to
     * @param _amount The amount of tokens to mint
     * @param _requestId The request ID (0 to skip approval check)
     * 
     * Note: Limits are only enforced on the receiving side (minting), matching MessagePassingBridge behavior.
     * The canMint() function is a public view for checking limits without state changes.
     * This function checks limits AND updates the daily limit counters.
     */
    function _enforceMintLimits(address _to, uint256 _amount, uint256 _requestId) internal {
        // Reset daily limits if needed
        if (bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days) {
            bridgeDailyLimit.lastTransferReset = block.timestamp;
            bridgeDailyLimit.bridged24Hours = 0;
        }

        if (accountsDailyLimit[_to].lastTransferReset < block.timestamp - 1 days) {
            accountsDailyLimit[_to].lastTransferReset = block.timestamp;
            accountsDailyLimit[_to].bridged24Hours = 0;
        }

        // Skip limits for manually approved requests
        if (_requestId > 0 && approvedRequests[_requestId]) {
            // Approved request, skip limit checks but still update counters
            bridgeDailyLimit.bridged24Hours += _amount;
            accountsDailyLimit[_to].bridged24Hours += _amount;
            return;
        }

        // Check limits
        (bool isValid, string memory reason) = canMint(_to, _amount);
        if (!isValid) revert BRIDGE_LIMITS(reason);

        // Update counters
        bridgeDailyLimit.bridged24Hours += _amount;
        accountsDailyLimit[_to].bridged24Hours += _amount;
    }

    /**
     * @dev Burn tokens from an address
     * @param _from The address to burn tokens from
     * @param _amount The amount of tokens to burn
     * @return success True if the burn was successful
     * 
     * Only authorized operators (like OFT adapter) or the DAO avatar can call this.
     * Note: Limits are NOT enforced on the sending side (burning), matching MessagePassingBridge behavior.
     * Limits are only enforced on the receiving side (minting) when tokens are received.
     */
    function burn(address _from, uint256 _amount) external onlyOperators returns (bool) {
        token.burnFrom(_from, _amount);
        
        emit TokensBurned(_from, _amount, msg.sender);
        return true;
    }

    /**
     * @dev Mint tokens to an address
     * @param _to The address to mint tokens to
     * @param _amount The amount of tokens to mint
     * @return success True if the mint was successful
     * 
     * Only authorized operators (like OFT adapter) or the DAO avatar can call this.
     * Limits are enforced on the receiving side (when minting received tokens).
     */
    function mint(address _to, uint256 _amount) external onlyOperators returns (bool) {
        // Enforce limits (requestId = 0 means no approval bypass)
        _enforceMintLimits(_to, _amount, 0);
        
        bool success = token.mint(_to, _amount);
        if (success) {
            emit TokensMinted(_to, _amount, msg.sender);
        }
        return success;
    }

    /**
     * @dev Mint tokens to an address with request ID (for approved requests above limits)
     * @param _to The address to mint tokens to
     * @param _amount The amount of tokens to mint
     * @param _requestId The request ID (if approved, limits are bypassed)
     * @return success True if the mint was successful
     * 
     * Only authorized operators (like OFT adapter) or the DAO avatar can call this.
     * This version allows bypassing limits for pre-approved requests.
     */
    function mintWithRequestId(address _to, uint256 _amount, uint256 _requestId) external onlyOperators returns (bool) {
        // Enforce limits with requestId (approved requests bypass limits)
        _enforceMintLimits(_to, _amount, _requestId);
        
        bool success = token.mint(_to, _amount);
        if (success) {
            emit TokensMinted(_to, _amount, msg.sender);
        }
        return success;
    }

    /**
     * @dev Pause all mint and burn operations
     * 
     * Only the DAO avatar can call this. Useful for emergency situations.
     */
    function pause() external {
        _onlyAvatar();
        require(!paused, "Already paused");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @dev Unpause mint and burn operations
     * 
     * Only the DAO avatar can call this.
     */
    function unpause() external {
        _onlyAvatar();
        require(paused, "Not paused");
        paused = false;
        emit Unpaused(msg.sender);
    }

}