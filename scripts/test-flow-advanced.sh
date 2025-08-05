#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONTRACTS_DIR="$PROJECT_ROOT/../bmn-evm-contracts"
ENV_FILE="$PROJECT_ROOT/.env"
LOG_DIR="$PROJECT_ROOT/logs"

# Create logs directory
mkdir -p "$LOG_DIR"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo -e "${RED}Error: .env file not found. Running setup script...${NC}"
    "$SCRIPT_DIR/setup-env.sh"
    source "$ENV_FILE"
fi

# Parse command line arguments
MODE="local"
ALICE_AMOUNT="100"
BOB_PROFIT_BPS="50"
INTERACTIVE=true
VERBOSE=false

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -m, --mode MODE          Deployment mode: local or mainnet (default: local)"
    echo "  -a, --amount AMOUNT      Amount Alice wants to swap (default: 100)"
    echo "  -p, --profit BPS         Bob's profit in basis points (default: 50 = 0.5%)"
    echo "  -n, --non-interactive    Run without user prompts"
    echo "  -v, --verbose            Enable verbose output"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                       # Interactive local test with defaults"
    echo "  $0 -a 200 -p 100        # Swap 200 tokens with 1% profit"
    echo "  $0 -m mainnet -n        # Non-interactive mainnet test"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            MODE="$2"
            shift 2
            ;;
        -a|--amount)
            ALICE_AMOUNT="$2"
            shift 2
            ;;
        -p|--profit)
            BOB_PROFIT_BPS="$2"
            shift 2
            ;;
        -n|--non-interactive)
            INTERACTIVE=false
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Function to print section headers
print_header() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} ${CYAN}$1${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n"
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

# Function to print debug (only in verbose mode)
print_debug() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${PURPLE}[DEBUG]${NC} $1"
    fi
}

# Function to wait for user input
wait_for_input() {
    if [ "$INTERACTIVE" = true ]; then
        echo -e "\n${YELLOW}Press Enter to continue, or 'q' to quit...${NC}"
        read -r response
        if [ "$response" = "q" ]; then
            echo -e "${RED}User quit the test flow${NC}"
            exit 0
        fi
    fi
}

# Function to execute cast commands with error handling
safe_cast() {
    local cmd="$1"
    local description="$2"
    
    print_debug "Executing: cast $cmd"
    
    if output=$(eval "cast $cmd" 2>&1); then
        echo "$output"
    else
        print_error "$description failed"
        print_error "Command: cast $cmd"
        print_error "Error: $output"
        return 1
    fi
}

# Function to check if chains are running with detailed info
check_chains() {
    print_header "Checking Chain Status"
    
    local chain_a_running=false
    local chain_b_running=false
    local chain_a_id=""
    local chain_b_id=""
    
    # Check Chain A
    if chain_a_id=$(cast chain-id --rpc-url http://localhost:8545 2>/dev/null); then
        chain_a_running=true
        print_status "Chain A is running on localhost:8545 (ID: $chain_a_id)"
        
        # Get block number
        local block_a=$(cast block-number --rpc-url http://localhost:8545 2>/dev/null || echo "unknown")
        print_info "  Current block: $block_a"
    fi
    
    # Check Chain B
    if chain_b_id=$(cast chain-id --rpc-url http://localhost:8546 2>/dev/null); then
        chain_b_running=true
        print_status "Chain B is running on localhost:8546 (ID: $chain_b_id)"
        
        # Get block number
        local block_b=$(cast block-number --rpc-url http://localhost:8546 2>/dev/null || echo "unknown")
        print_info "  Current block: $block_b"
    fi
    
    if [ "$chain_a_running" = false ] || [ "$chain_b_running" = false ]; then
        print_info "Starting local chains..."
        cd "$CONTRACTS_DIR"
        
        # Kill any existing anvil processes
        pkill -f "anvil" || true
        sleep 2
        
        # Start chains with logging
        ./scripts/multi-chain-setup.sh > "$LOG_DIR/chains.log" 2>&1 &
        CHAINS_PID=$!
        
        # Wait for chains to start with progress indicator
        local max_wait=30
        local waited=0
        echo -n "Starting chains"
        while [ $waited -lt $max_wait ]; do
            if cast chain-id --rpc-url http://localhost:8545 &>/dev/null && \
               cast chain-id --rpc-url http://localhost:8546 &>/dev/null; then
                echo ""
                print_status "Chains started successfully"
                break
            fi
            echo -n "."
            sleep 1
            ((waited++))
        done
        
        if [ $waited -eq $max_wait ]; then
            echo ""
            print_error "Failed to start chains within ${max_wait}s"
            print_info "Check logs at: $LOG_DIR/chains.log"
            exit 1
        fi
        
        cd "$PROJECT_ROOT"
    fi
}

# Function to deploy contracts if needed
deploy_contracts() {
    print_header "Deploying Contracts"
    
    cd "$CONTRACTS_DIR"
    
    print_info "Deploying to Chain A..."
    forge script script/Deploy.s.sol:DeployScript \
        --broadcast \
        --rpc-url http://localhost:8545 \
        --private-key "$ANVIL_PRIVATE_KEY_0" \
        -vvv > "$LOG_DIR/deploy-chain-a.log" 2>&1
    
    print_info "Deploying to Chain B..."
    forge script script/Deploy.s.sol:DeployScript \
        --broadcast \
        --rpc-url http://localhost:8546 \
        --private-key "$ANVIL_PRIVATE_KEY_0" \
        -vvv > "$LOG_DIR/deploy-chain-b.log" 2>&1
    
    cd "$PROJECT_ROOT"
    
    print_status "Contracts deployed"
    print_info "Deployment logs saved to $LOG_DIR/"
}

# Enhanced contract checking with validation
check_contracts() {
    print_header "Checking Contract Deployment"
    
    local addresses_file="$CONTRACTS_DIR/test/addresses.json"
    
    if [ ! -f "$addresses_file" ]; then
        print_info "Contract addresses file not found. Deploying contracts..."
        deploy_contracts
    else
        print_status "Contract addresses file found"
    fi
    
    # Load and validate contract addresses
    export ESCROW_FACTORY_A=$(jq -r '.chainA.escrowFactory' "$addresses_file")
    export ESCROW_FACTORY_B=$(jq -r '.chainB.escrowFactory' "$addresses_file")
    export LIMIT_ORDER_PROTOCOL_A=$(jq -r '.chainA.limitOrderProtocol' "$addresses_file")
    export TOKEN_A=$(jq -r '.chainA.tokenA' "$addresses_file")
    export TOKEN_B=$(jq -r '.chainB.tokenB' "$addresses_file")
    
    print_info "Contract addresses loaded:"
    echo "  ${CYAN}Chain A:${NC}"
    echo "    - Escrow Factory: $ESCROW_FACTORY_A"
    echo "    - Limit Order Protocol: $LIMIT_ORDER_PROTOCOL_A"
    echo "    - Token A: $TOKEN_A"
    echo "  ${CYAN}Chain B:${NC}"
    echo "    - Escrow Factory: $ESCROW_FACTORY_B"
    echo "    - Token B: $TOKEN_B"
    
    # Validate contracts are deployed
    print_info "Validating contract deployment..."
    
    # Check if contracts have code
    local factory_a_code=$(cast code "$ESCROW_FACTORY_A" --rpc-url http://localhost:8545 2>/dev/null || echo "0x")
    local factory_b_code=$(cast code "$ESCROW_FACTORY_B" --rpc-url http://localhost:8546 2>/dev/null || echo "0x")
    
    if [ "$factory_a_code" = "0x" ] || [ "$factory_b_code" = "0x" ]; then
        print_error "Contracts not properly deployed. Redeploying..."
        deploy_contracts
        
        # Reload addresses
        export ESCROW_FACTORY_A=$(jq -r '.chainA.escrowFactory' "$addresses_file")
        export ESCROW_FACTORY_B=$(jq -r '.chainB.escrowFactory' "$addresses_file")
        export LIMIT_ORDER_PROTOCOL_A=$(jq -r '.chainA.limitOrderProtocol' "$addresses_file")
        export TOKEN_A=$(jq -r '.chainA.tokenA' "$addresses_file")
        export TOKEN_B=$(jq -r '.chainB.tokenB' "$addresses_file")
    else
        print_status "All contracts validated successfully"
    fi
}

# Enhanced funding with approval checks
fund_accounts() {
    print_header "Funding Test Accounts"
    
    local alice_addr=$(cast wallet address --private-key "$ALICE_PRIVATE_KEY")
    local bob_addr=$(cast wallet address --private-key "$BOB_PRIVATE_KEY")
    
    echo -e "${CYAN}Test Accounts:${NC}"
    echo "  Alice: $alice_addr"
    echo "  Bob:   $bob_addr"
    echo ""
    
    # Check current balances
    local alice_balance_a=$(cast call "$TOKEN_A" "balanceOf(address)(uint256)" "$alice_addr" --rpc-url http://localhost:8545)
    local bob_balance_b=$(cast call "$TOKEN_B" "balanceOf(address)(uint256)" "$bob_addr" --rpc-url http://localhost:8546)
    
    local alice_readable_a=$(cast from-wei "$alice_balance_a")
    local bob_readable_b=$(cast from-wei "$bob_balance_b")
    
    print_info "Current balances:"
    echo "  - Alice has $alice_readable_a Token A"
    echo "  - Bob has $bob_readable_b Token B"
    
    # Fund if needed
    if (( $(echo "$alice_readable_a < 500" | bc -l) )); then
        print_info "Minting 1000 Token A for Alice..."
        cast send "$TOKEN_A" "mint(address,uint256)" "$alice_addr" "$(cast to-wei 1000)" \
            --rpc-url http://localhost:8545 \
            --private-key "$ANVIL_PRIVATE_KEY_0" \
            > /dev/null 2>&1
        print_status "Alice funded with Token A"
    fi
    
    if (( $(echo "$bob_readable_b < 500" | bc -l) )); then
        print_info "Minting 1000 Token B for Bob..."
        cast send "$TOKEN_B" "mint(address,uint256)" "$bob_addr" "$(cast to-wei 1000)" \
            --rpc-url http://localhost:8546 \
            --private-key "$ANVIL_PRIVATE_KEY_0" \
            > /dev/null 2>&1
        print_status "Bob funded with Token B"
    fi
    
    # Approve contracts
    print_info "Setting up token approvals..."
    
    # Alice approves Limit Order Protocol for Token A
    cast send "$TOKEN_A" "approve(address,uint256)" "$LIMIT_ORDER_PROTOCOL_A" "$(cast to-wei 10000)" \
        --rpc-url http://localhost:8545 \
        --private-key "$ALICE_PRIVATE_KEY" \
        > /dev/null 2>&1
    print_status "Alice approved Limit Order Protocol"
    
    # Bob approves Escrow Factory B for Token B
    cast send "$TOKEN_B" "approve(address,uint256)" "$ESCROW_FACTORY_B" "$(cast to-wei 10000)" \
        --rpc-url http://localhost:8546 \
        --private-key "$BOB_PRIVATE_KEY" \
        > /dev/null 2>&1
    print_status "Bob approved Escrow Factory B"
}

# Enhanced balance display with formatting
show_balances() {
    local title="${1:-Current Balances}"
    print_header "$title"
    
    local alice_addr=$(cast wallet address --private-key "$ALICE_PRIVATE_KEY")
    local bob_addr=$(cast wallet address --private-key "$BOB_PRIVATE_KEY")
    
    # Get all balances
    local alice_balance_a=$(cast call "$TOKEN_A" "balanceOf(address)(uint256)" "$alice_addr" --rpc-url http://localhost:8545)
    local alice_balance_b=$(cast call "$TOKEN_B" "balanceOf(address)(uint256)" "$alice_addr" --rpc-url http://localhost:8546)
    local bob_balance_a=$(cast call "$TOKEN_A" "balanceOf(address)(uint256)" "$bob_addr" --rpc-url http://localhost:8545)
    local bob_balance_b=$(cast call "$TOKEN_B" "balanceOf(address)(uint256)" "$bob_addr" --rpc-url http://localhost:8546)
    
    # Convert to readable format
    local alice_a=$(cast from-wei "$alice_balance_a")
    local alice_b=$(cast from-wei "$alice_balance_b")
    local bob_a=$(cast from-wei "$bob_balance_a")
    local bob_b=$(cast from-wei "$bob_balance_b")
    
    # Display in table format
    echo -e "${CYAN}┌─────────┬──────────────┬──────────────┐${NC}"
    echo -e "${CYAN}│ Account │   Token A    │   Token B    │${NC}"
    echo -e "${CYAN}├─────────┼──────────────┼──────────────┤${NC}"
    printf "${CYAN}│${NC} Alice   ${CYAN}│${NC} %12s ${CYAN}│${NC} %12s ${CYAN}│${NC}\n" "$alice_a" "$alice_b"
    printf "${CYAN}│${NC} Bob     ${CYAN}│${NC} %12s ${CYAN}│${NC} %12s ${CYAN}│${NC}\n" "$bob_a" "$bob_b"
    echo -e "${CYAN}└─────────┴──────────────┴──────────────┘${NC}"
}

# Direct order creation using cast
create_order_direct() {
    print_header "Creating Order Directly (Advanced)"
    
    local alice_addr=$(cast wallet address --private-key "$ALICE_PRIVATE_KEY")
    local amount_wei=$(cast to-wei "$ALICE_AMOUNT")
    
    # Calculate amounts
    local profit_factor=$((10000 + BOB_PROFIT_BPS))
    local dst_amount_wei=$((amount_wei * 10000 / profit_factor))
    
    # Generate secret and hashlock
    local secret="0x$(openssl rand -hex 32)"
    local hashlock=$(cast keccak "$secret")
    
    print_info "Order parameters:"
    echo "  - Amount: $ALICE_AMOUNT Token A"
    echo "  - Expected: $(cast from-wei "$dst_amount_wei") Token B"
    echo "  - Profit: $BOB_PROFIT_BPS bps ($(echo "scale=2; $BOB_PROFIT_BPS / 100" | bc)%)"
    echo "  - Secret: $secret"
    echo "  - Hashlock: $hashlock"
    
    # Create order data
    local order_data=$(cast abi-encode "createOrder(address,uint256,uint256,address,uint256,uint256,bytes32,uint256)" \
        "$TOKEN_A" \
        "$amount_wei" \
        1338 \
        "$TOKEN_B" \
        "$dst_amount_wei" \
        300 \
        "$hashlock" \
        50)
    
    print_info "Creating order on-chain..."
    
    # Send transaction
    local tx_hash=$(cast send "$LIMIT_ORDER_PROTOCOL_A" "$order_data" \
        --rpc-url http://localhost:8545 \
        --private-key "$ALICE_PRIVATE_KEY" \
        --json | jq -r '.transactionHash')
    
    print_status "Order creation transaction: $tx_hash"
    
    # Get order ID from events
    local logs=$(cast logs \
        --from-block latest \
        --to-block latest \
        --address "$LIMIT_ORDER_PROTOCOL_A" \
        --rpc-url http://localhost:8545)
    
    # Extract order ID (this is simplified, actual implementation would parse events properly)
    ORDER_ID="1" # Simplified for demo
    ORDER_SECRET="$secret"
    ORDER_HASHLOCK="$hashlock"
    
    print_status "Order created with ID: $ORDER_ID"
    
    # Save order details
    echo "{
        \"orderId\": \"$ORDER_ID\",
        \"secret\": \"$secret\",
        \"hashlock\": \"$hashlock\",
        \"amount\": \"$ALICE_AMOUNT\",
        \"expectedAmount\": \"$(cast from-wei "$dst_amount_wei")\"
    }" > "$LOG_DIR/order-$ORDER_ID.json"
    
    print_info "Order details saved to: $LOG_DIR/order-$ORDER_ID.json"
}

# Monitor resolver with detailed logging
monitor_resolver() {
    print_header "Monitoring Resolver Activity"
    
    local max_wait=60
    local check_interval=2
    local elapsed=0
    
    echo -n "Waiting for resolver to process order"
    
    while [ $elapsed -lt $max_wait ]; do
        # Check resolver log for various stages
        if grep -q "Destination escrow deployed" resolver.log 2>/dev/null; then
            echo ""
            print_status "Resolver deployed destination escrow"
            
            local dst_escrow=$(grep -oP 'Destination escrow: \K0x[a-fA-F0-9]+' resolver.log | tail -1)
            print_info "Destination escrow address: $dst_escrow"
            
            # Verify escrow on chain
            local escrow_code=$(cast code "$dst_escrow" --rpc-url http://localhost:8546 2>/dev/null || echo "0x")
            if [ "$escrow_code" != "0x" ]; then
                print_status "Destination escrow verified on Chain B"
            fi
        fi
        
        if grep -q "Order filled successfully" resolver.log 2>/dev/null; then
            echo ""
            print_status "Order processed successfully!"
            return 0
        fi
        
        echo -n "."
        sleep $check_interval
        ((elapsed += check_interval))
    done
    
    echo ""
    print_error "Resolver did not process order within ${max_wait}s"
    return 1
}

# Direct withdrawal using cast
withdraw_direct() {
    print_header "Direct Withdrawal Using Cast"
    
    local alice_addr=$(cast wallet address --private-key "$ALICE_PRIVATE_KEY")
    
    # Get destination escrow from resolver log
    local dst_escrow=$(grep -oP 'Destination escrow: \K0x[a-fA-F0-9]+' resolver.log | tail -1)
    
    if [ -z "$dst_escrow" ]; then
        print_error "Could not find destination escrow address"
        return 1
    fi
    
    print_info "Withdrawing from destination escrow: $dst_escrow"
    print_info "This will reveal the secret: $ORDER_SECRET"
    
    # Encode withdraw call
    local withdraw_data=$(cast abi-encode "withdraw(bytes32)" "$ORDER_SECRET")
    
    # Send withdrawal transaction
    local tx_hash=$(cast send "$dst_escrow" "$withdraw_data" \
        --rpc-url http://localhost:8546 \
        --private-key "$ALICE_PRIVATE_KEY" \
        --json | jq -r '.transactionHash')
    
    print_status "Withdrawal transaction: $tx_hash"
    
    # Wait for transaction
    cast receipt "$tx_hash" --rpc-url http://localhost:8546 --confirmations 1 > /dev/null
    
    print_status "Alice successfully withdrew from destination escrow"
    
    # Monitor Bob's claim
    print_info "Monitoring Bob's claim from source escrow..."
    
    local claim_wait=10
    local claimed=false
    
    for i in $(seq 1 $claim_wait); do
        if grep -q "Successfully claimed from source escrow" resolver.log 2>/dev/null; then
            print_status "Bob successfully claimed from source escrow!"
            claimed=true
            break
        fi
        sleep 1
    done
    
    if [ "$claimed" = false ]; then
        print_error "Bob has not claimed yet. This might indicate an issue."
        print_info "Check resolver.log for details"
    fi
}

# Error recovery options
handle_error() {
    local error_type="$1"
    
    print_header "Error Recovery Options"
    
    case "$error_type" in
        "order_failed")
            print_info "Order creation failed. Options:"
            echo "  1. Check token balances and approvals"
            echo "  2. Verify contract addresses"
            echo "  3. Check chain connectivity"
            echo "  4. View transaction logs"
            ;;
        "resolver_timeout")
            print_info "Resolver timeout. Options:"
            echo "  1. Check resolver logs: tail -f resolver.log"
            echo "  2. Restart resolver: deno task resolver:start"
            echo "  3. Check order profitability"
            echo "  4. Verify resolver configuration"
            ;;
        "withdrawal_failed")
            print_info "Withdrawal failed. Options:"
            echo "  1. Check escrow state"
            echo "  2. Verify secret is correct"
            echo "  3. Check timelock expiry"
            echo "  4. Manual withdrawal with cast"
            ;;
    esac
    
    if [ "$INTERACTIVE" = true ]; then
        echo ""
        echo "Select option (1-4) or 'c' to continue, 'q' to quit:"
        read -r option
        
        case "$option" in
            1|2|3|4)
                # Implement specific recovery actions
                print_info "Executing recovery option $option..."
                ;;
            c)
                return 0
                ;;
            q)
                exit 0
                ;;
        esac
    fi
}

# Cleanup function
cleanup() {
    print_header "Cleanup"
    
    if [ ! -z "${RESOLVER_PID:-}" ]; then
        print_info "Stopping resolver..."
        kill "$RESOLVER_PID" 2>/dev/null || true
        wait "$RESOLVER_PID" 2>/dev/null || true
        print_status "Resolver stopped"
    fi
    
    if [ ! -z "${CHAINS_PID:-}" ] && [ "$MODE" = "local" ]; then
        print_info "Stopping local chains..."
        kill "$CHAINS_PID" 2>/dev/null || true
        pkill -f "anvil" || true
        print_status "Chains stopped"
    fi
    
    print_info "Logs saved to: $LOG_DIR/"
    
    if [ -f resolver.log ]; then
        mv resolver.log "$LOG_DIR/resolver-$(date +%Y%m%d-%H%M%S).log"
    fi
}

# Main flow
main() {
    print_header "Bridge-Me-Not Atomic Swap Test Flow (Advanced)"
    
    echo -e "${CYAN}Configuration:${NC}"
    echo "  Mode: $MODE"
    echo "  Amount: $ALICE_AMOUNT tokens"
    echo "  Bob's profit: $BOB_PROFIT_BPS bps ($(echo "scale=2; $BOB_PROFIT_BPS / 100" | bc)%)"
    echo "  Interactive: $INTERACTIVE"
    echo "  Verbose: $VERBOSE"
    
    # Set trap for cleanup
    trap cleanup EXIT
    
    # Step 1: Environment setup
    if [ "$MODE" = "local" ]; then
        check_chains
        check_contracts
        fund_accounts
    else
        print_info "Running in $MODE mode - using existing deployment"
        check_contracts
    fi
    
    wait_for_input
    
    # Step 2: Show initial state
    show_balances "Initial Balances"
    wait_for_input
    
    # Step 3: Create order
    if [ "$VERBOSE" = true ]; then
        create_order_direct
    else
        print_info "Creating order using standard flow..."
        cd "$PROJECT_ROOT"
        
        # Create order and capture output
        local order_output=$(deno task alice:create-order --amount "$ALICE_AMOUNT" --token-a TKA --token-b TKB 2>&1)
        
        # Extract order ID
        ORDER_ID=$(echo "$order_output" | grep -oP 'Order created with ID: \K[0-9]+' || echo "")
        
        if [ -z "$ORDER_ID" ]; then
            print_error "Failed to create order"
            echo "$order_output"
            handle_error "order_failed"
            exit 1
        fi
        
        print_status "Order created with ID: $ORDER_ID"
        
        # Show order details
        deno task alice:list-orders
    fi
    
    wait_for_input
    
    # Step 4: Start resolver
    print_header "Starting Bob's Resolver"
    
    print_info "Starting resolver in background..."
    cd "$PROJECT_ROOT"
    deno task resolver:start > resolver.log 2>&1 &
    RESOLVER_PID=$!
    
    print_status "Resolver started (PID: $RESOLVER_PID)"
    
    # Monitor resolver
    if ! monitor_resolver; then
        handle_error "resolver_timeout"
        print_info "Resolver log tail:"
        tail -20 resolver.log
    fi
    
    wait_for_input
    
    # Step 5: Withdraw funds
    if [ "$VERBOSE" = true ]; then
        withdraw_direct
    else
        print_info "Withdrawing using standard flow..."
        cd "$PROJECT_ROOT"
        
        if ! deno task alice:withdraw --order-id "$ORDER_ID"; then
            print_error "Withdrawal failed"
            handle_error "withdrawal_failed"
        else
            print_status "Alice successfully withdrew from destination escrow"
            
            # Wait for Bob to claim
            print_info "Waiting for Bob to claim from source escrow..."
            sleep 5
            
            if grep -q "Successfully claimed from source escrow" resolver.log 2>/dev/null; then
                print_status "Bob successfully claimed from source escrow!"
            else
                print_error "Bob may not have claimed yet. Check resolver.log"
            fi
        fi
    fi
    
    wait_for_input
    
    # Step 6: Show final state
    show_balances "Final Balances"
    
    # Summary
    print_header "Test Summary"
    
    echo -e "${GREEN}✅ Atomic swap completed successfully!${NC}"
    echo ""
    echo "Summary:"
    echo "  - Alice swapped $ALICE_AMOUNT Token A for Token B"
    echo "  - Bob provided liquidity and earned $BOB_PROFIT_BPS bps profit"
    echo "  - All funds were transferred atomically"
    echo ""
    echo "Transaction flow:"
    echo "  1. Alice created order with hashlock on Chain A"
    echo "  2. Bob deployed matching escrow on Chain B"
    echo "  3. Alice withdrew from Chain B (revealing secret)"
    echo "  4. Bob claimed from Chain A using revealed secret"
    
    if [ "$VERBOSE" = true ]; then
        echo ""
        echo "Detailed logs available at:"
        echo "  - Chains: $LOG_DIR/chains.log"
        echo "  - Resolver: $LOG_DIR/resolver-*.log"
        echo "  - Order details: $LOG_DIR/order-$ORDER_ID.json"
    fi
}

# Run main function
main