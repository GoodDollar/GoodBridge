// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import '@openzeppelin/contracts/access/Ownable.sol';
// import 'hardhat/console.sol';

import './BridgeCore.sol';

abstract contract BridgeMixedConsensus is BridgeCore, Ownable {
    uint256 public requiredValidatorsSet;

    mapping(address => uint256) public requiredValidators;
    uint32 public numRequiredValidators;

    uint32 public consensusRatio;

    constructor(
        address[] memory _validators,
        uint256 _cycleEnd,
        address[] memory _requiredValidators,
        uint32 _consensusRatio
    ) {
        _setValidators(_validators, _cycleEnd);
        _setRequiredValidators(_requiredValidators);

        consensusRatio = _consensusRatio;
    }

    function _setRequiredValidators(address[] memory validators) internal {
        requiredValidatorsSet++;
        for (uint256 i = 0; i < validators.length; i++) {
            requiredValidators[validators[i]] = requiredValidatorsSet;
        }
        numRequiredValidators = uint32(validators.length);
    }

    function setRequiredValidators(address[] memory validators) public onlyOwner {
        _setRequiredValidators(validators);
    }

    function setConsensusRatio(uint32 _consensusRatio) public onlyOwner {
        consensusRatio = _consensusRatio;
    }

    function isValidConsensus(address[] memory signers) public virtual override returns (bool isValid) {
        uint256 countValid;
        uint256 countRequired;
        for (uint256 i = 0; i < signers.length; i++) {
            for (int256 j = int256(i) - 1; j >= 0; j--) {
                require(signers[i] != signers[uint256(j)], 'dup signer');
            }
            if (currentValidators[signers[i]] == validatorsCycleEnd) {
                countValid++;
            }
            if (requiredValidators[signers[i]] == requiredValidatorsSet) {
                countRequired++;
            }
            if (countRequired == numRequiredValidators && countValid >= ((numValidators * consensusRatio) / 100)) {
                return true;
            }
        }
        // console.log('valid: %s required: %s', countValid, countRequired);

        return false;
    }
}
