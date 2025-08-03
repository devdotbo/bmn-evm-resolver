#!/bin/bash

# Bridge-Me-Not Mainnet Resolver Runner
# This script starts the resolver for Base <-> Etherlink mainnet

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Bridge-Me-Not Mainnet Resolver${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please copy .env.example to .env and configure it for mainnet"
    exit 1
fi

# Source environment variables
source .env

# Validate required environment variables
REQUIRED_VARS=(
    "RESOLVER_PRIVATE_KEY"
    "BASE_RPC_URL"
    "ETHERLINK_RPC_URL"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ Error: $var is not set${NC}"
        exit 1
    fi
done

# Set network mode to mainnet
export NETWORK_MODE=mainnet

# Check if using test factory
if [ "$USE_TEST_FACTORY" = "true" ]; then
    echo -e "${YELLOW}⚠️  Warning: Using TestEscrowFactory for testing${NC}"
    echo "This bypasses security checks and should only be used for testing!"
fi

# Display configuration
echo -e "${GREEN}Configuration:${NC}"
echo "  Network Mode: mainnet"
echo "  Base RPC: $BASE_RPC_URL"
echo "  Etherlink RPC: $ETHERLINK_RPC_URL"
echo "  Test Factory: ${USE_TEST_FACTORY:-false}"
echo "  Reverse Chains: ${REVERSE_CHAINS:-false}"

# Start the resolver
echo -e "${GREEN}Starting resolver...${NC}"
deno task resolver:start

# The resolver will run until interrupted
echo -e "${GREEN}Resolver is running. Press Ctrl+C to stop.${NC}"