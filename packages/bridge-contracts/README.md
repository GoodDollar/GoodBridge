# Contracts for bridge based on block header proofs

## Contracts

- blockRegistry/BlockHeaderRegistry.sol - Contract allowing fuse validators to submit signed blocks + updated validator set
- bridge/BridgeCore.sol - Basic contract that implements a bridge based on block header proofs, currently only receipts are supported
- bridge/BridgeMixedConsensus.sol - Extension for BridgeCore that allows to trust headers by defining the quorom percentage + a set of validators that MUST sign the block
- bridge/TokenBridge.sol - a token bridge implementation based on liquidity pools

## Deploying the Registry

- The registry should be deployed using hardhat upgrades (openzeppelin)
- It accepts 3 params:
  - voting: The address that can control the registry and upgrade it
  - consensus: The contract implementing IConsensus (ie the fuse consensus)
  - eventsOnly: Wether the contract should only emit events of signed blocks or also store them in contract storage (false)
- Chains can be added by calling `addBlockchain` to tell the validators running the bridge-app which chains to read blocks from
- If you want to use a custom Consensus contract, you can deploy a mock contract for testing see `test/ConsensusMock.sol`

```

  import { ethers, upgrades} from "hardhat";

  const voting=<registry owner>
  const consensus=<fuse consensus contract> ('0x3014ca10b91cb3D0AD85fEf7A3Cb95BCAc9c0f79')
  const eventsOnly=true
  const rf = await ethers.getContractFactory('BlockHeaderRegistry');
  const registery = await upgrades.deployProxy(rf, [voting, consensus, eventsOnly], {
      kind: 'uups',
    });
  console.log('deployed registery to:', registery.address);

  await (await registery.addBlockchain(122, 'https://rpc.fuse.io,https://fuse-rpc.gateway.pokt.network')).wait();
  await (
      await registery.addBlockchain(
        42220,
        'https://rpc.ankr.com/celo,https://forno.celo.org,https://celo-hackathon.lavanet.xyz/celo/http',
      )
    ).wait();
```

## Deploy the TokenBridge

- The token bridge accepts the following params in the constructor
  - address[] memory \_validators - initial validator set
  - uint256 \_cycleEnd - initial fuse cycle end
  - address[] memory \_requiredValidators - a set of required validators for a block to be accepted
  - uint32 \_consensusRatio - percentage 0-100 of validators from the set that needs to sign a block for it to be approved,
  - address \_bridgedToken - address of token to bridge,
  - BridgeFees memory \_fees
  - BridgeLimits memory \_limits
  - IFaucet \_faucet - faucet contract, can be 0x0...
  - INameService \_nameService - nameservice contract to find the identity contract address in case onlyWhitelisted is required. can be 0x0... which will disable onlyWhitelisted

### Example for a fuse/celo bridge

```
  let initValidators = [<initial validators set>];
  let cycleEnd = <fuse consensus cycle end for the initial validator set>;
  let reqValidators = [<required validators set>];
  let consensusRatio = <percentage 0 - 10>;
  let sourceToken = <source bridge token address>
  let targetToken = <target bridge token address>
  let fees = { maxFee: 10000, minFee: 200, fee: 10 },
  let limits = { dailyLimit: 1e10, txLimit: 1e8, accountDailyLimit: 1e9, minAmount: 100000, onlyWhitelisted: false }
  let fuseFaucet = <faucet on fuse>
  let celoFaucet = <faucet on celo>
  let fuseNameService = <nameservice on fuse>
  let celoNameService = <nameservice on celo>
  const celosigner = new ethers.Wallet(process.env.PRIVATE_KEY || '').connect(
    new ethers.providers.JsonRpcProvider('https://forno.celo.org'),
  );
  const fusesigner = celosigner.connect(ethers.provider);


  const tokenBridge = await ethers.getContractFactory('TokenBridge');
  const sourceBridge = await tokenBridge
    .connect(fusesigner)
    .deploy(
      initialValidators,
      cycleEnd,
      reqValidators,
      consensusRatio,
      sourceToken,
      fees,
      limits,
      fuseFaucet,
      fuseNameService,
    );

  const targetBridge = await tokenBridge
    .connect(celosigner)
    .deploy(
      initialValidators,
      cycleEnd,
      reqValidators,
      consensusRatio,
      targetToken,
      fees,
      limits,
      celoFaucet,
      celoNameService,
    );

  //Trusting the bridges...

  console.log('deployed bridges...');
  await (
    await sourceBridge.setSourceBridges([targetBridge.address], [await celosigner.provider.getBlockNumber()])
  ).wait();
  await (
    await targetBridge.setSourceBridges([sourceBridge.address], [await fusesigner.provider.getBlockNumber()])
  ).wait();
```

## Using the bridge

- make sure a validator bridge-app is running (see bridge-app package), so new blocks are signed
- transfer tokens to the bridge by calling `bridgeTo(recipient,targetChainId,amount)`
- create a BridgeSDK (see bridge-app package) instance and call relayTx(sourceChain,targetChain,txHash,ethersSigner)
