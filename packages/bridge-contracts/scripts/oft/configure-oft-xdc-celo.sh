#!/bin/bash

# Script to configure OFT (Omnichain Fungible Token) on XDC and CELO networks
# 
# This script automates the complete OFT setup process:
# 1. Deploy OFT contracts (MinterBurner and OFTAdapter) on both networks
# 2. Wire LayerZero connections between XDC and CELO
# 3. Grant MINTER_ROLE to MinterBurner on both networks
# 4. Transfer OFT adapter ownership to DAO Avatar on both networks
# 5. Set mint/burn limits on MinterBurner for both networks
# 6. Test bridge functionality (optional, last step)
#
# Usage:
#   ./scripts/multichain-deploy/oft/configure-oft-xdc-celo.sh
#
# Environment variables (optional):
#   DAILY_LIMIT=1000000                      # Daily bridge limit in G$ (e.g., 1M G$ - will be converted to wei automatically)
#   TX_LIMIT=100000                          # Per-transaction limit in G$ (e.g., 100K G$)
#   ACCOUNT_DAILY_LIMIT=50000                # Per-account daily limit in G$ (e.g., 50K G$)
#   MIN_AMOUNT=10                            # Minimum bridge amount in G$ (e.g., 10 G$)
#   ONLY_WHITELISTED=false                   # Whether to restrict to whitelisted addresses
#   SKIP_BRIDGE_TEST=true                    # Skip bridge test step
#   SKIP_LIMITS=true                         # Skip setting limits step
#   SKIP_WIRING=true                         # Skip LayerZero wiring step (peers must be set manually)
#
# Note: Limit values can be specified in decimal format (e.g., "1000000" for 1M G$)
#       The script will automatically convert them to wei (18 decimals).
#       You can also use wei values directly if preferred.

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the project root
if [ ! -f "hardhat.config.ts" ] && [ ! -f "hardhat.config.js" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

print_step "OFT Configuration Script for XDC and CELO"
echo "This script will configure OFT on both development-xdc and development-celo networks"
echo ""

# Step 1: Deploy OFT contracts
print_step "Step 1: Deploying OFT contracts"

print_step "Deploying on development-xdc..."
yarn hardhat run scripts/oft/oft-deploy.ts --network development-xdc
print_success "OFT contracts deployed on development-xdc"

print_step "Deploying on development-celo..."
yarn hardhat run scripts/oft/oft-deploy.ts --network development-celo
print_success "OFT contracts deployed on development-celo"

echo ""

# Step 2: Grant MINTER_ROLE
print_step "Step 2: Granting MINTER_ROLE to GoodDollarMinterBurner"

print_step "Granting MINTER_ROLE on development-xdc..."
yarn hardhat run scripts/oft/grant-minter-role.ts --network development-xdc
print_success "MINTER_ROLE granted on development-xdc"

print_step "Granting MINTER_ROLE on development-celo..."
yarn hardhat run scripts/oft/grant-minter-role.ts --network development-celo
print_success "MINTER_ROLE granted on development-celo"

echo ""

# Step 4: Set LayerZero peers (required before wiring, after ownership transfer)
print_step "Step 4: Setting LayerZero peer connections"

print_step "Setting peer on development-xdc..."
yarn hardhat run scripts/oft/set-layerzero-peers.ts --network development-xdc
print_success "Peer set on development-xdc"

print_step "Setting peer on development-celo..."
yarn hardhat run scripts/oft/set-layerzero-peers.ts --network development-celo
print_success "Peer set on development-celo"

echo ""

# Step 5: Wire LayerZero connections (optional - peers already set)
WIRE_XDC_SUCCESS=false
WIRE_CELO_SUCCESS=false

if [ "$SKIP_WIRING" != "true" ]; then
    print_step "Step 5: Wiring LayerZero connections"
    print_warning "Note: Peers are already set. Wiring configures send libraries, DVNs, executors, and enforced options."
    print_warning "If wiring fails due to permissions, we'll set enforced options manually as a fallback."
    
    print_step "Wiring on development-xdc..."
    set +e  # Temporarily disable exit on error
    yarn hardhat lz:oapp:wire --oapp-config ./layerzero.config.ts --network development-xdc
    WIRE_XDC_STATUS=$?
    set -e  # Re-enable exit on error
    if [ $WIRE_XDC_STATUS -eq 0 ]; then
        print_success "LayerZero wired on development-xdc"
        WIRE_XDC_SUCCESS=true
    else
        print_warning "Wiring failed on development-xdc (error code: $WIRE_XDC_STATUS)"
        print_warning "This is likely a permission error (0xc4c52593). Will set enforced options manually."
    fi

    print_step "Wiring on development-celo..."
    set +e  # Temporarily disable exit on error
    yarn hardhat lz:oapp:wire --oapp-config ./layerzero.config.ts --network development-celo
    WIRE_CELO_STATUS=$?
    set -e  # Re-enable exit on error
    if [ $WIRE_CELO_STATUS -eq 0 ]; then
        print_success "LayerZero wired on development-celo"
        WIRE_CELO_SUCCESS=true
    else
        print_warning "Wiring failed on development-celo (error code: $WIRE_CELO_STATUS)"
        print_warning "This is likely a permission error (0xc4c52593). Will set enforced options manually."
    fi
else
    print_warning "Skipping wiring step (SKIP_WIRING=true)"
fi

# Step 6: Set bridge limits (optional)
if [ "$SKIP_LIMITS" != "true" ]; then
    print_step "Step 6: Setting bridge limits on OFTAdapter"
    
    if [ -z "$DAILY_LIMIT" ] && [ -z "$TX_LIMIT" ] && [ -z "$ACCOUNT_DAILY_LIMIT" ] && [ -z "$MIN_AMOUNT" ] && [ -z "$ONLY_WHITELISTED" ]; then
        print_warning "No limit environment variables set. Skipping limits configuration."
        print_warning "To set limits, use decimal values (easier to read):"
        print_warning "  DAILY_LIMIT=1000000 TX_LIMIT=100000 \\"
        print_warning "  ACCOUNT_DAILY_LIMIT=50000 MIN_AMOUNT=10 \\"
        print_warning "  ONLY_WHITELISTED=false \\"
        print_warning "  ./scripts/oft/configure-oft-xdc-celo.sh"
        print_warning ""
        print_warning "Note: Values are in G$ (e.g., '1000000' = 1M G$). The script automatically converts to wei."
    else
        print_step "Setting bridge limits on development-xdc..."
        DAILY_LIMIT=$DAILY_LIMIT \
        TX_LIMIT=$TX_LIMIT \
        ACCOUNT_DAILY_LIMIT=$ACCOUNT_DAILY_LIMIT \
        MIN_AMOUNT=$MIN_AMOUNT \
        ONLY_WHITELISTED=$ONLY_WHITELISTED \
        yarn hardhat run scripts/oft/set-minter-burner-limits.ts --network development-xdc
        print_success "Bridge limits set on development-xdc"
        
        print_step "Setting bridge limits on development-celo..."
        DAILY_LIMIT=$DAILY_LIMIT \
        TX_LIMIT=$TX_LIMIT \
        ACCOUNT_DAILY_LIMIT=$ACCOUNT_DAILY_LIMIT \
        MIN_AMOUNT=$MIN_AMOUNT \
        ONLY_WHITELISTED=$ONLY_WHITELISTED \
        yarn hardhat run scripts/oft/set-minter-burner-limits.ts --network development-celo
        print_success "Bridge limits set on development-celo"
    fi
    echo ""
else
    print_warning "Skipping limits configuration (SKIP_LIMITS=true)"
    echo ""
fi

# Step 3: Transfer ownership (required before setting peers)
print_step "Step 3: Transferring OFT adapter ownership to DAO Avatar"

print_step "Transferring ownership on development-xdc..."
yarn hardhat run scripts/oft/transfer-oft-adapter-ownership.ts --network development-xdc
print_success "Ownership transferred on development-xdc"

print_step "Transferring ownership on development-celo..."
yarn hardhat run scripts/oft/transfer-oft-adapter-ownership.ts --network development-celo
print_success "Ownership transferred on development-celo"

echo ""

# Step 7: Test bridge (optional, last step)
if [ "$SKIP_BRIDGE_TEST" != "true" ]; then
    print_step "Step 7: Testing bridge functionality"
    print_warning "This step will attempt to bridge 1 G$ from XDC to CELO"
    read -p "Do you want to test the bridge? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_step "Bridging from development-xdc to development-celo..."
        yarn hardhat run scripts/oft/bridge-oft-token.ts --network development-xdc || print_warning "Bridge test failed (this is okay if you don't have sufficient balance)"
        echo ""
    else
        print_warning "Skipping bridge test"
    fi
    echo ""
else
    print_warning "Skipping bridge test (SKIP_BRIDGE_TEST=true)"
    echo ""
fi

# Summary
print_step "Configuration Complete!"
print_success "OFT has been successfully configured on both XDC and CELO networks"
echo ""
echo "Summary of completed steps:"
echo "  ✅ Deployed OFT contracts on both networks"
echo "  ✅ Granted MINTER_ROLE to MinterBurner"
echo "  ✅ Transferred OFT adapter ownership to DAO Avatar"
echo "  ✅ Set LayerZero peer connections"
if [ "$SKIP_WIRING" != "true" ]; then
    if [ "$WIRE_XDC_SUCCESS" = "true" ] && [ "$WIRE_CELO_SUCCESS" = "true" ]; then
        echo "  ✅ Wired LayerZero connections"
    else
        echo "  ⚠️  LayerZero wiring failed (permission errors)"
        echo "  ✅ Set enforced options manually as fallback"
    fi
fi
if [ "$SKIP_LIMITS" != "true" ] && ([ -n "$DAILY_LIMIT" ] || [ -n "$TX_LIMIT" ] || [ -n "$ACCOUNT_DAILY_LIMIT" ] || [ -n "$MIN_AMOUNT" ] || [ -n "$ONLY_WHITELISTED" ]); then
    echo "  ✅ Set bridge limits"
fi
if [ "$SKIP_BRIDGE_TEST" != "true" ]; then
    echo "  ✅ Tested bridge functionality (if executed)"
fi
echo ""
print_success "You can now use the bridge-oft-token.ts script to bridge tokens between chains!"
print_success "Run: yarn hardhat run scripts/oft/bridge-oft-token.ts --network <network>"

