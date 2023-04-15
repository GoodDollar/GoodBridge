import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('TestRLPParser', function () {
  it('should return the correct block receiptsRoot for Celo', async function () {
    const rlpHeader =
      '0xf9025ba0da3ad238e953b53fbff4abf9aca0695fe1d184f7323a13f6dfaf301f86fa024e94a66e834933e2c51542e95477d71f5a0aaf7d4999a05ef9062b21491902565ecc4da5d11840ed39fee113098808bf12fdf48c9ac0f3a03810c781bd05b16d56cacbb3933c92cc337b1a0d69c80047225d4f0cd28ca690a0bb378148b985cbd491bea26a17b17d1cd55dcb4a6625a2f4c2f76b35eea27f0eb901000080000000020000000024004002000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000200020000000000000000084000200400000000000000000000000000000000040000000040000000800800000000000000004081000000000000000000008000000040008000000000080000000000000080000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000010000000200000000000000000000000000040000000000000000000000002000002000000000000000000002000000000000000000084011e1cec830a987a846438756fb8afd983010700846765746889676f312e31372e3133856c696e7578000000000000f88dc0c080b841e87a93c9a5871e405b8d4d63821c0ad490b49a656babce6c07eb4857f58662370c68e0385af96cfb397c75c1513bf7065a8cd89e686e3e804b0fc48d7a2dfa8500c3808080f8418e3fffffffffffffffffffefffffffb0797a8a3efe1aa3717445ab60433dc90070aec61b12306febe4595ceb86cdcb87a2d39e3c112d243906e63bbec87e550180';
    const chainId = 42220;
    const expectedRoot = '0xbb378148b985cbd491bea26a17b17d1cd55dcb4a6625a2f4c2f76b35eea27f0e';

    const RLPParser = await ethers.getContractFactory('TestRLPParser');
    const parser = await RLPParser.deploy();

    const root = await parser.testGetBlockReceiptsRoot(chainId, rlpHeader);
    expect(root).to.equal(expectedRoot);
  });

  it('should return the correct block number for Celo', async function () {
    const rlpHeader =
      '0xf9025ba0da3ad238e953b53fbff4abf9aca0695fe1d184f7323a13f6dfaf301f86fa024e94a66e834933e2c51542e95477d71f5a0aaf7d4999a05ef9062b21491902565ecc4da5d11840ed39fee113098808bf12fdf48c9ac0f3a03810c781bd05b16d56cacbb3933c92cc337b1a0d69c80047225d4f0cd28ca690a0bb378148b985cbd491bea26a17b17d1cd55dcb4a6625a2f4c2f76b35eea27f0eb901000080000000020000000024004002000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000200020000000000000000084000200400000000000000000000000000000000040000000040000000800800000000000000004081000000000000000000008000000040008000000000080000000000000080000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000010000000200000000000000000000000000040000000000000000000000002000002000000000000000000002000000000000000000084011e1cec830a987a846438756fb8afd983010700846765746889676f312e31372e3133856c696e7578000000000000f88dc0c080b841e87a93c9a5871e405b8d4d63821c0ad490b49a656babce6c07eb4857f58662370c68e0385af96cfb397c75c1513bf7065a8cd89e686e3e804b0fc48d7a2dfa8500c3808080f8418e3fffffffffffffffffffefffffffb0797a8a3efe1aa3717445ab60433dc90070aec61b12306febe4595ceb86cdcb87a2d39e3c112d243906e63bbec87e550180';
    const chainId = 42220;
    const expectedBlockNumber = Number(0x11e1cec);

    const RLPParser = await ethers.getContractFactory('TestRLPParser');
    const parser = await RLPParser.deploy();

    const blockNumber = await parser.testGetBlockNumber(chainId, rlpHeader);
    expect(blockNumber).to.equal(expectedBlockNumber);
  });

  it('should return the correct block parent and number for Celo', async function () {
    const rlpHeader =
      '0xf9025ba0da3ad238e953b53fbff4abf9aca0695fe1d184f7323a13f6dfaf301f86fa024e94a66e834933e2c51542e95477d71f5a0aaf7d4999a05ef9062b21491902565ecc4da5d11840ed39fee113098808bf12fdf48c9ac0f3a03810c781bd05b16d56cacbb3933c92cc337b1a0d69c80047225d4f0cd28ca690a0bb378148b985cbd491bea26a17b17d1cd55dcb4a6625a2f4c2f76b35eea27f0eb901000080000000020000000024004002000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000200020000000000000000084000200400000000000000000000000000000000040000000040000000800800000000000000004081000000000000000000008000000040008000000000080000000000000080000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000010000000200000000000000000000000000040000000000000000000000002000002000000000000000000002000000000000000000084011e1cec830a987a846438756fb8afd983010700846765746889676f312e31372e3133856c696e7578000000000000f88dc0c080b841e87a93c9a5871e405b8d4d63821c0ad490b49a656babce6c07eb4857f58662370c68e0385af96cfb397c75c1513bf7065a8cd89e686e3e804b0fc48d7a2dfa8500c3808080f8418e3fffffffffffffffffffefffffffb0797a8a3efe1aa3717445ab60433dc90070aec61b12306febe4595ceb86cdcb87a2d39e3c112d243906e63bbec87e550180';
    const chainId = 42220;
    const expectedBlockNumber = Number(0x11e1cec);
    const expectedParentHash = '0xda3ad238e953b53fbff4abf9aca0695fe1d184f7323a13f6dfaf301f86fa024e';

    const RLPParser = await ethers.getContractFactory('TestRLPParser');
    const parser = await RLPParser.deploy();

    const [blockNumber, parentHash] = await parser.testGetBlockParentAndNumber(chainId, rlpHeader);
    expect(blockNumber).to.equal(expectedBlockNumber);
    expect(parentHash).to.equal(expectedParentHash);
  });
});
