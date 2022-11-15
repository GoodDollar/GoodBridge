// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '../blockRegistry/BlockHeaderRegistry.sol';
import '../utils/RLPReader.sol';
import '../utils/RLPParser.sol';
import '../utils/MPT.sol';

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

    function isValidConsensus(address[] memory signers) public virtual returns (bool isValid);

    function chainStartBlock(uint256 chainId) public virtual returns (uint256 bridgeStartBlock);

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
            BlockHeader memory blockHeader = parseRLPToHeader(_block.rlpHeader);
            require(blockHeader.number >= chainStartBlock(_block.chainId), 'block too old');

            chainVerifiedBlocks[_block.chainId][blockHeader.number] = rlpHeaderHash;

            //update the validators set
            if (isFuse && _block.validators.length > 0 && blockHeader.number >= validatorsCycleEnd) {
                _setValidators(_block.validators, _block.cycleEnd);
            }
        }
    }

    function _setValidators(address[] memory validators, uint256 cycleEnd) internal {
        for (uint256 i = 0; i < validators.length; i++) {
            currentValidators[validators[i]] = cycleEnd;
        }
        validatorsCycleEnd = cycleEnd;
        numValidators = validators.length;
    }

    function executeReceipts(uint256 chainId, BlockReceiptProofs[] calldata blocks) public virtual {
        for (uint256 i = 0; i < blocks.length; i++) {
            BlockReceiptProofs memory blockReceipts = blocks[i];
            bytes32 blockHash = chainVerifiedBlocks[chainId][blockReceipts.blockNumber];
            require(keccak256(blockReceipts.blockHeaderRlp) == blockHash, 'invalid block hash');
            RLPReader.RLPItem[] memory ls = blockReceipts.blockHeaderRlp.toRlpItem().toList();
            bytes32 receiptRoot = bytes32(ls[5].toUint());
            for (uint256 j = 0; j < blockReceipts.receiptProofs.length; j++) {
                bytes32 receiptKey = keccak256(
                    abi.encode(chainId, blockHash, blockReceipts.receiptProofs[j].expectedValue)
                );
                require(usedReceipts[receiptKey] == false, 'receipt already used');
                usedReceipts[receiptKey] = true;
                require(
                    blockReceipts.receiptProofs[j].keyIndex == 0 && blockReceipts.receiptProofs[j].proofIndex == 0,
                    'not start index'
                );
                require(blockReceipts.receiptProofs[j].expectedRoot == receiptRoot, 'receiptRoot mismatch');
                require(blockReceipts.receiptProofs[j].verifyTrieProof(), 'receipt not in block');
                require(chainStartBlock(chainId) <= blockReceipts.blockNumber, 'receipt too old');
                require(
                    _executeReceipt(
                        chainId,
                        blockReceipts.blockNumber,
                        RLPParser.toReceipt(blockReceipts.receiptProofs[j].expectedValue)
                    ),
                    'execute failed'
                );
            }
        }
    }

    function parseRLPToHeader(bytes memory rlpHeader) public pure returns (BlockHeader memory header) {
        RLPReader.RLPItem[] memory ls = rlpHeader.toRlpItem().toList();
        header.parentHash = bytes32(ls[0].toUint());
        // header.root = bytes32(ls[3].toUint());
        // header.txHash = bytes32(ls[4].toUint());
        // header.receiptHash = bytes32(ls[5].toUint());
        // header.bloom = ls[6].toBytes();
        header.number = ls[8].toUint();
    }

    function verifyParentBlocks(
        uint256 chainId,
        uint256 childBlockNumber,
        bytes[] calldata parentRlpHeaders,
        bytes calldata childRlpHeader
    ) public {
        bytes32 childHash = chainVerifiedBlocks[chainId][childBlockNumber];
        require(childHash == keccak256(childRlpHeader), 'invalid child rlpHeader');
        BlockHeader memory child = parseRLPToHeader(childRlpHeader);
        for (uint256 i = 0; i < parentRlpHeaders.length; i++) {
            bytes32 parentHash = keccak256(parentRlpHeaders[i]);
            require(child.parentHash == parentHash, 'not parent');
            BlockHeader memory parent = parseRLPToHeader(parentRlpHeaders[i]);
            require(parent.number >= chainStartBlock(chainId), 'block too old');
            require(
                chainVerifiedBlocks[chainId][parent.number] == bytes32(0) ||
                    chainVerifiedBlocks[chainId][parent.number] == parentHash,
                'already verified'
            );
            chainVerifiedBlocks[chainId][parent.number] = parentHash;
            child = parent;
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
