// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import "../oft/GoodDollarOFTAdapter.sol";

/**
 * @dev Test harness that exposes GoodDollarOFTAdapter internal functions for unit testing.
 * This contract must NEVER be deployed in production.
 */
contract GoodDollarOFTAdapterHarness is GoodDollarOFTAdapter {
    constructor(address _token, address _lzEndpoint)
        GoodDollarOFTAdapter(_token, _lzEndpoint)
    {}

    /// @dev Calls internal _lzReceive without the LayerZero endpoint restriction
    function exposed_lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external {
        _lzReceive(_origin, _guid, _message, _executor, _extraData);
    }

    /// @dev Calls internal _credit for isolated fee-collection testing
    function exposed_credit(
        address _to,
        uint256 _amountLD,
        uint32 _srcEid
    ) external returns (uint256) {
        return _credit(_to, _amountLD, _srcEid);
    }

    /// @dev Calls internal _debit to test the pull-and-burn path without a full LayerZero send
    function exposed_debit(
        address _from,
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) external returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        return _debit(_from, _amountLD, _minAmountLD, _dstEid);
    }
}
