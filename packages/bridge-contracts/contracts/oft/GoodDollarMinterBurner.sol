// SPDX-License-Identifier: MIT
pragma solidity >=0.8;

import {ISuperGoodDollar} from "./interfaces/ISuperGoodDollar.sol";
import {DAOUpgradeableContract, INameService} from "@gooddollar/goodprotocol/contracts/utils/DAOUpgradeableContract.sol";

/**
 * @title GoodDollarMinterBurner
 * @dev DAO-upgradeable contract that handles minting and burning of GoodDollar tokens for OFT; used by GoodDollarOFTAdapter for cross-chain transfers via LayerZero.
 */
contract GoodDollarMinterBurner is DAOUpgradeableContract {
    ISuperGoodDollar public token;
    mapping(address => bool) public operators;
    
    bool public paused;

    event OperatorSet(address indexed operator, bool status);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event TokensMinted(address indexed to, uint256 amount, address indexed operator);
    event TokensBurned(address indexed from, uint256 amount, address indexed operator);
    
    modifier onlyOperators() {
        require(operators[msg.sender] || msg.sender == avatar, "Not authorized");
        require(!paused, "Contract is paused");
        _;
    }
    
    /**
     * @dev Initialize the MinterBurner contract
     * @param _nameService The NameService contract for DAO integration
     */
    function initialize(
        INameService _nameService
    ) public initializer {
        setDAO(_nameService);
        token = ISuperGoodDollar(address(nativeToken()));
    }

    /**
     * @dev Set or remove an operator that can mint/burn tokens
     * @param _operator The address of the operator (e.g., OFT adapter)
     * @param _status True to enable, false to disable
     */
    function setOperator(address _operator, bool _status) external {
        _onlyAvatar();
        operators[_operator] = _status;
        emit OperatorSet(_operator, _status);
    }


    /**
     * @dev Burn tokens from an address. Limits are not enforced on the sending side (burning); limits are enforced on the receiving side (minting).
     * @param _from The address to burn tokens from
     * @param _amount The amount of tokens to burn
     * @return success True if the burn was successful
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
     */
    function mint(address _to, uint256 _amount) external onlyOperators returns (bool) {
        bool success = token.mint(_to, _amount);
        if (success) {
            emit TokensMinted(_to, _amount, msg.sender);
        }
        return success;
    }

    /**
     * @dev Pause all mint and burn operations (emergency use)
     */
    function pause() external {
        _onlyAvatar();
        require(!paused, "Already paused");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @dev Unpause mint and burn operations
     */
    function unpause() external {
        _onlyAvatar();
        require(paused, "Not paused");
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}