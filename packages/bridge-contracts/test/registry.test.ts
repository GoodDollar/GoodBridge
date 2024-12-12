import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';

describe('BlockHeaderRegistry', () => {
  let BlockHeaderRegistry;
  let blockHeaderRegistry;
  let Voting;
  let voting;
  let Consensus;
  let consensus;
  let signers;
  let signer;
  let header;
  let blockHash;
  beforeEach(async () => {
    signers = await ethers.getSigners();
    Voting = await ethers.getContractFactory('VotingMock');
    voting = await Voting.deploy();
    await voting.deployed();
    Consensus = await ethers.getContractFactory('ConsensusMock');
    consensus = await Consensus.deploy([signers[0].address, signers[2].address]);
    await consensus.deployed();
    BlockHeaderRegistry = await ethers.getContractFactory('BlockHeaderRegistry');
    blockHeaderRegistry = await upgrades.deployProxy(BlockHeaderRegistry, [voting.address, consensus.address, false], {
      kind: 'uups',
    });
    await blockHeaderRegistry.deployed();
    blockHash = '0x5d15649e25d8f3e2c0374946078539d200710afc977cdfc6a977bd23f20fa8e8';

    signer = signers[0];
    header = {
      ParentHash: '0x1e77d8f1267348b516ebc4f4da1e2aa59f85f0cbd853949500ffac8bfc38ba14',
      UncleHash: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
      Coinbase: '0x2a65Aca4D5fC5B5C859090a6c34d164135398226',
      Root: '0x0b5e4386680f43c224c5c037efc0b645c8e1c3f6b30da0eec07272b4e6f8cd89',
      TxHash: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      ReceiptHash: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      Bloom:
        '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      Difficulty: ethers.utils.hexlify(6022643743806),
      Number: ethers.utils.hexlify(400000),
      GasLimit: ethers.utils.hexlify(3141592),
      GasUsed: '0x', //(0).toString(16),
      Time: ethers.utils.hexlify(1445130204),
      Extra: '0xd583010202844765746885676f312e35856c696e7578',
      MixDigest: '0x3fbea7af642a4e20cd93a945a1f5e23bd72fc5261153e09102cf718980aeff38',
      Nonce: '0x6af23caae95692ef',
      //				'BaseFee': 0
    };
  });

  const blockData = (rlpHeader, blockHash, r, vs) => {
    return [[rlpHeader, [r, vs], 1, blockHash, 0, []]];
  };
  const blockData10x = (rlpHeader, blockHash, r, vs) => {
    return [
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
    ];
  };
  const blockData2x = (rlpHeader, blockHash, r, vs) => {
    return [
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
      [rlpHeader, [r, vs], 1, blockHash, 0, []],
    ];
  };
  const addSigBlocks = async (signerToUse, rlpHeaderp) => {
    const bhash = ethers.utils.keccak256(rlpHeaderp);
    const payload = ethers.utils.keccak256(
      ethers.utils.solidityPack(['bytes32', 'uint256', 'address[]', 'uint256'], [bhash, 1, [], 0]),
    );
    const { _vs: vs, r } = ethers.utils.splitSignature(await signerToUse.signMessage(ethers.utils.arrayify(payload)));
    const tx = await blockHeaderRegistry.connect(signerToUse).addSignedBlocks(blockData(rlpHeaderp, bhash, r, vs));

    const rx = await tx.wait();
    expect(rx.status).equal(1);
    return payload;
  };

  describe('Blockchains', () => {
    it('[ @skip-on-coverage ] Should cost less gas with events only', async () => {
      const eventsOnly = await upgrades.deployProxy(BlockHeaderRegistry, [voting.address, consensus.address, true], {
        kind: 'uups',
      });
      const rlpHeader = ethers.utils.RLP.encode(Object.values(header).map((v) => (v === 0 ? '0x' : v)));

      const bhash = ethers.utils.keccak256(rlpHeader);
      const payload = ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'uint256', 'address[]', 'uint256'], [bhash, 1, [], 0]),
      );
      const { _vs: vs, r } = ethers.utils.splitSignature(await signers[0].signMessage(ethers.utils.arrayify(payload)));
      const tx = await (
        await eventsOnly.connect(signers[0]).addSignedBlocks(blockData10x(rlpHeader, bhash, r, vs))
      ).wait();

      expect(tx.logs.length).eq(10);
      expect(tx.gasUsed).lt(600000);
    });

    it('Should add a new blockchain', async () => {
      const tx = await voting.addBlockchain(blockHeaderRegistry.address, 1337, 'http://localhost:8545');
      const rx = await tx.wait();
      expect(rx.status).equal(1);
    });

    it('Should not add a new blockchain from a random caller', async () => {
      const signer = signers[1];
      await expect(blockHeaderRegistry.connect(signer).addBlockchain(1337, 'http://localhost:8545')).to.be.revertedWith(
        'onlyVoting',
      );
    });
  });

  describe('Signed blocks', () => {
    it('Should return the block hash with most signatures', async () => {
      const rlpHeader = ethers.utils.RLP.encode(Object.values(header).map((v) => (v === 0 ? '0x' : v)));
      await addSigBlocks(signers[0], rlpHeader);

      const header2 = {
        ...header,
        ReceiptHash: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b420',
      };

      const rlpHeader2 = ethers.utils.RLP.encode(Object.values(header2));
      const payload2 = ethers.utils.keccak256(rlpHeader2);

      await addSigBlocks(signers[0], rlpHeader2);
      await addSigBlocks(signers[2], rlpHeader2);

      const block = await blockHeaderRegistry.getSignedBlock(1, header.Number);
      expect(block.blockHash).equal(payload2);
    });

    it('Should fail if the rlpHeaderHash is not the blockHash', async () => {
      const rlpHeader = ethers.utils.RLP.encode(Object.values(header).map((v) => (v === 0 ? '0x' : v)));
      const bhash = ethers.utils.keccak256(rlpHeader);
      const payload = ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'uint256', 'address[]', 'uint256'], [bhash, 1, [], 0]),
      );

      const { _vs: vs, r } = ethers.utils.splitSignature(await signer.signMessage(ethers.utils.arrayify(payload)));
      await expect(
        blockHeaderRegistry.connect(signer).addSignedBlocks([[rlpHeader.slice(0, -10), [r, vs], 1, bhash, 0, []]]),
      ).revertedWith('rlpHeaderHash');
    });

    it('Should fail if there are no signed blocks at some height', async () => {
      await expect(blockHeaderRegistry.getSignedBlock(1, 0)).revertedWith('_blockHashes.length');
    });

    it('[ @skip-on-coverage ] Should skip already signed block at the same height', async () => {
      const signer = signers[0];
      const rlpHeader = ethers.utils.RLP.encode(Object.values(header).map((v) => (v === 0 ? '0x' : v)));
      const bhash = ethers.utils.keccak256(rlpHeader);
      const payload = ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'uint256', 'address[]', 'uint256'], [bhash, 1, [], 0]),
      );

      const { _vs: vs, r } = ethers.utils.splitSignature(await signer.signMessage(ethers.utils.arrayify(payload)));
      const tx = await blockHeaderRegistry.connect(signer).addSignedBlocks([[rlpHeader, [r, vs], 1, bhash, 0, []]]);
      await tx.wait();
      const expectedGas = await blockHeaderRegistry
        .connect(signer)
        .estimateGas.addSignedBlocks([[rlpHeader, [r, vs], 1, bhash, 0, []]]);

      expect(expectedGas).lt(79500);
      await expect(blockHeaderRegistry.connect(signer).addSignedBlocks([[rlpHeader, [r, vs], 1, bhash, 0, []]])).not
        .reverted;
    });

    it('Should add a signed block from another signer', async () => {
      const rlpHeader = ethers.utils.RLP.encode(Object.values(header).map((v) => (v === 0 ? '0x' : v)));
      const bhash = ethers.utils.keccak256(rlpHeader);
      const payload = ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'uint256', 'address[]', 'uint256'], [bhash, 1, [], 0]),
      );

      const { _vs: vs, r } = ethers.utils.splitSignature(await signer.signMessage(ethers.utils.arrayify(payload)));
      await expect(blockHeaderRegistry.connect(signers[2]).addSignedBlocks([[rlpHeader, [r, vs], 1, bhash, 0, []]])).not
        .reverted;
      expect(await blockHeaderRegistry.hasValidatorSigned(payload, signer.address)).true;
    });

    it('Should add and get a EVM signed block', async () => {
      const rlpHeader = ethers.utils.RLP.encode(Object.values(header).map((v) => (v === 0 ? '0x' : v)));
      const payload = await addSigBlocks(signer, rlpHeader);
      const bhash = await blockHeaderRegistry.blockHashes(1, header.Number, 0);
      expect(bhash).equal(payload);
      const block = await blockHeaderRegistry.getSignedBlock(1, header.Number);
      expect(block.blockHash).equal(ethers.utils.keccak256(rlpHeader));
    });

    it('Should not let a non-validator add a signed block', async () => {
      signer = signers[1];
      const rlpHeader = ethers.utils.RLP.encode(Object.values(header).map((v) => (v === 0 ? '0x' : v)));

      const bhash = ethers.utils.keccak256(rlpHeader);
      const payload = ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'uint256', 'address[]', 'uint256'], [bhash, 1, [], 0]),
      );

      const { _vs: vs, r } = ethers.utils.splitSignature(await signer.signMessage(ethers.utils.arrayify(payload)));
      await expect(
        blockHeaderRegistry.connect(signer).addSignedBlocks([[rlpHeader, [r, vs], 1, bhash, 0, []]]),
      ).revertedWith('not validator');
    });

    it('Should add and get a fuse signed block', async () => {
      const rlpHeader = ethers.utils.RLP.encode(Object.values(header).map((v) => (v === 0 ? '0x' : v)));
      const blockHash = '0x5d15649e25d8f3e2c0374946078539d200710afc977cdfc6a977bd23f20fa8e8';
      expect(blockHash).equal(ethers.utils.keccak256(rlpHeader));
      const validators = ['0x1111111111111111111111111111111111111111'];
      const cycleEnd = Math.floor(Date.now() / 1000);
      const packed = ethers.utils.solidityPack(
        ['bytes32', 'uint256', 'address[]', 'uint256'],
        [blockHash, 122, validators, cycleEnd],
      );
      const payload = ethers.utils.keccak256(packed);
      const { _vs: vs, r } = ethers.utils.splitSignature(await signer.signMessage(ethers.utils.arrayify(payload)));
      const tx = await blockHeaderRegistry
        .connect(signer)
        .addSignedBlocks([[rlpHeader, [r, vs], 0x7a, blockHash, cycleEnd, validators]]);
      const rx = await tx.wait();
      expect(rx.status).equal(1);
      const bhash = await blockHeaderRegistry.blockHashes(0x7a, header.Number, 0);
      expect(bhash).equal(payload);
      const block = await blockHeaderRegistry.getSignedBlock(0x7a, header.Number);
      expect(block.blockHash).equal(blockHash);
      const header2 = {
        ...header,
        ReceiptHash: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b420',
      };
      const rlpHeader2 = ethers.utils.RLP.encode(Object.values(header2));
      const blockHash2 = ethers.utils.keccak256(rlpHeader2);
      const packed2 = ethers.utils.solidityPack(
        ['bytes32', 'uint256', 'address[]', 'uint256'],
        [blockHash2, 122, validators, cycleEnd],
      );
      const payload2 = ethers.utils.keccak256(packed2);
      const { _vs: vs2, r: r2 } = ethers.utils.splitSignature(
        await signer.signMessage(ethers.utils.arrayify(payload2)),
      );
      const tx2 = await blockHeaderRegistry
        .connect(signer)
        .addSignedBlocks([[rlpHeader2, [r2, vs2], 0x7a, blockHash2, cycleEnd, validators]]);
      const rx2 = await tx2.wait();
      expect(rx2.status).equal(1);
      const block2 = await blockHeaderRegistry.getSignedBlock(0x7a, header2.Number);
      expect(block2.blockHash).equal(blockHash);
      const signer2 = signers[2];
      const { _vs: vs3, r: r3 } = ethers.utils.splitSignature(
        await signer2.signMessage(ethers.utils.arrayify(payload2)),
      );
      const tx3 = await blockHeaderRegistry
        .connect(signers[2])
        .addSignedBlocks([[rlpHeader2, [r3, vs3], 0x7a, blockHash2, cycleEnd, validators]]);
      const rx3 = await tx3.wait();
      const block3 = await blockHeaderRegistry.getSignedBlock(0x7a, header2.Number);
      expect(block3.blockHash).equal(blockHash2);
    });
  });
});
