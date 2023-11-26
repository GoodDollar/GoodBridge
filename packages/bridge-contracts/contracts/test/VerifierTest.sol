pragma solidity >=0.8.0;

import '../utils/MPT.sol';
import '../utils/RLPParser.sol';

contract VerifierTest {
    function verifyReceipt(MPT.MerkleProof calldata proof) external pure returns (bool ok) {
        return MPT.verifyTrieProof(proof);
    }

    function parseReceipt(
        bytes calldata receiptRlp
    ) external pure returns (RLPParser.TransactionReceipt memory receipt) {
        return RLPParser.toReceipt(receiptRlp);
    }
}
