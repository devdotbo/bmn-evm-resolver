#!/bin/bash

# Bridge-Me-Not Resolver mprocs launcher
# This script checks for mprocs installation and runs the multi-process UI

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Check if mprocs is installed
if ! command -v mprocs &> /dev/null; then
    echo -e "${RED}Error: mprocs is not installed!${NC}"
    echo ""
    echo "To install mprocs, you can use one of the following methods:"
    echo ""
    echo "  Using Homebrew (macOS/Linux):"
    echo "    ${GREEN}brew install mprocs${NC}"
    echo ""
    echo "  Using Cargo (Rust):"
    echo "    ${GREEN}cargo install mprocs${NC}"
    echo ""
    echo "  Download from GitHub releases:"
    echo "    ${BLUE}https://github.com/pvolok/mprocs/releases${NC}"
    echo ""
    echo "For more information, visit: ${BLUE}https://github.com/pvolok/mprocs${NC}"
    exit 1
fi

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Change to project root
cd "$PROJECT_ROOT"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Warning: .env file not found. Running setup...${NC}"
    if [ -f "scripts/setup-env.sh" ]; then
        ./scripts/setup-env.sh
    else
        echo -e "${RED}Error: .env file not found and setup script missing!${NC}"
        echo "Please copy .env.example to .env and configure it."
        exit 1
    fi
fi

# Check if chains are running (optional check)
check_chains() {
    if ! curl -s -X POST http://localhost:8545 \
        -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
        echo -e "${YELLOW}Warning: Chain A (localhost:8545) is not responding${NC}"
        echo -e "${YELLOW}Make sure to run ./scripts/multi-chain-setup.sh in the bmn-evm-contracts directory${NC}"
        echo ""
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Check chains
check_chains

# Clear screen for better visibility
clear

echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}       Bridge-Me-Not Resolver - Multi-Process UI       ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Starting mprocs...${NC}"
echo ""
echo -e "${YELLOW}Keyboard shortcuts:${NC}"
echo "  • Ctrl+Q: Quit"
echo "  • Ctrl+S: Start selected process"
echo "  • Ctrl+R: Restart selected process"
echo "  • Ctrl+K: Kill selected process"
echo "  • Tab/Shift+Tab: Navigate between processes"
echo "  • Enter: Focus on process output"
echo ""
echo -e "${GREEN}Press any key to start...${NC}"
read -n 1 -s

# Run mprocs
exec mprocs