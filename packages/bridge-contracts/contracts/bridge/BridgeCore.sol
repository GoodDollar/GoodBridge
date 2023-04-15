// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '../blockRegistry/BlockHeaderRegistry.sol';
import '../utils/RLPReader.sol';
import '../utils/RLPParser.sol';
import '../utils/MPT.sol';

// import 'hardhat/console.sol';

abstract contract BridgeCore {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;
    using MPT for MPT.MerkleProof;

    struct SignedBlock {
        uint256 chainId;
        bytes rlpHeader;
        bytes[] signatures;
        uint256 cycleEnd;
        address[] validators;
    }

    struct BlockHeader {
        bytes32 parentHash;
        uint256 number;
    }

    struct BlockReceiptProofs {
        MPT.MerkleProof[] receiptProofs;
        bytes blockHeaderRlp;
        uint256 blockNumber;
    }

    mapping(uint256 => mapping(uint256 => bytes32)) public chainVerifiedBlocks; //chainId => (blockNumber => blockHash)

    mapping(address => uint256) public currentValidators;

    mapping(bytes32 => bool) public usedReceipts;

    uint256 public numValidators;

    uint256 public validatorsCycleEnd;

    uint256[16] private _gap;

    event BlockVerified(uint256 chainId, uint256 blockNumber, bytes32 blockHash);
    event ValidatorsSet(address[] validators, uint256 cycleEnd);

    function isValidConsensus(address[] memory signers) public virtual returns (bool isValid);

    function chainStartBlock(uint256 chainId) public view virtual returns (uint256 bridgeStartBlock);

    function _executeReceipt(
        uint256 chainId,
        uint256 blockNumber,
        RLPParser.TransactionReceipt memory receipt
    ) internal virtual returns (bool ok);

    function submitBlocks(SignedBlock[] memory signedBlocks) public {
        for (uint256 i = 0; i < signedBlocks.length; i++) {
            SignedBlock memory _block = signedBlocks[i];
            bytes32 rlpHeaderHash = keccak256(_block.rlpHeader);
            bool isFuse = _block.chainId == 122;
            bytes32 payload = keccak256(
                abi.encodePacked(rlpHeaderHash, _block.chainId, _block.validators, _block.cycleEnd)
            );
            address[] memory signers = new address[](_block.signatures.length);
            for (uint256 j = 0; j < _block.signatures.length; j++) {
                (bytes32 r, bytes32 vs) = abi.decode(_block.signatures[j], (bytes32, bytes32));
                signers[j] = ECDSA.recover(ECDSA.toEthSignedMessageHash(payload), r, vs);
            }
            require(isValidConsensus(signers), 'invalid signers');

            //save the verified block
            uint256 blockNumber = RLPParser.getBlockNumber(_block.chainId, _block.rlpHeader);
            require(blockNumber >= chainStartBlock(_block.chainId), 'block too old');

            chainVerifiedBlocks[_block.chainId][blockNumber] = rlpHeaderHash;

            //update the validators set
            if (isFuse && _block.validators.length > 0 && blockNumber >= validatorsCycleEnd) {
                _setValidators(_block.validators, _block.cycleEnd);
            }

            emit BlockVerified(_block.chainId, blockNumber, rlpHeaderHash);
        }
    }

    function _setValidators(address[] memory validators, uint256 cycleEnd) internal {
        for (uint256 i = 0; i < validators.length; i++) {
            currentValidators[validators[i]] = cycleEnd;
        }
        validatorsCycleEnd = cycleEnd;
        numValidators = validators.length;
        emit ValidatorsSet(validators, cycleEnd);
    }

    function executeReceipts(
        uint256 chainId,
        BlockReceiptProofs[] calldata blocks
    ) public virtual returns (string[][] memory results) {
        results = new string[][](blocks.length);
        for (uint256 i = 0; i < blocks.length; i++) {
            BlockReceiptProofs memory blockReceipts = blocks[i];
            bytes32 blockHash = chainVerifiedBlocks[chainId][blockReceipts.blockNumber];
            require(keccak256(blockReceipts.blockHeaderRlp) == blockHash, 'invalid block hash');
            bytes32 receiptRoot = RLPParser.getBlockReceiptsRoot(chainId, blockReceipts.blockHeaderRlp);
            results[i] = new string[](blockReceipts.receiptProofs.length);
            for (uint256 j = 0; j < blockReceipts.receiptProofs.length; j++) {
                bytes32 receiptKey = keccak256(
                    abi.encode(chainId, blockHash, blockReceipts.receiptProofs[j].expectedValue)
                );

                //skip receipt if already redeemed (to not revert in case of front running)
                if (usedReceipts[receiptKey] == true) {
                    results[i][j] = 'receipt already used';
                    continue;
                }

                usedReceipts[receiptKey] = true;

                require(
                    blockReceipts.receiptProofs[j].keyIndex == 0 && blockReceipts.receiptProofs[j].proofIndex == 0,
                    'not start index'
                );
                require(blockReceipts.receiptProofs[j].expectedRoot == receiptRoot, 'receiptRoot mismatch');
                require(blockReceipts.receiptProofs[j].verifyTrieProof(), 'receipt not in block');
                require(chainStartBlock(chainId) <= blockReceipts.blockNumber, 'receipt too old');

                bool executed = _executeReceipt(
                    chainId,
                    blockReceipts.blockNumber,
                    RLPParser.toReceipt(blockReceipts.receiptProofs[j].expectedValue)
                );
                results[i][j] = executed ? 'executed' : 'execute failed';
            }
        }
    }

    function verifyParentBlocks(
        uint256 chainId,
        uint256 childBlockNumber,
        bytes[] calldata parentRlpHeaders,
        bytes calldata childRlpHeader
    ) public {
        bytes32 childHash = chainVerifiedBlocks[chainId][childBlockNumber];
        require(childHash == keccak256(childRlpHeader), 'invalid child rlpHeader');
        (, bytes32 childParentHash) = RLPParser.getBlockParentAndNumber(chainId, childRlpHeader);
        for (uint256 i = 0; i < parentRlpHeaders.length; i++) {
            bytes32 parentHash = keccak256(parentRlpHeaders[i]);
            require(childParentHash == parentHash, 'not parent');
            (uint256 parentBlockNumber, bytes32 parentParentHash) = RLPParser.getBlockParentAndNumber(
                chainId,
                parentRlpHeaders[i]
            );
            require(parentBlockNumber >= chainStartBlock(chainId), 'block too old');
            require(
                chainVerifiedBlocks[chainId][parentBlockNumber] == bytes32(0) ||
                    chainVerifiedBlocks[chainId][parentBlockNumber] == parentHash,
                'already verified'
            );
            chainVerifiedBlocks[chainId][parentBlockNumber] = parentHash;
            childParentHash = parentParentHash;
            emit BlockVerified(chainId, parentBlockNumber, parentHash);
        }
    }

    function submitChainBlockParentsAndTxs(
        SignedBlock calldata blockData,
        uint256 signedBlockNumber,
        bytes[] calldata parentRlpHeaders,
        BlockReceiptProofs[] calldata txs
    ) public {
        if (blockData.signatures.length > 0) {
            SignedBlock[] memory arr = new SignedBlock[](1);
            arr[0] = blockData;
            submitBlocks(arr);
        }
        if (parentRlpHeaders.length > 0)
            verifyParentBlocks(blockData.chainId, signedBlockNumber, parentRlpHeaders, blockData.rlpHeader);
        executeReceipts(blockData.chainId, txs);
    }
}
