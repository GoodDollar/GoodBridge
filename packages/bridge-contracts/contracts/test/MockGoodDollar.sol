// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/**
 * @dev Minimal token implementing mint() and burnFrom() as expected by GoodDollarOFTMinterBurner.
 * burnFrom() respects allowances like standard ERC20Burnable.
 */
contract MockGoodDollar is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external returns (bool) {
        _mint(to, amount);
        return true;
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
