import '../bridge/TokenBridge.sol';

contract TokenBridgeTest is TokenBridge {
    uint256 chainId;

    constructor(
        address[] memory _validators,
        uint256 _cycleEnd,
        address[] memory _requiredValidators,
        uint32 _consensusRatio,
        address _bridgedToken,
        BridgeFees memory _fees,
        IFaucet _faucet,
        uint256 _chainIdOverride
    ) TokenBridge(_validators, _cycleEnd, _requiredValidators, _consensusRatio, _bridgedToken, _fees, _faucet) {
        chainId = _chainIdOverride;
    }

    function _chainId() internal view override returns (uint256) {
        return chainId;
    }
}
