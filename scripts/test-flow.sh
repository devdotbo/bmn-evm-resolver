#!/bin/bash

# Bridge-Me-Not Complete Test Flow Script
# This script demonstrates a full atomic swap between Alice and Bob

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
echo -e "${BLUE}║     Bridge-Me-Not Atomic Swap Test Flow              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if .env exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Running setup...${NC}"
    "$SCRIPT_DIR/setup-env.sh"
fi

# Source environment variables
source "$PROJECT_ROOT/.env"

# Function to check if a process is running
check_process() {
    if pgrep -f "$1" > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to wait for user confirmation
wait_for_enter() {
    echo -e "${YELLOW}Press Enter to continue...${NC}"
    read -r
}

# Function to run command with nice output
run_command() {
    local description="$1"
    local command="$2"
    
    echo -e "${BLUE}► $description${NC}"
    echo -e "${YELLOW}  Command: $command${NC}"
    eval "$command"
    echo ""
}

# 1. Start Resolver (Bob) in background
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Step 1: Starting Resolver (Bob)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

# Kill any existing resolver process
if check_process "resolver:start"; then
    echo -e "${YELLOW}Stopping existing resolver...${NC}"
    pkill -f "resolver:start" || true
    sleep 2
fi

# Start resolver in background
echo -e "${BLUE}Starting resolver with WebSocket monitoring...${NC}"
cd "$PROJECT_ROOT"
deno task resolver:start > resolver.log 2>&1 &
RESOLVER_PID=$!

sleep 3

# Check if resolver started
if check_process "resolver:start"; then
    echo -e "${GREEN}✅ Resolver started successfully (PID: $RESOLVER_PID)${NC}"
    echo -e "${YELLOW}   Logs: tail -f resolver.log${NC}"
else
    echo -e "${RED}❌ Failed to start resolver${NC}"
    exit 1
fi

echo ""
wait_for_enter

# 2. Check resolver status
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Step 2: Checking Resolver Status${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

run_command "Checking resolver status" "deno task resolver:status"
wait_for_enter

# 3. Alice creates an order
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Step 3: Alice Creates Order (100 TKA → 100 TKB)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

run_command "Creating order on Chain A" \
    "deno task alice:create-order -- --amount 100 --token-a TKA --token-b TKB"

echo -e "${YELLOW}⏳ Waiting for Bob to detect and execute order...${NC}"
sleep 5

# 4. List Alice's orders
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Step 4: Listing Alice's Orders${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

run_command "Listing all orders" "deno task alice:list-orders"
wait_for_enter

# 5. Alice withdraws from destination escrow
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Step 5: Alice Withdraws from Destination Escrow${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

# Get the order ID from alice-state.json
ORDER_ID=$(cat alice-state.json 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data['orders']:
    print(list(data['orders'].keys())[0])
" || echo "")

if [ -z "$ORDER_ID" ]; then
    echo -e "${RED}❌ No order found in alice-state.json${NC}"
    echo -e "${YELLOW}Please check the logs for errors.${NC}"
else
    echo -e "${BLUE}Found order ID: $ORDER_ID${NC}"
    run_command "Alice withdrawing from Chain B" \
        "deno task alice:withdraw -- --order-id $ORDER_ID"
    
    echo -e "${YELLOW}⏳ Waiting for Bob to detect secret and withdraw...${NC}"
    sleep 5
fi

# 6. Check final status
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Step 6: Final Status Check${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

run_command "Final resolver status" "deno task resolver:status"
run_command "Final order status" "deno task alice:list-orders"

# 7. Show logs summary
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Step 7: Logs Summary${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${BLUE}Recent resolver logs:${NC}"
tail -n 20 resolver.log | grep -E "(order|escrow|secret|withdraw)" || echo "No relevant logs found"

# Cleanup
echo ""
echo -e "${YELLOW}Stopping resolver...${NC}"
kill $RESOLVER_PID 2>/dev/null || true

echo ""
echo -e "${GREEN}✅ Test flow completed!${NC}"
echo ""
echo -e "${BLUE}Summary:${NC}"
echo "  1. Bob (resolver) monitored for orders using WebSocket"
echo "  2. Alice created an order swapping 100 TKA for 100 TKB"
echo "  3. Bob detected the order and deployed destination escrow"
echo "  4. Alice withdrew from destination escrow (revealing secret)"
echo "  5. Bob used the secret to claim from source escrow"
echo ""
echo -e "${YELLOW}Check the following files for details:${NC}"
echo "  - resolver.log: Bob's activity log"
echo "  - resolver-state.json: Bob's order tracking"
echo "  - alice-state.json: Alice's order tracking"