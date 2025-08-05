#!/bin/bash
set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to display menu
show_menu() {
    clear
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║          Bridge-Me-Not Test Suite                             ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Select a test scenario:"
    echo ""
    echo "  1) Quick Local Test (Default settings)"
    echo "  2) Local Test with Custom Amount"
    echo "  3) High Profit Test (2% spread)"
    echo "  4) Non-Interactive Automated Test"
    echo "  5) Advanced Test with Verbose Output"
    echo "  6) Stress Test (Multiple Orders)"
    echo "  7) Manual Step-by-Step Test"
    echo "  8) Mainnet Test (requires .env.mainnet)"
    echo ""
    echo "  0) Exit"
    echo ""
}

# Function to run quick test
run_quick_test() {
    echo -e "${GREEN}Running quick local test...${NC}"
    "$SCRIPT_DIR/test-flow.sh" local 100 50
}

# Function to run custom amount test
run_custom_test() {
    echo -e "${YELLOW}Enter swap amount (default: 100):${NC}"
    read -r amount
    amount=${amount:-100}
    
    echo -e "${YELLOW}Enter Bob's profit in basis points (default: 50 = 0.5%):${NC}"
    read -r profit
    profit=${profit:-50}
    
    echo -e "${GREEN}Running test with $amount tokens and $profit bps profit...${NC}"
    "$SCRIPT_DIR/test-flow.sh" local "$amount" "$profit"
}

# Function to run high profit test
run_high_profit_test() {
    echo -e "${GREEN}Running high profit test (2% spread)...${NC}"
    "$SCRIPT_DIR/test-flow.sh" local 200 200
}

# Function to run automated test
run_automated_test() {
    echo -e "${GREEN}Running non-interactive automated test...${NC}"
    "$SCRIPT_DIR/test-flow-advanced.sh" --mode local --amount 150 --profit 75 --non-interactive
}

# Function to run verbose test
run_verbose_test() {
    echo -e "${GREEN}Running advanced test with verbose output...${NC}"
    "$SCRIPT_DIR/test-flow-advanced.sh" --mode local --amount 100 --profit 50 --verbose
}

# Function to run stress test
run_stress_test() {
    echo -e "${YELLOW}Running stress test with multiple orders...${NC}"
    echo -e "${RED}This will create 5 orders in sequence${NC}"
    
    for i in {1..5}; do
        echo -e "\n${BLUE}=== Order $i of 5 ===${NC}"
        amount=$((50 * i))
        profit=$((25 * i))
        
        echo "Creating order for $amount tokens with $profit bps profit"
        "$SCRIPT_DIR/test-flow-advanced.sh" --mode local --amount "$amount" --profit "$profit" --non-interactive
        
        echo "Waiting 5 seconds before next order..."
        sleep 5
    done
    
    echo -e "\n${GREEN}Stress test completed!${NC}"
}

# Function to run manual test
run_manual_test() {
    echo -e "${GREEN}Running manual step-by-step test...${NC}"
    echo -e "${YELLOW}This test will pause at each step for manual verification${NC}"
    echo ""
    echo "Press Enter to continue..."
    read -r
    
    "$SCRIPT_DIR/test-flow-advanced.sh" --mode local --amount 100 --profit 100 --verbose
}

# Function to run mainnet test
run_mainnet_test() {
    if [ ! -f "$SCRIPT_DIR/../.env.mainnet" ]; then
        echo -e "${RED}Error: .env.mainnet file not found!${NC}"
        echo "Please create .env.mainnet with mainnet configuration"
        return 1
    fi
    
    echo -e "${RED}WARNING: This will run on MAINNET!${NC}"
    echo -e "${YELLOW}Are you sure? (yes/no):${NC}"
    read -r confirm
    
    if [ "$confirm" = "yes" ]; then
        echo -e "${GREEN}Running mainnet test...${NC}"
        "$SCRIPT_DIR/test-flow.sh" mainnet 10 100
    else
        echo "Mainnet test cancelled"
    fi
}

# Main loop
main() {
    while true; do
        show_menu
        echo -n "Select option: "
        read -r option
        
        case $option in
            1)
                run_quick_test
                ;;
            2)
                run_custom_test
                ;;
            3)
                run_high_profit_test
                ;;
            4)
                run_automated_test
                ;;
            5)
                run_verbose_test
                ;;
            6)
                run_stress_test
                ;;
            7)
                run_manual_test
                ;;
            8)
                run_mainnet_test
                ;;
            0)
                echo -e "${GREEN}Exiting test suite${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                ;;
        esac
        
        echo -e "\n${YELLOW}Press Enter to return to menu...${NC}"
        read -r
    done
}

# Check if test scripts exist
if [ ! -f "$SCRIPT_DIR/test-flow.sh" ] || [ ! -f "$SCRIPT_DIR/test-flow-advanced.sh" ]; then
    echo -e "${RED}Error: Test scripts not found!${NC}"
    echo "Please ensure test-flow.sh and test-flow-advanced.sh exist in the scripts directory"
    exit 1
fi

# Run main
main