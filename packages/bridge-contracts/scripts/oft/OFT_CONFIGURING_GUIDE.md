# OFT bridge deploy & configure

From `packages/bridge-contracts`. Addresses are written to git-ignored hardhat-deploy artifacts:

`deployments/<network>/GoodDollarOFTAdapter.json`  
`deployments/<network>/GoodDollarOFTMinterBurner.json`

## Deploy

```bash
npx hardhat deploy --tags OFT --network production-xdc
npx hardhat deploy --tags OFT --network production-celo
```

Use `development-xdc` / `development-celo` for staging. Deploy **both** chains before configure (wiring needs both adapters).

### Deploy parameters (`deploy/deployOFT.ts`)

| Parameter | Source | Notes |
|-----------|--------|--------|
| Token / NameService / Controller | `@gooddollar/goodprotocol` `deployment.json` for the Hardhat network | Required |
| LayerZero endpoint | `@layerzerolabs/lz-evm-sdk-v2` `EndpointV2.json` via `deploy/utils/getLzEndpoint.ts` (override: `LAYERZERO_ENDPOINT`) | Celo/XDC mainnet deployments |
| Proxy CREATE2 salt | `Development-…V1` or `Production-…V1` string hash | Fixed proxy address per env |
| Implementation CREATE2 salt | `keccak256(bytecode)` | Changes when code changes |

## Configure

```bash
yarn oft:configure --network production-xdc
yarn oft:configure --network production-celo
```

### Steps (in order)

1. **Minter role** — grant `MINTER_ROLE` on G$ to `GoodDollarOFTMinterBurner` via Controller/Avatar  
2. **Bridge limits** — `setBridgeLimits` from `scripts/oft/oft.config.json`  
3. **LayerZero wire** — `lz:oapp:wire --ci` using `scripts/oft/layerzero.config.ts` (peers / DVNs / options)  
4. **Adapter ownership** — transfer `GoodDollarOFTAdapter` owner to DAO Avatar  

### Skip flags

```bash
yarn oft:configure --network production-xdc --skip-wire
yarn oft:configure --network production-celo --skip-minter --skip-limits --skip-adapter-ownership
```

| Flag | Skips |
|------|--------|
| `--skip-minter` | Step 1 |
| `--skip-limits` | Step 2 |
| `--skip-wire` | Step 3 |
| `--skip-adapter-ownership` | Step 4 |

### Limit parameters (`oft.config.json`)

Values are **G$ amounts** (e.g. `"100"` → 100 G$), not wei:

| Field | Meaning |
|-------|---------|
| `dailyLimit` | Max G$ bridged per 24h (all users) |
| `txLimit` | Max G$ in one tx |
| `accountDailyLimit` | Max G$ per account per 24h |
| `minAmount` | Min G$ per tx |
| `onlyWhitelisted` | `true` → only Identity-whitelisted senders |

### LayerZero pair env

`oft:configure` sets these from the network name (`production` vs `development`):

- `OFT_XDC_NETWORK`
- `OFT_CELO_NETWORK`

## Upgrade

Proxy addresses stay the same:

```bash
npx hardhat deploy --tags OFT-Upgrade --network production-xdc
npx hardhat deploy --tags OFT-Upgrade --network production-celo
```

## Bridge (smoke test)

After deploy + configure on **both** chains, send ~1 G$ from the source network:

```bash
npx hardhat run scripts/oft/bridge-oft-token.ts --network production-xdc
npx hardhat run scripts/oft/bridge-oft-token.ts --network production-celo
```

`--network` is the **source** chain (XDC → CELO or CELO → XDC). Needs G$ on source, native gas for the tx + LayerZero fee, peers wired, and minter role on both sides. Track delivery on [LayerZero Scan](https://layerzeroscan.com/).

## Add a network for LayerZero wiring

Today wiring is **XDC ↔ CELO** in `scripts/oft/layerzero.config.ts`. To add another chain:

1. **Deploy** OFT on the new Hardhat network (`--tags OFT`) so `deployments/<network>/GoodDollarOFTAdapter.json` exists  
2. **Hardhat** — network entry in `hardhat.config.ts` (RPC + accounts)  
3. **Endpoint** — map the Hardhat network → `@layerzerolabs/lz-evm-sdk-v2` `deployments/<lz-network>/EndpointV2.json` in `deploy/utils/getLzEndpoint.ts` (or set `LAYERZERO_ENDPOINT`)  
4. **`layerzero.config.ts`** — new `OmniPointHardhat` with `EndpointId.<CHAIN>_V2_…` + adapter address from `getOftDeploymentAddresses`  
5. **Pathway** — append a `pathways` entry: `[dest, src, DVNs, confirmations, enforcedOptions]` (same shape as the existing XDC↔CELO pair)  
6. **Configure helpers** — limits in `oft.config.json`; if `oft:configure` pair env only knows xdc/celo, extend `resolveOftPairNetworks` (or set `OFT_*_NETWORK` yourself)  
7. **Wire** — `yarn oft:configure --network <new-network>` (and on each peer you care about)

`EndpointId` values come from `@layerzerolabs/lz-definitions`. DVN names must match LayerZero metadata for that chain.
