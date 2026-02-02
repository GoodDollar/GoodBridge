// SPDX-License-Identifier: MIT

// pragma solidity >=0.8;
// import {IGoodDollar} from "@gooddollar/goodprotocol/contracts/Interfaces.sol";
/**
 * @title ISuperGoodDollar
 * @notice Interface for GoodDollar token functions used in this project
 * @dev This is a minimal interface containing only the functions actually used
 */
interface ISuperGoodDollar {
	function isMinter(address _minter) external view returns (bool);

	function mint(address to, uint256 amount) external returns (bool);

	function burnFrom(address account, uint256 amount) external;

	function addMinter(address _minter) external;
}
