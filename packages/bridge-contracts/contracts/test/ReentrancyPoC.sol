// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';

interface IERC777RecipientLike {
    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    ) external;
}

interface IFailedRequestApprover {
    function approveFailedRequest(bytes32 guid) external;
}

/**
 * @dev Mimics SuperGoodDollar/SuperToken._mint: the recipient's ERC777 tokensReceived hook is invoked after
 * balances are updated (SuperToken resolves the implementer via ERC1820; here a contract recipient is its own implementer).
 */
contract MockGoodDollarWithMintHook is ERC20 {
    constructor() ERC20('GoodDollar', 'G$') {}

    function mint(address to, uint256 amount) external returns (bool) {
        _mint(to, amount);
        if (to.code.length > 0) {
            IERC777RecipientLike(to).tokensReceived(msg.sender, address(0), to, amount, '', '');
        }
        return true;
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}

contract FailedRequestReentrancyAttacker {
    IFailedRequestApprover public immutable adapter;
    bytes32 public guid;
    uint256 public maxReentries;
    uint256 public reentries;

    constructor(IFailedRequestApprover _adapter) {
        adapter = _adapter;
    }

    function attack(bytes32 _guid, uint256 _maxReentries) external {
        guid = _guid;
        maxReentries = _maxReentries;
        adapter.approveFailedRequest(_guid);
    }

    function tokensReceived(address, address, address, uint256, bytes calldata, bytes calldata) external {
        if (reentries < maxReentries) {
            reentries++;
            adapter.approveFailedRequest(guid);
        }
    }
}
