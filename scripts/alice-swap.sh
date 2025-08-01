#!/bin/bash

# Bridge-Me-Not Alice Swap Flow Script
# This script executes Alice's complete atomic swap flow

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
AMOUNT="100"
TOKEN_A="TKA"
TOKEN_B="TKB"
AUTO_WITHDRAW="false"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --amount)
            AMOUNT="$2"
            shift 2
            ;;
        --token-a)
            TOKEN_A="$2"
            shift 2
            ;;
        --token-b)
            TOKEN_B="$2"
            shift 2
            ;;
        --auto)
            AUTO_WITHDRAW="true"
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --amount <value>    Amount to swap (default: 100)"
            echo "  --token-a <symbol>  Source token (default: TKA)"
            echo "  --token-b <symbol>  Destination token (default: TKB)"
            echo "  --auto              Automatically withdraw when ready"
            echo "  --help              Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Alice's Atomic Swap Flow                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Configuration:${NC}"
echo "  Amount: $AMOUNT"
echo "  Source Token: $TOKEN_A (Chain A)"
echo "  Destination Token: $TOKEN_B (Chain B)"
echo "  Auto-withdraw: $AUTO_WITHDRAW"
echo ""

# Check if .env exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Running setup...${NC}"
    "$SCRIPT_DIR/setup-env.sh"
fi

# Source and export environment variables
set -a  # Export all variables
source "$PROJECT_ROOT/.env"
set +a  # Stop exporting

# Function to wait for user confirmation
wait_for_enter() {
    if [ "$AUTO_WITHDRAW" != "true" ]; then
        echo -e "${YELLOW}Press Enter to continue...${NC}"
        read -r
    fi
}

# Function to get order ID from state
get_latest_order_id() {
    if [ -f "$PROJECT_ROOT/alice-state.json" ]; then
        cat "$PROJECT_ROOT/alice-state.json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
orders = list(data.get('orders', {}).keys())
if orders:
    print(orders[-1])
" || echo ""
    else
        echo ""
    fi
}

# Step 1: Create Order
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Step 1: Creating Order${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

cd "$PROJECT_ROOT"
echo -e "${BLUE}Creating order: $AMOUNT $TOKEN_A → $AMOUNT $TOKEN_B${NC}"
deno task alice:create-order --amount "$AMOUNT" --token-a "$TOKEN_A" --token-b "$TOKEN_B"

# Get the order ID
ORDER_ID=$(get_latest_order_id)
if [ -z "$ORDER_ID" ]; then
    echo -e "${RED}❌ Failed to create order${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Order created successfully!${NC}"
echo -e "${BLUE}   Order ID: $ORDER_ID${NC}"
echo ""

# Step 2: Monitor Order Status
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Step 2: Monitoring Order Status${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

# Function to check order status
check_order_status() {
    deno task alice:list-orders 2>/dev/null | grep -A 5 "$ORDER_ID" | grep "Status:" | awk '{print $2}' || echo "unknown"
}

# Wait for Bob to deploy destination escrow
echo -e "${YELLOW}⏳ Waiting for Bob to deploy destination escrow...${NC}"
COUNTER=0
MAX_WAIT=60  # 60 seconds

while [ $COUNTER -lt $MAX_WAIT ]; do
    STATUS=$(check_order_status)
    
    if [ "$STATUS" == "DstEscrowDeployed" ] || [ "$STATUS" == "SecretRevealed" ] || [ "$STATUS" == "Completed" ]; then
        echo -e "${GREEN}✅ Destination escrow deployed by Bob!${NC}"
        break
    fi
    
    echo -ne "\r${YELLOW}Waiting... ($COUNTER/$MAX_WAIT seconds) Current status: $STATUS${NC}"
    sleep 1
    COUNTER=$((COUNTER + 1))
done

echo ""

if [ $COUNTER -eq $MAX_WAIT ]; then
    echo -e "${RED}❌ Timeout waiting for Bob to deploy escrow${NC}"
    echo -e "${YELLOW}Make sure the resolver is running!${NC}"
    exit 1
fi

# Show current order details
echo ""
deno task alice:list-orders | grep -A 10 "$ORDER_ID" || true
echo ""

wait_for_enter

# Step 3: Withdraw from Destination
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Step 3: Withdrawing from Destination Escrow${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${BLUE}Withdrawing $AMOUNT $TOKEN_B from Chain B...${NC}"
deno task alice:withdraw --order-id "$ORDER_ID"

echo ""
echo -e "${GREEN}✅ Withdrawal successful!${NC}"
echo -e "${YELLOW}   Secret has been revealed on-chain${NC}"
echo ""

# Step 4: Final Status
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Step 4: Final Order Status${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

# Wait a bit for Bob to claim
if [ "$AUTO_WITHDRAW" == "true" ]; then
    echo -e "${YELLOW}⏳ Waiting for Bob to claim from source escrow...${NC}"
    sleep 5
fi

# Show final status
deno task alice:list-orders | grep -A 10 "$ORDER_ID" || true

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Atomic Swap Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "Summary:"
echo "  1. Alice created order swapping $AMOUNT $TOKEN_A for $AMOUNT $TOKEN_B"
echo "  2. Bob detected order and deployed destination escrow"
echo "  3. Alice withdrew from destination (revealing secret)"
echo "  4. Bob claimed from source using the revealed secret"
echo ""
echo -e "${BLUE}Check alice-state.json for complete order history${NC}"