// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

/**
 * @dev Minimal NameService mock compatible with GoodProtocol's DAOContract.
 * DAOContract only requires getAddress(string) to resolve CONTROLLER and GOODDOLLAR.
 */
contract NameServiceMock {
    mapping(bytes32 => address) private addresses;

    function setAddress(string memory key, address value) external {
        addresses[keccak256(bytes(key))] = value;
    }

    function getAddress(string memory key) external view returns (address) {
        return addresses[keccak256(bytes(key))];
    }
}

