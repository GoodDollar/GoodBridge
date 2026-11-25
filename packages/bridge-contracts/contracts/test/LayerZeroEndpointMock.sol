// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

/**
 * @dev Placeholder contract to provide a non-zero endpoint address for OFT adapter constructor.
 * Tests that revert before LayerZero calls do not require any endpoint logic, beyond the compose
 * dispatch a replayed composed message performs.
 */
contract LayerZeroEndpointMock {
    /// @dev Records the compose payload the OFT dispatches for a composed message.
    event ComposeSent(address indexed from, address indexed to, bytes32 indexed guid, uint16 index, bytes message);

    mapping(bytes32 => bytes) public composeQueue;

    // OAppCoreUpgradeable expects endpoint.setDelegate(_delegate) during initialization.
    function setDelegate(address) external {}

    function sendCompose(address _to, bytes32 _guid, uint16 _index, bytes calldata _message) external {
        bytes32 key = keccak256(abi.encodePacked(msg.sender, _to, _guid, _index));
        require(composeQueue[key].length == 0, "LZ_ComposeExists");
        composeQueue[key] = _message;
        emit ComposeSent(msg.sender, _to, _guid, _index, _message);
    }
}

