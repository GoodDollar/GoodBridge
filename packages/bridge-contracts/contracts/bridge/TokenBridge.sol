// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./BridgeMixedConsensus.sol";
import "../BlockHeaderRegistry.sol";
import "../RLPReader.sol";
import "../RLPParser.sol";
import "../MPT.sol";

import "hardhat/console.sol";

contract TokenBridge is BridgeMixedConsensus {
    address public bridgedToken;
    mapping(address => bool) public sourceBridges;
    bool public isClosed;

    event BridgeRequest(
        address indexed from,
        address indexed to,
        uint256 targetChainId,
        uint256 amount
    );

    event ExecutedTransfer(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 sourceChainId,
        uint256 sourceBlockNumber
    );

    bytes32 public constant BRIDGE_TOPIC =
        keccak256("BridgeRequest(address,address,uint256,uint256)");

    constructor(
        address[] memory _validators,
        uint256 _cycleEnd,
        address[] memory _requiredValidators,
        uint32 _consensusRatio,
        address _bridgedToken
    )
        BridgeMixedConsensus(
            _validators,
            _cycleEnd,
            _requiredValidators,
            _consensusRatio
        )
    {
        bridgedToken = _bridgedToken;
    }

    function setSourceBridges(address[] calldata bridges) external onlyOwner {
        for (uint256 i = 0; i < bridges.length; i++)
            sourceBridges[bridges[i]] = true;
    }

    function bridgeTo(
        address target,
        uint256 targetChainId,
        uint256 amount
    ) external {
        require(isClosed == false, "closed");
        require(
            IERC20(bridgedToken).transferFrom(
                msg.sender,
                address(this),
                amount
            ),
            "transferFrom"
        );
        emit BridgeRequest(msg.sender, target, targetChainId, amount);
    }

    function onTokenTransfer(
        address from,
        uint256 amount,
        bytes calldata data
    ) external {
        require(msg.sender == bridgedToken, "not token");
        require(isClosed == false, "closed");
        (uint256 targetChainId, address target) = abi.decode(
            data,
            (uint256, address)
        );
        emit BridgeRequest(from, target, targetChainId, amount);
    }

    function _executeReceipt(
        uint256 chainId,
        uint256 blockNumber,
        RLPParser.TransactionReceipt memory receipt
    ) internal virtual override returns (bool ok) {
        require(receipt.status == 1, "invalid status");
        bool validLog = false;
        for (uint256 i = 0; i < receipt.logs.length; i++) {
            RLPParser.Log memory log = receipt.logs[i];
            // verify receipt is for bridgedToken transfer event where:
            // emiting contract is a valid sourceBridge
            // where topic is BridgeTransfer
            console.log("log address %s", log.contractAddress);
            console.logBytes32(log.topics[0]);
            if (
                sourceBridges[log.contractAddress] == false ||
                log.topics[0] != BRIDGE_TOPIC
            ) {
                continue;
            }
            //parse targetChainId and amount from data
            (uint256 targetChainId, uint256 amount) = abi.decode(
                log.data,
                (uint256, uint256)
            );
            // uint256 amount = uint256(log.topics[4]);

            require(targetChainId == _chainId(), "targetChainId");
            //get recipient
            address target = address(uint160(uint256(log.topics[2])));
            address from = address(uint160(uint256(log.topics[1])));

            validLog = true;
            require(IERC20(bridgedToken).transfer(target, amount), "transfer");

            emit ExecutedTransfer(from, target, amount, chainId, blockNumber);
        }
        return validLog;
    }

    function _chainId() internal view returns (uint256 chainId) {
        assembly {
            chainId := chainid()
        }
    }

    function closeBridge() external onlyOwner {
        require(
            IERC20(bridgedToken).transfer(
                owner(),
                IERC20(bridgedToken).balanceOf(address(this))
            ),
            "transfer"
        );

        isClosed = true;
    }
}
