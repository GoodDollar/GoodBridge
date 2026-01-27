#!/bin/bash

# Verification script for GoodDollar OFT contracts on Celo and XDC
# This script provides verification commands for both proxy and implementation contracts

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Contract addresses from deployment.json
CELO_OFT_ADAPTER="0x28aE7CE2F3BBb0bf58B24F1961885aeE1e456f46"
CELO_MINTER_BURNER="0x3850786C7627Ce276EF6F715a0eF31d5FeCf1fc7"
XDC_OFT_ADAPTER="0x3a568CFD4e3F6ef9f5e341FAbAD84B6Cc41C1A75"
XDC_MINTER_BURNER="0xb20eaE658437b793257C326751a695ED5e94dD3E"

# LayerZero endpoint addresses
CELO_LZ_ENDPOINT="0x1a44076050125825900e736c501f859c50fE728c"
XDC_LZ_ENDPOINT="0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa"

echo -e "${BLUE}=== OFT Contracts Verification Script ===${NC}"
echo ""
echo "This script helps verify GoodDollarOFTAdapter and GoodDollarMinterBurner contracts"
echo "on Celo and XDC networks."
echo ""
echo -e "${YELLOW}Note:${NC} For upgradeable contracts (UUPS proxies), you need to verify the"
echo "implementation contract, not the proxy. The implementation address can be"
echo "retrieved using:"
echo "  yarn hardhat run scripts/oft/get-implementation.ts --network <network>"
echo ""

echo "Choose a network:"
echo "1. development-celo"
echo "2. development-xdc"
echo ""
read -p "Enter choice (1 or 2): " choice

case $choice in
  1)
    NETWORK="development-celo"
    OFT_ADAPTER=$CELO_OFT_ADAPTER
    MINTER_BURNER=$CELO_MINTER_BURNER
    LZ_ENDPOINT=$CELO_LZ_ENDPOINT
    
    echo ""
    echo -e "${BLUE}=== Contract Addresses for $NETWORK ===${NC}"
    echo ""
    echo "Proxy addresses:"
    echo "  GoodDollarOFTAdapter:     $OFT_ADAPTER"
    echo "  GoodDollarMinterBurner:    $MINTER_BURNER"
    echo ""
    echo "LayerZero Endpoint:          $LZ_ENDPOINT"
    echo ""
    
    # Get token address
    echo -e "${YELLOW}Enter GoodDollar token address for Celo:${NC}"
    read -p "Token address: " TOKEN_ADDRESS
    
    if [ -z "$TOKEN_ADDRESS" ]; then
      echo -e "${RED}Error: Token address is required for verification${NC}"
      exit 1
    fi
    
    echo ""
    echo -e "${GREEN}=== Step 1: Get Implementation Addresses ===${NC}"
    echo ""
    echo "Run these commands to get the implementation addresses:"
    echo ""
    echo -e "${BLUE}# Get GoodDollarOFTAdapter implementation${NC}"
    echo "yarn hardhat run - <<'EOF' --network $NETWORK"
    echo "const { upgrades } = require('hardhat');"
    echo "upgrades.erc1967.getImplementationAddress('$OFT_ADAPTER').then(addr => console.log('OFT Adapter Impl:', addr));"
    echo "EOF"
    echo ""
    echo -e "${BLUE}# Get GoodDollarMinterBurner implementation${NC}"
    echo "yarn hardhat run - <<'EOF' --network $NETWORK"
    echo "const { upgrades } = require('hardhat');"
    echo "upgrades.erc1967.getImplementationAddress('$MINTER_BURNER').then(addr => console.log('MinterBurner Impl:', addr));"
    echo "EOF"
    echo ""
    
    echo -e "${YELLOW}Enter the implementation addresses (press Enter after each):${NC}"
    read -p "GoodDollarOFTAdapter implementation: " OFT_IMPL
    read -p "GoodDollarMinterBurner implementation: " MINTER_BURNER_IMPL
    
    if [ -z "$OFT_IMPL" ] || [ -z "$MINTER_BURNER_IMPL" ]; then
      echo -e "${RED}Error: Implementation addresses are required${NC}"
      exit 1
    fi
    
    echo ""
    echo -e "${GREEN}=== Step 2: Verification Commands ===${NC}"
    echo ""
    echo -e "${BLUE}# Verify GoodDollarOFTAdapter implementation${NC}"
    echo "yarn hardhat verify \\"
    echo "  --network $NETWORK \\"
    echo "  --contract contracts/oft/GoodDollarOFTAdapter.sol:GoodDollarOFTAdapter \\"
    echo "  $OFT_IMPL \\"
    echo "  $TOKEN_ADDRESS \\"
    echo "  $LZ_ENDPOINT"
    echo ""
    
    echo -e "${BLUE}# Verify GoodDollarMinterBurner implementation${NC}"
    echo "yarn hardhat verify \\"
    echo "  --network $NETWORK \\"
    echo "  --contract contracts/oft/GoodDollarMinterBurner.sol:GoodDollarMinterBurner \\"
    echo "  $MINTER_BURNER_IMPL"
    echo ""
    
    echo -e "${YELLOW}Do you want to run these verification commands now? (y/n)${NC}"
    read -p "Run verifications: " run_verify
    
    if [ "$run_verify" = "y" ] || [ "$run_verify" = "Y" ]; then
      echo ""
      echo -e "${GREEN}Verifying GoodDollarOFTAdapter...${NC}"
      yarn hardhat verify \
        --network $NETWORK \
        --contract contracts/oft/GoodDollarOFTAdapter.sol:GoodDollarOFTAdapter \
        $OFT_IMPL \
        $TOKEN_ADDRESS \
        $LZ_ENDPOINT
      
      echo ""
      echo -e "${GREEN}Verifying GoodDollarMinterBurner...${NC}"
      yarn hardhat verify \
        --network $NETWORK \
        --contract contracts/oft/GoodDollarMinterBurner.sol:GoodDollarMinterBurner \
        $MINTER_BURNER_IMPL
    fi
    ;;
    
  2)
    NETWORK="development-xdc"
    OFT_ADAPTER=$XDC_OFT_ADAPTER
    MINTER_BURNER=$XDC_MINTER_BURNER
    LZ_ENDPOINT=$XDC_LZ_ENDPOINT
    
    echo ""
    echo -e "${BLUE}=== Contract Addresses for $NETWORK ===${NC}"
    echo ""
    echo "Proxy addresses:"
    echo "  GoodDollarOFTAdapter:     $OFT_ADAPTER"
    echo "  GoodDollarMinterBurner:    $MINTER_BURNER"
    echo ""
    echo "LayerZero Endpoint:          $LZ_ENDPOINT"
    echo ""
    
    # Get token address
    echo -e "${YELLOW}Enter GoodDollar token address for XDC:${NC}"
    read -p "Token address: " TOKEN_ADDRESS
    
    if [ -z "$TOKEN_ADDRESS" ]; then
      echo -e "${RED}Error: Token address is required for verification${NC}"
      exit 1
    fi
    
    echo ""
    echo -e "${GREEN}=== Step 1: Get Implementation Addresses ===${NC}"
    echo ""
    echo "Run these commands to get the implementation addresses:"
    echo ""
    echo -e "${BLUE}# Get GoodDollarOFTAdapter implementation${NC}"
    echo "yarn hardhat run - <<'EOF' --network $NETWORK"
    echo "const { upgrades } = require('hardhat');"
    echo "upgrades.erc1967.getImplementationAddress('$OFT_ADAPTER').then(addr => console.log('OFT Adapter Impl:', addr));"
    echo "EOF"
    echo ""
    echo -e "${BLUE}# Get GoodDollarMinterBurner implementation${NC}"
    echo "yarn hardhat run - <<'EOF' --network $NETWORK"
    echo "const { upgrades } = require('hardhat');"
    echo "upgrades.erc1967.getImplementationAddress('$MINTER_BURNER').then(addr => console.log('MinterBurner Impl:', addr));"
    echo "EOF"
    echo ""
    
    echo -e "${YELLOW}Enter the implementation addresses (press Enter after each):${NC}"
    read -p "GoodDollarOFTAdapter implementation: " OFT_IMPL
    read -p "GoodDollarMinterBurner implementation: " MINTER_BURNER_IMPL
    
    if [ -z "$OFT_IMPL" ] || [ -z "$MINTER_BURNER_IMPL" ]; then
      echo -e "${RED}Error: Implementation addresses are required${NC}"
      exit 1
    fi
    
    echo ""
    echo -e "${GREEN}=== Step 2: Verification Commands ===${NC}"
    echo ""
    echo -e "${BLUE}# Verify GoodDollarOFTAdapter implementation${NC}"
    echo "yarn hardhat verify \\"
    echo "  --network $NETWORK \\"
    echo "  --contract contracts/oft/GoodDollarOFTAdapter.sol:GoodDollarOFTAdapter \\"
    echo "  $OFT_IMPL \\"
    echo "  $TOKEN_ADDRESS \\"
    echo "  $LZ_ENDPOINT"
    echo ""
    
    echo -e "${BLUE}# Verify GoodDollarMinterBurner implementation${NC}"
    echo "yarn hardhat verify \\"
    echo "  --network $NETWORK \\"
    echo "  --contract contracts/oft/GoodDollarMinterBurner.sol:GoodDollarMinterBurner \\"
    echo "  $MINTER_BURNER_IMPL"
    echo ""
    
    echo -e "${YELLOW}Do you want to run these verification commands now? (y/n)${NC}"
    read -p "Run verifications: " run_verify
    
    if [ "$run_verify" = "y" ] || [ "$run_verify" = "Y" ]; then
      echo ""
      echo -e "${GREEN}Verifying GoodDollarOFTAdapter...${NC}"
      yarn hardhat verify \
        --network $NETWORK \
        --contract contracts/oft/GoodDollarOFTAdapter.sol:GoodDollarOFTAdapter \
        $OFT_IMPL \
        $TOKEN_ADDRESS \
        $LZ_ENDPOINT
      
      echo ""
      echo -e "${GREEN}Verifying GoodDollarMinterBurner...${NC}"
      yarn hardhat verify \
        --network $NETWORK \
        --contract contracts/oft/GoodDollarMinterBurner.sol:GoodDollarMinterBurner \
        $MINTER_BURNER_IMPL
    fi
    ;;
    
  *)
    echo -e "${RED}Invalid choice. Exiting.${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}=== Verification Complete ===${NC}"
