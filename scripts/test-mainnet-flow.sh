#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo -e "${RED}Error: .env file not found.${NC}"
    exit 1
fi

# Set mainnet mode
export NETWORK_MODE=mainnet

# Function to print section headers
print_header() {
    echo -e "\n${BLUE}==== $1 ====${NC}\n"
}

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to print info
print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Main test flow
print_header "Bridge-Me-Not Mainnet Test Flow"

echo "Network: Base ↔ Etherlink Mainnet"
echo "Token: BMN (Bridge-Me-Not)"
echo "Amount: 10 BMN"
echo ""

# Check balances
print_header "Checking Account Balances"

print_info "Checking BMN balances..."
ALICE_BMN_BASE=$(cast call $MAINNET_BMN_TOKEN "balanceOf(address)" $ALICE_ADDRESS --rpc-url $BASE_RPC_URL)
ALICE_BMN_ETHERLINK=$(cast call $MAINNET_BMN_TOKEN "balanceOf(address)" $ALICE_ADDRESS --rpc-url $ETHERLINK_RPC_URL)
BOB_BMN_BASE=$(cast call $MAINNET_BMN_TOKEN "balanceOf(address)" $BOB_ADDRESS --rpc-url $BASE_RPC_URL)
BOB_BMN_ETHERLINK=$(cast call $MAINNET_BMN_TOKEN "balanceOf(address)" $BOB_ADDRESS --rpc-url $ETHERLINK_RPC_URL)

echo "Alice BMN:"
echo "  Base: $(cast from-wei $ALICE_BMN_BASE)"
echo "  Etherlink: $(cast from-wei $ALICE_BMN_ETHERLINK)"
echo ""
echo "Bob BMN:"
echo "  Base: $(cast from-wei $BOB_BMN_BASE)"
echo "  Etherlink: $(cast from-wei $BOB_BMN_ETHERLINK)"

print_info "Checking ETH balances for gas..."
ALICE_ETH_BASE=$(cast balance $ALICE_ADDRESS --rpc-url $BASE_RPC_URL --ether)
ALICE_ETH_ETHERLINK=$(cast balance $ALICE_ADDRESS --rpc-url $ETHERLINK_RPC_URL --ether)
BOB_ETH_BASE=$(cast balance $BOB_ADDRESS --rpc-url $BASE_RPC_URL --ether)
BOB_ETH_ETHERLINK=$(cast balance $BOB_ADDRESS --rpc-url $ETHERLINK_RPC_URL --ether)

echo ""
echo "Alice ETH (for gas):"
echo "  Base: $ALICE_ETH_BASE"
echo "  Etherlink: $ALICE_ETH_ETHERLINK"
echo ""
echo "Bob ETH (for gas):"
echo "  Base: $BOB_ETH_BASE"
echo "  Etherlink: $BOB_ETH_ETHERLINK"

# Step 1: Alice creates order
print_header "Step 1: Alice Creates Order"
print_info "Creating order to swap 10 BMN from Base to Etherlink..."

cd "$PROJECT_ROOT"
deno task alice:create-order --amount 10 --token-a BMN --token-b BMN

# Get the order hash from the latest order file
ORDER_HASH=$(ls -t data/orders/order-*.json 2>/dev/null | head -1 | sed 's/.*order-\(.*\)\.json/\1/')
if [ -z "$ORDER_HASH" ]; then
    print_error "Failed to create order"
    exit 1
fi

print_status "Order created with hash: $ORDER_HASH"

# Step 2: Start Bob's resolver in background
print_header "Step 2: Starting Bob's Resolver"
print_info "Starting resolver to monitor for orders..."

# Kill any existing resolver
pkill -f "deno.*resolver:start" || true

# Start resolver in background
deno task resolver:start > resolver.log 2>&1 &
RESOLVER_PID=$!
print_status "Resolver started (PID: $RESOLVER_PID)"

# Wait for Bob to process the order
print_info "Waiting for Bob to discover and process the order..."
sleep 30

# Check if destination escrow was created
print_header "Step 3: Checking Order Status"
if grep -q "Destination escrow created" resolver.log; then
    print_status "Bob has created the destination escrow!"
    
    # Step 4: Alice withdraws from destination
    print_header "Step 4: Alice Withdraws from Destination"
    print_info "Alice withdrawing from destination escrow..."
    
    deno task alice:withdraw --order-id "$ORDER_HASH"
    
    # Wait for Bob to claim
    print_info "Waiting for Bob to detect withdrawal and claim..."
    sleep 20
    
    # Check final balances
    print_header "Final Balances"
    
    ALICE_BMN_BASE_FINAL=$(cast call $MAINNET_BMN_TOKEN "balanceOf(address)" $ALICE_ADDRESS --rpc-url $BASE_RPC_URL)
    ALICE_BMN_ETHERLINK_FINAL=$(cast call $MAINNET_BMN_TOKEN "balanceOf(address)" $ALICE_ADDRESS --rpc-url $ETHERLINK_RPC_URL)
    BOB_BMN_BASE_FINAL=$(cast call $MAINNET_BMN_TOKEN "balanceOf(address)" $BOB_ADDRESS --rpc-url $BASE_RPC_URL)
    BOB_BMN_ETHERLINK_FINAL=$(cast call $MAINNET_BMN_TOKEN "balanceOf(address)" $BOB_ADDRESS --rpc-url $ETHERLINK_RPC_URL)
    
    echo "Alice BMN:"
    echo "  Base: $(cast from-wei $ALICE_BMN_BASE) → $(cast from-wei $ALICE_BMN_BASE_FINAL)"
    echo "  Etherlink: $(cast from-wei $ALICE_BMN_ETHERLINK) → $(cast from-wei $ALICE_BMN_ETHERLINK_FINAL)"
    echo ""
    echo "Bob BMN:"
    echo "  Base: $(cast from-wei $BOB_BMN_BASE) → $(cast from-wei $BOB_BMN_BASE_FINAL)"
    echo "  Etherlink: $(cast from-wei $BOB_BMN_ETHERLINK) → $(cast from-wei $BOB_BMN_ETHERLINK_FINAL)"
    
    print_status "Atomic swap completed!"
else
    print_error "Bob did not create destination escrow. Check resolver.log for errors."
fi

# Cleanup
print_header "Cleanup"
kill $RESOLVER_PID 2>/dev/null || true
print_status "Resolver stopped"

echo ""
print_info "Test complete. Check resolver.log for detailed logs."