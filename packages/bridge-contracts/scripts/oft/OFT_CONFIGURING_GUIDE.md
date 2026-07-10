# OFT bridge deploy & configure

From `packages/bridge-contracts`. Addresses are written to git-ignored hardhat-deploy artifacts:

`deployments/<network>/GoodDollarOFTAdapter.json`  
`deployments/<network>/GoodDollarOFTMinterBurner.json`

## Deploy

```bash
npx hardhat deploy --tags OFT --network production-xdc
npx hardhat deploy --tags OFT --network production-celo
```

Use `development-xdc` / `development-celo` for staging. Deploy **both** chains before configuring (LayerZero wire needs both adapters, and must run while the deployer still owns the OApp).

### Deploy parameters (`deploy/deployOFT.ts`)

| Parameter | Source | Notes |
|-----------|--------|--------|
| Token / NameService / Controller | `@gooddollar/goodprotocol` `deployment.json` for the Hardhat network | Required |
| LayerZero endpoint | `@layerzerolabs/lz-evm-sdk-v2` `EndpointV2.json` via `deploy/utils/getLzEndpoint.ts` (fallback: `LAYERZERO_ENDPOINT` if network unmapped) | Celo/XDC mainnet deployments |
| Proxy CREATE2 salt | `Development-…V1` or `Production-…V1` string hash | Fixed proxy address per env |
| Implementation CREATE2 salt | `keccak256(bytecode)` | Changes when code changes |

## Configure

Hardhat task (`package.json` → `hardhat oft:configure`):

```bash
yarn oft:configure --network production-xdc
yarn oft:configure --network production-celo
```

### Steps (in order)

1. **LayerZero wire** — `lz:oapp:wire --ci` using `scripts/oft/layerzero.config.ts` (peers / DVNs / options). Must run **before** ownership transfer; after Avatar owns the adapter, wiring is not possible from the deployer key.  
2. **Minter role** — grant `MINTER_ROLE` on G$ to `GoodDollarOFTMinterBurner` via Controller/Avatar  
3. **Bridge limits** — `setBridgeLimits` from `scripts/oft/oft.config.json` (still as deployer owner)  
4. **Adapter ownership** — transfer `GoodDollarOFTAdapter` owner to DAO Avatar (**last**)

### Skip flags

```bash
yarn oft:configure --network production-xdc --skip-wire
yarn oft:configure --network production-celo --skip-minter --skip-limits --skip-adapter-ownership
```

| Flag | Skips |
|------|--------|
| `--skip-wire` | Step 1 |
| `--skip-minter` | Step 2 |
| `--skip-limits` | Step 3 |
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

`oft:configure` sets these from the explicit network pair map in `configure-oft.ts`:

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

Today the stack is built for **XDC ↔ CELO** (`layerzero.config.ts`, `OFT_NETWORK_PAIRS`). Adding a third chain needs more than a one-line append — those two-chain helpers must be extended or refactored.

Suggested order:

1. **Hardhat** — add the network in `hardhat.config.ts` (RPC, accounts, and `eid: EndpointId.<CHAIN>_V2_…` like the existing celo/xdc entries)  
2. **Deploy endpoint** — map Hardhat name → `@layerzerolabs/lz-evm-sdk-v2` `deployments/<lz-network>/EndpointV2.json` in `getLzEndpoint.ts`, or set `LAYERZERO_ENDPOINT` for that run (required by the OFT adapter **constructor**, not by `lz:oapp:wire`)  
3. **GoodProtocol** — ensure `deployment.json` (or local overrides) has GoodDollar / NameService / Controller / Avatar for that network (configure steps need them)  
4. **Deploy** — `npx hardhat deploy --tags OFT --network <new-network>` → `deployments/<network>/GoodDollarOFTAdapter.json`  
5. **`layerzero.config.ts`** — add an `OmniPointHardhat` (eid + adapter from `getOftDeploymentAddresses`); add `pathways` for each pair you want (e.g. new↔CELO, new↔XDC). The current file is a single XDC↔CELO pathway driven by `OFT_XDC_NETWORK` / `OFT_CELO_NETWORK` — multi-chain needs that structure updated, not only one new pathway line  
6. **Configure helpers** — `oft.config.json` limits; extend/refactor `OFT_NETWORK_PAIRS` in `configure-oft.ts` so `oft:configure` knows how to set peer env for wiring  
7. **Wire then configure** — `yarn oft:configure --network <new-network>` (and on each peer). Wire runs **first** (deployer must still own the OApp); ownership transfer to Avatar is **last**

`EndpointId` / DVN names: `@layerzerolabs/lz-definitions` and LayerZero metadata for that chain.
