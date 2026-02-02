# OFT (Omnichain Fungible Token) Configuration Guide

This guide explains how to configure the GoodDollar OFT bridge between XDC and CELO networks using LayerZero.

## Overview

The OFT bridge enables cross-chain transfers of GoodDollar (G$) tokens between XDC and CELO networks. The setup involves deploying contracts, configuring permissions, setting up LayerZero connections, and configuring bridge limits.


## Configuration File

All configuration values are stored in `scripts/oft/oft.config.json`. Each network has its own configuration entry.

### Configuration Structure

```json
{
  "development-xdc": {
    "skipTransferOwnership": false,
    "skipWiring": false,
    "skipLimits": false,
    "skipBridgeTest": true,
    "limits": {
      "dailyLimit": "5000",
      "txLimit": "1000",
      "accountDailyLimit": "1000",
      "minAmount": "1",
      "onlyWhitelisted": false
    }
  },
  "development-celo": {
    // ... same structure
  },
  "production-xdc": {
    // ... same structure
  },
  "production-celo": {
    // ... same structure
  }
}
```

### Configuration Options

- **skipTransferOwnership**: Skip transferring OFT adapter ownership to DAO Avatar
- **skipWiring**: Skip LayerZero wiring (requires manual configuration)
- **skipLimits**: Skip setting bridge limits
- **skipBridgeTest**: Skip bridge functionality test
- **limits**: Bridge limit configuration
  - **dailyLimit**: Daily bridge limit in G$ (converted to wei automatically)
  - **txLimit**: Per-transaction limit in G$ (converted to wei automatically)
  - **accountDailyLimit**: Per-account daily limit in G$ (converted to wei automatically)
  - **minAmount**: Minimum bridge amount in G$ (converted to wei automatically)
  - **onlyWhitelisted**: Whether to restrict bridging to whitelisted addresses

**Note**: Limit values can be specified in decimal format (e.g., "5000" for 5,000 G$). The scripts automatically convert them to wei (18 decimals).

## Manual Configuration: Step-by-Step

If you prefer to configure each network individually or need more control, follow these steps:

### Step 1: Deploy OFT Contracts

Deploy the GoodDollarMinterBurner and GoodDollarOFTAdapter contracts on each network:

```bash
# Deploy on XDC
yarn hardhat run scripts/oft/oft-deploy.ts --network development-xdc

# Deploy on CELO
yarn hardhat run scripts/oft/oft-deploy.ts --network development-celo
```

This script will:
- Deploy `GoodDollarMinterBurner` (upgradeable proxy)
- Deploy `GoodDollarOFTAdapter` (upgradeable proxy)
- Set OFT adapter as operator on MinterBurner via DAO
- Save contract addresses to `release/deployment-oft.json`

### Step 2: Grant MINTER_ROLE

Grant the MINTER_ROLE to GoodDollarMinterBurner on the GoodDollar token:

```bash
# Grant on XDC
yarn hardhat run scripts/oft/grant-minter-role.ts --network development-xdc

# Grant on CELO
yarn hardhat run scripts/oft/grant-minter-role.ts --network development-celo
```

This executes via DAO governance (Controller/Avatar) to grant the minter role.

### Step 3: Wire LayerZero Connections

Configure LayerZero messaging libraries, DVNs, executors, and enforced options:

```bash
# Wire on XDC
yarn hardhat lz:oapp:wire --oapp-config ./layerzero.config.ts --network development-xdc

# Wire on CELO
yarn hardhat lz:oapp:wire --oapp-config ./layerzero.config.ts --network development-celo
```

**Important**: 
- Wiring may fail with permission errors (0xc4c52593) if the OApp owner doesn't have delegate permissions on the LayerZero endpoint
- If wiring fails, you may need to manually configure enforced options or contact LayerZero support

### Step 4: Set Bridge Limits

Configure bridge limits using values from `oft.config.json`:

```bash
# Set limits on XDC
yarn hardhat run scripts/oft/set-minter-burner-limits.ts --network development-xdc

# Set limits on CELO
yarn hardhat run scripts/oft/set-minter-burner-limits.ts --network development-celo
```

The script reads limit values from `oft.config.json` for the specified network and sets them on the OFT adapter.

### Step 5: Transfer Ownership

Transfer OFT adapter ownership to DAO Avatar:

```bash
# Transfer on XDC
yarn hardhat run scripts/oft/transfer-oft-adapter-ownership.ts --network development-xdc

# Transfer on CELO
yarn hardhat run scripts/oft/transfer-oft-adapter-ownership.ts --network development-celo
```

**Note**: This must be done by the current owner of the OFT adapter (usually the deployer).

### Step 6: Test Bridge Functionality (Optional)

Test the bridge by sending tokens from one chain to another:

```bash
# Bridge from XDC to CELO
yarn hardhat run scripts/oft/bridge-oft-token.ts --network development-xdc

# Bridge from CELO to XDC
yarn hardhat run scripts/oft/bridge-oft-token.ts --network development-celo
```

**Requirements**:
- Sufficient G$ balance on the source chain
- Sufficient native token (XDC/CELO) for gas and LayerZero fees
- MinterBurner approval for token burning

## Configuration Verification

After configuration, verify the setup:

1. **Check contract deployments**: Verify addresses in `release/deployment-oft.json`
2. **Check MINTER_ROLE**: Verify MinterBurner has minter role on GoodDollar token
3. **Check ownership**: Verify OFT adapter is owned by DAO Avatar
4. **Check LayerZero peers**: Verify peer connections are set between chains
5. **Check limits**: Verify bridge limits are set correctly

## Troubleshooting

### Bridge Test Fails

**Error**: `NoPeer` or peer not configured

**Solution**:
- Ensure LayerZero wiring completed successfully
- Verify peer addresses are set correctly in `layerzero.config.ts`
- Check that OFT adapters are deployed on both networks

**Error**: Insufficient balance

**Solution**:
- Ensure you have sufficient G$ tokens on the source chain
- Ensure you have sufficient native tokens (XDC/CELO) for gas and fees
- Approve MinterBurner to burn tokens if needed

### Limits Not Set

**Error**: No limits configuration found

**Solution**:
- Ensure `oft.config.json` has an entry for your network
- Verify the `limits` object is properly formatted
- Check that `skipLimits` is not set to `true`

