pragma solidity ^0.8.0;

interface IConsensus {
    function isValidator(address) external returns (bool);

    function getCurrentCycleEndBlock() external view returns (uint256);

    function getCurrentCycleStartBlock() external view returns (uint256);

    function getValidators() external view returns (address[] memory);
}
