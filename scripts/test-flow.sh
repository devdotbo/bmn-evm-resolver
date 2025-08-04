#!/bin/bash

# Bridge-Me-Not Integration Test Flow Script
# Orchestrates the complete atomic swap test flow

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
NETWORK_MODE="${NETWORK_MODE:-local}"
TOKEN_A="${TOKEN_A:-TKA}"
TOKEN_B="${TOKEN_B:-TKB}"
VERBOSE="${VERBOSE:-false}"

# Function to display usage
usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -n, --network <mode>   Network mode: local, testnet, or mainnet (default: local)"
    echo "  -a, --token-a <symbol> Source token symbol (default: TKA)"
    echo "  -b, --token-b <symbol> Destination token symbol (default: TKB)"
    echo "  -v, --verbose          Enable verbose output"
    echo "  -h, --help             Display this help message"
    echo ""
    echo "Examples:"
    echo "  # Test on local chains"
    echo "  $0"
    echo ""
    echo "  # Test on mainnet with BMN"
    echo "  $0 --network mainnet --token-a BMN --token-b BMN"
    echo ""
    echo "  # Test with verbose output"
    echo "  $0 --verbose"
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--network)
            NETWORK_MODE="$2"
            shift 2
            ;;
        -a|--token-a)
            TOKEN_A="$2"
            shift 2
            ;;
        -b|--token-b)
            TOKEN_B="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE="true"
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

# Function to check if a command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        exit 1
    fi
}

# Function to check if local chains are running
check_local_chains() {
    echo -e "${YELLOW}Checking if local chains are running...${NC}"
    
    # Check Chain A (port 8545)
    if nc -z localhost 8545 2>/dev/null; then
        echo -e "${GREEN}✓ Chain A is running on port 8545${NC}"
    else
        echo -e "${RED}✗ Chain A is not running on port 8545${NC}"
        return 1
    fi
    
    # Check Chain B (port 8546)
    if nc -z localhost 8546 2>/dev/null; then
        echo -e "${GREEN}✓ Chain B is running on port 8546${NC}"
    else
        echo -e "${RED}✗ Chain B is not running on port 8546${NC}"
        return 1
    fi
    
    return 0
}

# Function to start local chains
start_local_chains() {
    echo -e "${YELLOW}Starting local chains...${NC}"
    
    # Navigate to contracts directory
    CONTRACTS_DIR="../bmn-evm-contracts"
    if [ ! -d "$CONTRACTS_DIR" ]; then
        echo -e "${RED}Error: bmn-evm-contracts directory not found at $CONTRACTS_DIR${NC}"
        exit 1
    fi
    
    cd "$CONTRACTS_DIR"
    
    # Check if setup script exists
    if [ ! -f "./scripts/multi-chain-setup.sh" ]; then
        echo -e "${RED}Error: multi-chain-setup.sh not found${NC}"
        exit 1
    fi
    
    # Start chains
    echo "Starting multi-chain setup..."
    ./scripts/multi-chain-setup.sh > ../bmn-evm-resolver/logs/chains.log 2>&1 &
    CHAINS_PID=$!
    
    # Wait for chains to start
    echo "Waiting for chains to start..."
    sleep 10
    
    # Return to resolver directory
    cd - > /dev/null
    
    # Verify chains are running
    if check_local_chains; then
        echo -e "${GREEN}✓ Local chains started successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to start local chains${NC}"
        return 1
    fi
}

# Function to check contract deployments
check_contracts() {
    echo -e "${YELLOW}Checking contract deployments...${NC}"
    
    # For local mode, check if deployment files exist
    if [ "$NETWORK_MODE" = "local" ]; then
        if [ -f "deployments/chainA.json" ] && [ -f "deployments/chainB.json" ]; then
            echo -e "${GREEN}✓ Contract deployment files found${NC}"
            return 0
        else
            echo -e "${YELLOW}Contract deployment files not found${NC}"
            return 1
        fi
    fi
    
    # For mainnet/testnet, contracts should be pre-deployed
    return 0
}

# Function to run the integration test
run_integration_test() {
    echo -e "${BLUE}=== Running Bridge-Me-Not Integration Test ===${NC}"
    echo -e "Network mode: ${GREEN}$NETWORK_MODE${NC}"
    echo -e "Token A: ${GREEN}$TOKEN_A${NC}"
    echo -e "Token B: ${GREEN}$TOKEN_B${NC}"
    echo ""
    
    # Build command
    CMD="deno run --allow-all scripts/integration-test-flow.ts"
    CMD="$CMD --network $NETWORK_MODE"
    CMD="$CMD --token-a $TOKEN_A"
    CMD="$CMD --token-b $TOKEN_B"
    
    if [ "$VERBOSE" = "true" ]; then
        CMD="$CMD --verbose"
    fi
    
    # Run the test
    if $CMD; then
        echo -e "\n${GREEN}✅ Integration test passed!${NC}"
        return 0
    else
        echo -e "\n${RED}❌ Integration test failed!${NC}"
        return 1
    fi
}

# Main execution
main() {
    echo -e "${BLUE}=== Bridge-Me-Not Test Flow ===${NC}\n"
    
    # Check prerequisites
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    check_command deno
    check_command nc
    
    # Create logs directory
    mkdir -p logs
    
    # Check environment file
    ENV_FILE=".env"
    if [ "$NETWORK_MODE" = "mainnet" ]; then
        ENV_FILE=".env.mainnet"
    elif [ "$NETWORK_MODE" = "testnet" ]; then
        ENV_FILE=".env.testnet"
    fi
    
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}Error: $ENV_FILE file not found!${NC}"
        echo "Please create $ENV_FILE with the required configuration"
        exit 1
    fi
    
    # Export environment file
    export ENV_FILE
    echo -e "${GREEN}✓ Using environment file: $ENV_FILE${NC}"
    
    # For local mode, check and start chains if needed
    if [ "$NETWORK_MODE" = "local" ]; then
        if ! check_local_chains; then
            echo -e "${YELLOW}Local chains not running. Starting them...${NC}"
            if ! start_local_chains; then
                echo -e "${RED}Failed to start local chains${NC}"
                exit 1
            fi
        fi
        
        # Check contracts
        if ! check_contracts; then
            echo -e "${YELLOW}Contracts not deployed. Please deploy them first.${NC}"
            echo "Run: cd ../bmn-evm-contracts && forge script script/Deploy.s.sol --broadcast"
            exit 1
        fi
    fi
    
    # Run the integration test
    echo ""
    if run_integration_test; then
        exit_code=0
    else
        exit_code=1
    fi
    
    # Cleanup
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    
    # Stop local chains if we started them
    if [ ! -z "$CHAINS_PID" ]; then
        echo "Stopping local chains..."
        kill $CHAINS_PID 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✓ Cleanup complete${NC}"
    exit $exit_code
}

# Run main function
main