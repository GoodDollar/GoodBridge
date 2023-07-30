// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

library BridgeHelperLibrary {
    /**
     * @dev Function for normalizing token amounts to 18 decimals
     * @param amount The amount to normalize
     * @return normalized amount
     */
    function normalizeFromTokenTo18Decimals(uint256 amount, uint8 decimals) internal pure returns (uint256 normalized) {
        normalized = amount;
        if (decimals < 18) {
            uint256 diff = 18 - decimals;
            normalized = amount * 10 ** diff;
        } else if (decimals > 18) {
            uint256 diff = decimals - 18;
            normalized = amount / 10 ** diff;
        }
    }

    /**
     * @dev Function for normalizing token amounts from 18 decimals
     * @param amount The amount to normalize
     * @return normalized amount
     */
    function normalizeFrom18ToTokenDecimals(uint256 amount, uint8 decimals) internal pure returns (uint256 normalized) {
        normalized = amount;
        if (decimals < 18) {
            uint256 diff = 18 - decimals;
            normalized = amount / 10 ** diff;
        } else if (decimals > 18) {
            uint256 diff = decimals - 18;
            normalized = amount * 10 ** diff;
        } else normalized = amount;
    }
}
