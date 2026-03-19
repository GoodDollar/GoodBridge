# OFT (Omnichain Fungible Token) Configuration Guide

This guide explains how to configure the GoodDollar OFT bridge between XDC and CELO networks using LayerZero.

## Overview

The OFT bridge enables cross-chain transfers of GoodDollar (G$) tokens between XDC and CELO networks. The setup involves deploying contracts, configuring permissions, setting up LayerZero connections, and configuring bridge limits.


## Configuration File

All configuration values are stored in `test/oft/oft.config.json`. Each network has its own configuration entry.

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

## Manual Configuration: Step-by-Step

If you prefer to configure each network individually or need more control, follow these steps:

### Step 1: Deploy OFT Contracts

Deploy the GoodDollarOFTMinterBurner and GoodDollarOFTAdapter contracts on each network using hardhat-deploy:

```bash
# Deploy on XDC
npx hardhat deploy --tags OFT --network development-xdc

# Deploy on CELO
npx hardhat deploy --tags OFT --network development-celo
```

This deployment script will:
- Deploy `GoodDollarOFTMinterBurner` (upgradeable proxy)
- Deploy `GoodDollarOFTAdapter` (upgradeable proxy)
- Save contract addresses to hardhat-deploy's `deployments/` artifacts
- Save deployments to hardhat-deploy's deployment system

**Note**: The deployment uses hardhat-deploy for better deployment management and tracking.

### Step 2: Grant MINTER_ROLE

`GoodDollarOFTMinterBurner.initialize(nameService, adapter)` automatically sets the OFT adapter as an operator,
so there is no separate “set operator” step required.

Grant the MINTER_ROLE to GoodDollarOFTMinterBurner on the GoodDollar token:

```bash
# Grant on XDC
yarn hardhat run test/oft/grant-minter-role.ts --network development-xdc

# Grant on CELO
yarn hardhat run test/oft/grant-minter-role.ts --network development-celo
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

### Step 4: Set Bridge Limits (Optional)

Configure bridge limits using values from `oft.config.json` (only needed if you want to set the bridge limits):

```bash
# Set limits on XDC
yarn hardhat run test/oft/set-bridge-limits.ts --network development-xdc

# Set limits on CELO
yarn hardhat run test/oft/set-bridge-limits.ts --network development-celo
```

The script reads limit values from `oft.config.json` for the specified network and sets them on the OFT adapter.

### Step 5: Test Bridge Functionality (Optional)

Test the bridge by sending tokens from one chain to another:

```bash
# Bridge from XDC to CELO
yarn hardhat run test/oft/bridge-oft-token.ts --network development-xdc

# Bridge from CELO to XDC
yarn hardhat run test/oft/bridge-oft-token.ts --network development-celo
```

**Requirements**:
- Sufficient G$ balance on the source chain
- Sufficient native token (XDC/CELO) for gas and LayerZero fees
- GoodDollarOFTMinterBurner approval for token burning

### Step 6: Transfer Ownership (Optional)

Transfer OFT adapter ownership to DAO Avatar. This should be done as the final step:

```bash
# Transfer on XDC
yarn hardhat run test/oft/transfer-oft-adapter-ownership.ts --network development-xdc

# Transfer on CELO
yarn hardhat run test/oft/transfer-oft-adapter-ownership.ts --network development-celo
```

**Note**: Only transfer ownership if you want the DAO Avatar to be the long-term owner (recommended for production). This must be done by the current owner of the OFT adapter (usually the deployer), and is performed after all other configuration.

## Configuration Verification

After configuration, verify the setup:

1. **Check contract deployments**: Verify addresses in hardhat-deploy's `deployments/` artifacts
2. **Check MINTER_ROLE**: Verify GoodDollarOFTMinterBurner has minter role on GoodDollar token
3. **Check ownership**: Verify OFT adapter is owned by DAO Avatar
4. **Check LayerZero peers**: Verify peer connections are set between chains
5. **Check limits**: Verify bridge limits are set correctly
