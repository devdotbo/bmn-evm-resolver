#!/bin/bash

# End-to-End Mainnet Swap Test - REVERSE DIRECTION
# Tests BMN swap from Etherlink to Base

set -e

echo "=== Bridge-Me-Not Mainnet E2E Test (Reverse) ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        exit 1
    fi
}

# Check prerequisites
echo "Checking prerequisites..."
check_command deno
check_command cast

# Check environment files
if [ ! -f ".env" ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Please create .env with your private keys"
    exit 1
fi

# Export mainnet mode
export NETWORK_MODE=mainnet

# Function to check BMN balances
check_balances() {
    echo -e "\n${YELLOW}=== Current BMN Balances ===${NC}"
    
    # Base balances
    echo -e "\n${GREEN}Base Mainnet:${NC}"
    echo -n "Alice: "
    cast call 0x18ae5BB6E03Dc346eA9fd1afA78FEc314343857e "balanceOf(address)(uint256)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url https://mainnet.base.org | cast --to-dec
    
    echo -n "Bob: "
    cast call 0x18ae5BB6E03Dc346eA9fd1afA78FEc314343857e "balanceOf(address)(uint256)" 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --rpc-url https://mainnet.base.org | cast --to-dec
    
    # Etherlink balances
    echo -e "\n${GREEN}Etherlink Mainnet:${NC}"
    echo -n "Alice: "
    cast call 0x18ae5BB6E03Dc346eA9fd1afA78FEc314343857e "balanceOf(address)(uint256)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url https://node.mainnet.etherlink.com | cast --to-dec
    
    echo -n "Bob: "
    cast call 0x18ae5BB6E03Dc346eA9fd1afA78FEc314343857e "balanceOf(address)(uint256)" 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --rpc-url https://node.mainnet.etherlink.com | cast --to-dec
}

# Function to wait for user confirmation
wait_for_confirmation() {
    echo -e "\n${YELLOW}Press Enter to continue or Ctrl+C to abort...${NC}"
    read
}

# Main test flow
echo -e "${GREEN}Starting mainnet swap test (Etherlink → Base)...${NC}"

# Step 1: Check initial balances
check_balances

# Step 2: Start resolver in background
echo -e "\n${YELLOW}=== Starting Resolver ===${NC}"
echo "Starting resolver in background..."
./run-mainnet-resolver.sh > resolver-reverse.log 2>&1 &
RESOLVER_PID=$!
echo "Resolver started with PID: $RESOLVER_PID"
sleep 5

# Check if resolver is still running
if ! ps -p $RESOLVER_PID > /dev/null; then
    echo -e "${RED}Resolver failed to start! Check resolver-reverse.log${NC}"
    cat resolver-reverse.log
    exit 1
fi

# Step 3: Create order (reverse direction)
echo -e "\n${YELLOW}=== Creating Order ===${NC}"
echo "Alice will create an order to swap 10 BMN from Etherlink to Base"
wait_for_confirmation

deno run --allow-net --allow-read --allow-write --allow-env --env-file=.env src/alice/create-mainnet-order-reverse.ts

# Step 4: Monitor resolver
echo -e "\n${YELLOW}=== Monitoring Resolver ===${NC}"
echo "Waiting for resolver to process the order..."
echo "Tailing resolver log (press Ctrl+C to stop monitoring):"
echo ""

# Show resolver log for 30 seconds
timeout 30 tail -f resolver-reverse.log || true

# Step 5: Check if destination escrow was created
echo -e "\n${YELLOW}=== Checking Order Status ===${NC}"
deno run --allow-read src/alice/list-orders.ts

# Step 6: Alice withdraws from destination
echo -e "\n${YELLOW}=== Alice Withdraws from Destination ===${NC}"
echo "Alice will now withdraw BMN from Base escrow"
wait_for_confirmation

# Get order ID from state
ORDER_ID=$(deno eval --env-file=.env 'import { AliceStateManager } from "./src/alice/state.ts"; const sm = new AliceStateManager(); await sm.loadFromFile(); const orders = sm.getAllOrders(); console.log(orders[orders.length-1]?.id || "none")')

if [ "$ORDER_ID" = "none" ]; then
    echo -e "${RED}No order found!${NC}"
else
    echo "Using order ID: $ORDER_ID"
    deno run --allow-net --allow-read --allow-write --allow-env --env-file=.env src/alice/withdraw.ts --order-id "$ORDER_ID"
fi

# Step 7: Check final balances
echo -e "\n${YELLOW}=== Final Balances ===${NC}"
check_balances

# Step 8: Bob withdraws from source
echo -e "\n${YELLOW}=== Waiting for Bob's Withdrawal ===${NC}"
echo "Bob should automatically withdraw from source escrow..."
sleep 10

# Final balance check
echo -e "\n${YELLOW}=== Final Balance Check ===${NC}"
check_balances

# Cleanup
echo -e "\n${YELLOW}=== Cleanup ===${NC}"
echo "Stopping resolver..."
kill $RESOLVER_PID 2>/dev/null || true

echo -e "\n${GREEN}✅ Test completed!${NC}"
echo "Check the balances above to verify the swap was successful."
echo "Expected result: Alice should have less BMN on Etherlink and more on Base"
echo "                 Bob should have more BMN on Etherlink and less on Base"