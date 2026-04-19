// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

/**
 * @dev Minimal mock for the GoodProtocol Identity contract.
 * Allows test helpers to control which addresses are considered whitelisted.
 */
contract IdentityMock {
    mapping(address => bool) private _whitelisted;

    function setWhitelisted(address account, bool status) external {
        _whitelisted[account] = status;
    }

    function isWhitelisted(address account) external view returns (bool) {
        return _whitelisted[account];
    }
}
