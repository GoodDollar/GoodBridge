// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

contract ControllerMock {
    address public avatar;

    constructor(address _avatar) {
        avatar = _avatar;
    }

    function setAvatar(address _avatar) external {
        avatar = _avatar;
    }
}

