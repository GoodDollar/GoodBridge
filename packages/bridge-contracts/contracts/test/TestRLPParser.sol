pragma solidity >=0.8.0;

import '../utils/RLPParser.sol';

contract TestRLPParser {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    function testGetBlockReceiptsRoot(
        uint256 chainId,
        bytes memory rlpHeader
    ) public pure returns (bytes32 receiptsRoot) {
        receiptsRoot = RLPParser.getBlockReceiptsRoot(chainId, rlpHeader);
    }

    function testGetBlockNumber(uint256 chainId, bytes memory rlpHeader) public pure returns (uint256 blockNumber) {
        blockNumber = RLPParser.getBlockNumber(chainId, rlpHeader);
    }

    function testGetBlockParentAndNumber(
        uint256 chainId,
        bytes memory rlpHeader
    ) public pure returns (uint256 blockNumber, bytes32 parentHash) {
        (blockNumber, parentHash) = RLPParser.getBlockParentAndNumber(chainId, rlpHeader);
    }

    function testGetBlockHeaderNumFields(bytes memory rlpHeader) public pure returns (uint256 numItems) {
        return rlpHeader.toRlpItem().numItems();
    }
}
