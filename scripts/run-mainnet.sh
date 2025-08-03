#!/bin/bash

# Script to run the resolver with mainnet configuration

# Check if mainnet env file exists
if [ ! -f ".env.mainnet" ]; then
    echo "Error: .env.mainnet not found!"
    echo "Please copy .env.mainnet.example to .env.mainnet and configure it with your values."
    exit 1
fi

# Load mainnet environment variables
echo "Loading mainnet configuration..."
export $(cat .env.mainnet | grep -v '^#' | xargs)

# Set network mode
export NETWORK_MODE=mainnet

# Run the resolver
echo "Starting resolver on mainnet (Base: 8453, Etherlink: 42793)..."
echo "Factory: 0x068aABdFa6B8c442CD32945A9A147B45ad7146d2"
echo "BMN Token: 0x18ae5BB6E03Dc346eA9fd1afA78FEc314343857e"
echo ""

deno run --allow-all main.ts