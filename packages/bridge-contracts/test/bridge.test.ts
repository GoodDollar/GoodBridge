import { ethers } from 'hardhat';
import { expect } from 'chai';
import { TokenBridge } from '../typechain-types';
import { range } from 'lodash';
import * as SignUtils from '../../bridge-app/src/utils';

describe('Bridge', () => {
  let signers, bridgeA: TokenBridge, bridgeB: TokenBridge, token;
  before(async () => {
    signers = await ethers.getSigners();
    const validators = signers.map((_) => _.address);
    const requiredValidators = validators.slice(0, 2);
    token = await (await ethers.getContractFactory('TestToken')).deploy();
    bridgeA = (await (
      await ethers.getContractFactory('TokenBridge')
    ).deploy(
      validators,
      10000000,
      requiredValidators,
      0,
      token.address,
      {
        minFee: 0,
        maxFee: 2,
        fee: 10,
      },
      {
        dailyLimit: 1e10,
        txLimit: 1e8,
        accountDailyLimit: 1e9,
      },
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
    )) as TokenBridge;
    bridgeB = (await (
      await ethers.getContractFactory('TokenBridge')
    ).deploy(
      validators,
      10000000,
      requiredValidators.slice(2, 4),
      0,
      token.address,
      {
        minFee: 0,
        maxFee: 2,
        fee: 10,
      },
      {
        dailyLimit: 1e10,
        txLimit: 1e8,
        accountDailyLimit: 1e9,
      },
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
    )) as TokenBridge;
    await token.transfer(bridgeB.address, ethers.constants.WeiPerEther);
    await bridgeA.setSourceBridges([bridgeB.address]);
    await bridgeB.setSourceBridges([bridgeA.address]);
  });

  describe('block proofs', () => {
    let childHeader;
    it('should submit signed block after 10 previous blocks', async () => {
      for (let i = 0; i < 10; i++) await signers[0].sendTransaction({ value: 0, to: signers[1].address });
      const block = await ethers.provider.send('eth_getBlockByNumber', ['latest', false]);
      childHeader = SignUtils.prepareBlock(block, 1337);
      const sig1 = await SignUtils.signBlock(childHeader.rlpHeader, 1337, signers[0], 0, []);
      const sig2 = await SignUtils.signBlock(childHeader.rlpHeader, 1337, signers[1], 0, []);
      const { signature, ...signedBlock } = {
        ...sig1,
        ...{
          signatures: [
            ethers.utils.defaultAbiCoder.encode(['bytes32', 'bytes32'], Object.values(sig1.signature)),
            ethers.utils.defaultAbiCoder.encode(['bytes32', 'bytes32'], Object.values(sig2.signature)),
          ],
        },
      };
      await expect(bridgeB.submitBlocks([signedBlock])).not.reverted;
      expect(await bridgeB.chainVerifiedBlocks(1337, block.number)).equal(signedBlock.blockHash);
    });

    it('should submit parent blocks', async () => {
      const parents = await Promise.all(
        range(childHeader.block.number - 1, childHeader.block.number - 11).map(async (idx) => {
          const block = await ethers.provider.send('eth_getBlockByNumber', ['0x' + idx.toString(16), false]);
          return SignUtils.prepareBlock(block, 1337);
        }),
      );
      const parentRlps = parents.map((_) => _.rlpHeader);
      await expect(bridgeB.verifyParentBlocks(1337, childHeader.block.number, parentRlps, childHeader.rlpHeader)).not
        .reverted;
    });
  });
  describe('transfer and receive', () => {
    let tx;
    it('should transfer to bridge', async () => {
      await token.approve(bridgeA.address, 1000);
      tx = await (await bridgeA.bridgeTo(signers[1].address, 1337, 1000)).wait();
      const bridgeEvent = tx.events.find((_) => _.event === 'BridgeRequest');
      expect(bridgeEvent.topics[0]).eq(await bridgeA.BRIDGE_TOPIC());
      expect(bridgeEvent.args.from).to.eq(signers[0].address);
      expect(bridgeEvent.args.to).to.eq(signers[1].address);
      expect(bridgeEvent.args.amount).to.eq(1000);
      expect(bridgeEvent.args.targetChainId).to.eq(1337);
    });

    it('should submit signed block to target bridge', async () => {
      const block = await ethers.provider.send('eth_getBlockByNumber', ['0x' + tx.blockNumber.toString(16), true]);
      const blockHeader = SignUtils.prepareBlock(block, 1337);
      let sig1 = await SignUtils.signBlock(blockHeader.rlpHeader, 1337, signers[0], 0, []);
      const sig2 = await SignUtils.signBlock(blockHeader.rlpHeader, 1337, signers[1], 0, []);
      const { signature, ...signedBlock } = {
        ...sig1,
        ...{
          signatures: [
            ethers.utils.defaultAbiCoder.encode(['bytes32', 'bytes32'], Object.values(sig1.signature)),
            ethers.utils.defaultAbiCoder.encode(['bytes32', 'bytes32'], Object.values(sig2.signature)),
          ],
        },
      };
      await expect(bridgeB.submitBlocks([signedBlock])).not.reverted;
      expect(await bridgeB.chainVerifiedBlocks(1337, tx.blockNumber)).equal(signedBlock.blockHash);
    });

    it('should receive from bridge with valid proof', async () => {
      const proof = await SignUtils.receiptProof(tx.transactionHash, ethers.provider);
      const expectedRoot = proof.receiptsRoot;
      //    console.log({root: proof.receiptsRoot,expectedRoot, proofRoot: ethers.utils.keccak256(ethers.utils.RLP.encode(proof.orgProof[0]))})
      const receiptRlp = proof.receiptRlp;

      const mptProof = {
        expectedRoot,
        expectedValue: receiptRlp,
        proof: proof.receiptProof,
        key: SignUtils.index2key(proof.txIndex, proof.receiptProof.length),
        keyIndex: 0,
        proofIndex: 0,
      };

      const res = bridgeB.executeReceipts(1337, [
        { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
      ]);
      await (await res).wait();
      await expect(res).not.reverted;
      const txData = await (await res).wait();
      const txLog = txData.events?.find((_) => _.event === 'ExecutedTransfer');
      // from, target, amount, chainId, blockNumber
      expect(txLog?.args?.from).eq(signers[0].address);
      expect(txLog?.args?.to).eq(signers[1].address);
      expect(txLog?.args?.amount).eq(1000);
      expect(txLog?.args?.sourceChainId).eq(1337);
      expect(txLog?.args?.sourceBlockNumber).eq(tx.blockNumber);
    });

    it('should not receive from bridge with used proof', async () => {
      const proof = await SignUtils.receiptProof(tx.transactionHash, ethers.provider);
      const expectedRoot = proof.receiptsRoot;
      //    console.log({root: proof.receiptsRoot,expectedRoot, proofRoot: ethers.utils.keccak256(ethers.utils.RLP.encode(proof.orgProof[0]))})
      const receiptRlp = proof.receiptRlp;

      const mptProof = {
        expectedRoot,
        expectedValue: receiptRlp,
        proof: proof.receiptProof,
        key: SignUtils.index2key(proof.txIndex, proof.receiptProof.length),
        keyIndex: 0,
        proofIndex: 0,
      };

      const res = bridgeB.executeReceipts(1337, [
        { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
      ]);
      await expect(res).revertedWith('receipt already used');
    });
  });
});
