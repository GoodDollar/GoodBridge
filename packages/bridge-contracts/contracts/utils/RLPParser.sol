// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;
import './RLPReader.sol';

// import "hardhat/console.sol";

library RLPParser {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    struct Log {
        address contractAddress;
        bytes32[] topics;
        bytes data;
    }

    struct TransactionReceipt {
        uint8 status;
        uint256 gasUsed;
        bytes logsBloom;
        Log[] logs;
    }

    function toReceipt(bytes memory rlpHeader) internal pure returns (TransactionReceipt memory receipt) {
        uint256 skipBytes = 0;
        if (rlpHeader[0] <= bytes1(0x7f)) {
            skipBytes = 1;
        }
        RLPReader.RLPItem[] memory ls = rlpHeader.toRlpItem(skipBytes).toList();

        receipt.status = uint8(ls[0].toUint());
        receipt.gasUsed = ls[1].toUint();
        receipt.logsBloom = ls[2].toBytes();
        RLPReader.RLPItem[] memory logs = ls[3].toList();
        receipt.logs = new Log[](logs.length);
        for (uint256 i = 0; i < logs.length; i++) {
            receipt.logs[i] = toReceiptLog(logs[i]);
        }
    }

    function toReceiptLog(RLPReader.RLPItem memory logRlp) internal pure returns (Log memory log) {
        RLPReader.RLPItem[] memory ls = logRlp.toList();
        log.contractAddress = ls[0].toAddress();
        RLPReader.RLPItem[] memory topics = ls[1].toList();
        log.topics = new bytes32[](topics.length);
        for (uint256 i = 0; i < topics.length; i++) {
            bytes32 topic = bytes32(topics[i].toUint());
            log.topics[i] = topic;
        }
        log.data = ls[2].toBytes();
    }

    function getBlockReceiptsRoot(
        uint256 chainId,
        bytes memory rlpHeader
    ) internal pure returns (bytes32 receiptsRoot) {
        RLPReader.Iterator memory it = rlpHeader.toRlpItem().iterator();
        it.next();
        it.next();
        it.next();
        it.next(); // pos 3

        if (chainId != 42220) it.next(); //pos 4

        receiptsRoot = bytes32(it.next().toUint()); //pos 4 or 5
    }

    function getBlockNumber(uint256 chainId, bytes memory rlpHeader) internal pure returns (uint256 blockNumber) {
        RLPReader.Iterator memory it = rlpHeader.toRlpItem().iterator();
        it.next();
        it.next();
        it.next();
        it.next();
        it.next();
        it.next(); // pos 5

        //handle celo 1.8 hardfork that now matches regular blocks structure
        if (chainId != 42220 || it.item.numItems() > 10) {
            it.next();
            it.next(); //pos 7
        }

        blockNumber = it.next().toUint(); //pos 6 or 8
    }

    function getBlockParentAndNumber(
        uint256 chainId,
        bytes memory rlpHeader
    ) internal pure returns (uint256 blockNumber, bytes32 parentHash) {
        RLPReader.Iterator memory it = rlpHeader.toRlpItem().iterator();
        parentHash = bytes32(it.next().toUint()); // pos 0

        blockNumber = getBlockNumber(chainId, rlpHeader);
    }
}
