#!/bin/bash

# Test script for indexer integration
# This script demonstrates how to run the resolver with indexer support

echo "Testing Bridge-Me-Not Resolver with Indexer Integration"
echo "======================================================"

# Check if indexer is running
INDEXER_URL=${INDEXER_URL:-"http://localhost:42069/sql"}
echo "Checking indexer at: $INDEXER_URL"

# Try to connect to indexer
if curl -s -X POST "$INDEXER_URL" \
  -H "Content-Type: application/json" \
  -d '{"statement": "SELECT 1", "params": []}' > /dev/null 2>&1; then
  echo "✅ Indexer is running"
else
  echo "❌ Indexer is not accessible at $INDEXER_URL"
  echo "   Starting without indexer support..."
fi

echo ""
echo "Starting resolver with the following configuration:"
echo "- USE_INDEXER_FOR_ORDERS: ${USE_INDEXER_FOR_ORDERS:-false}"
echo "- USE_INDEXER_FOR_SECRETS: ${USE_INDEXER_FOR_SECRETS:-false}"
echo "- HYBRID_MODE: ${HYBRID_MODE:-false}"
echo "- ETH_SAFETY_DEPOSITS: ${ETH_SAFETY_DEPOSITS:-true}"
echo ""

# Export test configuration
export RESOLVER_PRIVATE_KEY=${RESOLVER_PRIVATE_KEY:-"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"}

# Optional: Enable indexer features
# export USE_INDEXER_FOR_ORDERS=true
# export USE_INDEXER_FOR_SECRETS=true
# export HYBRID_MODE=true

# Optional: Set custom profit margins
# export MIN_PROFIT_BPS=100  # 1% minimum profit
# export MAX_SLIPPAGE_BPS=50 # 0.5% max slippage

# Run the resolver
echo "Starting resolver..."
deno task resolver:start