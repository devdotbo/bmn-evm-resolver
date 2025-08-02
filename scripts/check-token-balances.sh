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
echo -e "${BLUE}║         Bridge-Me-Not Token Balance Report                 ║${NC}"
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

# Check if chains are running
if ! check_port 8545 || ! check_port 8546; then
    echo -e "${RED}Error: Both chains must be running!${NC}"
    echo "Chain A (8545): $(check_port 8545 && echo -e "${GREEN}Running${NC}" || echo -e "${RED}Not running${NC}")"
    echo "Chain B (8546): $(check_port 8546 && echo -e "${GREEN}Running${NC}" || echo -e "${RED}Not running${NC}")"
    echo ""
    echo "Run: cd ../bmn-evm-contracts && ./scripts/multi-chain-setup.sh"
    exit 1
fi

# Check if deployments exist
if [ ! -f "$PROJECT_ROOT/deployments/chainA.json" ] || [ ! -f "$PROJECT_ROOT/deployments/chainB.json" ]; then
    echo -e "${RED}Error: Deployment files not found!${NC}"
    echo "Please ensure contracts are deployed."
    exit 1
fi

# Function to get token balance
get_token_balance() {
    local token_address=$1
    local account=$2
    local rpc_url=$3
    
    local balance_wei=$(cast call $token_address "balanceOf(address)(uint256)" $account --rpc-url $rpc_url 2>/dev/null | awk '{print $1}')
    
    if [ ! -z "$balance_wei" ] && [ "$balance_wei" != "0" ]; then
        echo $(cast from-wei $balance_wei)
    else
        echo "0"
    fi
}

# Function to format balance with color
format_balance() {
    local balance=$1
    local expected=$2
    local color=$GREEN
    
    if (( $(echo "$balance == 0" | bc -l) )); then
        color=$RED
    elif (( $(echo "$balance < $expected" | bc -l) )); then
        color=$YELLOW
    fi
    
    printf "${color}%10s${NC}" "$balance"
}

# Function to get token symbol
get_token_symbol() {
    local token_address=$1
    local rpc_url=$2
    
    # Try to get symbol, fallback to abbreviated address if fails
    local symbol=$(cast call $token_address "symbol()(string)" --rpc-url $rpc_url 2>/dev/null | tr -d '"' | tr -d ' ')
    
    if [ -z "$symbol" ] || [ "$symbol" = "0x" ]; then
        echo "${token_address:0:6}...${token_address: -4}"
    else
        echo "$symbol"
    fi
}

# Get token addresses
TOKEN_A_CHAIN_A=$(cat "$PROJECT_ROOT/deployments/chainA.json" | jq -r '.tokenA // empty')
TOKEN_B_CHAIN_A=$(cat "$PROJECT_ROOT/deployments/chainA.json" | jq -r '.tokenB // empty')
TOKEN_A_CHAIN_B=$(cat "$PROJECT_ROOT/deployments/chainB.json" | jq -r '.tokenA // empty')
TOKEN_B_CHAIN_B=$(cat "$PROJECT_ROOT/deployments/chainB.json" | jq -r '.tokenB // empty')

# If jq is not available, fallback to grep
if [ -z "$TOKEN_A_CHAIN_A" ]; then
    TOKEN_A_CHAIN_A=$(cat "$PROJECT_ROOT/deployments/chainA.json" | grep -o '"tokenA": "[^"]*"' | cut -d'"' -f4)
    TOKEN_B_CHAIN_A=$(cat "$PROJECT_ROOT/deployments/chainA.json" | grep -o '"tokenB": "[^"]*"' | cut -d'"' -f4)
    TOKEN_A_CHAIN_B=$(cat "$PROJECT_ROOT/deployments/chainB.json" | grep -o '"tokenA": "[^"]*"' | cut -d'"' -f4)
    TOKEN_B_CHAIN_B=$(cat "$PROJECT_ROOT/deployments/chainB.json" | grep -o '"tokenB": "[^"]*"' | cut -d'"' -f4)
fi

# Timestamp
echo -e "\n${CYAN}Timestamp: $(date '+%Y-%m-%d %H:%M:%S')${NC}"

# Get all balances
echo -e "\n${YELLOW}Fetching token balances...${NC}"

# Chain A balances
ALICE_TKA_A=$(get_token_balance $TOKEN_A_CHAIN_A $ALICE "http://localhost:8545")
ALICE_TKB_A=$(get_token_balance $TOKEN_B_CHAIN_A $ALICE "http://localhost:8545")
BOB_TKA_A=$(get_token_balance $TOKEN_A_CHAIN_A $BOB "http://localhost:8545")
BOB_TKB_A=$(get_token_balance $TOKEN_B_CHAIN_A $BOB "http://localhost:8545")

# Chain B balances
ALICE_TKA_B=$(get_token_balance $TOKEN_A_CHAIN_B $ALICE "http://localhost:8546")
ALICE_TKB_B=$(get_token_balance $TOKEN_B_CHAIN_B $ALICE "http://localhost:8546")
BOB_TKA_B=$(get_token_balance $TOKEN_A_CHAIN_B $BOB "http://localhost:8546")
BOB_TKB_B=$(get_token_balance $TOKEN_B_CHAIN_B $BOB "http://localhost:8546")

# Display results in a table format
echo -e "\n${MAGENTA}═══ Token Balance Matrix ═══${NC}"
echo ""
echo -e "                    ${CYAN}Chain A (1337)${NC}              ${CYAN}Chain B (1338)${NC}"
echo -e "Account         TKA         TKB             TKA         TKB"
echo -e "─────────────────────────────────────────────────────────────────"

# Alice row
printf "Alice      %s      %s         %s      %s\n" \
    "$(format_balance $ALICE_TKA_A 100)" \
    "$(format_balance $ALICE_TKB_A 0)" \
    "$(format_balance $ALICE_TKA_B 0)" \
    "$(format_balance $ALICE_TKB_B 100)"

# Bob row
printf "Bob        %s      %s         %s      %s\n" \
    "$(format_balance $BOB_TKA_A 0)" \
    "$(format_balance $BOB_TKB_A 0)" \
    "$(format_balance $BOB_TKA_B 0)" \
    "$(format_balance $BOB_TKB_B 100)"

echo -e "─────────────────────────────────────────────────────────────────"

# Calculate totals
TOTAL_TKA_A=$(echo "$ALICE_TKA_A + $BOB_TKA_A" | bc)
TOTAL_TKB_A=$(echo "$ALICE_TKB_A + $BOB_TKB_A" | bc)
TOTAL_TKA_B=$(echo "$ALICE_TKA_B + $BOB_TKA_B" | bc)
TOTAL_TKB_B=$(echo "$ALICE_TKB_B + $BOB_TKB_B" | bc)

printf "${YELLOW}Total${NC}      %10s  %10s     %10s  %10s\n" \
    "$TOTAL_TKA_A" "$TOTAL_TKB_A" "$TOTAL_TKA_B" "$TOTAL_TKB_B"

# Expected setup for atomic swap
echo -e "\n${BLUE}═══ Atomic Swap Readiness ═══${NC}"
echo ""
echo -e "${CYAN}Expected Initial Setup:${NC}"
echo "  • Alice should have TKA on Chain A (to swap away)"
echo "  • Bob should have TKB on Chain B (to provide liquidity)"
echo ""

# Check Alice readiness
echo -e "${CYAN}Alice Status:${NC}"
if (( $(echo "$ALICE_TKA_A > 0" | bc -l) )); then
    echo -e "  ${GREEN}✓ Has ${ALICE_TKA_A} TKA on Chain A (can create orders)${NC}"
else
    echo -e "  ${RED}✗ No TKA on Chain A (cannot create orders)${NC}"
fi

if (( $(echo "$ALICE_TKB_B > 0" | bc -l) )); then
    echo -e "  ${YELLOW}! Already has ${ALICE_TKB_B} TKB on Chain B${NC}"
fi

# Check Bob readiness
echo -e "\n${CYAN}Bob Status:${NC}"
if (( $(echo "$BOB_TKB_B > 0" | bc -l) )); then
    echo -e "  ${GREEN}✓ Has ${BOB_TKB_B} TKB on Chain B (can provide liquidity)${NC}"
else
    echo -e "  ${RED}✗ No TKB on Chain B (cannot fill orders)${NC}"
fi

if (( $(echo "$BOB_TKA_A > 0" | bc -l) )); then
    echo -e "  ${YELLOW}! Already has ${BOB_TKA_A} TKA on Chain A${NC}"
fi

# Check if funding is needed
echo -e "\n${BLUE}═══ Funding Recommendations ═══${NC}"
NEED_FUNDING=false

if (( $(echo "$ALICE_TKA_A == 0" | bc -l) )); then
    echo -e "${RED}⚠ Alice needs TKA on Chain A to create swap orders${NC}"
    NEED_FUNDING=true
fi

if (( $(echo "$BOB_TKB_B == 0" | bc -l) )); then
    echo -e "${RED}⚠ Bob needs TKB on Chain B to provide liquidity${NC}"
    NEED_FUNDING=true
fi

if [ "$NEED_FUNDING" = true ]; then
    echo -e "\n${YELLOW}To fund token balances, run:${NC}"
    echo "  cd ../bmn-evm-contracts && ./scripts/fund-accounts.sh --tokens"
else
    echo -e "${GREEN}✓ Token balances are properly configured for atomic swaps${NC}"
fi

# Display token contract addresses
echo -e "\n${BLUE}═══ Token Contract Addresses ═══${NC}"
echo -e "${CYAN}Chain A:${NC}"
echo "  TKA: $TOKEN_A_CHAIN_A"
echo "  TKB: $TOKEN_B_CHAIN_A"
echo -e "${CYAN}Chain B:${NC}"
echo "  TKA: $TOKEN_A_CHAIN_B"
echo "  TKB: $TOKEN_B_CHAIN_B"

echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"