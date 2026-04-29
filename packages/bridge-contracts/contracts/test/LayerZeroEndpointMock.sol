// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

/**
 * @dev Placeholder contract to provide a non-zero endpoint address for OFT adapter constructor.
 * Tests that revert before LayerZero calls do not require any endpoint logic.
 */
contract LayerZeroEndpointMock {
    // OAppCoreUpgradeable expects endpoint.setDelegate(_delegate) during initialization.
    function setDelegate(address) external {}
}

