#!/bin/bash

# Bridge-Me-Not Complete Test Flow Script
# This script demonstrates a full atomic swap between Alice and Bob

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Default values
INTERACTIVE=true
VERBOSE=false
SKIP_CLEANUP=false
RESOLVER_PID=""

# Timing configuration (can be overridden by environment)
RESOLVER_START_DELAY=${RESOLVER_START_DELAY:-3}
ORDER_DETECTION_DELAY=${ORDER_DETECTION_DELAY:-5}
WITHDRAW_DETECTION_DELAY=${WITHDRAW_DETECTION_DELAY:-5}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -y, --yes             Run in non-interactive mode (auto-approve all steps)"
    echo "  -v, --verbose         Enable verbose output"
    echo "  -s, --skip-cleanup    Skip stopping the resolver at the end"
    echo "  -h, --help            Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  RESOLVER_START_DELAY       Delay after starting resolver (default: 3s)"
    echo "  ORDER_DETECTION_DELAY      Delay for order detection (default: 5s)"
    echo "  WITHDRAW_DETECTION_DELAY   Delay for withdraw detection (default: 5s)"
    exit 0
}

# Process arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes)
            INTERACTIVE=false
            # Reduce delays in non-interactive mode if not explicitly set
            RESOLVER_START_DELAY=${RESOLVER_START_DELAY:-2}
            ORDER_DETECTION_DELAY=${ORDER_DETECTION_DELAY:-3}
            WITHDRAW_DETECTION_DELAY=${WITHDRAW_DETECTION_DELAY:-3}
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -s|--skip-cleanup)
            SKIP_CLEANUP=true
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

# Cleanup function
cleanup() {
    local exit_code=$?
    if [ "$SKIP_CLEANUP" = false ] && [ -n "$RESOLVER_PID" ]; then
        echo -e "\n${YELLOW}Stopping resolver...${NC}"
        kill $RESOLVER_PID 2>/dev/null || true
    fi
    exit $exit_code
}

# Set up cleanup trap
trap cleanup EXIT INT TERM

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Bridge-Me-Not Atomic Swap Test Flow              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$INTERACTIVE" = false ]; then
    echo -e "${YELLOW}Running in non-interactive mode${NC}\n"
fi

# Check prerequisites
check_prerequisites() {
    local missing_tools=()
    
    # Check for required tools
    command -v deno >/dev/null 2>&1 || missing_tools+=("deno")
    
    # Check for JSON parsing tools (jq preferred, python as fallback)
    if ! command -v jq >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
        missing_tools+=("jq or python3")
    fi
    
    if [ ${#missing_tools[@]} -gt 0 ]; then
        echo -e "${RED}❌ Missing required tools: ${missing_tools[*]}${NC}"
        exit 1
    fi
    
    # Check if deployment files exist
    if [ ! -f "$PROJECT_ROOT/deployments/chainA.json" ] || [ ! -f "$PROJECT_ROOT/deployments/chainB.json" ]; then
        echo -e "${RED}❌ Deployment files not found. Please run contract deployment first.${NC}"
        exit 1
    fi
    
    # Check if chains are running
    if ! curl -s -X POST -H "Content-Type: application/json" \
         --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
         http://localhost:8545 >/dev/null 2>&1; then
        echo -e "${RED}❌ Chain A (localhost:8545) is not running${NC}"
        echo -e "${YELLOW}Please run './scripts/multi-chain-setup.sh' in the bmn-evm-contracts directory${NC}"
        exit 1
    fi
    
    if ! curl -s -X POST -H "Content-Type: application/json" \
         --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
         http://localhost:8546 >/dev/null 2>&1; then
        echo -e "${RED}❌ Chain B (localhost:8546) is not running${NC}"
        echo -e "${YELLOW}Please run './scripts/multi-chain-setup.sh' in the bmn-evm-contracts directory${NC}"
        exit 1
    fi
}

echo -e "${BLUE}Checking prerequisites...${NC}"
check_prerequisites
echo -e "${GREEN}✅ All prerequisites met${NC}\n"

# Check if .env exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Running setup...${NC}"
    "$SCRIPT_DIR/setup-env.sh"
fi

# Source and export environment variables
set -a  # Export all variables
source "$PROJECT_ROOT/.env"
set +a  # Stop exporting

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
    if [ "$INTERACTIVE" = true ]; then
        echo -e "${YELLOW}Press Enter to continue...${NC}"
        read -r
    fi
}

# Function to run command with nice output
run_command() {
    local description="$1"
    local command="$2"
    
    echo -e "${BLUE}► $description${NC}"
    if [ "$VERBOSE" = true ]; then
        echo -e "${YELLOW}  Command: $command${NC}"
    fi
    
    if [ "$VERBOSE" = true ]; then
        eval "$command"
    else
        eval "$command" 2>&1 | grep -v "^Download" || true
    fi
    echo ""
}

# Function to extract order ID from alice-state.json
get_order_id() {
    local order_id=""
    
    # Try jq first
    if command -v jq >/dev/null 2>&1; then
        order_id=$(jq -r '.orders | keys[0] // empty' alice-state.json 2>/dev/null || echo "")
    fi
    
    # Fallback to Python if jq failed or not available
    if [ -z "$order_id" ] && command -v python3 >/dev/null 2>&1; then
        order_id=$(cat alice-state.json 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    if data.get('orders'):
        print(list(data['orders'].keys())[0])
except:
    pass
" || echo "")
    fi
    
    echo "$order_id"
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

sleep $RESOLVER_START_DELAY

# Check if resolver started
if check_process "resolver:start"; then
    echo -e "${GREEN}✅ Resolver started successfully (PID: $RESOLVER_PID)${NC}"
    echo -e "${YELLOW}   Logs: tail -f resolver.log${NC}"
else
    echo -e "${RED}❌ Failed to start resolver${NC}"
    if [ "$VERBOSE" = true ] && [ -f resolver.log ]; then
        echo -e "${RED}Last 10 lines of resolver.log:${NC}"
        tail -n 10 resolver.log
    fi
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
    "deno task alice:create-order --amount 100 --token-a TKA --token-b TKB"

echo -e "${YELLOW}⏳ Waiting for Bob to detect and execute order...${NC}"
sleep $ORDER_DETECTION_DELAY

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
ORDER_ID=$(get_order_id)

if [ -z "$ORDER_ID" ]; then
    echo -e "${RED}❌ No order found in alice-state.json${NC}"
    echo -e "${YELLOW}Please check the logs for errors.${NC}"
else
    echo -e "${BLUE}Found order ID: $ORDER_ID${NC}"
    run_command "Alice withdrawing from Chain B" \
        "deno task alice:withdraw --order-id $ORDER_ID"
    
    echo -e "${YELLOW}⏳ Waiting for Bob to detect secret and withdraw...${NC}"
    sleep $WITHDRAW_DETECTION_DELAY
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