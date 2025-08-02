#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Bridge-Me-Not ETH Balance Report                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Function to check if port is in use
check_port() {
    lsof -i :$1 > /dev/null 2>&1
    return $?
}

# Account addresses
ALICE="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
BOB="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
DEPLOYER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

# Check if chains are running
CHAIN_A_RUNNING=false
CHAIN_B_RUNNING=false

if check_port 8545; then
    CHAIN_A_RUNNING=true
fi

if check_port 8546; then
    CHAIN_B_RUNNING=true
fi

if [ "$CHAIN_A_RUNNING" = false ] || [ "$CHAIN_B_RUNNING" = false ]; then
    echo -e "${RED}Error: Both chains must be running!${NC}"
    echo "Chain A (8545): $([ "$CHAIN_A_RUNNING" = true ] && echo -e "${GREEN}Running${NC}" || echo -e "${RED}Not running${NC}")"
    echo "Chain B (8546): $([ "$CHAIN_B_RUNNING" = true ] && echo -e "${GREEN}Running${NC}" || echo -e "${RED}Not running${NC}")"
    echo ""
    echo "Run: cd ../bmn-evm-contracts && ./scripts/multi-chain-setup.sh"
    exit 1
fi

# Function to get balance and format it
get_eth_balance() {
    local address=$1
    local rpc_url=$2
    local balance_wei=$(cast balance $address --rpc-url $rpc_url 2>/dev/null | sed 's/[^0-9]//g')
    
    if [ ! -z "$balance_wei" ] && [ "$balance_wei" != "0" ]; then
        echo $(cast from-wei $balance_wei)
    else
        echo "0"
    fi
}

# Function to format address for display
format_address() {
    local name=$1
    local address=$2
    echo "$name (${address:0:6}...${address: -4})"
}

# Function to compare balances and show delta
compare_balance() {
    local label=$1
    local value=$2
    local color=$GREEN
    
    # Color based on balance level
    if (( $(echo "$value < 0.1" | bc -l) )); then
        color=$RED
    elif (( $(echo "$value < 1" | bc -l) )); then
        color=$YELLOW
    fi
    
    printf "  %-20s: ${color}%10s ETH${NC}\n" "$label" "$value"
}

# Timestamp
echo -e "\n${CYAN}Timestamp: $(date '+%Y-%m-%d %H:%M:%S')${NC}"

# Chain A Balances
echo -e "\n${MAGENTA}═══ Chain A (ID: 1337) - http://localhost:8545 ═══${NC}"
echo ""

ALICE_ETH_A=$(get_eth_balance $ALICE "http://localhost:8545")
BOB_ETH_A=$(get_eth_balance $BOB "http://localhost:8545")
DEPLOYER_ETH_A=$(get_eth_balance $DEPLOYER "http://localhost:8545")

compare_balance "$(format_address "Alice" $ALICE)" "$ALICE_ETH_A"
compare_balance "$(format_address "Bob" $BOB)" "$BOB_ETH_A"
compare_balance "$(format_address "Deployer" $DEPLOYER)" "$DEPLOYER_ETH_A"

TOTAL_A=$(echo "$ALICE_ETH_A + $BOB_ETH_A" | bc)
echo -e "${YELLOW}  ────────────────────────────────────────────${NC}"
printf "  %-20s: ${CYAN}%10s ETH${NC}\n" "Total (Alice + Bob)" "$TOTAL_A"

# Chain B Balances
echo -e "\n${MAGENTA}═══ Chain B (ID: 1338) - http://localhost:8546 ═══${NC}"
echo ""

ALICE_ETH_B=$(get_eth_balance $ALICE "http://localhost:8546")
BOB_ETH_B=$(get_eth_balance $BOB "http://localhost:8546")
DEPLOYER_ETH_B=$(get_eth_balance $DEPLOYER "http://localhost:8546")

compare_balance "$(format_address "Alice" $ALICE)" "$ALICE_ETH_B"
compare_balance "$(format_address "Bob" $BOB)" "$BOB_ETH_B"
compare_balance "$(format_address "Deployer" $DEPLOYER)" "$DEPLOYER_ETH_B"

TOTAL_B=$(echo "$ALICE_ETH_B + $BOB_ETH_B" | bc)
echo -e "${YELLOW}  ────────────────────────────────────────────${NC}"
printf "  %-20s: ${CYAN}%10s ETH${NC}\n" "Total (Alice + Bob)" "$TOTAL_B"

# Summary
echo -e "\n${BLUE}═══ Cross-Chain Summary ═══${NC}"
echo ""

# Alice total
ALICE_TOTAL=$(echo "$ALICE_ETH_A + $ALICE_ETH_B" | bc)
echo -e "${CYAN}Alice Total:${NC}"
printf "  Chain A: %10s ETH\n" "$ALICE_ETH_A"
printf "  Chain B: %10s ETH\n" "$ALICE_ETH_B"
printf "  ${GREEN}Total  : %10s ETH${NC}\n" "$ALICE_TOTAL"

echo ""

# Bob total
BOB_TOTAL=$(echo "$BOB_ETH_A + $BOB_ETH_B" | bc)
echo -e "${CYAN}Bob Total:${NC}"
printf "  Chain A: %10s ETH\n" "$BOB_ETH_A"
printf "  Chain B: %10s ETH\n" "$BOB_ETH_B"
printf "  ${GREEN}Total  : %10s ETH${NC}\n" "$BOB_TOTAL"

# Check if funding is needed
echo -e "\n${BLUE}═══ Funding Status ═══${NC}"
NEED_FUNDING=false

if (( $(echo "$ALICE_ETH_A < 0.1" | bc -l) )); then
    echo -e "${RED}⚠ Alice needs ETH on Chain A${NC}"
    NEED_FUNDING=true
fi

if (( $(echo "$ALICE_ETH_B < 0.1" | bc -l) )); then
    echo -e "${RED}⚠ Alice needs ETH on Chain B${NC}"
    NEED_FUNDING=true
fi

if (( $(echo "$BOB_ETH_A < 0.1" | bc -l) )); then
    echo -e "${RED}⚠ Bob needs ETH on Chain A${NC}"
    NEED_FUNDING=true
fi

if (( $(echo "$BOB_ETH_B < 0.1" | bc -l) )); then
    echo -e "${RED}⚠ Bob needs ETH on Chain B${NC}"
    NEED_FUNDING=true
fi

if [ "$NEED_FUNDING" = true ]; then
    echo -e "\n${YELLOW}To fund accounts, run:${NC}"
    echo "  cd ../bmn-evm-contracts && ./scripts/fund-accounts.sh --eth"
else
    echo -e "${GREEN}✓ All accounts have sufficient ETH${NC}"
fi

# Check for active escrows (optional)
if [ -f "$PROJECT_ROOT/deployments/chainA.json" ] && [ -f "$PROJECT_ROOT/deployments/chainB.json" ]; then
    echo -e "\n${BLUE}═══ Escrow Activity ═══${NC}"
    
    # Get factory addresses
    FACTORY_A=$(cat "$PROJECT_ROOT/deployments/chainA.json" | grep -o '"factory": "[^"]*"' | cut -d'"' -f4)
    FACTORY_B=$(cat "$PROJECT_ROOT/deployments/chainB.json" | grep -o '"factory": "[^"]*"' | cut -d'"' -f4)
    
    if [ ! -z "$FACTORY_A" ]; then
        # Check for recent escrow deployments (simplified check)
        echo -e "Chain A Factory: ${address:0:10}..."
    fi
    
    if [ ! -z "$FACTORY_B" ]; then
        echo -e "Chain B Factory: ${address:0:10}..."
    fi
fi

echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"