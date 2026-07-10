# OFT (Omnichain Fungible Token) Configuration Guide

Configure the GoodDollar OFT bridge between XDC and CELO (LayerZero). Post-deploy steps live under `scripts/oft/` and are orchestrated by `yarn oft:configure`.

## Overview

1. Deploy OFT proxies/implementations (`deploy/deployOFT.ts`)
2. Configure each network with `yarn oft:configure` (grant minter → limits → LayerZero wire → adapter ownership)
3. Later upgrades use `deploy/upgradeOFT.ts` (`OFT-Upgrade` tag); **proxy addresses stay unchanged**

## Config values explained

### CREATE2 salts (`deploy/deployOFT.ts`)

| Salt | How it is derived | Purpose |
|------|-------------------|---------|
| Proxy salt (MinterBurner) | `keccak256("Development-GoodDollarOFTMinterBurnerV1")` or `Production-...V1` | Deterministic **proxy** address per env |
| Proxy salt (OFT Adapter) | `keccak256("Development-GoodDollarOFTAdapterV1")` or `Production-...V1` | Deterministic **proxy** address per env |
| Implementation salt | `keccak256(compiled bytecode)` of each contract | Deterministic **implementation** address; changes when bytecode changes |

Proxy salts are fixed strings so redeploys of the same env target the same proxy addresses. Implementation salts track bytecode so a new implementation gets a new CREATE2 address without moving the proxy.

### LayerZero endpoints (`deploy/deployOFT.ts`)

Passed as constructor args to `GoodDollarOFTAdapter` implementation:

| Hardhat network | Endpoint |
|-----------------|----------|
| `development-celo` / `production-celo` | `0x1a44076050125825900e736c501f859c50fE728c` |
| `development-xdc` / `production-xdc` | `0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa` |

Override with `LAYERZERO_ENDPOINT` if needed. Wiring peers/DVNs uses `layerzero.config.ts` (not these constructor args alone).

`layerzero.config.ts` loads adapter addresses from hardhat-deploy artifacts. Pair networks via env (set automatically by `oft:configure`):

- `OFT_XDC_NETWORK` — default `development-xdc`
- `OFT_CELO_NETWORK` — default `development-celo`

### Bridge limits (`scripts/oft/oft.config.json`)

Per-network `limits` object (human-readable G$ amounts; the script converts to 18-decimal wei when the string is short / decimal):

| Field | Meaning |
|-------|---------|
| `dailyLimit` | Max total G$ bridged in a rolling 24h window (global) |
| `txLimit` | Max G$ per single bridge transaction |
| `accountDailyLimit` | Max G$ one account can bridge in a rolling 24h window |
| `minAmount` | Minimum G$ amount per bridge transaction |
| `onlyWhitelisted` | If `true`, only Identity-whitelisted senders may bridge |

Skip behavior is controlled by CLI flags on `yarn oft:configure`, not by this JSON file.

Example:

```json
{
  "production-xdc": {
    "limits": {
      "dailyLimit": "1000000",
      "txLimit": "100000",
      "accountDailyLimit": "50000",
      "minAmount": "10",
      "onlyWhitelisted": false
    }
  }
}
```

## Step 1: Deploy OFT contracts

```bash
npx hardhat deploy --tags OFT --network development-xdc
npx hardhat deploy --tags OFT --network development-celo

npx hardhat deploy --tags OFT --network production-xdc
npx hardhat deploy --tags OFT --network production-celo
```

This deploys upgradeable proxies for `GoodDollarOFTMinterBurner` and `GoodDollarOFTAdapter` and writes addresses under `deployments/<network>/` (git-ignored).

`GoodDollarOFTMinterBurner.initialize(nameService, adapter)` sets the OFT adapter as operator; no separate set-operator step is required for the happy path.

## Step 2: Configure (`yarn oft:configure`)

Run on **each** network after both sides are deployed (wire needs both adapters in artifacts):

```bash
yarn oft:configure --network production-xdc
yarn oft:configure --network production-celo
```

Development:

```bash
yarn oft:configure --network development-xdc
yarn oft:configure --network development-celo
```

### Order of steps

1. Grant `MINTER_ROLE` to `GoodDollarOFTMinterBurner` (via Controller/Avatar)
2. Set bridge limits from `oft.config.json`
3. Wire LayerZero (`lz:oapp:wire --ci`) using `layerzero.config.ts`
4. Transfer `GoodDollarOFTAdapter` ownership to DAO Avatar (`adapter-ownership.ts`)

Ownership transfer is last so limits and wiring still run as the deployer owner.

### CLI flags

```bash
yarn oft:configure --network production-xdc --skip-wire
yarn oft:configure --network production-celo --skip-minter --skip-limits
yarn oft:configure --network production-xdc --skip-adapter-ownership
```

| Flag | Effect |
|------|--------|
| `--skip-minter` | Skip granting MINTER_ROLE |
| `--skip-limits` | Skip `setBridgeLimits` |
| `--skip-wire` | Skip `lz:oapp:wire` |
| `--skip-adapter-ownership` | Skip ownership transfer to Avatar |

### Individual helpers (optional)

Helpers used by `oft:configure` can still be run alone:

```bash
npx hardhat run scripts/oft/grant-minter-role.ts --network production-xdc
npx hardhat run scripts/oft/set-bridge-limits.ts --network production-xdc
npx hardhat lz:oapp:wire --oapp-config ./layerzero.config.ts --network production-xdc --ci
npx hardhat run scripts/oft/adapter-ownership.ts --network production-xdc
```

Other utilities:

- `scripts/oft/adapter-ownership.ts` — transfer adapter ownership to Avatar (also step 4 of `oft:configure`)
- `scripts/oft/bridge-oft-token.ts` — manual bridge smoke test
- `scripts/oft/set-oft-operator.ts` — set operator if needed outside initialize
- `scripts/oft/transfer-oft-adapter-ownership-from-avatar.ts` — transfer ownership away from Avatar via Controller

### LayerZero wire notes

- Wiring may fail with permission errors (`0xc4c52593`) if the OApp owner lacks endpoint delegate permissions
- Prefer running wire **before** transferring ownership to Avatar
- `oft:configure` sets `OFT_XDC_NETWORK` / `OFT_CELO_NETWORK` from whether the Hardhat network name contains `production`

## Upgrades

Proxy addresses remain fixed. Deploy new implementations and point proxies at them:

```bash
npx hardhat deploy --tags OFT-Upgrade --network production-xdc
npx hardhat deploy --tags OFT-Upgrade --network production-celo
```

## Verification checklist

1. Addresses present in `deployments/<network>/GoodDollarOFTAdapter.json` and `GoodDollarOFTMinterBurner.json`
2. `GoodDollarOFTMinterBurner` has minter role on GoodDollar
3. LayerZero peers configured between XDC and CELO
4. Bridge limits match `oft.config.json`
5. OFT adapter `owner()` is DAO Avatar (after configure without `--skip-adapter-ownership`)
