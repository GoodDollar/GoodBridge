import * as ethers from 'ethers';
import { abi as RegistryABI } from './abi/BlockHeaderRegistry.json';
import { flatten, pick } from 'lodash';
import { JsonRpcBatchProvider } from '@ethersproject/providers';
import Tree from 'merkle-patricia-tree';
import { Receipt, Proof } from 'eth-object';
import { encode } from 'eth-util-lite';
import { promisfy } from 'promisfy';
import * as RLP from 'rlp';
import { logger } from './blockHeaderRegistry';

export interface BlockHeader {
  number: number;
  hash: string;
  parentHash: string;
  nonce: string;
  sha3Uncles: string;
  logsBloom: string;
  transactionsRoot: string;
  stateRoot: string;
  receiptsRoot: string;
  miner: string;
  extraData: string;
  gasLimit: number;
  gasUsed: number;
  timestamp: number | string;
  baseFeePerGas?: number;
  size: number;
  difficulty: number;
  totalDifficulty: number;
  uncles: string[];
  transactions: string[];
}

// import logger from 'js-logger'

// logger.setLevel(logger.DEBUG)

//sign should return a Block struct
//
// struct Block {
//   bytes rlpHeader;
//   Signature signature;
//   uint256 chainId;
//   bytes32 blockHash;
//   uint256 cycleEnd;
//   address[] validators;
// }

const rpcs: { [chainId: string]: JsonRpcBatchProvider } = {};

export function getRlpHeader(web3Header: Partial<BlockHeader>) {
  const rlpBytes = flatten(
    Object.entries(web3Header).map(([k, v]) => {
      if (!v || v === '0x' || v === '0x0') return '0x';
      // if (typeof v === 'string' && v.startsWith("0x")) {
      //   //binance has 0x0000...0 fields that need to be kept
      //   if (v.length%2 !== 0 && !v.match(/^0x00+$/) && ["number", "gasLimit", "gasUsed", "timestamp", "nonce", "difficulty", "baseFeePerGas"].includes(k)) //make sure its even length bytes
      //     return ethers.utils.hexlify(ethers.BigNumber.from(v))
      //   else return v;
      // }
      if (k === 'sealFields') return (v as Array<string>).map((_) => ethers.utils.RLP.decode(_));
      // // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // return ethers.utils.hexlify(ethers.BigNumber.from(v))
      return v;
    }),
  );
  const rlpHeader = '0x' + RLP.encode(rlpBytes).toString('hex');
  // const hashTest = ethers.utils.keccak256("0x"+rlpHeaderTest.toString("hex"));
  // console.log({hashTest})
  // const rlpHeader = ethers.utils.RLP.encode(rlpBytes)
  return rlpHeader;
}

export async function signBlock(
  rlpHeader: string,
  chainId: number,
  signer: ethers.Signer,
  cycleEnd: number,
  validators: Array<string>,
) {
  const blockHash = ethers.utils.keccak256(rlpHeader);

  const packed = ethers.utils.solidityPack(
    ['bytes32', 'uint256', 'address[]', 'uint256'],
    [blockHash, chainId, validators, cycleEnd],
  );
  const payload = ethers.utils.keccak256(packed);

  const signature = ethers.utils.splitSignature(await signer.signMessage(ethers.utils.arrayify(payload)));

  return {
    rlpHeader,
    blockHash: ethers.utils.keccak256(rlpHeader),
    chainId: Number(chainId),
    signature: {
      r: signature.r,
      vs: signature._vs,
    },
    cycleEnd,
    validators,
  };
}

export const getRegistryContract = (address: string, signer: ethers.Signer) => {
  return new ethers.Contract(address, RegistryABI, signer);
};

// ParentHash  common.Hash    `json:"parentHash"       gencodec:"required"`
// 	UncleHash   common.Hash    `json:"sha3Uncles"       gencodec:"required"`
// 	Coinbase    common.Address `json:"miner"`
// 	Root        common.Hash    `json:"stateRoot"        gencodec:"required"`
// 	TxHash      common.Hash    `json:"transactionsRoot" gencodec:"required"`
// 	ReceiptHash common.Hash    `json:"receiptsRoot"     gencodec:"required"`
// 	Bloom       Bloom          `json:"logsBloom"        gencodec:"required"`
// 	Difficulty  *big.Int       `json:"difficulty"       gencodec:"required"`
// 	Number      *big.Int       `json:"number"           gencodec:"required"`
// 	GasLimit    uint64         `json:"gasLimit"         gencodec:"required"`
// 	GasUsed     uint64         `json:"gasUsed"          gencodec:"required"`
// 	Time        uint64         `json:"timestamp"        gencodec:"required"`
// 	Extra       []byte         `json:"extraData"        gencodec:"required"`
// 	MixDigest   common.Hash    `json:"mixHash"`
// 	Nonce       BlockNonce     `json:"nonce"`
// author: "0x0bfda4cd2a98505c20236150baa9676c0e85a891"
// difficulty: "340282366920938463463374607431768211454"
// extraData: "0xdb830302068c4f70656e457468657265756d86312e34372e30826c69"
// gasLimit: 10000000
// gasUsed: 1691857
// hash: "0xaa8c8f759569a41170cc5002b1c6b45c20ecc17182d98f3db7a3980c000de0e0"
// logsBloom: "0x0000000000000000000000200000040000000000000000000000a000000402000000000000000000000000000080800020022800018000200000000200010000000000008000000000800008000000000000000080000000000000200100000000000000000000000000010000000008000000000010000000040010000000000000000000000000000000000000000000000000200000010000800000000000820000a00008000000000000000000000000000420000000004000010000100000000002000000000000000400000200101000000008000000000000000000008080000000008400000001000088040000000000000000000000000080000000"
// miner: "0x0bfDa4Cd2A98505C20236150BAA9676C0E85a891"
// number: 18721056
// parentHash: "0x2e39038f7f86a7784d3bd908a9b35e14e4af8777d202550fe385775928c497f3"
// receiptsRoot: "0xfd24dd8af07e33002c8279c0a410c12a098459fcbf9319e5e7a34a25c31436d6"
// sealFields: (2) ['0x8413cd3db8', '0xb841e44a7f11d21c95638129547a7fe458cafc35c29fb27f…9cb9d1a8439c1271968b5c97e04e17d049f8944567a282f01']
// sha3Uncles: "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347"
// signature: "e44a7f11d21c95638129547a7fe458cafc35c29fb27fab0deb460cf4d72431e2122b8988e60225e1c9cb9d1a8439c1271968b5c97e04e17d049f8944567a282f01"
// size: 2085
// stateRoot: "0x9038d78273e0522af10196fd13a57a7e3198f1f3ff0dfb1287ed4725c5bcff60"
// step: "332217784"
// timestamp: 1661088920
// totalDifficulty: "6370445246939436547051789974708148865336809768"
// transactions: (11) ['0x306ada5d99ed42e2fe89a28447d95eee335649bc8bc3a2953aa6c29d70beedef', '0x54a062626e47890aeaef90f7898bd464e9b81dcf7618994eb1165e9d9524a88d', '0x408a3dfc59bad34a217681e26a918b48756f8cd3c542e08052894c492e30bde8', '0x00477a26dfe97eaa2278be1a30e2c402ab2d1808676c718c3199caeafaa00d1f', '0x7270fba634ba4435a9f8512627b3feb2a8fa980afc2058c756ef65732eeda8c0', '0x509ee29dec71dca63882864a456a9a6e71e5c31ddacaefa8bddf00b8c9999cff', '0x95f0cbff9d0c879416ee153e754aa8fe76e1509188f44ac8c41e537949a3656d', '0xf240776541a2704f4a85505707852006e55f2f0cdd6d760bf3345b282ad631fe', '0x2645bce43eaa7eeb832c109604e0ba354227aa1b6fda8e3e1131d16596abbf13', '0xb4940dd91683ea54879ae0706adf0f96f434a619b54db9def55ab5574de7421d', '0xb3473232cf497097fdbc77d7a3862b862d20b49d302ba2e0f9d9aea10d2ce971']
// transactionsRoot: "0xd443bc42f99dbfdd1f8a54be2c863ecd7c2f12e24252aa47e4fa33eed418aa2b"
// uncles: []
export const getBlockchainHeader = async (blockTag: string, chainId: number, rpc: string) => {
  const web3 = rpcs[String(chainId)] || new JsonRpcBatchProvider(rpc);
  rpcs[String(chainId)] = web3;
  const block = await web3.send('eth_getBlockByNumber', [
    blockTag === 'latest' ? 'latest' : ethers.utils.hexlify(Number(blockTag)),
    false,
  ]);
  return prepareBlock(block, chainId);
};

export const prepareBlock = (block: BlockHeader, chainId?: number) => {
  const header = pick(block, [
    'parentHash',
    'sha3Uncles',
    'miner',
    'stateRoot',
    'transactionsRoot',
    'receiptsRoot',
    'logsBloom',
    'difficulty',
    'number',
    'gasLimit',
    'gasUsed',
    'timestamp',
    'extraData',
    'sealFields',
    'step',
    'signature',
    'mixHash',
    'nonce',
    'baseFeePerGas',
  ]);
  //special parsing for celo
  //https://github.com/celo-org/celo-blockchain/blob/e0c433849e3e6bfe32a421fd8dc05372286ba6d3/core/types/block.go
  //https://github.com/celo-org/celo-blockchain/blob/1a239cbf64188d7c0bd49ce6ae2fe63faab691a1/core/types/istanbul.go
  if (chainId === 42220) {
    delete header['gasLimit'];
    const istanbulExtra = ethers.utils.RLP.decode('0x' + header.extraData.slice(66)); //0x+32bytes = 66
    istanbulExtra[4] = ['0x', '0x', '0x']; //AggregatedSeal
    const cleanExtra = ethers.utils.RLP.encode(istanbulExtra);
    header.extraData = header.extraData.slice(0, 66) + cleanExtra.slice(2);
  }
  if (header['sealFields'] && header['step'] && header['signature']) {
    delete header['step'];
    delete header['signature'];
  }
  const rlpHeader = getRlpHeader(header);
  const blockHash = ethers.utils.keccak256(rlpHeader);
  // console.log({block,header,rlpHeader, blockHash})
  if (blockHash !== block.hash) {
    logger.debug({ block, header, blockHash, rlpHeader });
    throw new Error('rlp hash doesnt match expected blockhash');
  }
  return { block, blockHeader: header, rlpHeader, computedHash: blockHash };
};
/**
 * key for merkle patricia tree proof
 * @param index
 * @param proofLength
 * @returns
 */
export const index2key = (index, proofLength) => {
  const actualkey = [];
  const encoded = encode(index).toString('hex');
  const key = [...new Array(encoded.length / 2).keys()].map((i) => parseInt(encoded[i * 2] + encoded[i * 2 + 1], 16));

  key.forEach((val) => {
    if (actualkey.length + 1 === proofLength) {
      actualkey.push(val);
    } else {
      actualkey.push(Math.floor(val / 16));
      actualkey.push(val % 16);
    }
  });
  return '0x' + actualkey.map((v) => v.toString(16).padStart(2, '0')).join('');
};

export const receiptProof = async (txHash: string, provider: ethers.providers.JsonRpcProvider, chainId?: number) => {
  const targetReceipt = await provider.send('eth_getTransactionReceipt', [txHash]);
  if (!targetReceipt) {
    throw new Error('txhash/targetReceipt not found. (use Archive node)');
  }

  const rpcBlock = await provider.send('eth_getBlockByHash', [targetReceipt.blockHash, false]);
  const blockHeader = prepareBlock(rpcBlock, chainId);
  const withReceiptType = !!blockHeader.blockHeader.baseFeePerGas || [42220].includes(chainId);
  let blockReceipt;
  if (chainId === 42220) {
    blockReceipt = provider.send('eth_getBlockReceipt', [targetReceipt.blockHash]);
  }
  const receipts = (
    await Promise.all(
      rpcBlock.transactions
        .map(async (siblingTxHash) => {
          return provider.send('eth_getTransactionReceipt', [siblingTxHash]);
        })
        .concat(blockReceipt),
    )
  ).filter((_) => _);

  const tree = new Tree();

  await Promise.all(
    receipts.map((siblingReceipt, index) => {
      const siblingPath = encode(index);
      let serializedReceipt = Receipt.fromRpc(siblingReceipt).serialize();
      if (withReceiptType && siblingReceipt.type && siblingReceipt.type != '0x0') {
        serializedReceipt = Buffer.concat([Buffer.from([siblingReceipt.type]), serializedReceipt]);
      }
      return promisfy(tree.put, tree)(siblingPath, serializedReceipt);
    }),
  );

  const [, , stack] = await promisfy(tree.findPath, tree)(encode(targetReceipt.transactionIndex));
  const receiptsRoot = '0x' + tree.root.toString('hex');
  if (receiptsRoot !== blockHeader.block.receiptsRoot) {
    console.error({
      receiptsRoot,
      blockReceiptsRoot: blockHeader.block.receiptsRoot,
    });
    throw new Error('receiptsRoot mismatch');
  }
  return {
    receipt: targetReceipt,
    receiptsRoot,
    headerRlp: blockHeader.rlpHeader,
    receiptProof: Proof.fromStack(stack).raw.map((_) => '0x' + encode(_).toString('hex')),
    txIndex: targetReceipt.transactionIndex,
    receiptRlp:
      '0x' +
      (withReceiptType && targetReceipt.type && targetReceipt.type != '0x0'
        ? ethers.utils.hexlify(Number(targetReceipt.type)).slice(2)
        : '') +
      Receipt.fromRpc(targetReceipt).serialize().toString('hex'),
  };
};
