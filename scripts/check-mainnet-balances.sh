#!/bin/bash

# Bridge-Me-Not Mainnet Balance Checker
# This script checks BMN token balances on Base and Etherlink mainnet

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Source environment variables
if [ -f .env ]; then
    source .env
fi

# BMN Token address (same on both chains)
BMN_TOKEN="0x8287CD2aC7E227D9D927F998EB600a0683a832A1"

# Default accounts
ALICE_ADDRESS="${ALICE_ADDRESS:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"
BOB_ADDRESS="${BOB_ADDRESS:-0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC}"

# Function to check balance
check_balance() {
    local chain_name=$1
    local rpc_url=$2
    local address=$3
    local name=$4
    
    # Get BMN balance
    local balance=$(cast call $BMN_TOKEN "balanceOf(address)(uint256)" $address --rpc-url $rpc_url 2>/dev/null || echo "0")
    
    # Convert from wei to BMN (18 decimals)
    # Using awk since cast from-wei might not handle large numbers correctly
    local bmn_balance=$(echo "$balance" | awk '{printf "%.6f", $1 / 1e18}')
    
    # Get ETH balance
    local eth_balance=$(cast balance $address --rpc-url $rpc_url 2>/dev/null || echo "0")
    local eth_formatted=$(cast from-wei $eth_balance 2>/dev/null || echo "0")
    
    echo -e "  ${BLUE}$name ($address):${NC}"
    echo "    BMN: $bmn_balance"
    echo "    ETH: $eth_formatted"
}

echo -e "${GREEN}🔍 Checking Mainnet Balances${NC}"
echo ""

# Check Base balances
echo -e "${GREEN}Base Mainnet:${NC}"
BASE_RPC="${BASE_RPC_URL:-https://mainnet.base.org}"
check_balance "Base" "$BASE_RPC" "$ALICE_ADDRESS" "Alice"
check_balance "Base" "$BASE_RPC" "$BOB_ADDRESS" "Bob (Resolver)"

if [ -n "$DEPLOYER_ADDRESS" ]; then
    check_balance "Base" "$BASE_RPC" "$DEPLOYER_ADDRESS" "Deployer"
fi

echo ""

# Check Etherlink balances
echo -e "${GREEN}Etherlink Mainnet:${NC}"
ETHERLINK_RPC="${ETHERLINK_RPC_URL:-https://node.mainnet.etherlink.com}"
check_balance "Etherlink" "$ETHERLINK_RPC" "$ALICE_ADDRESS" "Alice"
check_balance "Etherlink" "$ETHERLINK_RPC" "$BOB_ADDRESS" "Bob (Resolver)"

if [ -n "$DEPLOYER_ADDRESS" ]; then
    check_balance "Etherlink" "$ETHERLINK_RPC" "$DEPLOYER_ADDRESS" "Deployer"
fi

echo ""
echo -e "${GREEN}✅ Balance check complete${NC}"