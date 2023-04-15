pragma solidity >=0.8.0;

import '../utils/RLPParser.sol';

contract TestRLPParser {
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
}
