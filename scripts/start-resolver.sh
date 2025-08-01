#!/bin/bash

# Bridge-Me-Not Resolver Startup Script
# This script ensures proper environment setup and starts the resolver

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Bridge-Me-Not Resolver Startup                ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if .env exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Running setup...${NC}"
    "$SCRIPT_DIR/setup-env.sh"
fi

# Source environment variables
source "$PROJECT_ROOT/.env"

# Verify required environment variables
REQUIRED_VARS=(
    "RESOLVER_PRIVATE_KEY"
    "CHAIN_A_ESCROW_FACTORY"
    "CHAIN_A_LIMIT_ORDER_PROTOCOL"
    "CHAIN_B_ESCROW_FACTORY"
    "CHAIN_B_LIMIT_ORDER_PROTOCOL"
)

echo -e "${BLUE}Checking environment variables...${NC}"
MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo -e "${RED}❌ Missing required environment variables:${NC}"
    printf '%s\n' "${MISSING_VARS[@]}"
    echo -e "${YELLOW}Please check your .env file or run: ./scripts/setup-env.sh${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All required environment variables are set${NC}"
echo ""

# Check if chains are running
echo -e "${BLUE}Checking blockchain connections...${NC}"

# Check Chain A
if curl -s -X POST http://localhost:8545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Chain A (localhost:8545) is running${NC}"
else
    echo -e "${RED}❌ Chain A (localhost:8545) is not accessible${NC}"
    echo -e "${YELLOW}Please start the chains in bmn-evm-contracts:${NC}"
    echo -e "${YELLOW}  cd ../bmn-evm-contracts && ./scripts/multi-chain-setup.sh${NC}"
    exit 1
fi

# Check Chain B
if curl -s -X POST http://localhost:8546 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Chain B (localhost:8546) is running${NC}"
else
    echo -e "${RED}❌ Chain B (localhost:8546) is not accessible${NC}"
    echo -e "${YELLOW}Please start the chains in bmn-evm-contracts:${NC}"
    echo -e "${YELLOW}  cd ../bmn-evm-contracts && ./scripts/multi-chain-setup.sh${NC}"
    exit 1
fi

echo ""

# Clean up old state if requested
if [ "$1" == "--clean" ]; then
    echo -e "${YELLOW}Cleaning up old state files...${NC}"
    rm -f "$PROJECT_ROOT/resolver-state.json"
    rm -f "$PROJECT_ROOT/alice-state.json"
    echo -e "${GREEN}✅ State files cleaned${NC}"
    echo ""
fi

# Display resolver info
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Resolver Configuration:${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo "  Resolver Address: $(echo $RESOLVER_PRIVATE_KEY | cut -c1-10)...$(echo $RESOLVER_PRIVATE_KEY | tail -c 5)"
echo "  Chain A Factory: $CHAIN_A_ESCROW_FACTORY"
echo "  Chain B Factory: $CHAIN_B_ESCROW_FACTORY"
echo "  WebSocket: Enabled for real-time monitoring"
echo "  HTTP: Used for transaction execution"
echo ""

# Start the resolver
echo -e "${GREEN}Starting Bridge-Me-Not Resolver...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

cd "$PROJECT_ROOT"
exec deno task resolver:start