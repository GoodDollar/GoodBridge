// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';

import './BridgeMixedConsensus.sol';

// import 'hardhat/console.sol';

interface IFaucet {
    function canTop(address) external returns (bool);

    function topWallet(address) external;
}

interface INameService {
    function getAddress(string memory) external view returns (address);
}

interface IIdentity {
    function isWhitelisted(address) external view returns (bool);
}

contract SimpleBridge is Initializable, UUPSUpgradeable, BridgeMixedConsensus {
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
    mapping(address => uint256) private _sourceBridgeToBlockstart;

    bool public isClosed;

    BridgeFees public bridgeFees;

    BridgeLimits public bridgeLimits;

    BridgeDailyLimit public bridgeDailyLimit;

    mapping(address => AccountLimit) public accountsDailyLimit;

    IFaucet public faucet;

    INameService public nameService;

    uint256 public currentId;

    address public admin;

    mapping(uint256 => uint256) public lastChainExecutedBlock;
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

    function initialize(
        address _bridgedToken,
        BridgeFees memory _fees,
        BridgeLimits memory _limits,
        IFaucet _faucet,
        INameService _nameService
    ) public virtual initializer {
        bridgedToken = _bridgedToken;
        bridgeFees = _fees;
        bridgeLimits = _limits;
        faucet = _faucet;
        nameService = _nameService;
        admin = owner();
    }

    function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {}

    modifier onlyAdmin() {
        require(msg.sender == owner() || msg.sender == admin, 'not owner or admin');
        _;
    }

    function setAdmin(address _admin) public onlyOwner {
        admin = _admin;
    }

    // start block is enforced per source contract
    function chainStartBlock(uint256) public view virtual override returns (uint256 bridgeStartBlock) {
        return 1;
    }

    function setBridgeLimits(BridgeLimits memory _limits) external onlyAdmin {
        bridgeLimits = _limits;
    }

    function setBridgeFees(BridgeFees memory _fees) external onlyAdmin {
        bridgeFees = _fees;
    }

    function setFaucet(IFaucet _faucet) external onlyAdmin {
        faucet = _faucet;
    }

    function canBridge(address from, uint256 amount) public view returns (bool isWithinLimit, string memory error) {
        if (isClosed) return (false, 'closed');

        if (amount < bridgeLimits.minAmount) return (false, 'minAmount');

        if (amount > bridgeLimits.txLimit) return (false, 'txLimit');

        if (bridgeLimits.onlyWhitelisted && address(nameService) != address(0)) {
            IIdentity id = IIdentity(nameService.getAddress('IDENTITY'));
            if (address(id) != address(0))
                if (id.isWhitelisted(from) == false) return (false, 'not whitelisted');
        }

        uint256 account24hours = accountsDailyLimit[from].bridged24Hours;
        if (accountsDailyLimit[from].lastTransferReset < block.timestamp - 1 days) {
            account24hours = amount;
        } else {
            account24hours += amount;
        }

        // account limit only makes sense if we are using whitelisted, otherwise it is easy to by pass
        if (account24hours > bridgeLimits.accountDailyLimit) return (false, 'accountDailyLimit');

        if (bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days) {
            if (amount > bridgeLimits.dailyLimit) return (false, 'dailyLimit');
        } else {
            if (bridgeDailyLimit.bridged24Hours + amount > bridgeLimits.dailyLimit) return (false, 'dailyLimit');
        }

        return (true, '');
    }

    function bridgeTo(address target, uint256 targetChainId, uint256 amount) external {
        _bridgeTo(msg.sender, target, targetChainId, amount, true, false);
    }

    function withdraw(address token, uint256 amount) external onlyAdmin {
        if (amount == 0) amount = IERC20(token).balanceOf(address(this));
        require(IERC20(token).transfer(msg.sender, amount), 'transfer');
    }

    function closeBridge(address token) external onlyAdmin {
        require(IERC20(token).transfer(msg.sender, IERC20(token).balanceOf(address(this))), 'transfer');

        isClosed = true;
    }

    function onTokenTransfer(address from, uint256 amount, bytes calldata data) external returns (bool) {
        require(msg.sender == bridgedToken, 'not token');
        (uint256 targetChainId, address target, bool withoutRelay) = abi.decode(data, (uint256, address, bool));
        _bridgeTo(from, target, targetChainId, amount, !withoutRelay, true);
        return true;
    }

    function normalizeFromTokenTo18Decimals(uint256 amount) public view returns (uint256 normalized) {
        uint8 decimals = IERC20Metadata(bridgedToken).decimals();
        if (decimals < 18) {
            uint256 diff = 18 - decimals;
            normalized = amount * 10 ** diff;
        } else if (decimals > 18) {
            uint256 diff = decimals - 18;
            normalized = amount / 10 ** diff;
        } else normalized = amount;
    }

    function normalizeFrom18ToTokenDecimals(uint256 amount) public view returns (uint256 normalized) {
        uint8 decimals = IERC20Metadata(bridgedToken).decimals();
        if (decimals < 18) {
            uint256 diff = 18 - decimals;
            normalized = amount / 10 ** diff;
        } else if (decimals > 18) {
            uint256 diff = decimals - 18;
            normalized = amount * 10 ** diff;
        } else normalized = amount;
    }

    function _enforceLimits(address from, address target, uint256 amount, uint256 targetChainId) internal virtual {
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
        uint256 normalizedAmount = normalizeFromTokenTo18Decimals(amount); //on bridge request we normalize amount from source chain decimals to 18 decimals
        emit BridgeRequest(
            from,
            target,
            targetChainId,
            normalizedAmount,
            relay,
            block.timestamp,
            uint256(
                keccak256(
                    abi.encode(
                        from,
                        target,
                        _chainId(),
                        targetChainId,
                        normalizedAmount,
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

    function executeRequest(
        address from,
        address target,
        uint256 amount,
        uint256 sourceChainId,
        uint256 sourceBlockNumber,
        bool withRelay,
        uint256 id
    ) public onlyAdmin returns (bool ok) {
        //get recipient
        require(executedRequests[id] == false, 'already executed');
        _bridgeTransfer(from, target, amount, sourceChainId, sourceBlockNumber, withRelay, id); //added internal function for stack too deep
        lastChainExecutedBlock[sourceChainId] = sourceBlockNumber;
        return true;
    }

    function _executeReceipt(
        uint256 chainId,
        uint256 blockNumber,
        RLPParser.TransactionReceipt memory receipt
    ) internal virtual override returns (bool ok) {
        return true;
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
        uint256 normalizedAmount = normalizeFrom18ToTokenDecimals(amount); //on transfer we normalize the request which is in 18 decimals back to local chain token decimals
        (uint256 bridgeFee, uint256 relayFee) = _takeFee(
            normalizedAmount,
            withRelay && msg.sender != target && msg.sender != from
        );
        uint256 fee = bridgeFee + relayFee;

        // chainIdToTotalRelayFees[sourceChainId] += relayFee;
        // chainIdToTotalBridgeFees[sourceChainId] += bridgeFee;
        // chainIdToTotalBridged[sourceChainId] += normalizedAmount;

        //make it easier to find out for relayers about the status
        executedRequests[id] = true;
        _topGas(target);

        require(IERC20(bridgedToken).transfer(target, normalizedAmount - fee), 'transfer');
        if (relayFee > 0) require(IERC20(bridgedToken).transfer(msg.sender, relayFee), 'relayFee');

        emit ExecutedTransfer(from, target, msg.sender, normalizedAmount, fee, sourceChainId, sourceBlockNumber, id);
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
