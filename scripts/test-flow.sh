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
CONTRACTS_DIR="$PROJECT_ROOT/../bmn-evm-contracts"
ENV_FILE="$PROJECT_ROOT/.env"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    set -a  # automatically export all variables
    source "$ENV_FILE"
    set +a  # turn off automatic export
else
    echo -e "${RED}Error: .env file not found. Running setup script...${NC}"
    "$SCRIPT_DIR/setup-env.sh"
    set -a
    source "$ENV_FILE"
    set +a
fi

# Default values
MODE="${1:-mainnet}" # local or mainnet (default to mainnet)
ALICE_AMOUNT="${2:-10}" # Amount Alice wants to swap (10 BMN for mainnet)
BOB_PROFIT_BPS="${3:-50}" # Bob's profit in basis points (0.5%)

# Use RESOLVER_PRIVATE_KEY as BOB_PRIVATE_KEY if not set
BOB_PRIVATE_KEY="${BOB_PRIVATE_KEY:-$RESOLVER_PRIVATE_KEY}"

# Set RPC URLs based on mode
if [ "$MODE" = "mainnet" ]; then
    CHAIN_A_RPC="${BASE_RPC_URL:-http://localhost:8545}"
    CHAIN_B_RPC="${ETHERLINK_RPC_URL:-http://localhost:8546}"
    # BMN token is the same on both chains (CREATE3 deployed)
    BMN_TOKEN_ADDR="${MAINNET_BMN_TOKEN:-0x8287CD2aC7E227D9D927F998EB600a0683a832A1}"
    ESCROW_FACTORY_A_ADDR="${BASE_ESCROW_FACTORY:-$MAINNET_ESCROW_FACTORY}"
    ESCROW_FACTORY_B_ADDR="${ETHERLINK_ESCROW_FACTORY:-$MAINNET_ESCROW_FACTORY}"
    LIMIT_ORDER_PROTOCOL_ADDR="${BASE_LIMIT_ORDER_PROTOCOL:-0x1111111254EEB25477B68fb85Ed929f73A960582}"
else
    CHAIN_A_RPC="${CHAIN_A_RPC_URL:-http://localhost:8545}"
    CHAIN_B_RPC="${CHAIN_B_RPC_URL:-http://localhost:8546}"
    # For local testing, still use TKA/TKB
    TOKEN_A_ADDR="$CHAIN_A_TOKEN_TKA"
    TOKEN_B_ADDR="$CHAIN_B_TOKEN_TKB"
    ESCROW_FACTORY_A_ADDR="$CHAIN_A_ESCROW_FACTORY"
    ESCROW_FACTORY_B_ADDR="$CHAIN_B_ESCROW_FACTORY"
    LIMIT_ORDER_PROTOCOL_ADDR="$CHAIN_A_LIMIT_ORDER_PROTOCOL"
fi

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

# Function to wait for user input
wait_for_input() {
    echo -e "\n${YELLOW}Press Enter to continue...${NC}"
    read -r
}

# Function to check if chains are running
check_chains() {
    print_header "Checking Chain Status"
    
    local chain_a_running=false
    local chain_b_running=false
    
    if curl -s -X POST -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}' \
        "$CHAIN_A_RPC" > /dev/null 2>&1; then
        chain_a_running=true
        print_status "Chain A is running on $CHAIN_A_RPC"
    fi
    
    if curl -s -X POST -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}' \
        "$CHAIN_B_RPC" > /dev/null 2>&1; then
        chain_b_running=true
        print_status "Chain B is running on $CHAIN_B_RPC"
    fi
    
    if [ "$chain_a_running" = false ] || [ "$chain_b_running" = false ]; then
        print_info "Starting local chains..."
        cd "$CONTRACTS_DIR"
        ./scripts/multi-chain-setup.sh
        cd "$PROJECT_ROOT"
        sleep 5
        print_status "Chains started"
    fi
}

# Function to check if contracts are deployed
check_contracts() {
    print_header "Checking Contract Deployment"
    
    if [ "$MODE" = "mainnet" ]; then
        # For mainnet, use addresses from environment/config
        export ESCROW_FACTORY_A="$ESCROW_FACTORY_A_ADDR"
        export ESCROW_FACTORY_B="$ESCROW_FACTORY_B_ADDR"
        export LIMIT_ORDER_PROTOCOL_A="$LIMIT_ORDER_PROTOCOL_ADDR"
        export TOKEN_A="$BMN_TOKEN_ADDR"
        export TOKEN_B="$BMN_TOKEN_ADDR"
        
        print_status "Using mainnet contract addresses"
    else
        # For local mode, check if addresses.json exists
        local addresses_file="$CONTRACTS_DIR/test/addresses.json"
        if [ ! -f "$addresses_file" ]; then
            print_info "Contracts not deployed. Deploying now..."
            cd "$CONTRACTS_DIR"
            forge script script/Deploy.s.sol:DeployScript --broadcast --rpc-url "$CHAIN_A_RPC"
            forge script script/Deploy.s.sol:DeployScript --broadcast --rpc-url "$CHAIN_B_RPC"
            cd "$PROJECT_ROOT"
            print_status "Contracts deployed"
        else
            print_status "Contracts already deployed"
        fi
        
        # Export contract addresses
        export ESCROW_FACTORY_A=$(jq -r '.chainA.escrowFactory' "$addresses_file")
        export ESCROW_FACTORY_B=$(jq -r '.chainB.escrowFactory' "$addresses_file")
        export LIMIT_ORDER_PROTOCOL_A=$(jq -r '.chainA.limitOrderProtocol' "$addresses_file")
        export TOKEN_A=$(jq -r '.chainA.tokenA' "$addresses_file")
        export TOKEN_B=$(jq -r '.chainB.tokenB' "$addresses_file")
    fi
    
    print_info "Contract addresses loaded:"
    echo "  - Escrow Factory A: $ESCROW_FACTORY_A"
    echo "  - Escrow Factory B: $ESCROW_FACTORY_B"
    echo "  - Limit Order Protocol A: $LIMIT_ORDER_PROTOCOL_A"
    echo "  - Token A: $TOKEN_A"
    echo "  - Token B: $TOKEN_B"
}

# Function to fund accounts with test tokens
fund_accounts() {
    print_header "Funding Test Accounts"
    
    # Debug: check if keys are loaded
    if [ -z "$ALICE_PRIVATE_KEY" ]; then
        print_error "ALICE_PRIVATE_KEY not set!"
        exit 1
    fi
    
    local alice_addr=$(cast wallet address --private-key "$ALICE_PRIVATE_KEY" 2>&1)
    local bob_addr=$(cast wallet address --private-key "${BOB_PRIVATE_KEY:-$RESOLVER_PRIVATE_KEY}" 2>&1)
    
    # Check for errors
    if [[ "$alice_addr" == *"Error"* ]]; then
        print_error "Failed to get Alice address: $alice_addr"
        exit 1
    fi
    if [[ "$bob_addr" == *"Error"* ]]; then
        print_error "Failed to get Bob address: $bob_addr"
        exit 1
    fi
    
    print_info "Alice address: $alice_addr"
    print_info "Bob address: $bob_addr"
    
    # Fund Alice with Token A on Chain A
    print_info "Minting Token A for Alice..."
    cast send "$TOKEN_A" "mint(address,uint256)" "$alice_addr" "$(cast to-wei 1000)" \
        --rpc-url "$CHAIN_A_RPC" \
        --private-key "$ANVIL_PRIVATE_KEY_0" \
        > /dev/null 2>&1
    
    # Fund Bob with Token B on Chain B  
    print_info "Minting Token B for Bob..."
    cast send "$TOKEN_B" "mint(address,uint256)" "$bob_addr" "$(cast to-wei 1000)" \
        --rpc-url "$CHAIN_B_RPC" \
        --private-key "$ANVIL_PRIVATE_KEY_0" \
        > /dev/null 2>&1
    
    # Check balances
    local alice_balance_a=$(cast call "$TOKEN_A" "balanceOf(address)(uint256)" "$alice_addr" --rpc-url "$CHAIN_A_RPC")
    local bob_balance_b=$(cast call "$TOKEN_B" "balanceOf(address)(uint256)" "$bob_addr" --rpc-url "$CHAIN_B_RPC")
    
    print_status "Alice has $(cast from-wei "$alice_balance_a") Token A"
    print_status "Bob has $(cast from-wei "$bob_balance_b") Token B"
}

# Function to show current balances
show_balances() {
    local title="${1:-Current Balances}"
    print_header "$title"
    
    # Debug: check if keys are loaded
    if [ -z "$ALICE_PRIVATE_KEY" ]; then
        print_error "ALICE_PRIVATE_KEY not set!"
        exit 1
    fi
    
    local alice_addr=$(cast wallet address --private-key "$ALICE_PRIVATE_KEY" 2>&1)
    local bob_addr=$(cast wallet address --private-key "${BOB_PRIVATE_KEY:-$RESOLVER_PRIVATE_KEY}" 2>&1)
    
    # Check for errors
    if [[ "$alice_addr" == *"Error"* ]]; then
        print_error "Failed to get Alice address: $alice_addr"
        exit 1
    fi
    if [[ "$bob_addr" == *"Error"* ]]; then
        print_error "Failed to get Bob address: $bob_addr"
        exit 1
    fi
    
    # Alice balances
    local alice_balance_a=$(cast call "$TOKEN_A" "balanceOf(address)(uint256)" "$alice_addr" --rpc-url "$CHAIN_A_RPC" 2>/dev/null || echo "0")
    local alice_balance_b=$(cast call "$TOKEN_B" "balanceOf(address)(uint256)" "$alice_addr" --rpc-url "$CHAIN_B_RPC" 2>/dev/null || echo "0")
    
    # Bob balances
    local bob_balance_a=$(cast call "$TOKEN_A" "balanceOf(address)(uint256)" "$bob_addr" --rpc-url "$CHAIN_A_RPC" 2>/dev/null || echo "0")
    local bob_balance_b=$(cast call "$TOKEN_B" "balanceOf(address)(uint256)" "$bob_addr" --rpc-url "$CHAIN_B_RPC" 2>/dev/null || echo "0")
    
    # Remove any non-numeric characters (like error messages)
    alice_balance_a=$(echo "$alice_balance_a" | grep -E '^[0-9]+$' || echo "0")
    alice_balance_b=$(echo "$alice_balance_b" | grep -E '^[0-9]+$' || echo "0")
    bob_balance_a=$(echo "$bob_balance_a" | grep -E '^[0-9]+$' || echo "0")
    bob_balance_b=$(echo "$bob_balance_b" | grep -E '^[0-9]+$' || echo "0")
    
    if [ "$MODE" = "mainnet" ]; then
        echo "Alice:"
        echo "  - BMN on Base: $(cast from-wei "$alice_balance_a")"
        echo "  - BMN on Etherlink: $(cast from-wei "$alice_balance_b")"
        echo ""
        echo "Bob:"
        echo "  - BMN on Base: $(cast from-wei "$bob_balance_a")"
        echo "  - BMN on Etherlink: $(cast from-wei "$bob_balance_b")"
    else
        echo "Alice:"
        echo "  - Token A: $(cast from-wei "$alice_balance_a")"
        echo "  - Token B: $(cast from-wei "$alice_balance_b")"
        echo ""
        echo "Bob:"
        echo "  - Token A: $(cast from-wei "$bob_balance_a")"
        echo "  - Token B: $(cast from-wei "$bob_balance_b")"
    fi
}

# Function to create order
create_order() {
    print_header "Creating Order (Alice)"
    
    # Calculate amounts with profit for Bob
    local amount_wei=$(cast to-wei "$ALICE_AMOUNT")
    local profit_factor=$((10000 + BOB_PROFIT_BPS))
    local dst_amount_wei=$((amount_wei * 10000 / profit_factor))
    
    if [ "$MODE" = "mainnet" ]; then
        print_info "Alice wants to swap $ALICE_AMOUNT BMN from Base to Etherlink"
        print_info "Bob will receive $ALICE_AMOUNT BMN on Base"
        print_info "Alice will receive $(cast from-wei "$dst_amount_wei") BMN on Etherlink"
    else
        print_info "Alice wants to swap $ALICE_AMOUNT Token A for Token B"
        print_info "Bob will receive $ALICE_AMOUNT Token A"
        print_info "Alice will receive $(cast from-wei "$dst_amount_wei") Token B"
    fi
    print_info "Bob's profit: $BOB_PROFIT_BPS bps ($(echo "scale=2; $BOB_PROFIT_BPS / 100" | bc)%)"
    
    wait_for_input
    
    # Create order using Alice's task
    print_info "Creating order..."
    cd "$PROJECT_ROOT"
    
    # Create order and capture output
    if [ "$MODE" = "mainnet" ]; then
        # For mainnet, use BMN token on both chains
        local order_output=$(deno task alice:create-order --amount "$ALICE_AMOUNT" --token-a BMN --token-b BMN 2>&1)
    else
        # For local testing, use TKA/TKB
        local order_output=$(deno task alice:create-order --amount "$ALICE_AMOUNT" --token-a TKA --token-b TKB 2>&1)
    fi
    
    # Extract order ID from output
    ORDER_ID=$(echo "$order_output" | grep -oP 'Order created with ID: \K[0-9]+' || echo "")
    
    if [ -z "$ORDER_ID" ]; then
        print_error "Failed to create order"
        echo "$order_output"
        exit 1
    fi
    
    print_status "Order created with ID: $ORDER_ID"
    
    # Show order details
    deno task alice:list-orders
}

# Function to start resolver
start_resolver() {
    print_header "Starting Bob's Resolver"
    
    print_info "Starting resolver in background..."
    
    # Start resolver in background and capture PID
    cd "$PROJECT_ROOT"
    deno task resolver:start > resolver.log 2>&1 &
    RESOLVER_PID=$!
    
    print_status "Resolver started (PID: $RESOLVER_PID)"
    print_info "Waiting for resolver to process order..."
    
    # Wait for resolver to process the order
    local max_wait=30
    local waited=0
    while [ $waited -lt $max_wait ]; do
        if grep -q "Order filled successfully" resolver.log 2>/dev/null; then
            print_status "Resolver processed the order!"
            break
        fi
        sleep 1
        ((waited++))
        echo -ne "\rWaiting... ${waited}s / ${max_wait}s"
    done
    echo ""
    
    if [ $waited -eq $max_wait ]; then
        print_error "Resolver did not process order within ${max_wait}s"
        print_info "Resolver log:"
        tail -20 resolver.log
    fi
}

# Function to withdraw funds
withdraw_funds() {
    print_header "Withdrawing Funds (Alice)"
    
    print_info "Alice will now withdraw from destination escrow..."
    print_info "This will reveal the secret, allowing Bob to claim from source escrow"
    
    wait_for_input
    
    # Get destination escrow address from resolver log
    local dst_escrow=$(grep -oP 'Destination escrow: \K0x[a-fA-F0-9]+' resolver.log | tail -1)
    
    if [ -z "$dst_escrow" ]; then
        print_error "Could not find destination escrow address"
        exit 1
    fi
    
    print_info "Destination escrow: $dst_escrow"
    
    # Alice withdraws using the task
    cd "$PROJECT_ROOT"
    deno task alice:withdraw --order-id "$ORDER_ID"
    
    print_status "Alice successfully withdrew from destination escrow"
    
    # Wait for Bob to claim
    print_info "Waiting for Bob to claim from source escrow..."
    sleep 5
    
    # Check if Bob claimed
    if grep -q "Successfully claimed from source escrow" resolver.log 2>/dev/null; then
        print_status "Bob successfully claimed from source escrow!"
    else
        print_error "Bob may not have claimed yet. Check resolver.log for details"
    fi
}

# Function to cleanup
cleanup() {
    print_header "Cleanup"
    
    if [ ! -z "${RESOLVER_PID:-}" ]; then
        print_info "Stopping resolver..."
        kill "$RESOLVER_PID" 2>/dev/null || true
        wait "$RESOLVER_PID" 2>/dev/null || true
        print_status "Resolver stopped"
    fi
    
    if [ -f resolver.log ]; then
        print_info "Resolver log saved to: resolver.log"
    fi
}

# Main flow
main() {
    print_header "Bridge-Me-Not Atomic Swap Test Flow"
    echo "Mode: $MODE"
    echo "Amount: $ALICE_AMOUNT tokens"
    echo "Bob's profit: $BOB_PROFIT_BPS bps"
    
    # Set trap for cleanup
    trap cleanup EXIT
    
    # Only setup chains and contracts for local mode
    if [ "$MODE" = "local" ]; then
        check_chains
        check_contracts
        fund_accounts
    else
        print_info "Running in mainnet mode - skipping chain/contract setup"
        # Load contract addresses from config
        check_contracts
    fi
    
    # Show initial balances
    show_balances "Initial Balances"
    wait_for_input
    
    # Create order
    create_order
    wait_for_input
    
    # Start resolver
    start_resolver
    wait_for_input
    
    # Withdraw funds
    withdraw_funds
    wait_for_input
    
    # Show final balances
    show_balances "Final Balances"
    
    print_header "Test Complete!"
    print_status "Atomic swap completed successfully"
    if [ "$MODE" = "mainnet" ]; then
        print_info "Alice swapped BMN from Base to Etherlink"
    else
        print_info "Alice swapped Token A for Token B"
    fi
    print_info "Bob earned profit by providing liquidity"
}

# Run main function
main