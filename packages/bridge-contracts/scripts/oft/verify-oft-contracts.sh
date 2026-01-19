#!/bin/bash

# Verification commands for GoodDollarOFTAdapter and GoodDollarMinterBurner
# Usage: Run the commands below for the desired network

echo "=== OFT Contracts Verification Commands ==="
echo ""
echo "Choose a network:"
echo "1. development-celo"
echo "2. development-xdc"
echo ""
read -p "Enter choice (1 or 2): " choice

case $choice in
  1)
    NETWORK="development-celo"
    echo ""
    echo "=== Verifying contracts on $NETWORK ==="
    echo ""
    
    # GoodDollarMinterBurner
    # Constructor: (token, owner)
    echo "Verifying GoodDollarMinterBurner..."
    yarn hardhat verify \
      --network $NETWORK \
      --contract contracts/token/oft/GoodDollarMinterBurner.sol:GoodDollarMinterBurner \
      0x57D60087b69b7bA13afbAbc41CB56A24A8B648F8 \
      0xFa51eFDc0910CCdA91732e6806912Fa12e2FD475 \
      0x14204392270CD38D02C43465909Cade33BF5D6E5
    
    echo ""
    echo "Verifying GoodDollarOFTAdapter..."
    # GoodDollarOFTAdapter
    # Constructor: (token, minterBurner, lzEndpoint, owner)
    yarn hardhat verify \
      --network $NETWORK \
      --contract contracts/token/oft/GoodDollarOFTAdapter.sol:GoodDollarOFTAdapter \
      0xb8e2aae105fb0637B08806e855057A0985bf859c \
      0xFa51eFDc0910CCdA91732e6806912Fa12e2FD475 \
      0x57D60087b69b7bA13afbAbc41CB56A24A8B648F8 \
      0x1a44076050125825900e736c501f859c50fE728c \
      0x14204392270CD38D02C43465909Cade33BF5D6E5
    ;;
    
  2)
    NETWORK="development-xdc"
    echo ""
    echo "=== Verifying contracts on $NETWORK ==="
    echo ""
    
    # GoodDollarMinterBurner
    # Constructor: (token, owner)
    echo "Verifying GoodDollarMinterBurner..."
    yarn hardhat verify \
      --network $NETWORK \
      --contract contracts/token/oft/GoodDollarMinterBurner.sol:GoodDollarMinterBurner \
      0x91e02521E76A3d64050b15Ac419bc9D64fA99fe7 \
      0xA13625A72Aef90645CfCe34e25c114629d7855e7 \
      0xC47747659b74Cc23210DD851b254260b0B039eED
    
    echo ""
    echo "Verifying GoodDollarOFTAdapter..."
    # GoodDollarOFTAdapter
    # Constructor: (token, minterBurner, lzEndpoint, owner)
    yarn hardhat verify \
      --network $NETWORK \
      --contract contracts/token/oft/GoodDollarOFTAdapter.sol:GoodDollarOFTAdapter \
      0xFe9ed346a232b45A0Ed699ab86B1AaB162eDCCA7 \
      0xA13625A72Aef90645CfCe34e25c114629d7855e7 \
      0x91e02521E76A3d64050b15Ac419bc9D64fA99fe7 \
      0xcb566e3B6934Fa77258d68ea18E931fa75e1aaAa \
      0xC47747659b74Cc23210DD851b254260b0B039eED
    ;;
    
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac

echo ""
echo "=== Verification Complete ==="

