#!/bin/bash

# Factory Migration Verification Script using Cast (Foundry)
# 
# This script uses cast commands to verify the migration to factory v2.1.0
# Requirements: Foundry installed (cast command available)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Factory addresses
FACTORY_V2="0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A"
FACTORY_V1_BASE="0x2B2d52Cf0080a01f457A4f64F41cbca500f787b1"
FACTORY_V1_OPTIMISM="0xB916C3edbFe574fFCBa688A6B92F72106479bD6c"

# Get resolver address from environment
RESOLVER_ADDRESS="${1:-$RESOLVER_ADDRESS}"

if [ -z "$RESOLVER_ADDRESS" ]; then
    echo -e "${RED}Error: Resolver address not provided${NC}"
    echo "Usage: $0 <RESOLVER_ADDRESS>"
    echo "Or set RESOLVER_ADDRESS environment variable"
    exit 1
fi

# RPC URLs (use environment variables or defaults)
BASE_RPC="${BASE_RPC:-https://mainnet.base.org}"
OPTIMISM_RPC="${OPTIMISM_RPC:-https://mainnet.optimism.io}"

echo -e "${BOLD}${BLUE}========================================${NC}"
echo -e "${BOLD}${BLUE}Factory Migration Verification (Cast)${NC}"
echo -e "${BOLD}${BLUE}========================================${NC}"
echo ""
echo -e "Resolver Address: ${BOLD}$RESOLVER_ADDRESS${NC}"
echo -e "Timestamp: $(date)"
echo ""

# Function to check factory
check_factory() {
    local CHAIN_NAME=$1
    local RPC_URL=$2
    local FACTORY=$3
    local VERSION_LABEL=$4
    
    echo -e "${BOLD}${BLUE}📍 $CHAIN_NAME - $VERSION_LABEL${NC}"
    echo -e "${BLUE}----------------------------------------${NC}"
    echo -e "Factory: $FACTORY"
    
    # Check VERSION
    echo -n "Checking version... "
    VERSION=$(cast call $FACTORY "VERSION()(string)" --rpc-url $RPC_URL 2>/dev/null || echo "ERROR")
    if [ "$VERSION" != "ERROR" ]; then
        echo -e "${GREEN}✅ $VERSION${NC}"
    else
        echo -e "${RED}❌ Failed to read version${NC}"
    fi
    
    # Check whitelisted status
    echo -n "Checking whitelist status... "
    WHITELISTED=$(cast call $FACTORY "whitelistedResolvers(address)(bool)" $RESOLVER_ADDRESS --rpc-url $RPC_URL 2>/dev/null || echo "ERROR")
    if [ "$WHITELISTED" = "true" ]; then
        echo -e "${GREEN}✅ Whitelisted${NC}"
    elif [ "$WHITELISTED" = "false" ]; then
        echo -e "${RED}❌ NOT Whitelisted${NC}"
    else
        echo -e "${RED}❌ Failed to check${NC}"
    fi
    
    # Check emergency pause
    echo -n "Checking pause status... "
    PAUSED=$(cast call $FACTORY "emergencyPaused()(bool)" --rpc-url $RPC_URL 2>/dev/null || echo "ERROR")
    if [ "$PAUSED" = "false" ]; then
        echo -e "${GREEN}✅ Not paused (operational)${NC}"
    elif [ "$PAUSED" = "true" ]; then
        echo -e "${YELLOW}⚠️ PAUSED${NC}"
    else
        echo -e "${RED}❌ Failed to check${NC}"
    fi
    
    echo ""
}

# Check Base V2
check_factory "Base" "$BASE_RPC" "$FACTORY_V2" "V2.1.0 (SECURE)"

# Check Optimism V2
check_factory "Optimism" "$OPTIMISM_RPC" "$FACTORY_V2" "V2.1.0 (SECURE)"

# Optional: Check old factories if flag is set
if [ "$CHECK_V1" = "true" ]; then
    echo -e "${YELLOW}Checking V1.1.0 factories (for comparison)...${NC}"
    echo ""
    check_factory "Base" "$BASE_RPC" "$FACTORY_V1_BASE" "V1.1.0 (INSECURE)"
    check_factory "Optimism" "$OPTIMISM_RPC" "$FACTORY_V1_OPTIMISM" "V1.1.0 (INSECURE)"
fi

# Additional verification commands
echo -e "${BOLD}${BLUE}Additional Verification Commands${NC}"
echo -e "${BLUE}----------------------------------------${NC}"
echo ""
echo "To manually verify, run these commands:"
echo ""
echo -e "${BOLD}Base:${NC}"
echo "cast call $FACTORY_V2 \"whitelistedResolvers(address)(bool)\" $RESOLVER_ADDRESS --rpc-url $BASE_RPC"
echo "cast call $FACTORY_V2 \"emergencyPaused()(bool)\" --rpc-url $BASE_RPC"
echo "cast call $FACTORY_V2 \"VERSION()(string)\" --rpc-url $BASE_RPC"
echo ""
echo -e "${BOLD}Optimism:${NC}"
echo "cast call $FACTORY_V2 \"whitelistedResolvers(address)(bool)\" $RESOLVER_ADDRESS --rpc-url $OPTIMISM_RPC"
echo "cast call $FACTORY_V2 \"emergencyPaused()(bool)\" --rpc-url $OPTIMISM_RPC"
echo "cast call $FACTORY_V2 \"VERSION()(string)\" --rpc-url $OPTIMISM_RPC"
echo ""

# Monitor events (optional)
if [ "$MONITOR_EVENTS" = "true" ]; then
    echo -e "${BOLD}${BLUE}Monitoring Factory Events${NC}"
    echo -e "${BLUE}----------------------------------------${NC}"
    echo "Monitoring for ResolverWhitelisted events..."
    
    # Get recent blocks
    CURRENT_BLOCK=$(cast block-number --rpc-url $BASE_RPC)
    FROM_BLOCK=$((CURRENT_BLOCK - 1000))
    
    echo "Checking blocks $FROM_BLOCK to $CURRENT_BLOCK on Base..."
    cast logs --address $FACTORY_V2 --from-block $FROM_BLOCK --rpc-url $BASE_RPC || echo "No recent events"
    echo ""
fi

echo -e "${BOLD}${GREEN}========================================${NC}"
echo -e "${BOLD}${GREEN}Verification Complete${NC}"
echo -e "${BOLD}${GREEN}========================================${NC}"