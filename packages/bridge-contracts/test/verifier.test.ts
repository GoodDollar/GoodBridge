import { ethers } from 'hardhat';
import { expect } from 'chai';

import * as SignUtils from '../../bridge-app/src/utils';

describe('Parser/MPT Verifier', () => {
  let verifier;
  const fuseRpc = new ethers.providers.JsonRpcProvider('https://rpc.fuse.io');
  const ethRpc = new ethers.providers.JsonRpcProvider('https://cloudflare-eth.com/v1/mainnet');
  const celoRpc = new ethers.providers.JsonRpcBatchProvider('https://forno.celo.org');
  let fuseProof, ethProof;
  before(async () => {
    verifier = await (await ethers.getContractFactory('VerifierTest')).deploy();
    fuseProof = await SignUtils.receiptProof(
      '0x8770fb92888d3ff30dfc96040a9371872737318c81e6ca1cb2b0e88ad981e627',
      new ethers.providers.JsonRpcBatchProvider('https://rpc.fuse.io'),
      122,
    );
    ethProof = await SignUtils.receiptProof(
      '0x32ba5e829fc530871442755ad770693c7fadf7160f271d0e572dd9453f5adaaa',
      ethRpc,
      1,
    );
    // celoProof = await SignUtils.receiptProof("0x2de34d3317cee9052bfc086602022070c90d12ed60374ee192a505655b0be0f6",celoRpc, 42220)
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
