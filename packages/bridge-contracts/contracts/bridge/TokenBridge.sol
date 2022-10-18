// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import './BridgeMixedConsensus.sol';

// import "hardhat/console.sol";

interface IFaucet {
    function canTop(address) external returns (bool);

    function topWallet(address) external;
}

contract TokenBridge is BridgeMixedConsensus {
    struct BridgeFees {
        uint256 minFee;
        uint256 maxFee;
        uint256 fee;
    }

    address public bridgedToken;
    mapping(address => bool) public sourceBridges;
    bool public isClosed;

    BridgeFees public bridgeFees;

    IFaucet public faucet;

    event BridgeRequest(address indexed from, address indexed to, uint256 targetChainId, uint256 amount);

    event ExecutedTransfer(
        address indexed from,
        address indexed to,
        address indexed relayer,
        uint256 amount,
        uint256 fee,
        uint256 sourceChainId,
        uint256 sourceBlockNumber
    );

    bytes32 public constant BRIDGE_TOPIC = keccak256('BridgeRequest(address,address,uint256,uint256)');

    constructor(
        address[] memory _validators,
        uint256 _cycleEnd,
        address[] memory _requiredValidators,
        uint32 _consensusRatio,
        address _bridgedToken,
        BridgeFees memory _fees,
        IFaucet _faucet
    ) BridgeMixedConsensus(_validators, _cycleEnd, _requiredValidators, _consensusRatio) {
        bridgedToken = _bridgedToken;
        bridgeFees = _fees;
        faucet = _faucet;
    }

    function setBridgeFees(BridgeFees memory _fees) external onlyOwner {
        bridgeFees = _fees;
    }

    function setFaucet(IFaucet _faucet) external onlyOwner {
        faucet = _faucet;
    }

    function setSourceBridges(address[] calldata bridges) external onlyOwner {
        for (uint256 i = 0; i < bridges.length; i++) sourceBridges[bridges[i]] = true;
    }

    function bridgeTo(
        address target,
        uint256 targetChainId,
        uint256 amount
    ) external {
        require(isClosed == false, 'closed');
        require(IERC20(bridgedToken).transferFrom(msg.sender, address(this), amount), 'transferFrom');
        emit BridgeRequest(msg.sender, target, targetChainId, amount);
    }

    function onTokenTransfer(
        address from,
        uint256 amount,
        bytes calldata data
    ) external {
        require(msg.sender == bridgedToken, 'not token');
        require(isClosed == false, 'closed');
        (uint256 targetChainId, address target) = abi.decode(data, (uint256, address));
        emit BridgeRequest(from, target, targetChainId, amount);
    }

    function _takeFee(uint256 amount) internal view returns (uint256 baseFee) {
        baseFee = (amount * bridgeFees.fee) / 10000;
        baseFee = baseFee >= bridgeFees.minFee ? baseFee : bridgeFees.minFee;
        baseFee = baseFee <= bridgeFees.maxFee ? baseFee : bridgeFees.maxFee;
    }

    function _executeReceipt(
        uint256 chainId,
        uint256 blockNumber,
        RLPParser.TransactionReceipt memory receipt
    ) internal virtual override returns (bool ok) {
        require(receipt.status == 1, 'invalid status');
        bool validLog = false;
        for (uint256 i = 0; i < receipt.logs.length; i++) {
            RLPParser.Log memory log = receipt.logs[i];
            // verify receipt is for bridgedToken transfer event where:
            // emiting contract is a valid sourceBridge
            // where topic is BridgeTransfer
            // console.log('log address %s', log.contractAddress);
            // console.logBytes32(log.topics[0]);
            if (sourceBridges[log.contractAddress] == false || log.topics[0] != BRIDGE_TOPIC) {
                continue;
            }
            //parse targetChainId and amount from data
            (uint256 targetChainId, uint256 amount) = abi.decode(log.data, (uint256, uint256));

            require(targetChainId == _chainId(), 'targetChainId');
            validLog = true;

            //get recipient
            address target = address(uint160(uint256(log.topics[2])));
            address from = address(uint160(uint256(log.topics[1])));
            _bridgeTransfer(from, target, amount, chainId, blockNumber); //added internal function for stack too deep
        }

        return validLog;
    }

    function _bridgeTransfer(
        address from,
        address target,
        uint256 amount,
        uint256 sourceChainId,
        uint256 sourceBlockNumber
    ) internal {
        uint256 fee;
        if (msg.sender != target && msg.sender != from) {
            fee = _takeFee(amount);
        }

        require(IERC20(bridgedToken).transfer(target, amount - fee), 'transfer');
        _topGas(target);

        emit ExecutedTransfer(from, target, msg.sender, amount - fee, fee, sourceChainId, sourceBlockNumber);
    }

    function _topGas(address target) internal {
        if (address(faucet) != address(0) && faucet.canTop(target)) {
            try faucet.topWallet(target) {} catch {}
        }
    }

    function _chainId() internal view returns (uint256 chainId) {
        assembly {
            chainId := chainid()
        }
    }

    function closeBridge() external onlyOwner {
        require(IERC20(bridgedToken).transfer(owner(), IERC20(bridgedToken).balanceOf(address(this))), 'transfer');

        isClosed = true;
    }
}
