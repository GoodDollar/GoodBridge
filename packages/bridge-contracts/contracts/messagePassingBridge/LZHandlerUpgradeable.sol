// SPDX-License-Identifier: MIT

pragma solidity ^0.8.2;

import '@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol';
import '@layerzerolabs/solidity-examples/contracts/contracts-upgradable/lzApp/NonblockingLzAppUpgradeable.sol';

abstract contract LZHandlerUpgradeable is Initializable, NonblockingLzAppUpgradeable {
    using BytesLib for bytes;

    error INVALID_SENDER(bytes _srcAddress);
    error INVALID_ENDPOINT(address lzEndpoint);

    function __LZHandlerUpgradeable_init(address _lzEndpoint) internal onlyInitializing {
        __Ownable_init_unchained();
        __LzAppUpgradeable_init_unchained(_lzEndpoint);
    }

    function __LZHandlerUpgradeable_init_unchained() internal onlyInitializing {}

    //override lzReceive for simpler trustedRemote handling
    function lzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64 _nonce,
        bytes calldata _payload
    ) public virtual override {
        // lzReceive must be called by the endpoint for security
        if (_msgSender() != address(lzEndpoint)) revert INVALID_ENDPOINT(_msgSender());

        bytes memory trustedRemote = abi.encodePacked(address(this), address(this)); //we assume all bridges have same address
        // if will still block the message pathway from (srcChainId, srcAddress). should not receive message from untrusted remote.
        if (
            _srcAddress.length != trustedRemote.length ||
            trustedRemote.length == 0 ||
            keccak256(_srcAddress) != keccak256(trustedRemote)
        ) revert INVALID_SENDER(_srcAddress);

        _blockingLzReceive(_srcChainId, _srcAddress, _nonce, _payload);
    }

    function estimateSendFee(
        uint16 _dstChainId,
        address _fromAddress,
        address _toAddress,
        uint _normalizedAmount,
        bool _useZro,
        bytes calldata _adapterParams
    ) public view virtual returns (uint nativeFee, uint zroFee) {
        bytes memory payload = abi.encode(_fromAddress, _toAddress, _normalizedAmount, 0); //fake request id as 0, just for fee estimation, shouldnt make a difference
        return lzEndpoint.estimateFees(_dstChainId, address(this), payload, _useZro, _adapterParams);
    }

    function _nonblockingLzReceive(
        uint16 _srcChainId,
        bytes memory /*_srcAddress*/,
        uint64 _nonce,
        bytes memory _payload
    ) internal virtual override {
        (address from, address to, uint normalizedAmount, uint requestId) = abi.decode(
            _payload,
            (address, address, uint, uint)
        );

        address sourceAddress = address(this); //lzreceive already validates sourceAddress

        _lzBridgeFrom(_srcChainId, sourceAddress, _nonce, from, to, normalizedAmount, requestId);
    }

    function _lzBridgeTo(
        bytes memory _payload,
        uint16 _dstChainId,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes memory _adapterParams
    ) internal virtual {
        trustedRemoteLookup[_dstChainId] = abi.encodePacked(address(this), address(this)); //make sure we are a trusted remote, tokens will be sent to same contract address on target chain
        _lzSend(_dstChainId, _payload, _refundAddress, _zroPaymentAddress, _adapterParams, msg.value);
    }

    function _lzBridgeFrom(
        uint16 _srcChainId,
        address _srcAddress,
        uint64 _nonce,
        address _from,
        address _to,
        uint _normalizedAmount,
        uint _requestId
    ) internal virtual;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint[49] private __gap;
}
