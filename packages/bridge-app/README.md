# Bridge app based on block header proofs

- main.ts - entry point for the validator app submiting blocks to the registry
- sdk.ts - sdk for submiting signed blocks from the registry to a bridge

## Running the bridge validator app

- Run the script where you run your validator node
- The docker expects a local `fusenet/config` to exists where the private key is
- Alternatively you can provide a private key or mnemonic via env variables `PRIVATE_KEY` and `MNEMONIC` (see below how to set env variables)

```
curl https://raw.githubusercontent.com/GoodDollar/GoodBridge/master/packages/bridge-app/dockerstart.sh -o dockerstart.sh
chmod u+x dockerstart.sh
./dockerstart.sh
```

## Using the sdk

```
import { BridgeSDK } from "@gooddollar/bridge-app/dist/sdk.js";

// blockheaderregistry contract
const registry = "0x44a1E0A83821E239F9Cef248CECc3AC5b910aeD2";

// your custom bridges contracts implementing BridgeCore, key is chainId and value the bridge contract
const bridges = {"122":"0x...","1":"0x..."};

//the checkpoint update frequency
const stepSize = 10;

const bridgeSDK = new BridgeSDK(
    registry,
    bridges,
    stepSize
  );

// relayTx = async (sourceChainId: number, targetChainId: number, txHash: string, signer: Signer)
// this will fetch the signed block from the registry and the receipt proof for that txHash and submit them
// to the bridge contract
const = { relayTxHash, relayPromise } = await sdk.relayTx(sourceChain, targetChain, txHash, signer)
```

## Advanced configuration via env variables

- Edit the dockerstart.sh script and overwrite env variables with `-e`
- OR create a `.env` file in your local `fusenet/config` folder, env vars defined in this file will override any defined via `-e`

## Env variables

- POLLING_INTERVAL (default 5000) - How often to query RPCs for new blocks (milliseconds)
- LOG_LEVEL (default info)
- REGISTRY_RPC (default http://172.17.0.1:8545) - RPC to for the blockchain with the registry contract
- FUSE_RPC (default http://172.17.0.1:8545) - RPC for fuse
- BLOCK_REGISTRY_ADDRESS
- CONSENSUS_ADDRESS (default 0x3014ca10b91cb3D0AD85fEf7A3Cb95BCAc9c0f79) - The fuse consensus contract to fetch latest set of validators and sign them
- TEST_MODE (default false) - When true will not submit blocks to registry
- STEP_SIZE (default 10) - Submit signed blockchain block every STEP_SIZE blocks
- CONFIG_DIR (default /config/) - Docker folder where private key json can be found
- DOTENV_FILE (default /config/.env) - Docker folder for .env to override defaults

## Running app/sdk tests

- first deploy dev env by running in the `bridge-contracts` package the command `yarn start:dev`
- run `yarn test`
