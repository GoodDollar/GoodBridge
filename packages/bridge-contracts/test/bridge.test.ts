import { ethers, waffle, upgrades } from 'hardhat';
import { expect } from 'chai';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { TokenBridge } from '../typechain-types';
import { range } from 'lodash';
import * as SignUtils from '../../bridge-app/src/utils';
import { keccak256 } from 'ethers/lib/utils';

describe('Bridge', () => {
  let signers, bridgeA: TokenBridge, bridgeB: TokenBridge, token;
  before(async () => {
    signers = await ethers.getSigners();
    const validators = signers.slice(0, 5).map((_) => _.address);
    const requiredValidators = validators.slice(0, 2);
    token = await (await ethers.getContractFactory('TestToken')).deploy();
    const ns = await waffle.deployMockContract(signers[0], ['function getAddress(string) returns(address)']);
    const id = await waffle.deployMockContract(signers[0], ['function isWhitelisted(address) returns(bool)']);

    await ns.mock.getAddress.withArgs('IDENTITY').returns(id.address);
    await id.mock.isWhitelisted.returns(true);

    bridgeA = (await upgrades.deployProxy(
      await ethers.getContractFactory('TokenBridge'),
      [
        validators,
        1,
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
        ns.address,
      ],
      { kind: 'uups' },
    )) as TokenBridge;

    bridgeB = (await upgrades.deployProxy(
      await ethers.getContractFactory('TokenBridge'),
      [
        validators,
        1,
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
        ns.address,
      ],
      { kind: 'uups' },
    )) as TokenBridge;

    await token.transfer(bridgeB.address, ethers.constants.WeiPerEther);
    await bridgeA.setSourceBridges([bridgeB.address], [1]);
    await bridgeB.setSourceBridges([bridgeA.address], [1]);
    await loadFixture(cleanFixture);
  });

  const cleanFixture = async () => {
    return { bridgeA, bridgeB };
  };

  const basicFixture = async () => {
    await loadFixture(cleanFixture);
    await token.approve(bridgeA.address, 1000);
    let tx = await (await bridgeA.bridgeTo(signers[1].address, 1337, 1000)).wait();
    return { bridgeA, bridgeB, bridgeFromAToBTx: tx };
  };

  const withCheckpointFixutre = async () => {
    const res = await loadFixture(basicFixture);
    const block = await ethers.provider.send('eth_getBlockByNumber', [
      '0x' + res.bridgeFromAToBTx.blockNumber.toString(16),
      true,
    ]);
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
    await bridgeB.submitBlocks([signedBlock]);
    return res;
  };

  const decimalsFixture = async () => {
    const validators = signers.slice(0, 5).map((_) => _.address);
    const requiredValidators = validators.slice(0, 2);
    const ten = await (await ethers.getContractFactory('TestToken10')).deploy();
    const tenBridge = (await upgrades.deployProxy(
      await ethers.getContractFactory('TokenBridge'),
      [
        validators,
        1,
        requiredValidators.slice(2, 3),
        0,
        ten.address,
        {
          minFee: 0,
          maxFee: 0,
          fee: 10,
        },
        {
          dailyLimit: ethers.constants.WeiPerEther.mul(1e12),
          txLimit: ethers.constants.WeiPerEther.mul(1e12),
          accountDailyLimit: ethers.constants.WeiPerEther.mul(1e12),
          minAmount: 100,
          onlyWhitelisted: true,
        },
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
      ],
      { kind: 'uups' },
    )) as TokenBridge;

    const ray = await (await ethers.getContractFactory('TestToken27')).deploy();
    const rayBridge = (await upgrades.deployProxy(
      await ethers.getContractFactory('TokenBridge'),
      [
        validators,
        1,
        requiredValidators.slice(2, 3),
        0,
        ray.address,
        {
          minFee: 0,
          maxFee: 0,
          fee: 10,
        },
        {
          dailyLimit: ethers.constants.WeiPerEther.mul(1e12),
          txLimit: ethers.constants.WeiPerEther.mul(1e12),
          accountDailyLimit: ethers.constants.WeiPerEther.mul(1e12),
          minAmount: 100,
          onlyWhitelisted: true,
        },
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
      ],
      { kind: 'uups' },
    )) as TokenBridge;

    await ray.transfer(rayBridge.address, ethers.constants.WeiPerEther.mul(1e10));
    await ten.transfer(tenBridge.address, ethers.constants.WeiPerEther);
    await tenBridge.setSourceBridges([rayBridge.address], [1]);
    await rayBridge.setSourceBridges([tenBridge.address], [1]);

    await ten.approve(tenBridge.address, 1e10);
    await ray.approve(rayBridge.address, ethers.constants.WeiPerEther.mul(1e9));
    const tenTx = await (await tenBridge.bridgeTo(signers[1].address, 1337, 1e10)).wait();
    const rayTx = await (
      await rayBridge.bridgeTo(signers[1].address, 1337, ethers.constants.WeiPerEther.mul(1e9))
    ).wait();

    const block = await ethers.provider.send('eth_getBlockByNumber', ['0x' + rayTx.blockNumber.toString(16), true]);
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
    await (await tenBridge.submitBlocks([signedBlock])).wait();
    const tx = await (await rayBridge.submitBlocks([signedBlock])).wait();

    //make sure we have the blocks for the tenTx verified
    const parents = await Promise.all(
      range(rayTx.blockNumber - 1, rayTx.blockNumber - 5).map(async (idx) => {
        const block = await ethers.provider.send('eth_getBlockByNumber', ['0x' + idx.toString(16), false]);
        return SignUtils.prepareBlock(block, 1337);
      }),
    );
    const parentRlps = parents.map((_) => _.rlpHeader);
    await tenBridge.verifyParentBlocks(1337, rayTx.blockNumber, parentRlps, blockHeader.rlpHeader);
    await rayBridge.verifyParentBlocks(1337, rayTx.blockNumber, parentRlps, blockHeader.rlpHeader);

    return { ten, ray, tenBridge, rayBridge, tenTx, rayTx };
  };

  describe('token decimals', () => {
    it('should convert between decimals correctly', async () => {
      const { tenBridge, rayBridge } = await loadFixture(decimalsFixture);

      expect(await tenBridge.normalizeFromTokenTo18Decimals(1e10)).equal(ethers.constants.WeiPerEther);
      expect(await tenBridge.normalizeFrom18ToTokenDecimals(ethers.constants.WeiPerEther)).equal(10000000000);

      expect(await rayBridge.normalizeFromTokenTo18Decimals(ethers.BigNumber.from(10).pow(27))).equal(
        ethers.constants.WeiPerEther,
      );
      expect(await rayBridge.normalizeFrom18ToTokenDecimals(ethers.constants.WeiPerEther)).equal(
        ethers.BigNumber.from(10).pow(27),
      );
    });

    it('should emit normalized 18 decimals amount on bridge request', async () => {
      const { ten, ray, tenBridge, rayBridge } = await loadFixture(decimalsFixture);
      await ten.approve(tenBridge.address, 1e10);
      await ray.approve(rayBridge.address, ethers.constants.WeiPerEther.mul(1e9));
      const { events = [] } = await (await tenBridge.bridgeTo(signers[1].address, 100, 1e10)).wait();
      const request = events.find((_) => _.event === 'BridgeRequest');
      expect(request?.args?.amount).equal(ethers.constants.WeiPerEther);

      const { events: rayEvents } = await (
        await rayBridge.bridgeTo(signers[1].address, 100, ethers.constants.WeiPerEther.mul(1e9))
      ).wait();
      const rayRequest = rayEvents?.find((_) => _.event === 'BridgeRequest');
      expect(rayRequest?.args?.amount).equal(ethers.constants.WeiPerEther);
    });

    it('should release tokens in normalized down to local token decimals', async () => {
      const { ten, tenBridge, rayBridge, rayTx } = await loadFixture(decimalsFixture);

      const proof = await SignUtils.receiptProof(rayTx.transactionHash, ethers.provider);
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

      const tx = await (
        await tenBridge.executeReceipts(1337, [
          { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: rayTx.blockNumber },
        ])
      ).wait();

      //verifying that 1ray was converted to 1e10
      const tenClaimedEvent = tx.events?.find((_) => _.event === 'ExecutedTransfer');
      expect(tenClaimedEvent?.args?.amount).eq(1e10);
      expect(await ten.balanceOf(signers[1].address)).eq(1e10);
    });

    it('should release tokens in normalized up to local token decimals', async () => {
      const { ray, rayBridge, tenTx } = await loadFixture(decimalsFixture);

      const proof = await SignUtils.receiptProof(tenTx.transactionHash, ethers.provider);
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

      const tx = await (
        await rayBridge.executeReceipts(1337, [
          { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tenTx.blockNumber },
        ])
      ).wait();

      //verifying that 1e10 was converted to ray
      const rayClaimedEvent = tx.events?.find((_) => _.event === 'ExecutedTransfer');
      expect(rayClaimedEvent?.args?.amount).eq(ethers.constants.WeiPerEther.mul(1e9));
      expect(await ray.balanceOf(signers[1].address)).eq(ethers.constants.WeiPerEther.mul(1e9));
    });
  });

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
      ).revertedWith('Ownable: caller is not the owner');
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
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('should set faucet only by owner', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setFaucet(signers[1].address);

      expect(await bridgeA.faucet()).eq(signers[1].address);

      await expect(bridgeA.connect(signers[1]).setFaucet(ethers.constants.AddressZero)).revertedWith(
        'Ownable: caller is not the owner',
      );
    });

    it('should set trusted bridges only by owner', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setSourceBridges([signers[1].address, signers[2].address], [5, 5]);

      expect(await bridgeA.sourceBridgeToBlockstart(signers[1].address)).eq(5);
      expect(await bridgeA.sourceBridgeToBlockstart(signers[2].address)).eq(5);

      await expect(
        bridgeA.connect(signers[1]).setSourceBridges([signers[1].address, signers[2].address], [1, 1]),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('should set consensus ratio only by owner', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setConsensusRatio(10n);

      expect(await bridgeA.consensusRatio()).eq(10n);

      await expect(bridgeA.connect(signers[1]).setConsensusRatio(10)).revertedWith('Ownable: caller is not the owner');
    });

    it('should set required validators only by owner', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      await bridgeA.setRequiredValidators([signers[1].address, signers[2].address]);

      expect(await bridgeA.requiredValidatorsSet()).eq(2);
      expect(await bridgeA.requiredValidators(signers[1].address)).eq(2);
      expect(await bridgeA.requiredValidators(signers[2].address)).eq(2);

      await expect(
        bridgeA.connect(signers[1]).setRequiredValidators([signers[1].address, signers[2].address]),
      ).revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('enforce limits', () => {
    it('should enforce tx limit', async () => {
      const { bridgeA } = await loadFixture(basicFixture);
      const { txLimit } = await bridgeA.bridgeLimits();
      await token.approve(bridgeA.address, txLimit.mul(2));
      await expect(bridgeA.bridgeTo(signers[1].address, 100, txLimit)).not.reverted;
      await expect(bridgeA.bridgeTo(signers[1].address, 100, txLimit.add(1))).revertedWith('txLimit');
      await expect(bridgeA.bridgeTo(signers[1].address, 100, txLimit)).not.reverted;
    });

    it('should enforce global daily limit', async () => {
      const { bridgeA } = await loadFixture(cleanFixture);
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
      const { bridgeA } = await loadFixture(cleanFixture);

      await bridgeA.setBridgeLimits({
        txLimit: 1000,
        dailyLimit: 2000,
        accountDailyLimit: 1500,
        minAmount: 1,
        onlyWhitelisted: true,
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

    xit('should enforce min transfer amount', async () => {});
    xit('target address should not be 0 and chain id should be >0', async () => {});
  });

  describe('fees', () => {
    xit('should charge min fee when applicable', async () => {
      //verify both bridge + relayer get the fee
    });
    xit('should charge max fee when applicable', async () => {});
    xit('should charge full fee when relaying', async () => {
      //perform execute receipt by non target/sender
    });
    xit('should charge half fee when self relaying', async () => {
      //perform execute receipt by target/sender
    });
  });
  describe('block proofs', () => {
    let childHeader;
    it('should update validators from signed block of chain 122', async () => {
      await loadFixture(basicFixture);
      const block = await ethers.provider.send('eth_getBlockByNumber', ['latest', false]);
      childHeader = SignUtils.prepareBlock(block, 122);
      const sig1 = await SignUtils.signBlock(childHeader.rlpHeader, 122, signers[0], 10, [
        signers[10].address,
        signers[9].address,
      ]);
      const sig2 = await SignUtils.signBlock(childHeader.rlpHeader, 122, signers[1], 10, [
        signers[10].address,
        signers[9].address,
      ]);
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
      expect(await bridgeB.validatorsCycleEnd()).eq(10);
      expect(await bridgeB.currentValidators(signers[10].address)).eq(10);
      expect(await bridgeB.currentValidators(signers[9].address)).eq(10);
      expect(await bridgeB.chainVerifiedBlocks(122, block.number)).equal(signedBlock.blockHash);
    });

    it('should submit signed block after 10 previous blocks', async () => {
      await loadFixture(basicFixture);
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

    it('should submit signed block with parent blocks and txs via submitChainBlockParentsAndTxs', async () => {
      await loadFixture(basicFixture);
      await token.approve(bridgeA.address, 1000);
      const tx = await (await bridgeA.bridgeTo(signers[1].address, 1337, 1000)).wait();

      for (let i = 0; i < 10; i++) await signers[0].sendTransaction({ value: 0, to: signers[1].address });
      const block = await ethers.provider.send('eth_getBlockByNumber', [
        '0x' + (tx.blockNumber + 9).toString(16),
        false,
      ]);
      const childHeader = SignUtils.prepareBlock(block, 1337);
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

      const parents = await Promise.all(
        range(childHeader.block.number - 1, childHeader.block.number - 11).map(async (idx) => {
          const block = await ethers.provider.send('eth_getBlockByNumber', ['0x' + idx.toString(16), false]);
          return SignUtils.prepareBlock(block, 1337);
        }),
      );
      const parentRlps = parents.map((_) => _.rlpHeader);

      const proof = await SignUtils.receiptProof(tx.transactionHash, ethers.provider);
      const expectedRoot = proof.receiptsRoot;
      const receiptRlp = proof.receiptRlp;

      const mptProof = {
        expectedRoot,
        expectedValue: receiptRlp,
        proof: proof.receiptProof,
        key: SignUtils.index2key(proof.txIndex, proof.receiptProof.length),
        keyIndex: 0,
        proofIndex: 0,
      };

      const proofs = [{ receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber }];

      await expect(bridgeB.submitChainBlockParentsAndTxs(signedBlock, block.number, parentRlps, proofs)).not.reverted;
    });

    xit('it should revert if duplicate signature found', async () => {
      //duplicate one signatures when submitting block
    });
    xit('it should fail consensus', async () => {
      //remove one signature when submitting block
    });

    xit('verifyparentblocks should fail if child rlpheadher hash doesnt match existing submitted block', async () => {
      //add some bytes to the child rlpheader
    });
    xit('verifyparentblocks should fail if parent hash doesnt match grandparent hash', async () => {
      //add a random parent block to the list of blocks
    });
    xit('verifyparentblocks should not fail when verifying parents again', async () => {
      //perform two consecutive calls that shouldnt fail
    });
  });

  describe('transfer and receive', () => {
    it('should transfer to bridge', async () => {
      const { bridgeFromAToBTx } = await loadFixture(basicFixture);
      const bridgeEvent = bridgeFromAToBTx.events?.find((_) => _.event === 'BridgeRequest') || ({} as any);
      expect(bridgeEvent.topics[0]).eq(await bridgeA.BRIDGE_TOPIC());
      expect(bridgeEvent.args.from).to.eq(signers[0].address);
      expect(bridgeEvent.args.to).to.eq(signers[1].address);
      expect(bridgeEvent.args.amount).to.eq(1000);
      expect(bridgeEvent.args.targetChainId).to.eq(1337);
    });

    it('should submit signed block to target bridge', async () => {
      const { bridgeFromAToBTx: tx } = await loadFixture(basicFixture);
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

    it('execute receipt should fail for various reasons', async () => {
      const { bridgeFromAToBTx: tx } = await loadFixture(withCheckpointFixutre);
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
      await expect(
        bridgeA.executeReceipts(1337, [
          { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp + '00', blockNumber: tx.blockNumber },
        ]),
      ).revertedWith('invalid block hash');

      mptProof.keyIndex = 1;
      await expect(
        bridgeB.executeReceipts(1337, [
          { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
        ]),
      ).revertedWith('not start index');

      mptProof.keyIndex = 0;
      mptProof.expectedRoot = expectedRoot.slice(0, -2) + '00';
      await expect(
        bridgeB.executeReceipts(1337, [
          { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
        ]),
      ).revertedWith('receiptRoot mismatch');

      mptProof.expectedRoot = expectedRoot;
      const copy = mptProof.proof[0];
      mptProof.proof[0] = mptProof.proof[0].slice(0, -2) + '00';
      await expect(
        bridgeB.executeReceipts(1337, [
          { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
        ]),
      ).revertedWith('verifyTrieProof root node hash invalid');
    });

    it('should receive from bridge with valid proof', async () => {
      const { bridgeFromAToBTx: tx } = await loadFixture(withCheckpointFixutre);
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
      const { bridgeFromAToBTx: tx } = await loadFixture(withCheckpointFixutre);
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

      await bridgeB.executeReceipts(1337, [
        { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
      ]);

      const staticResult = await bridgeB.callStatic.executeReceipts(1337, [
        { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
      ]);

      expect(staticResult[0][0]).eq('receipt already used');

      const res = bridgeB.executeReceipts(1337, [
        { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
      ]);
      const txData = await (await res).wait();
      const txLog = txData.events?.find((_) => _.event === 'ExecutedTransfer');
      expect(txLog).to.be.undefined;
    });
  });

  describe('token bridge', () => {
    it('should skip old receipt', async () => {
      const { bridgeFromAToBTx: tx } = await loadFixture(withCheckpointFixutre);
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

      await bridgeB.setSourceBridges([bridgeA.address], [tx.blockNumber + 1]);
      const res = await bridgeB.callStatic.executeReceipts(1337, [
        { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
      ]);
      expect(res[0][0]).to.eq('execute failed');
    });

    xit('should not execute if receipt status not 1', async () => {
      //cause bridgeTo to fail by forcing low gas limit
      //call execute receipts
      //verify result [0][0] execute failed
    });

    xit('should not execute if receipt log topic isnt valid', async () => {
      //get receipt proof for some other tx in bridge that generate an event (like submit blocks)
      //call execute receipts
      //verify result[0][0]  = execute failed
    });

    xit('should not execute if target chainid does not match', async () => {
      //create bridgeto with some invalid chainid
      //verify result[0][0]  = execute failed
    });

    it('should call topgas and not fail on revert', async () => {
      const { bridgeFromAToBTx: tx } = await loadFixture(withCheckpointFixutre);
      const faucet = await waffle.deployMockContract(signers[0], [
        'function canTop(address account ) view returns (bool valid)',
        'function topWallet(address account)',
      ]);
      await faucet.mock.canTop.returns(true);
      await faucet.mock.topWallet.revertsWithReason('xxx');
      await bridgeB.setFaucet(faucet.address);
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

      await expect(
        bridgeB.executeReceipts(1337, [
          { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
        ]),
      ).not.reverted;
    });

    it('should call topgas', async () => {
      const { bridgeFromAToBTx: tx } = await loadFixture(withCheckpointFixutre);
      const faucet = await waffle.deployMockContract(signers[0], [
        'function canTop(address account ) view returns (bool valid)',
        'function topWallet(address account)',
      ]);
      await faucet.mock.canTop.returns(true);
      await faucet.mock.topWallet.returns();
      await bridgeB.setFaucet(faucet.address);

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

      await expect(
        bridgeB.executeReceipts(1337, [
          { receiptProofs: [mptProof], blockHeaderRlp: proof.headerRlp, blockNumber: tx.blockNumber },
        ]),
      ).not.reverted;
    });

    xit('should not allow to bridge when closed', async () => {
      //set bridge as closed
    });
    xit('should not allow to bridge if whitelisted required and account not whitelisted', async () => {
      //turn on bridge whitelisting requirement
      //mock identity contract
      //set bridge identity
      //call to bridge should revert
    });

    xit('should bridge with/withoutout relay', async () => {
      //call bridgewithoutrelay
      //event with relay=false should be emitted
      //call bridge
      //event with relay=true should be emitted
    });
    xit('only owner should be able to withdraw/close bridge', async () => {
      //check that close+withdraw call not with owner reverts with correct reason
      //verify that call to close+withdraw by owner returns token balance to owner and close bridge
    });

    xit('should be able to bridge using transferAndCall without relay in data', async () => {
      //create a bridge with a token that supports transferAndCall (erc677) - you can use GoodDollar @gooddollar/goodprotocol
      //encode in data chainId + targetAddress
      //verify event was emitted with relay = true
    });
    xit('should be able to bridge using transferAndCall with relay in data', async () => {
      //create a bridge with a token that supports transferAndCall (erc677) - you can use GoodDollar @gooddollar/goodprotocol
      //encode in data chainId + targetAddress + withoutRelay (true)
      //verify event was emitted with relay = false
    });
    xit('should be able to bridge using transferAndCall with relay in data', async () => {
      //create a bridge with a token that supports transferAndCall (erc677) - you can use GoodDollar @gooddollar/goodprotocol
      //encode in data chainId + targetAddress + withoutRelay (true)
      //verify event was emitted with relay = false
    });
  });
});
