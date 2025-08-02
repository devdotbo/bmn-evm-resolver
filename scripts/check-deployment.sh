#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Bridge-Me-Not Resolver Deployment Status${NC}"
echo "======================================="

# Function to check if port is in use
check_port() {
    lsof -i :$1 > /dev/null 2>&1
    return $?
}

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Check Chain A
echo -e "\n${BLUE}Chain A (1337) - Port 8545:${NC}"
if check_port 8545; then
    echo -e "  Status: ${GREEN}Running${NC}"
    if [ -f "$PROJECT_ROOT/deployments/chainA.json" ]; then
        echo -e "  Deployment: ${GREEN}Found${NC}"
        echo "  Contracts:"
        cat "$PROJECT_ROOT/deployments/chainA.json" | grep -E '"(factory|tokenA|tokenB|limitOrderProtocol)"' | sed 's/^/    /'
    else
        echo -e "  Deployment: ${RED}Not found${NC}"
    fi
else
    echo -e "  Status: ${RED}Not running${NC}"
fi

# Check Chain B
echo -e "\n${BLUE}Chain B (1338) - Port 8546:${NC}"
if check_port 8546; then
    echo -e "  Status: ${GREEN}Running${NC}"
    if [ -f "$PROJECT_ROOT/deployments/chainB.json" ]; then
        echo -e "  Deployment: ${GREEN}Found${NC}"
        echo "  Contracts:"
        cat "$PROJECT_ROOT/deployments/chainB.json" | grep -E '"(factory|tokenA|tokenB|limitOrderProtocol)"' | sed 's/^/    /'
    else
        echo -e "  Deployment: ${RED}Not found${NC}"
    fi
else
    echo -e "  Status: ${RED}Not running${NC}"
fi

# Check if .env exists
echo -e "\n${BLUE}Environment Setup:${NC}"
if [ -f "$PROJECT_ROOT/.env" ]; then
    echo -e "  .env file: ${GREEN}Found${NC}"
else
    echo -e "  .env file: ${YELLOW}Not found${NC} (run setup-env.sh)"
fi

# Check test accounts balances if chains are running
if check_port 8545 && check_port 8546; then
    echo -e "\n${BLUE}Test Account Balances:${NC}"
    
    ALICE="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
    BOB="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
    
    # Check ETH balances
    echo -e "\n  ${BLUE}ETH Balances:${NC}"
    
    # Chain A ETH
    ALICE_ETH_A=$(cast balance $ALICE --rpc-url http://localhost:8545 2>/dev/null | sed 's/[^0-9]//g')
    BOB_ETH_A=$(cast balance $BOB --rpc-url http://localhost:8545 2>/dev/null | sed 's/[^0-9]//g')
    
    if [ ! -z "$ALICE_ETH_A" ]; then
        echo -e "    Chain A - Alice: ${GREEN}$(cast from-wei $ALICE_ETH_A) ETH${NC}"
        echo -e "    Chain A - Bob:   ${GREEN}$(cast from-wei $BOB_ETH_A) ETH${NC}"
    fi
    
    # Chain B ETH
    ALICE_ETH_B=$(cast balance $ALICE --rpc-url http://localhost:8546 2>/dev/null | sed 's/[^0-9]//g')
    BOB_ETH_B=$(cast balance $BOB --rpc-url http://localhost:8546 2>/dev/null | sed 's/[^0-9]//g')
    
    if [ ! -z "$ALICE_ETH_B" ]; then
        echo -e "    Chain B - Alice: ${GREEN}$(cast from-wei $ALICE_ETH_B) ETH${NC}"
        echo -e "    Chain B - Bob:   ${GREEN}$(cast from-wei $BOB_ETH_B) ETH${NC}"
    fi
    
    # Check token balances if deployments exist
    if [ -f "$PROJECT_ROOT/deployments/chainA.json" ] && [ -f "$PROJECT_ROOT/deployments/chainB.json" ]; then
        echo -e "\n  ${BLUE}Token Balances:${NC}"
        
        # Get token addresses
        TOKEN_A_CHAIN_A=$(cat "$PROJECT_ROOT/deployments/chainA.json" | grep -o '"tokenA": "[^"]*"' | cut -d'"' -f4)
        TOKEN_B_CHAIN_A=$(cat "$PROJECT_ROOT/deployments/chainA.json" | grep -o '"tokenB": "[^"]*"' | cut -d'"' -f4)
        TOKEN_A_CHAIN_B=$(cat "$PROJECT_ROOT/deployments/chainB.json" | grep -o '"tokenA": "[^"]*"' | cut -d'"' -f4)
        TOKEN_B_CHAIN_B=$(cat "$PROJECT_ROOT/deployments/chainB.json" | grep -o '"tokenB": "[^"]*"' | cut -d'"' -f4)
        
        echo -e "\n    ${YELLOW}Chain A Tokens:${NC}"
        if [ ! -z "$TOKEN_A_CHAIN_A" ]; then
            # Token A on Chain A
            ALICE_TKA_A=$(cast call $TOKEN_A_CHAIN_A "balanceOf(address)(uint256)" $ALICE --rpc-url http://localhost:8545 2>/dev/null | awk '{print $1}')
            BOB_TKA_A=$(cast call $TOKEN_A_CHAIN_A "balanceOf(address)(uint256)" $BOB --rpc-url http://localhost:8545 2>/dev/null | awk '{print $1}')
            
            if [ ! -z "$ALICE_TKA_A" ]; then
                echo -e "      Alice TKA: ${GREEN}$(cast from-wei $ALICE_TKA_A)${NC}"
                echo -e "      Bob TKA:   ${GREEN}$(cast from-wei $BOB_TKA_A)${NC}"
            fi
        fi
        
        if [ ! -z "$TOKEN_B_CHAIN_A" ]; then
            # Token B on Chain A
            ALICE_TKB_A=$(cast call $TOKEN_B_CHAIN_A "balanceOf(address)(uint256)" $ALICE --rpc-url http://localhost:8545 2>/dev/null | awk '{print $1}')
            BOB_TKB_A=$(cast call $TOKEN_B_CHAIN_A "balanceOf(address)(uint256)" $BOB --rpc-url http://localhost:8545 2>/dev/null | awk '{print $1}')
            
            if [ ! -z "$ALICE_TKB_A" ]; then
                echo -e "      Alice TKB: ${GREEN}$(cast from-wei $ALICE_TKB_A)${NC}"
                echo -e "      Bob TKB:   ${GREEN}$(cast from-wei $BOB_TKB_A)${NC}"
            fi
        fi
        
        echo -e "\n    ${YELLOW}Chain B Tokens:${NC}"
        if [ ! -z "$TOKEN_A_CHAIN_B" ]; then
            # Token A on Chain B
            ALICE_TKA_B=$(cast call $TOKEN_A_CHAIN_B "balanceOf(address)(uint256)" $ALICE --rpc-url http://localhost:8546 2>/dev/null | awk '{print $1}')
            BOB_TKA_B=$(cast call $TOKEN_A_CHAIN_B "balanceOf(address)(uint256)" $BOB --rpc-url http://localhost:8546 2>/dev/null | awk '{print $1}')
            
            if [ ! -z "$ALICE_TKA_B" ]; then
                echo -e "      Alice TKA: ${GREEN}$(cast from-wei $ALICE_TKA_B)${NC}"
                echo -e "      Bob TKA:   ${GREEN}$(cast from-wei $BOB_TKA_B)${NC}"
            fi
        fi
        
        if [ ! -z "$TOKEN_B_CHAIN_B" ]; then
            # Token B on Chain B
            ALICE_TKB_B=$(cast call $TOKEN_B_CHAIN_B "balanceOf(address)(uint256)" $ALICE --rpc-url http://localhost:8546 2>/dev/null | awk '{print $1}')
            BOB_TKB_B=$(cast call $TOKEN_B_CHAIN_B "balanceOf(address)(uint256)" $BOB --rpc-url http://localhost:8546 2>/dev/null | awk '{print $1}')
            
            if [ ! -z "$ALICE_TKB_B" ]; then
                echo -e "      Alice TKB: ${GREEN}$(cast from-wei $ALICE_TKB_B)${NC}"
                echo -e "      Bob TKB:   ${GREEN}$(cast from-wei $BOB_TKB_B)${NC}"
            fi
        fi
    fi
fi

# Check resolver state
echo -e "\n${BLUE}Resolver State:${NC}"
if [ -f "$PROJECT_ROOT/alice-state.json" ]; then
    echo -e "  Alice state: ${GREEN}Found${NC}"
    ORDER_COUNT=$(cat "$PROJECT_ROOT/alice-state.json" | grep -o '"id"' | wc -l)
    echo -e "    Orders: $ORDER_COUNT"
fi

if [ -f "$PROJECT_ROOT/resolver-state.json" ]; then
    echo -e "  Resolver state: ${GREEN}Found${NC}"
    ORDER_COUNT=$(cat "$PROJECT_ROOT/resolver-state.json" | grep -o '"id"' | wc -l)
    echo -e "    Orders: $ORDER_COUNT"
fi

# Check if resolver is running
echo -e "\n${BLUE}Resolver Process:${NC}"
if pgrep -f "resolver:start" > /dev/null; then
    echo -e "  Status: ${GREEN}Running${NC}"
    echo -e "  PID: $(pgrep -f 'resolver:start')"
else
    echo -e "  Status: ${YELLOW}Not running${NC}"
fi

echo -e "\n${BLUE}Commands:${NC}"
echo "  Start chains:     cd ../bmn-evm-contracts && ./scripts/multi-chain-setup.sh"
echo "  Check balances:   ./scripts/check-balances.sh"
echo "  Check tokens:     ./scripts/check-token-balances.sh"
echo "  Run test flow:    ./scripts/test-flow.sh"
echo "  Start mprocs UI:  deno task mprocs"
echo "  Fund accounts:    cd ../bmn-evm-contracts && ./scripts/fund-accounts.sh"