// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import {IAxelarGasService} from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol';
import {AxelarExecutable} from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';
import {StringToAddress, AddressToString} from '@axelar-network/axelar-gmp-sdk-solidity/contracts/utils/AddressString.sol';
import '@openzeppelin/contracts/utils/Strings.sol';

/**
 * @title AxelarHandlerUpgradeable
 * @dev A contract for using axelar for bridging
 */
abstract contract AxelarHandlerUpgradeable is AxelarExecutable {
    using StringToAddress for string;
    using AddressToString for address;

    // An interface for the gas service contract
    IAxelarGasService public immutable gasService;

    //Gap array
    uint256[50] _gap;

    constructor(address gateway, address gasReceiver) AxelarExecutable(gateway) {
        gasService = IAxelarGasService(gasReceiver);
    }

    function _axelarBridgeTo(
        bytes memory payload,
        string memory targetChainId,
        address refundAddress
    ) internal virtual {
        string memory stringAddress = address(this).toString();
        gasService.payNativeGasForContractCall{value: msg.value}(
            address(this),
            targetChainId,
            stringAddress,
            payload,
            refundAddress
        );
        gateway.callContract(targetChainId, stringAddress, payload);
    }

    /**
     * @dev Executes a transfer, override axelar execute
     * @param sourceChain The chain the transfer is coming from
     * @param sourceAddress The address the transfer is coming from
     * @param payload The payload of the transfer
     */
    function _execute(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        // the message should come from same contract on other chains
        address source = sourceAddress.toAddress();
        (address from, address to, uint256 amount, uint256 id) = abi.decode(
            payload,
            (address, address, uint256, uint256)
        );
        _axelarBridgeFrom(sourceChain, source, from, to, amount, id);
    }

    function _axelarBridgeFrom(
        string memory sourceChain,
        address sourceAddress,
        address from,
        address to,
        uint normalizedAmount,
        uint requestId
    ) internal virtual;
}
