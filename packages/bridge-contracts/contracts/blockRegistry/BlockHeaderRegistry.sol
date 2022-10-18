// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '../fuse/IConsensus.sol';
import '../utils/RLPReader.sol';

// import 'hardhat/console.sol';

/**

	The purpose of this contract is to store on Fuse block headers 
	from different blockchains signed by the Fuse validators.

**/
contract BlockHeaderRegistry {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    struct Signature {
        bytes32 r;
        bytes32 vs;
    }

    struct SignedBlock {
        bytes[] signatures;
        // Just for fuse
        uint256 cycleEnd;
        address[] validators;
        bytes32 blockHash;
    }

    struct BlockHeader {
        bytes32 blockHash;
        bytes32 parentHash;
        bytes32 uncleHash;
        address coinbase;
        bytes32 root;
        bytes32 txHash;
        bytes32 receiptHash;
        bytes bloom;
        uint256 difficulty;
        uint256 number;
        uint256 gasLimit;
        uint256 gasUsed;
        uint256 time;
        bytes mixDigest;
        uint256 nonce;
        uint256 baseFee;
        bytes extra;
    }

    struct Block {
        bytes rlpHeader;
        Signature signature;
        uint256 chainId;
        bytes32 blockHash;
        uint256 cycleEnd;
        address[] validators;
    }

    struct Blockchain {
        string rpc;
        uint256 chainId;
    }

    // To prevent double signatures
    mapping(bytes32 => mapping(address => bool)) public hasValidatorSigned;

    // Block hashes per block number for blockchain
    mapping(uint256 => mapping(uint256 => bytes32[])) public blockHashes;

    // Validator signatures per blockHash
    mapping(bytes32 => SignedBlock) public signedBlocks;

    Blockchain[] public enabledBlockchains;

    address public immutable voting;
    address public immutable consensus;

    event BlockchainAdded(uint256 chainId, string rpc);
    event BlockchainRemoved(uint256 chainId);
    event BlockAdded(
        address indexed validator,
        uint256 indexed chainId,
        bytes32 indexed rlpHeaderHash,
        address[] validators,
        uint256 cycleEnd
    );

    constructor(address _voting, address _consensus) {
        voting = _voting;
        consensus = _consensus;
    }

    modifier onlyVoting() {
        require(msg.sender == voting, 'onlyVoting');
        _;
    }

    function addBlockchain(uint256 chainId, string memory rpc) external onlyVoting {
        uint256 len = enabledBlockchains.length;
        for (uint256 i = 0; i < len; i++) {
            if (enabledBlockchains[i].chainId == chainId) {
                //delete
                if (bytes(rpc).length == 0) {
                    if (i + 1 < len) {
                        enabledBlockchains[i] = enabledBlockchains[len - 1];
                    }
                    enabledBlockchains.pop();
                    emit BlockchainRemoved(chainId);
                    return;
                }
                enabledBlockchains[i].rpc = rpc;
                emit BlockchainAdded(chainId, rpc);
                return;
            }
        }
        Blockchain memory toAdd;
        toAdd.chainId = chainId;
        toAdd.rpc = rpc;
        enabledBlockchains.push(toAdd);
        emit BlockchainAdded(chainId, rpc);
    }

    modifier onlyValidator() {
        require(_isValidator(msg.sender), 'onlyValidator');
        _;
    }

    function getRPCs() external view returns (Blockchain[] memory) {
        return enabledBlockchains;
    }

    /**
		@notice Add a signed block from any blockchain.
		@notice Costs slightly more if the block has never been registered before.
		@notice Processes fuse blocks slightly differently.
		@param blocks List of block headers and signatures to add.
	*/
    function addSignedBlocks(Block[] calldata blocks) external onlyValidator {
        for (uint256 i = 0; i < blocks.length; i++) {
            Block calldata _block = blocks[i];
            bytes32 rlpHeaderHash = keccak256(_block.rlpHeader);
            require(rlpHeaderHash == _block.blockHash, 'rlpHeaderHash');
            bool isFuse = _isFuse(_block.chainId);
            bytes32 payload = keccak256(
                abi.encodePacked(_block.blockHash, _block.chainId, _block.validators, _block.cycleEnd)
            );
            // console.logBytes32(payload);
            address signer = ECDSA.recover(
                ECDSA.toEthSignedMessageHash(payload),
                _block.signature.r,
                _block.signature.vs
            );
            require(msg.sender == signer, 'msg.sender == signer');

            if (hasValidatorSigned[payload][msg.sender]) continue;

            hasValidatorSigned[payload][signer] = true;

            if (_isNewBlock(payload)) {
                uint256 blockNumber = parseRLPBlockNumber(_block.rlpHeader);
                blockHashes[_block.chainId][blockNumber].push(payload);

                if (isFuse && _block.validators.length > 0) {
                    signedBlocks[payload].validators = _block.validators;
                    signedBlocks[payload].cycleEnd = _block.cycleEnd;
                }
                signedBlocks[payload].blockHash = rlpHeaderHash;
            }

            signedBlocks[payload].signatures.push(abi.encode(_block.signature.r, _block.signature.vs));
            emit BlockAdded(msg.sender, _block.chainId, rlpHeaderHash, _block.validators, _block.cycleEnd);
        }
    }

    function getSignedBlock(uint256 chainId, uint256 number) public view returns (SignedBlock memory signedBlock) {
        bytes32[] memory _payloadHashes = blockHashes[chainId][number];
        require(_payloadHashes.length != 0, '_blockHashes.length');
        bytes32 payloadHash = _payloadHashes[0];
        uint256 _signatures = signedBlocks[payloadHash].signatures.length;
        for (uint256 i = 1; i < _payloadHashes.length; i++) {
            uint256 _sigs = signedBlocks[_payloadHashes[i]].signatures.length;
            if (_sigs > _signatures) {
                _signatures = _sigs;
                payloadHash = _payloadHashes[i];
            }
        }
        signedBlock = signedBlocks[payloadHash];
    }

    function getBlockHashByPayloadHash(bytes32 payloadHash) public view returns (bytes32 blockHash) {
        return signedBlocks[payloadHash].blockHash;
    }

    function _isValidator(address person) internal virtual returns (bool) {
        return IConsensus(consensus).isValidator(person);
    }

    function _isNewBlock(bytes32 key) private view returns (bool) {
        return signedBlocks[key].signatures.length == 0;
    }

    function _isFuse(uint256 chainId) internal view virtual returns (bool) {
        return chainId == 0x7a;
    }

    // function parseRLPToHeader(bytes calldata rlpHeader)
    //     public
    //     pure
    //     returns (BlockHeader memory header)
    // {
    //     RLPReader.RLPItem[] memory ls = rlpHeader.toRlpItem().toList();
    //     // header.parentHash = bytes32(ls[0].toUint());
    //     // header.uncleHash = bytes32(ls[1].toUint());
    //     // header.coinbase = ls[2].toAddress();
    //     header.root = bytes32(ls[3].toUint());
    //     header.txHash = bytes32(ls[4].toUint());
    //     header.receiptHash = bytes32(ls[5].toUint());
    //     header.bloom = ls[6].toBytes();
    //     // header.difficulty = ls[7].toUint();
    //     header.number = ls[8].toUint();
    //     // header.gasLimit = ls[9].toUint();
    //     // header.gasUsed = ls[10].toUint();
    //     // header.time = ls[11].toUint();
    //     // header.extra = ls[12].toBytes();

    //     // //for chains like Fuse the sealFields order is reversed
    //     // if (ls[14].payloadLen() == 32) {
    //     //     header.mixDigest = ls[13].toBytes();
    //     //     header.nonce = ls[14].toUint();
    //     // } else {
    //     //     header.mixDigest = ls[14].toBytes();
    //     //     header.nonce = ls[13].toUint();
    //     // }

    //     // if (ls.length == 16) header.baseFee = ls[15].toUint();
    // }

    function parseRLPBlockNumber(bytes calldata rlpHeader) public pure returns (uint256 blockNumber) {
        RLPReader.RLPItem[] memory ls = rlpHeader.toRlpItem().toList();

        blockNumber = ls[8].toUint();
    }
}
