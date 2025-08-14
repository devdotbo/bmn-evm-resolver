#!/bin/bash

# Health check script for BMN EVM Resolver system
# Checks services, RPC connectivity, and system readiness

set -e

echo "======================================"
echo "BMN EVM Resolver Health Check"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if services are configured
check_services() {
    echo "🔍 Checking Services..."
    
    # Check Alice service
    if curl -s -f -o /dev/null "http://localhost:8001/health" 2>/dev/null; then
        echo -e "${GREEN}✅ Alice Service (8001): Running${NC}"
        curl -s "http://localhost:8001/health" | jq -r '.status // "Unknown"' | sed 's/^/   Status: /'
    else
        echo -e "${YELLOW}⚠️  Alice Service (8001): Not running${NC}"
    fi
    
    # Check Bob-Resolver service
    if curl -s -f -o /dev/null "http://localhost:8002/health" 2>/dev/null; then
        echo -e "${GREEN}✅ Bob-Resolver Service (8002): Running${NC}"
        curl -s "http://localhost:8002/health" | jq -r '.status // "Unknown"' | sed 's/^/   Status: /'
    else
        echo -e "${YELLOW}⚠️  Bob-Resolver Service (8002): Not running${NC}"
    fi
    
    echo ""
}

# Check environment configuration
check_environment() {
    echo "🔍 Checking Environment..."
    
    if [ -f ".env" ]; then
        echo -e "${GREEN}✅ .env file exists${NC}"
        
        # Check for required keys (without exposing values)
        required_keys=("ALICE_PRIVATE_KEY" "BOB_PRIVATE_KEY" "ANKR_API_KEY")
        missing_keys=()
        
        for key in "${required_keys[@]}"; do
            if grep -q "^${key}=" .env 2>/dev/null; then
                value=$(grep "^${key}=" .env | cut -d'=' -f2)
                if [ -z "$value" ] || [ "$value" = "your_key_here" ]; then
                    missing_keys+=("$key")
                fi
            else
                missing_keys+=("$key")
            fi
        done
        
        if [ ${#missing_keys[@]} -eq 0 ]; then
            echo -e "${GREEN}✅ All required environment variables configured${NC}"
        else
            echo -e "${RED}❌ Missing environment variables:${NC}"
            for key in "${missing_keys[@]}"; do
                echo "   - $key"
            done
        fi
    else
        echo -e "${RED}❌ .env file not found${NC}"
        echo "   Run: cp .env.example .env"
    fi
    
    echo ""
}

# Check RPC connectivity
check_rpc() {
    echo "🔍 Checking RPC Connectivity..."
    
    # Try to run the preflight checks
    if command -v deno &> /dev/null; then
        if deno run -A --env-file=.env cli/preflight-checks.ts --json 2>/dev/null | jq -r '.checks[] | select(.name == "RPC Connectivity") | .status' | grep -q "pass"; then
            echo -e "${GREEN}✅ RPC connections healthy${NC}"
        else
            echo -e "${RED}❌ RPC connection issues detected${NC}"
            echo "   Run: deno run -A --env-file=.env cli/preflight-checks.ts"
        fi
    else
        echo -e "${YELLOW}⚠️  Deno not found - cannot check RPC${NC}"
    fi
    
    echo ""
}

# Check data directories
check_directories() {
    echo "🔍 Checking Data Directories..."
    
    dirs=("data/orders" "data/escrows" "data/swaps" "data/secrets" "data/fills")
    all_exist=true
    
    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ]; then
            echo -e "${GREEN}✅ $dir exists${NC}"
        else
            echo -e "${YELLOW}⚠️  $dir missing (will be created on first use)${NC}"
            all_exist=false
        fi
    done
    
    echo ""
}

# Check contract deployments
check_contracts() {
    echo "🔍 Checking Contract Addresses..."
    
    # Check if wagmi config exists
    if [ -f "wagmi.config.ts" ]; then
        echo -e "${GREEN}✅ Wagmi config exists${NC}"
        
        # Check for contract addresses
        if grep -q "LIMIT_ORDER_PROTOCOL\|ESCROW_FACTORY" src/config/contracts.ts 2>/dev/null; then
            echo -e "${GREEN}✅ Contract addresses configured${NC}"
            
            # Display addresses
            echo "   Protocol: 0xe767105dcfB3034a346578afd2aFD8e583171489"
            echo "   Factory:  0xdebE6F4bC7BaAD2266603Ba7AfEB3BB6dDA9FE0A"
        else
            echo -e "${RED}❌ Contract addresses not found${NC}"
        fi
    else
        echo -e "${RED}❌ Wagmi config missing${NC}"
        echo "   Run: deno task wagmi:generate"
    fi
    
    echo ""
}

# Check account balances and allowances
check_accounts() {
    echo "🔍 Checking Account Status..."
    
    if command -v deno &> /dev/null; then
        # Check balances
        echo "Checking balances..."
        if deno run -A --env-file=.env cli/check-balances.ts --json 2>/dev/null | jq -e '.balances | length > 0' > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Balance check completed${NC}"
        else
            echo -e "${YELLOW}⚠️  Could not check balances${NC}"
        fi
        
        # Check allowances
        echo "Checking allowances..."
        if deno run -A --env-file=.env cli/check-allowances.ts --json 2>/dev/null | jq -e '.allowances | length > 0' > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Allowance check completed${NC}"
        else
            echo -e "${YELLOW}⚠️  Could not check allowances${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Deno not found - cannot check accounts${NC}"
    fi
    
    echo ""
}

# Run comprehensive preflight check
run_preflight() {
    echo "🚀 Running Comprehensive Pre-flight Check..."
    
    if command -v deno &> /dev/null; then
        if deno run -A --env-file=.env cli/preflight-checks.ts 2>/dev/null; then
            echo -e "${GREEN}✅ System ready for operations${NC}"
        else
            echo -e "${RED}❌ System not ready - check details above${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Cannot run preflight checks without Deno${NC}"
    fi
    
    echo ""
}

# Main execution
main() {
    check_environment
    check_services
    check_rpc
    check_directories
    check_contracts
    check_accounts
    
    echo "======================================"
    echo "Health Check Summary"
    echo "======================================"
    
    run_preflight
    
    echo "For detailed information, run:"
    echo "  - deno run -A --env-file=.env cli/preflight-checks.ts"
    echo "  - deno run -A --env-file=.env cli/check-balances.ts"
    echo "  - deno run -A --env-file=.env cli/check-allowances.ts"
}

main