#!/bin/bash

# Run Bridge-Me-Not Resolver in Mainnet Mode

echo "=== Starting Bridge-Me-Not Resolver (Mainnet) ==="
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Error: .env file not found!"
    echo "Please copy .env.example and set your private keys."
    exit 1
fi

# Check if resolver private key is set
if ! grep -q "RESOLVER_PRIVATE_KEY=0x" .env; then
    echo "Error: RESOLVER_PRIVATE_KEY not set in .env!"
    echo "Please set your resolver (Bob's) private key."
    exit 1
fi

# Export mainnet environment
export NETWORK_MODE=mainnet

# Run the resolver with mainnet configuration
echo "Loading mainnet configuration..."
echo "- Base (Chain 8453)"
echo "- Etherlink (Chain 42793)"
echo ""

# Run with mainnet env file
deno run \
    --allow-net \
    --allow-read \
    --allow-write \
    --allow-env \
    --env-file=.env \
    src/resolver/index.ts