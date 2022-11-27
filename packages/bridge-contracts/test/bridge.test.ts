import { ethers } from 'hardhat';
import { pick } from 'lodash';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { TokenBridge } from '../typechain-types';
import { range } from 'lodash';
import * as SignUtils from '../../bridge-app/src/utils';
import { BigNumber } from 'ethers';
import { bridge } from '../typechain-types/contracts';

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
        minAmount: 100,
        onlyWhitelisted: true,
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
        minAmount: 100,
        onlyWhitelisted: true,
      },
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
    )) as TokenBridge;
    await token.transfer(bridgeB.address, ethers.constants.WeiPerEther);
    await bridgeA.setSourceBridges([bridgeB.address], [1]);
    await bridgeB.setSourceBridges([bridgeA.address], [1]);
  });

  const basicFixture = async () => {
    return { bridgeA, bridgeB };
  };

  describe('bridge params', () => {
    it('should have chainstartblock set to 1', async () => {
      expect(await bridgeA.chainStartBlock(3948484)).eq(1);
    });

    it('should set limits only by owner', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setBridgeLimits({
        txLimit: 1,
        dailyLimit: 1,
        accountDailyLimit: 1,
        minAmount: 1,
        onlyWhitelisted: true,
      });
      const limits = await bridgeA.bridgeLimits();
      expect(limits.txLimit).eq(1);
      expect(limits.dailyLimit).eq(1);
      expect(limits.accountDailyLimit).eq(1);
      expect(limits.minAmount).eq(1);
      expect(limits.onlyWhitelisted).eq(true);

      await expect(
        bridgeA.connect(signers[1]).setBridgeLimits({
          txLimit: 1,
          dailyLimit: 1,
          accountDailyLimit: 1,
          minAmount: 1,
          onlyWhitelisted: true,
        }),
      ).revertedWith('owner');
    });

    it('should set fees only by owner', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setBridgeFees({
        fee: 1,
        maxFee: 1,
        minFee: 1,
      });

      const fees = await bridgeA.bridgeFees();
      expect(fees.fee).eq(1);
      expect(fees.maxFee).eq(1);
      expect(fees.minFee).eq(1);

      await expect(
        bridgeA.connect(signers[1]).setBridgeFees({
          fee: 1,
          maxFee: 1,
          minFee: 1,
        }),
      ).revertedWith('owner');
    });

    it('should set faucet only by owner', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setFaucet(signers[1].address);

      expect(await bridgeA.faucet()).eq(signers[1].address);

      await expect(bridgeA.connect(signers[1]).setFaucet(ethers.constants.AddressZero)).revertedWith('owner');
    });

    it('should set trusted bridges only by owner', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setSourceBridges([signers[1].address, signers[2].address], [5, 5]);

      expect(await bridgeA.sourceBridgeToBlockstart(signers[1].address)).eq(5);
      expect(await bridgeA.sourceBridgeToBlockstart(signers[2].address)).eq(5);

      await expect(
        bridgeA.connect(signers[1]).setSourceBridges([signers[1].address, signers[2].address], [1, 1]),
      ).revertedWith('owner');
    });

    it('should set consensus ratio only by owner', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setConsensusRatio(10);

      expect(await bridgeA.consensusRatio()).eq(10);
      expect(await bridgeA.sourceBridgeToBlockstart(signers[2].address)).eq(5);

      await expect(bridgeA.connect(signers[1]).setConsensusRatio(10)).revertedWith('owner');
    });

    it('should set required validators only by owner', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setRequiredValidators([signers[1].address, signers[2].address]);

      expect(await bridgeA.requiredValidatorsSet()).eq(2);
      expect(await bridgeA.requiredValidators(signers[1].address)).eq(2);
      expect(await bridgeA.requiredValidators(signers[2].address)).eq(2);

      await expect(
        bridgeA.connect(signers[1]).setRequiredValidators([signers[1].address, signers[2].address]),
      ).revertedWith('owner');
    });
  });

  describe.only('enforce limits', () => {
    it('should enforce tx limit', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      const { txLimit } = await bridgeA.bridgeLimits();
      await token.approve(bridgeA.address, txLimit.mul(2));
      await expect(bridgeA.bridgeTo(signers[1].address, 100, txLimit)).not.reverted;
      await expect(bridgeA.bridgeTo(signers[1].address, 100, txLimit.add(1))).revertedWith('txLimit');
      await expect(bridgeA.bridgeTo(signers[1].address, 100, txLimit)).not.reverted;
    });

    it('should enforce global daily limit', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setBridgeLimits({
        txLimit: 1000,
        dailyLimit: 2000,
        accountDailyLimit: 3000,
        minAmount: 1,
        onlyWhitelisted: false,
      });
      let { txLimit, dailyLimit } = await bridgeA.bridgeLimits();
      expect((await bridgeA.bridgeDailyLimit()).bridged24Hours).eq(0);
      await token.approve(bridgeA.address, dailyLimit.mul(2));
      await expect(bridgeA.bridgeTo(signers[1].address, 100, txLimit)).not.reverted;
      await expect(bridgeA.bridgeTo(signers[1].address, 100, txLimit)).not.reverted;
      await expect(bridgeA.bridgeTo(signers[1].address, 100, 1)).revertedWith('dailyLimit');

      await time.increase(24 * 60 * 60);
      await expect(bridgeA.bridgeTo(signers[1].address, 100, 1)).not.reverted;
      expect((await bridgeA.bridgeDailyLimit()).bridged24Hours).eq(1);
    });

    it('should enforce account daily limit', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setBridgeLimits({
        txLimit: 1000,
        dailyLimit: 2000,
        accountDailyLimit: 1500,
        minAmount: 1,
        onlyWhitelisted: false,
      });
      let { txLimit, dailyLimit } = await bridgeA.bridgeLimits();
      expect((await bridgeA.bridgeDailyLimit()).bridged24Hours).eq(0);
      await token.approve(bridgeA.address, dailyLimit.mul(2));
      await expect(bridgeA.bridgeTo(signers[1].address, 100, txLimit)).not.reverted;
      await expect(bridgeA.bridgeTo(signers[1].address, 100, 500)).not.reverted;
      await expect(bridgeA.bridgeTo(signers[1].address, 100, 1)).revertedWith('accountDailyLimit');

      await time.increase(24 * 60 * 60);
      await expect(bridgeA.bridgeTo(signers[1].address, 100, 1)).not.reverted;
      expect((await bridgeA.accountsDailyLimit(signers[0].address)).bridged24Hours).eq(1);
    });
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

      const staticResult = await bridgeB.callStatic.executeReceipts(1337, [
        { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
      ]);

      expect(staticResult[0][0]).eq('receipt already used');

      const res = bridgeB.executeReceipts(1337, [
        { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
      ]);
      const txData = await (await res).wait();
      const txLog = txData.events?.find((_) => _.event === 'ExecutedTransfer');
      expect(txLog).to.be.undefined();
    });
  });
});
