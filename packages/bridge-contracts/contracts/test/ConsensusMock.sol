pragma solidity ^0.8.0;

import "../fuse/IConsensus.sol";

contract ConsensusMock is IConsensus {
    mapping(address => bool) public override isValidator;
    address[] public currentValidators;

    constructor(address[] memory signers) {
        for (uint8 i = 0; i < signers.length; i++)
            isValidator[signers[i]] = true;
        currentValidators = signers;
    }

    function getCurrentCycleEndBlock() public view returns (uint256) {
        return block.number + 100;
    }

    function getCurrentCycleStartBlock() public view returns (uint256) {
        return block.number;
    }

    /**
     * @dev Function which returns the current validator addresses
     */
    function getValidators() external view returns (address[] memory) {
        return currentValidators;
    }
}
