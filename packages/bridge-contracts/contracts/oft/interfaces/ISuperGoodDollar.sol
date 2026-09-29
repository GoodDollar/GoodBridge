// SPDX-License-Identifier: MIT
pragma solidity >=0.8;

/**
 * @title ISuperGoodDollar
 * @notice Interface for GoodDollar token functions used in this project
 * @dev This is a minimal interface containing only the functions actually used
 */
interface ISuperGoodDollar {
    function isMinter(address _minter) external view returns (bool);

    function mint(address to, uint256 amount) external returns (bool);

    function burn(uint256 amount) external;

    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    function addMinter(address _minter) external;
}
