// SPDX-License-Identifier: MIT
pragma solidity >=0.8;
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
        BridgeLimits memory _limits,
        IFaucet _faucet,
        INameService _nameService,
        uint256 _chainIdOverride
    ) {
        initialize(
            _validators,
            _cycleEnd,
            _requiredValidators,
            _consensusRatio,
            _bridgedToken,
            _fees,
            _limits,
            _faucet,
            _nameService
        );
        chainId = _chainIdOverride;
    }

    function _chainId() internal view override returns (uint256) {
        return chainId;
    }
}
