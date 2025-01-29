import { ethers } from 'hardhat';
import { expect } from 'chai';

import * as SignUtils from '../../bridge-app/src/utils';

describe('Parser/MPT Verifier', () => {
  let verifier;
  const fuseRpc = new ethers.providers.JsonRpcProvider('https://explorer-node.fuse.io/');
  const ethRpc = new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/eth');
  const celoRpc = new ethers.providers.JsonRpcBatchProvider('https://forno.celo.org');
  const alfajoresRpc = new ethers.providers.JsonRpcBatchProvider('https://alfajores-forno.celo-testnet.org');
  let fuseProof, ethProof, celoProof;
  before(async () => {
    verifier = await (await ethers.getContractFactory('VerifierTest')).deploy();
    fuseProof = await SignUtils.receiptProof(
      '0x8770fb92888d3ff30dfc96040a9371872737318c81e6ca1cb2b0e88ad981e627',
      new ethers.providers.JsonRpcBatchProvider('https://explorer-node.fuse.io/'),
      122,
    );
    ethProof = await SignUtils.receiptProof(
      '0x32ba5e829fc530871442755ad770693c7fadf7160f271d0e572dd9453f5adaaa',
      ethRpc,
      1,
    );
  });

  it('should parse receipt', async () => {
    const receipt = await fuseRpc.getTransactionReceipt(
      '0x8770fb92888d3ff30dfc96040a9371872737318c81e6ca1cb2b0e88ad981e627',
    );

    const parsedReceipt = await verifier.parseReceipt(fuseProof.receiptRlp);

    expect(parsedReceipt.logsBloom).eq(receipt.logsBloom);
    expect(parsedReceipt.status).eq(receipt.status);
    expect(parsedReceipt.gasUsed.toNumber()).eq(receipt.cumulativeGasUsed.toNumber());
    for (const log in parsedReceipt.logs) {
      expect(parsedReceipt.logs[log].contractAddress).eq(receipt.logs[log].address);
      expect(parsedReceipt.logs[log].data).eq(receipt.logs[log].data);
      expect(parsedReceipt.logs[log].topics).eql(receipt.logs[log].topics);
    }
  });

  it('should parse celo receipt after 1.8 fork', async () => {
    const receipt = await celoRpc.getTransactionReceipt(
      '0xa4ebf1da90dea53f0b1432c34caa1e9c2e5ec2ae94edb0911ccf967e6546eeb8',
    );

    const proof = await SignUtils.receiptProof(
      '0xa4ebf1da90dea53f0b1432c34caa1e9c2e5ec2ae94edb0911ccf967e6546eeb8',
      celoRpc,
      42220,
    );

    const parsedReceipt = await verifier.parseReceipt(proof.receiptRlp);

    expect(parsedReceipt.logsBloom).eq(receipt.logsBloom);
    expect(parsedReceipt.status).eq(receipt.status);
    expect(parsedReceipt.gasUsed.toNumber()).eq(receipt.cumulativeGasUsed.toNumber());
    for (const log in parsedReceipt.logs) {
      expect(parsedReceipt.logs[log].contractAddress).eq(receipt.logs[log].address);
      expect(parsedReceipt.logs[log].data).eq(receipt.logs[log].data);
      expect(parsedReceipt.logs[log].topics).eql(receipt.logs[log].topics);
    }
  });

  it('should parse alfajores L2 receipt', async () => {
    const receipt = await alfajoresRpc.getTransactionReceipt(
      '0x3f5c02c2184915db9a238583f05f0c8e6033438c0423ab0cd55846f05df93409',
    );

    const proof = await SignUtils.receiptProof(
      '0x3f5c02c2184915db9a238583f05f0c8e6033438c0423ab0cd55846f05df93409',
      alfajoresRpc,
      44787,
    );

    const parsedReceipt = await verifier.parseReceipt(proof.receiptRlp);

    expect(parsedReceipt.logsBloom).eq(receipt.logsBloom);
    expect(parsedReceipt.status).eq(receipt.status);
    expect(parsedReceipt.gasUsed.toNumber()).eq(receipt.cumulativeGasUsed.toNumber());
    for (const log in parsedReceipt.logs) {
      expect(parsedReceipt.logs[log].contractAddress).eq(receipt.logs[log].address);
      expect(parsedReceipt.logs[log].data).eq(receipt.logs[log].data);
      expect(parsedReceipt.logs[log].topics).eql(receipt.logs[log].topics);
    }
  });

  it('should parse london fork receipt', async () => {
    const receipt = await ethRpc.getTransactionReceipt(
      '0x32ba5e829fc530871442755ad770693c7fadf7160f271d0e572dd9453f5adaaa',
    );

    const parsedReceipt = await verifier.parseReceipt(ethProof.receiptRlp);

    expect(parsedReceipt.logsBloom).eq(receipt.logsBloom);
    expect(parsedReceipt.status).eq(receipt.status);
    expect(parsedReceipt.gasUsed.toNumber()).eq(receipt.cumulativeGasUsed.toNumber());
    for (const log in parsedReceipt.logs) {
      expect(parsedReceipt.logs[log].contractAddress).eq(receipt.logs[log].address);
      expect(parsedReceipt.logs[log].data).eq(receipt.logs[log].data);
      expect(parsedReceipt.logs[log].topics).eql(receipt.logs[log].topics);
    }
  });

  it('should verify receipt inclusion', async () => {
    const expectedRoot = fuseProof.receiptsRoot;

    const receiptRlp = fuseProof.receiptRlp;
    const path = fuseProof.receiptProof;
    const mptproof = {
      expectedRoot,
      expectedValue: receiptRlp,
      proof: path,
      key: SignUtils.index2key(fuseProof.txIndex, path.length),
      keyIndex: 0,
      proofIndex: 0,
    };
    const isVerified = await verifier.verifyReceipt(mptproof);
    expect(isVerified).to.be.true;
  });

  it('should verify edge case of last tx in block', async () => {
    const proof = await SignUtils.receiptProof(
      '0x5b77e45c0085c3c4a2242736098838b948ef335f2805a726a95e6b5e2bc59c72',
      new ethers.providers.JsonRpcProvider('https://forno.celo.org'),
      42220,
    );

    const expectedRoot = proof.receiptsRoot;

    const receiptRlp = proof.receiptRlp;
    const path = proof.receiptProof;
    const mptproof = {
      expectedRoot,
      expectedValue: receiptRlp,
      proof: path,
      key: SignUtils.index2key(proof.txIndex, path.length),
      keyIndex: 0,
      proofIndex: 0,
    };
    const isVerified = await verifier.verifyReceipt(mptproof);
    expect(isVerified).to.be.true;
  });

  it('should verify ethereum receipt inclusion', async () => {
    const proof = ethProof;
    const expectedRoot = proof.receiptsRoot;

    const receiptRlp = proof.receiptRlp;
    const path = proof.receiptProof;
    const mptproof = {
      expectedRoot,
      expectedValue: receiptRlp,
      proof: path,
      key: SignUtils.index2key(proof.txIndex, path.length),
      keyIndex: 0,
      proofIndex: 0,
    };
    const isVerified = await verifier.verifyReceipt(mptproof);
    expect(isVerified).to.be.true;
  });

  it('should verify celo receipt inclusion', async () => {
    const proof = await SignUtils.receiptProof(
      '0x67b389bc4640211455cfc7234fec76ce7cd90198b594a427b7935bda17bd940d',
      celoRpc,
      42220,
    );

    const expectedRoot = proof.receiptsRoot;

    const receiptRlp = proof.receiptRlp;
    const path = proof.receiptProof;
    const mptproof = {
      expectedRoot,
      expectedValue: receiptRlp,
      proof: path,
      key: SignUtils.index2key(proof.txIndex, path.length),
      keyIndex: 0,
      proofIndex: 0,
    };
    // console.log('key indexes:', mptproof.key);
    const isVerified = await verifier.verifyReceipt(mptproof);
    expect(isVerified).to.be.true;
  });

  it('should verify celo receipt inclusion extension even', async () => {
    const proof = await SignUtils.receiptProof(
      '0xd9402a712a1d7c42329c467b524f03ada2cb7cf3041c2aa2e4cdcc73dc83acf5',
      celoRpc,
      42220,
    );

    const expectedRoot = proof.receiptsRoot;

    const receiptRlp = proof.receiptRlp;
    const path = proof.receiptProof;
    const mptproof = {
      expectedRoot,
      expectedValue: receiptRlp,
      proof: path,
      key: SignUtils.index2key(proof.txIndex, path.length),
      keyIndex: 0,
      proofIndex: 0,
    };
    const isVerified = await verifier.verifyReceipt(mptproof);
    expect(isVerified).to.be.true;
  });

  it('should verify celo receipt inclusion after fork', async () => {
    const proof = await SignUtils.receiptProof(
      '0xa31152574444d2b437abd0a952e6c964a1069ffd3bf5a6094b4e4febf6efbdc2',
      celoRpc,
      42220,
    );

    const expectedRoot = proof.receiptsRoot;

    const receiptRlp = proof.receiptRlp;
    const path = proof.receiptProof;
    const mptproof = {
      expectedRoot,
      expectedValue: receiptRlp,
      proof: path,
      key: SignUtils.index2key(proof.txIndex, path.length),
      keyIndex: 0,
      proofIndex: 0,
    };
    const isVerified = await verifier.verifyReceipt(mptproof);
    expect(isVerified).to.be.true;
  });

  it('should verify alfajores L2 receipt inclusion ', async () => {
    const proof = await SignUtils.receiptProof(
      '0x2e060ef10dafc8a0c47776e0d9d61d45b5c5c5f86f82955d07bb0788948b16e3',
      alfajoresRpc,
      44787,
    );

    const expectedRoot = proof.receiptsRoot;

    const receiptRlp = proof.receiptRlp;
    const path = proof.receiptProof;
    const mptproof = {
      expectedRoot,
      expectedValue: receiptRlp,
      proof: path,
      key: SignUtils.index2key(proof.txIndex, path.length),
      keyIndex: 0,
      proofIndex: 0,
    };
    const isVerified = await verifier.verifyReceipt(mptproof);
    expect(isVerified).to.be.true;
  });

  it('should not verify receipt inclusion with false data', async () => {
    const expectedRoot = fuseProof.receiptsRoot;

    const receiptRlp = fuseProof.receiptRlp;
    const path = fuseProof.receiptProof;
    path[2] = path[1]; //put false data
    await expect(
      verifier.verifyReceipt({
        expectedRoot,
        expectedValue: receiptRlp,
        proof: path,
        key: SignUtils.index2key(fuseProof.txIndex, path.length),
        keyIndex: 0,
        proofIndex: 0,
      }),
    ).revertedWith('verifyTrieProof else');
  });

  it('should not verify receipt inclusion with bad root', async () => {
    const expectedRoot = ethers.utils.keccak256(390890);
    const receiptRlp = fuseProof.receiptRlp;
    const path = fuseProof.receiptProof;
    await expect(
      verifier.verifyReceipt({
        expectedRoot,
        expectedValue: receiptRlp,
        proof: path,
        key: SignUtils.index2key(fuseProof.txIndex, path.length),
        keyIndex: 0,
        proofIndex: 0,
      }),
    ).revertedWith('verifyTrieProof root node hash invalid');
  });
});
