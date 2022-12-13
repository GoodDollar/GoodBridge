// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import './BridgeMixedConsensus.sol';

// import 'hardhat/console.sol';

interface IFaucet {
    function canTop(address) external returns (bool);

    function topWallet(address) external;
}

interface INameService {
    function getAddress(string memory) external returns (address);
}

interface IIdentity {
    function isWhitelisted(address) external returns (bool);
}

contract TokenBridge is BridgeMixedConsensus {
    struct BridgeFees {
        uint256 minFee;
        uint256 maxFee;
        uint256 fee;
    }

    struct BridgeLimits {
        uint256 dailyLimit;
        uint256 txLimit;
        uint256 accountDailyLimit;
        uint256 minAmount;
        bool onlyWhitelisted;
    }

    struct AccountLimit {
        uint256 lastTransferReset;
        uint256 bridged24Hours;
    }

    struct BridgeDailyLimit {
        uint256 lastTransferReset;
        uint256 bridged24Hours;
    }

    struct Stats {
        uint128 totalBridged;
        uint128 totalRelayFees;
        uint128 totalBridgeFees;
    }

    mapping(uint256 => Stats) public chainIdToStats;

    mapping(uint256 => bool) public executedRequests;

    address public bridgedToken;

    // 0 means soureBridge no longer valid. other wise accept only receipts with block number of source chain > blockstart
    mapping(address => uint256) public sourceBridgeToBlockstart;

    bool public isClosed;

    BridgeFees public bridgeFees;

    BridgeLimits public bridgeLimits;

    BridgeDailyLimit public bridgeDailyLimit;

    mapping(address => AccountLimit) public accountsDailyLimit;

    IFaucet public faucet;

    INameService public nameService;

    uint256 public currentId;

    event BridgeRequest(
        address indexed from,
        address indexed to,
        uint256 targetChainId,
        uint256 amount,
        bool withRelay,
        uint256 timestamp,
        uint256 indexed id
    );

    bytes32 public constant BRIDGE_TOPIC =
        keccak256('BridgeRequest(address,address,uint256,uint256,bool,uint256,uint256)');

    event ExecutedTransfer(
        address indexed from,
        address indexed to,
        address relayer,
        uint256 amount,
        uint256 fee,
        uint256 sourceChainId,
        uint256 sourceBlockNumber,
        uint256 indexed id
    );

    constructor(
        address[] memory _validators,
        uint256 _cycleEnd,
        address[] memory _requiredValidators,
        uint32 _consensusRatio,
        address _bridgedToken,
        BridgeFees memory _fees,
        BridgeLimits memory _limits,
        IFaucet _faucet,
        INameService _nameService
    ) BridgeMixedConsensus(_validators, _cycleEnd, _requiredValidators, _consensusRatio) {
        bridgedToken = _bridgedToken;
        bridgeFees = _fees;
        bridgeLimits = _limits;
        faucet = _faucet;
        nameService = _nameService;
    }

    // start block is enforced per source contract
    function chainStartBlock(uint256) public view virtual override returns (uint256 bridgeStartBlock) {
        return 1;
    }

    function setBridgeLimits(BridgeLimits memory _limits) external onlyOwner {
        bridgeLimits = _limits;
    }

    function setBridgeFees(BridgeFees memory _fees) external onlyOwner {
        bridgeFees = _fees;
    }

    function setFaucet(IFaucet _faucet) external onlyOwner {
        faucet = _faucet;
    }

    function setSourceBridges(address[] calldata bridges, uint256[] calldata blockstart) external onlyOwner {
        for (uint256 i = 0; i < bridges.length; i++) sourceBridgeToBlockstart[bridges[i]] = blockstart[i];
    }

    function canBridge(address from, uint256 amount) public returns (bool isWithinLimit, string memory error) {
        if (isClosed) return (false, 'closed');

        if (amount < bridgeLimits.minAmount) return (false, 'minAmount');

        if (bridgeLimits.onlyWhitelisted && address(nameService) != address(0)) {
            IIdentity id = IIdentity(nameService.getAddress('IDENTITY'));
            if (address(id) != address(0))
                if (id.isWhitelisted(from) == false) return (false, 'not whitelisted');
        }

        if (amount > bridgeLimits.txLimit) return (false, 'txLimit');

        if (bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days) {} else {
            if (bridgeDailyLimit.bridged24Hours + amount > bridgeLimits.dailyLimit) return (false, 'dailyLimit');
        }

        uint256 account24hours = accountsDailyLimit[from].bridged24Hours;
        if (accountsDailyLimit[from].lastTransferReset < block.timestamp - 1 days) {
            account24hours = amount;
        } else {
            account24hours += amount;
        }
        if (account24hours > bridgeLimits.accountDailyLimit) return (false, 'accountDailyLimit');

        return (true, '');
    }

    function bridgeToWithoutRelay(
        address target,
        uint256 targetChainId,
        uint256 amount
    ) external {
        _bridgeTo(msg.sender, target, targetChainId, amount, false, false);
    }

    function bridgeTo(
        address target,
        uint256 targetChainId,
        uint256 amount
    ) external {
        _bridgeTo(msg.sender, target, targetChainId, amount, true, false);
    }

    function withdraw(address token) external onlyOwner {
        require(IERC20(token).transfer(msg.sender, IERC20(token).balanceOf(address(this))), 'transfer');
    }

    function closeBridge(address token) external onlyOwner {
        require(IERC20(token).transfer(msg.sender, IERC20(token).balanceOf(address(this))), 'transfer');

        isClosed = true;
    }

    function onTokenTransfer(
        address from,
        uint256 amount,
        bytes calldata data
    ) external returns (bool) {
        require(msg.sender == bridgedToken, 'not token');
        (uint256 targetChainId, address target, bool withoutRelay) = abi.decode(data, (uint256, address, bool));
        _bridgeTo(from, target, targetChainId, amount, !withoutRelay, true);
        return true;
    }

    function _enforceLimits(
        address from,
        address target,
        uint256 amount,
        uint256 targetChainId
    ) internal virtual {
        require(target != address(0), 'invalid target');
        require(targetChainId > 0, 'invalid targetChainId');

        if (bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days) {
            bridgeDailyLimit.lastTransferReset = block.timestamp;
            bridgeDailyLimit.bridged24Hours = 0;
        }

        if (accountsDailyLimit[from].lastTransferReset < block.timestamp - 1 days) {
            accountsDailyLimit[from].lastTransferReset = block.timestamp;
            accountsDailyLimit[from].bridged24Hours = 0;
        }
        (bool isValid, string memory reason) = canBridge(from, amount);
        require(isValid, reason);

        bridgeDailyLimit.bridged24Hours += amount;
        accountsDailyLimit[from].bridged24Hours += amount;
    }

    function _bridgeTo(
        address from,
        address target,
        uint256 targetChainId,
        uint256 amount,
        bool relay,
        bool isOnTokenTransfer
    ) internal {
        _enforceLimits(from, target, amount, targetChainId);

        if (isOnTokenTransfer == false)
            require(IERC20(bridgedToken).transferFrom(from, address(this), amount), 'transferFrom');
        emit BridgeRequest(
            from,
            target,
            targetChainId,
            amount,
            relay,
            block.timestamp,
            uint256(
                keccak256(
                    abi.encode(
                        from,
                        target,
                        _chainId(),
                        targetChainId,
                        amount,
                        address(this),
                        block.timestamp,
                        currentId++
                    )
                )
            )
        );
    }

    function _takeFee(uint256 amount, bool isRelay) internal view returns (uint256 bridgeFee, uint256 relayFee) {
        uint256 baseFee = (amount * bridgeFees.fee) / 10000;
        baseFee = baseFee >= bridgeFees.minFee ? baseFee : bridgeFees.minFee;
        baseFee = baseFee <= bridgeFees.maxFee ? baseFee : bridgeFees.maxFee;
        baseFee /= 2;

        return (baseFee, isRelay ? baseFee : 0);
    }

    function _executeReceipt(
        uint256 chainId,
        uint256 receiptBlockNumber,
        RLPParser.TransactionReceipt memory receipt
    ) internal virtual override returns (bool ok) {
        if (receipt.status != 1) return false;
        bool validLog = false;
        // console.log('receipt logs %s', receipt.logs.length);
        for (uint256 i = 0; i < receipt.logs.length; i++) {
            RLPParser.Log memory log = receipt.logs[i];
            // verify receipt is for bridgedToken transfer event where:
            // emiting contract is a valid sourceBridge
            // where topic is BridgeTransfer
            // console.log('log address %s', log.contractAddress);
            // console.logBytes32(log.topics[0]);
            if (sourceBridgeToBlockstart[log.contractAddress] > receiptBlockNumber) continue;

            if (sourceBridgeToBlockstart[log.contractAddress] == 0 || log.topics[0] != BRIDGE_TOPIC) {
                continue;
            }
            // console.log('receipt found log index %s', i);
            //parse targetChainId and amount from data
            else {
                (uint256 targetChainId, uint256 amount, bool withRelay) = abi.decode(
                    log.data,
                    (uint256, uint256, bool)
                );

                // console.log('executeReceipt token: %s %s %s', targetChainId, amount, withRelay);

                if (targetChainId != _chainId()) continue;

                validLog = true;

                //get recipient
                _bridgeTransfer(
                    address(uint160(uint256(log.topics[1]))), // from - stack to deep
                    address(uint160(uint256(log.topics[2]))), // to - stack to deep
                    amount,
                    chainId,
                    receiptBlockNumber,
                    withRelay,
                    uint256(log.topics[3])
                ); //added internal function for stack too deep
            }
        }

        return validLog;
    }

    function _bridgeTransfer(
        address from,
        address target,
        uint256 amount,
        uint256 sourceChainId,
        uint256 sourceBlockNumber,
        bool withRelay,
        uint256 id
    ) internal {
        (uint256 bridgeFee, uint256 relayFee) = _takeFee(
            amount,
            withRelay && msg.sender != target && msg.sender != from
        );
        uint256 fee = bridgeFee + relayFee;

        // chainIdToTotalRelayFees[sourceChainId] += relayFee;
        // chainIdToTotalBridgeFees[sourceChainId] += bridgeFee;
        // chainIdToTotalBridged[sourceChainId] += amount;

        //make it easier to find out for relayers about the status
        executedRequests[id] = true;
        _topGas(target);

        require(IERC20(bridgedToken).transfer(target, amount - fee), 'transfer');
        if (relayFee > 0) require(IERC20(bridgedToken).transfer(msg.sender, relayFee), 'relayFee');

        emit ExecutedTransfer(from, target, msg.sender, amount, fee, sourceChainId, sourceBlockNumber, id);
    }

    function _topGas(address target) internal {
        if (address(faucet) != address(0) && faucet.canTop(target)) {
            try faucet.topWallet(target) {} catch {}
        }
    }

    function _chainId() internal view virtual returns (uint256 chainId) {
        assembly {
            chainId := chainid()
        }
    }
}
