// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;
import {INameService} from '@gooddollar/goodprotocol/contracts/utils/DAOUpgradeableContract.sol';
import './IMessagePassingBridge.sol';

interface IIdentity {
    function isWhitelisted(address) external view returns (bool);
}

library BridgeHelperLibrary {
    /**
     * @dev Function for normalizing token amounts to 18 decimals
     * @param amount The amount to normalize
     * @return normalized amount
     */
    function normalizeFromTokenTo18Decimals(uint256 amount, uint8 decimals) external pure returns (uint256 normalized) {
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
    function normalizeFrom18ToTokenDecimals(uint256 amount, uint8 decimals) external pure returns (uint256 normalized) {
        normalized = amount;
        if (decimals < 18) {
            uint256 diff = 18 - decimals;
            normalized = amount / 10 ** diff;
        } else if (decimals > 18) {
            uint256 diff = decimals - 18;
            normalized = amount * 10 ** diff;
        }
    }

    /**
     * @dev Function for checking if a bridge is possible
     * @param from The address of the sender
     * @param amount The amount to bridge
     * @return isWithinLimit Whether the bridge is within the limit
     * @return error The error message, if any
     */
    function canBridge(
        IMessagePassingBridge.BridgeLimits memory bridgeLimits,
        IMessagePassingBridge.AccountLimit memory accountDailyLimit,
        IMessagePassingBridge.BridgeDailyLimit memory bridgeDailyLimit,
        INameService nameService,
        bool isClosed,
        address from,
        uint256 amount
    ) public view returns (bool isWithinLimit, string memory error) {
        if (isClosed) return (false, 'closed');

        if (amount < bridgeLimits.minAmount) return (false, 'minAmount');

        uint256 account24hours = accountDailyLimit.bridged24Hours;
        if (accountDailyLimit.lastTransferReset < block.timestamp - 1 days) {
            account24hours = amount;
        } else {
            account24hours += amount;
        }

        if (bridgeLimits.onlyWhitelisted && address(nameService) != address(0)) {
            IIdentity id = IIdentity(nameService.getAddress('IDENTITY'));
            if (address(id) != address(0))
                if (id.isWhitelisted(from) == false) return (false, 'not whitelisted');
        }

        if (account24hours > bridgeLimits.accountDailyLimit) return (false, 'accountDailyLimit');

        if (amount > bridgeLimits.txLimit) return (false, 'txLimit');

        if (bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days) {
            if (amount > bridgeLimits.dailyLimit) return (false, 'dailyLimit');
        } else {
            if (bridgeDailyLimit.bridged24Hours + amount > bridgeLimits.dailyLimit) return (false, 'dailyLimit');
        }

        return (true, '');
    }
}
