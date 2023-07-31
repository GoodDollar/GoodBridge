// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;
import '@gooddollar/goodprotocol/contracts/utils/ProxyFactory1967.sol'; //imported so it is compiled and available in hardhat deploy
import {IAxelarGateway} from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol';
import {IAxelarGasService} from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol';
import {DAOUpgradeableContract, INameService} from '@gooddollar/goodprotocol/contracts/utils/DAOUpgradeableContract.sol';
import {AxelarExecutable} from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';
import {StringToAddress, AddressToString} from '@axelar-network/axelar-gmp-sdk-solidity/contracts/utils/AddressString.sol';
import {AccessControlUpgradeable} from '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts/utils/Strings.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import './LZHandlerUpgradeable.sol';
import './AxelarHandlerUpgradeable.sol';
import './BridgeHelperLibrary.sol';

interface IFaucet {
    function canTop(address) external view returns (bool);

    function topWallet(address) external;
}

interface IIdentity {
    function isWhitelisted(address) external view returns (bool);
}

interface IMinter {
    function mint(address to, uint256 amount) external returns (bool);
}

/**
 * @title MessagePassingBridge
 * @dev A contract for bridging assets between chains
 */
contract MessagePassingBridge is DAOUpgradeableContract, LZHandlerUpgradeable, AxelarHandlerUpgradeable {
    using StringToAddress for string;
    using AddressToString for address;

    enum BridgeService {
        AXELAR,
        LZ
    }

    address public immutable lzEndpoint_;
    bool public immutable TESTNET;

    // // A constant for the guardian role
    // bytes32 public constant GUARDIAN_ROLE = keccak256('GUARDIAN_ROLE');

    // An error message for when the contract is already initialized
    error AlreadyInitialized();

    // An error message for when the caller is not a guardian
    error NOT_GUARDIAN(address sender);

    error WRONG_TOKEN(address token);
    error INVALID_TARGET_OR_CHAINID(address target, uint256 chainId);
    error BRIDGE_LIMITS(string);
    error TRANSFER_FROM();
    error TRANSFER();
    error ALREADY_EXECUTED(uint256 requestId);
    error MISSING_FEE();
    error UNSUPPORTED_CHAIN(uint256 chainId);
    error LZ_FEE(uint256 required, uint256 sent);

    // An event emitted when a bridge request is made
    event BridgeRequest(
        address indexed from,
        address indexed to,
        uint256 targetChainId,
        uint256 normalizedAmount,
        uint256 timestamp,
        BridgeService bridge,
        uint256 indexed id
    );

    // An event emitted when a transfer is executed
    event ExecutedTransfer(
        address indexed from,
        address indexed to,
        uint256 normalizedAmount,
        uint256 fee,
        uint256 sourceChainId,
        BridgeService bridge,
        uint256 indexed id
    );

    event FalseSender(uint256 sourceChainId, address sourceAddress);

    // A struct for storing bridge fees
    struct BridgeFees {
        uint256 minFee;
        uint256 maxFee;
        uint256 fee;
    }

    // A struct for storing bridge limits
    struct BridgeLimits {
        uint256 dailyLimit;
        uint256 txLimit;
        uint256 accountDailyLimit;
        uint256 minAmount;
        bool onlyWhitelisted;
    }

    // A struct for storing account limits
    struct AccountLimit {
        uint256 lastTransferReset;
        uint256 bridged24Hours;
    }

    // A struct for storing bridge daily limits
    struct BridgeDailyLimit {
        uint256 lastTransferReset;
        uint256 bridged24Hours;
    }

    address public guardian;

    // A mapping for executed requests
    mapping(uint256 => bool) public executedRequests;

    // A mapping for disabled source bridges (key is hash(sourceChainId,bridgeservice))
    mapping(bytes32 => bool) public disabledSourceBridges;

    // A boolean for whether the bridge is closed
    bool public isClosed;

    // A variable for storing bridge fees
    BridgeFees public bridgeFees;

    // A variable for storing bridge limits
    BridgeLimits public bridgeLimits;

    // A variable for storing bridge daily limits
    BridgeDailyLimit public bridgeDailyLimit;

    // A mapping for storing account limits
    mapping(address => AccountLimit) public accountsDailyLimit;

    // An interface for the faucet contract
    IFaucet public faucet;

    // A variable for storing the current ID
    uint256 public currentId;

    mapping(uint256 => uint16) public lzChainIdsMapping;

    address public feeRecipient;
    /**
     * @dev Modifier that allows only the owner or guardian to call a function
     */
    modifier onlyOwnerOrGuardian() {
        if ((guardian == msg.sender || avatar == msg.sender || owner() == msg.sender) == false)
            revert NOT_GUARDIAN(msg.sender);
        _;
    }

    /**
     * @dev Constructor function for the AxelarBridge contract
     * @param axlGateway The address of the gateway contract
     * @param axlGasReceiver The address of the gas receiver contract
     */
    constructor(
        address axlGateway,
        address axlGasReceiver,
        address lzEndpoint,
        bool isTestnet
    ) AxelarHandlerUpgradeable(axlGateway, axlGasReceiver) {
        lzEndpoint_ = lzEndpoint;
        TESTNET = isTestnet;
    }

    function _authorizeUpgrade(address impl) internal virtual override onlyOwner {}

    /**
     * @dev Function for initializing the contract
     * @param nameService The address of the name service contract
     */
    function initialize(
        INameService nameService,
        BridgeLimits memory limits,
        BridgeFees memory fees
    ) public initializer {
        setDAO(nameService);
        __LZHandlerUpgradeable_init(lzEndpoint_);
        guardian = msg.sender;
        transferOwnership(avatar);
        bridgeLimits = limits;
        bridgeFees = fees;
        feeRecipient = nameService.getAddress('UBISCHEME');
        if (feeRecipient == address(0)) feeRecipient = avatar;
    }

    /**
     * @dev Function for setting the fee recipient
     * @param recipient The fee recipient to set
     */
    function setFeeRecipient(address recipient) external onlyOwnerOrGuardian {
        feeRecipient = recipient;
    }

    /**
     * @dev Function for setting the bridge limits
     * @param limits The bridge limits to set
     */
    function setBridgeLimits(BridgeLimits memory limits) external onlyOwnerOrGuardian {
        bridgeLimits = limits;
    }

    /**
     * @dev Function for setting the bridge fees
     * @param fees The bridge fees to set
     */
    function setBridgeFees(BridgeFees memory fees) external onlyOwnerOrGuardian {
        bridgeFees = fees;
    }

    function setDisabledBridges(bytes32[] memory bridgeKeys, bool[] memory disabled) external onlyOwnerOrGuardian {
        for (uint256 i = 0; i < bridgeKeys.length; i++) disabledSourceBridges[bridgeKeys[i]] = disabled[i];
    }

    /**
     * @dev Function for setting the faucet contract
     * @param _faucet The faucet contract to set
     */
    function setFaucet(IFaucet _faucet) external onlyOwnerOrGuardian {
        faucet = _faucet;
    }

    /**
     * @dev Function for setting the guardian contract
     * @param _guardian The guardian to set
     */
    function setGuardian(address _guardian) external onlyOwnerOrGuardian {
        guardian = _guardian;
    }

    /**
     * @dev Function for checking if a bridge is possible
     * @param from The address of the sender
     * @param amount The amount to bridge
     * @return isWithinLimit Whether the bridge is within the limit
     * @return error The error message, if any
     */
    function canBridge(address from, uint256 amount) public view returns (bool isWithinLimit, string memory error) {
        if (isClosed) return (false, 'closed');

        if (amount < bridgeLimits.minAmount) return (false, 'minAmount');

        uint256 account24hours = accountsDailyLimit[from].bridged24Hours;
        if (accountsDailyLimit[from].lastTransferReset < block.timestamp - 1 days) {
            account24hours = amount;
        } else {
            account24hours += amount;
        }

        if (bridgeLimits.onlyWhitelisted && address(nameService) != address(0)) {
            IIdentity id = IIdentity(nameService.getAddress('IDENTITY'));
            if (address(id) != address(0))
                if (id.isWhitelisted(from) == false) return (false, 'not whitelisted');
        }

        if (account24hours > bridgeLimits.accountDailyLimit) return (false, 'accountDailyLimit');

        if (amount > bridgeLimits.txLimit) return (false, 'txLimit');

        if (bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days) {} else {
            if (bridgeDailyLimit.bridged24Hours + amount > bridgeLimits.dailyLimit) return (false, 'dailyLimit');
        }

        return (true, '');
    }

    /**
     * @dev Function for withdrawing tokens
     * @param token The address of the token to withdraw
     * @param amount The amount to withdraw
     */
    function withdraw(address token, uint256 amount) external onlyOwner {
        if (amount == 0) amount = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(msg.sender, amount);
    }

    /**
     * @dev Function for pausing the bridge
     * @param isPaused Whether to pause the bridge or not
     */
    function pauseBridge(bool isPaused) external onlyOwnerOrGuardian {
        isClosed = isPaused;
    }

    /**
     * @dev Function for handling token transfers
     * @param from The address of the sender
     * @param amount The amount to transfer
     * @param data The data to decode of format (uint256 targetChainId, address target, BridgeService bridge, bytes memory lzAdapterParams)
     * @return Whether the transfer was successful or not
     */
    function onTokenTransfer(address from, uint256 amount, bytes calldata data) external payable returns (bool) {
        if (msg.sender != address(nativeToken())) revert WRONG_TOKEN(msg.sender);

        (uint256 targetChainId, address target, BridgeService bridge, bytes memory lzAdapterParams) = abi.decode(
            data,
            (uint256, address, BridgeService, bytes)
        );

        _bridgeTo(from, target, targetChainId, amount, true, bridge, lzAdapterParams);
        return true;
    }

    /**
     * @dev Enforces transfer limits and checks if the transfer is valid
     * @param from The address to transfer from
     * @param target The address to transfer to
     * @param amount The amount to transfer
     * @param targetChainId The chain ID of the target chain
     */
    function _enforceLimits(address from, address target, uint256 amount, uint256 targetChainId) internal virtual {
        if (target == address(0) || targetChainId == 0) revert INVALID_TARGET_OR_CHAINID(target, targetChainId);

        if (bridgeDailyLimit.lastTransferReset < block.timestamp - 1 days) {
            bridgeDailyLimit.lastTransferReset = block.timestamp;
            bridgeDailyLimit.bridged24Hours = 0;
        }

        if (accountsDailyLimit[from].lastTransferReset < block.timestamp - 1 days) {
            accountsDailyLimit[from].lastTransferReset = block.timestamp;
            accountsDailyLimit[from].bridged24Hours = 0;
        }
        (bool isValid, string memory reason) = canBridge(from, amount);
        if (isValid == false) revert BRIDGE_LIMITS(reason);

        bridgeDailyLimit.bridged24Hours += amount;
        accountsDailyLimit[from].bridged24Hours += amount;
    }

    function bridgeTo(address target, uint256 targetChainId, uint256 amount, BridgeService bridge) external payable {
        _bridgeTo(msg.sender, target, targetChainId, amount, false, bridge, '');
    }

    function bridgeToWithLz(address target, uint256 targetChainId, uint256 amount) external payable {
        _bridgeTo(msg.sender, target, targetChainId, amount, false, BridgeService.LZ, '');
    }

    function bridgeToWithLzAdapterParams(
        address target,
        uint256 targetChainId,
        uint256 amount,
        bytes calldata adapterParams
    ) external payable {
        _bridgeTo(msg.sender, target, targetChainId, amount, false, BridgeService.LZ, adapterParams);
    }

    function bridgeToWithAxelar(address target, uint256 targetChainId, uint256 amount) external payable {
        _bridgeTo(msg.sender, target, targetChainId, amount, false, BridgeService.AXELAR, '');
    }

    /**
     * @dev Bridges tokens from one chain to another, this performs burning or locking
     * @param from The address to bridge tokens from
     * @param target The address to bridge tokens to
     * @param targetChainId The chain ID of the target chain
     * @param amount The amount of tokens to bridge
     * @param isOnTokenTransfer Whether the transfer is on token transfer
     */
    function _bridgeTo(
        address from,
        address target,
        uint256 targetChainId,
        uint256 amount,
        bool isOnTokenTransfer,
        BridgeService bridge,
        bytes memory lzAdapterParams
    ) internal {
        if (isClosed) revert BRIDGE_LIMITS('closed');

        if (isOnTokenTransfer == false) {
            // lock on mainnet, burn on other chains
            if (_chainId() == 1 || _chainId() == 5) {
                if (nativeToken().transferFrom(from, address(this), amount) == false) revert TRANSFER_FROM();
            } else nativeToken().burnFrom(from, amount);
        }
        //ontokentransfer we already have the tokens, so burn them
        else {
            if (_chainId() != 1 && _chainId() != 5) nativeToken().burn(amount);
        }

        uint256 normalizedAmount = BridgeHelperLibrary.normalizeFromTokenTo18Decimals(amount, nativeToken().decimals()); //on bridge request we normalize amount from source chain decimals to 18 decimals

        if (msg.value == 0) revert MISSING_FEE();

        uint256 requestId = uint256(keccak256(abi.encode(address(this), _chainId(), currentId++)));
        bytes memory payload = abi.encode(from, target, normalizedAmount, requestId);

        if (bridge == BridgeService.AXELAR) {
            string memory chainId = _toAxelarChainId(targetChainId);
            if (bytes(chainId).length == 0) revert UNSUPPORTED_CHAIN(targetChainId);
            _axelarBridgeTo(payload, chainId);
        } else if (bridge == BridgeService.LZ) {
            uint16 chainId = _toLzChainId(targetChainId);
            if (chainId == 0) revert UNSUPPORTED_CHAIN(targetChainId);
            (uint256 nativeFee, ) = estimateSendFee(chainId, from, target, normalizedAmount, false, lzAdapterParams);
            if (nativeFee > msg.value) revert LZ_FEE(nativeFee, msg.value);
            _lzBridgeTo(payload, chainId, payable(from), address(0), lzAdapterParams);
        }

        emit BridgeRequest(from, target, targetChainId, normalizedAmount, block.timestamp, bridge, requestId);
    }

    /**
     * @dev Takes a fee from the amount being transferred
     * @param amount The amount being transferred
     * @return fee amount
     */
    function _takeFee(uint256 amount) internal view returns (uint256 fee) {
        fee = (amount * bridgeFees.fee) / 10000;
    }

    /**
     * we override the callback that is triggered when a message is received
     * @param sourceChainId the source chain
     * @param sourceAddress the source contract
     * @param from sender
     * @param to recipient
     * @param normalizedAmount amount in 18 decimals
     * @param requestId request id
     */
    function _axelarBridgeFrom(
        string memory sourceChainId,
        address sourceAddress,
        address from,
        address to,
        uint256 normalizedAmount,
        uint256 requestId
    ) internal virtual override {
        uint256 chainId = _fromAxelarChainId(sourceChainId);
        if (sourceAddress != address(this)) {
            emit FalseSender(chainId, sourceAddress);
            return;
        }
        _bridgeFrom(from, to, normalizedAmount, chainId, requestId, BridgeService.AXELAR);
    }

    /**
     * we override the callback that is triggered when a message is received
     * @param sourceChainId source chain
     * @param sourceAddress source contract
     * @param from sender
     * @param to recipient
     * @param normalizedAmount amount in 18 decimals
     * @param requestId request id
     */
    function _lzBridgeFrom(
        uint16 sourceChainId,
        address sourceAddress,
        uint64 /*nonce*/,
        address from,
        address to,
        uint256 normalizedAmount,
        uint256 requestId
    ) internal virtual override {
        uint256 chainId = _fromLzChainId(sourceChainId);
        if (sourceAddress != address(this)) {
            emit FalseSender(chainId, sourceAddress);
            return;
        }
        _bridgeFrom(from, to, normalizedAmount, chainId, requestId, BridgeService.LZ);
    }

    /**
     * @dev Bridges tokens from one chain to another, this performs minting or unlock
     * @param from The address to bridge tokens from
     * @param target The address to bridge tokens to
     * @param normalizedAmount The amount of tokens to bridge
     * @param sourceChainId The chain ID of the source chain
     * @param id The ID of the transfer
     */
    function _bridgeFrom(
        address from,
        address target,
        uint256 normalizedAmount,
        uint256 sourceChainId,
        uint256 id,
        BridgeService bridge
    ) internal {
        if (_toLzChainId(sourceChainId) == 0) revert UNSUPPORTED_CHAIN(sourceChainId);
        if (disabledSourceBridges[keccak256(abi.encode(sourceChainId, bridge))])
            revert BRIDGE_LIMITS('source disabled');

        if (executedRequests[id]) revert ALREADY_EXECUTED(id);

        _enforceLimits(from, target, normalizedAmount, _chainId());
        uint256 tokenAmount = BridgeHelperLibrary.normalizeFrom18ToTokenDecimals(
            normalizedAmount,
            nativeToken().decimals()
        ); //on transfer we normalize the request which is in 18 decimals back to local chain token decimals

        uint256 fee = _takeFee(tokenAmount);

        //make it easier to find out for relayers about the status
        executedRequests[id] = true;
        _topGas(target);

        //unlock on mainnet mint on other chains
        if (_chainId() == 1 || _chainId() == 5) {
            if (nativeToken().transfer(target, tokenAmount - fee) == false) revert TRANSFER();
            if (fee > 0) nativeToken().burn(fee);
        } else {
            IMinter(nameService.getAddress('MINTBURN_WRAPPER')).mint(target, tokenAmount - fee);
            if (fee > 0) IMinter(nameService.getAddress('MINTBURN_WRAPPER')).mint(feeRecipient, fee);
        }

        emit ExecutedTransfer(from, target, normalizedAmount, fee, sourceChainId, bridge, id);
    }

    /**
     * @dev Tops up gas for a wallet
     * @param target The address of the wallet to top up gas for
     */
    function _topGas(address target) internal {
        if (address(faucet) != address(0) && faucet.canTop(target)) {
            try faucet.topWallet(target) {} catch {}
        }
    }

    /**
     * @dev Gets the chain ID of the current chain
     * @return chainId The chain ID
     */
    function _chainId() internal view virtual returns (uint256 chainId) {
        assembly {
            chainId := chainid()
        }
    }

    function _toLzChainId(uint256 chainId) internal pure returns (uint16 lzChainId) {
        if (chainId == 1) return 10001;
        if (chainId == 5) return 10121;
        if (chainId == 42220) return 125;
        if (chainId == 44787) return 10125;
        if (chainId == 122) return 138;
    }

    function _fromLzChainId(uint16 lzChainId) internal pure returns (uint256 chainId) {
        if (lzChainId == 10001) return 1;
        if (lzChainId == 10121) return 5;
        if (lzChainId == 125) return 42220;
        if (lzChainId == 10125) return 44787;
        if (lzChainId == 138) return 122;
    }

    function _toAxelarChainId(uint256 chainId) internal pure returns (string memory axlChainId) {
        if (chainId == 1) return 'Ethereum';
        if (chainId == 5) return 'ethereum-2';
        if (chainId == 42220) return 'celo';
        if (chainId == 44787) return 'celo';
    }

    function _fromAxelarChainId(string memory axlChainId) internal view returns (uint256 chainId) {
        bytes32 chainHash = keccak256(bytes(axlChainId));
        if (chainHash == keccak256('Ethereum')) return 1;
        if (chainHash == keccak256('ethereum-2')) return 5;
        if (chainHash == keccak256('celo'))
            if (TESTNET) return 44787;
            else return 42220;
    }
}
