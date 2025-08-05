#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo -e "${RED}Error: .env file not found.${NC}"
    exit 1
fi

# Function to print section headers
print_header() {
    echo -e "\n${BLUE}==== $1 ====${NC}\n"
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

print_header "Bridge-Me-Not Fund Recovery Tool"

# Check current balances
print_header "Current Balances"

print_info "Checking BMN balances..."
ALICE_BMN_BASE=$(cast call $MAINNET_BMN_TOKEN "balanceOf(address)" $ALICE_ADDRESS --rpc-url $BASE_RPC_URL)
ALICE_BMN_ETHERLINK=$(cast call $MAINNET_BMN_TOKEN "balanceOf(address)" $ALICE_ADDRESS --rpc-url $ETHERLINK_RPC_URL)

echo "Alice BMN:"
echo "  Base: $(cast from-wei $ALICE_BMN_BASE) (raw: $ALICE_BMN_BASE)"
echo "  Etherlink: $(cast from-wei $ALICE_BMN_ETHERLINK) (raw: $ALICE_BMN_ETHERLINK)"

# Check token decimals
BMN_DECIMALS_BASE=$(cast call $MAINNET_BMN_TOKEN "decimals()" --rpc-url $BASE_RPC_URL 2>/dev/null || echo "18")
BMN_DECIMALS_ETHERLINK=$(cast call $MAINNET_BMN_TOKEN "decimals()" --rpc-url $ETHERLINK_RPC_URL 2>/dev/null || echo "18")
print_info "BMN token decimals - Base: $(cast to-dec $BMN_DECIMALS_BASE), Etherlink: $(cast to-dec $BMN_DECIMALS_ETHERLINK)"

# Check token allowances
print_info "Checking token allowances..."
ALICE_ALLOWANCE_BASE=$(cast call $MAINNET_BMN_TOKEN "allowance(address,address)" $ALICE_ADDRESS $MAINNET_ESCROW_FACTORY --rpc-url $BASE_RPC_URL)
ALICE_ALLOWANCE_ETHERLINK=$(cast call $MAINNET_BMN_TOKEN "allowance(address,address)" $ALICE_ADDRESS $MAINNET_ESCROW_FACTORY --rpc-url $ETHERLINK_RPC_URL)
echo "  Base allowance to EscrowFactory: $(cast from-wei $ALICE_ALLOWANCE_BASE)"
echo "  Etherlink allowance to EscrowFactory: $(cast from-wei $ALICE_ALLOWANCE_ETHERLINK)"

# Check for recent escrow events
print_header "Checking for Active Escrows"

# Get recent events from the factory (last 10000 blocks to be safe)
print_info "Scanning for source escrows on Base..."
CURRENT_BLOCK_BASE=$(cast block-number --rpc-url $BASE_RPC_URL)
FROM_BLOCK_BASE=$((CURRENT_BLOCK_BASE - 10000))

# Check for SrcEscrowCreated events
SRC_ESCROWS=$(cast logs \
    --from-block $FROM_BLOCK_BASE \
    --to-block latest \
    --address $MAINNET_ESCROW_FACTORY \
    "SrcEscrowCreated(address,uint256,bytes32,address,address,uint256,uint256,uint256)" \
    --rpc-url $BASE_RPC_URL 2>/dev/null || echo "")

if [ ! -z "$SRC_ESCROWS" ]; then
    print_info "Found source escrow events. Parsing..."
    # Parse and display escrow addresses
    echo "$SRC_ESCROWS" | while read -r log; do
        if [[ $log =~ address:\ (0x[a-fA-F0-9]{40}) ]]; then
            ESCROW_ADDR="${BASH_REMATCH[1]}"
            print_info "Found escrow at: $ESCROW_ADDR"
            
            # Check if we're the maker
            MAKER=$(cast call $ESCROW_ADDR "maker()" --rpc-url $BASE_RPC_URL 2>/dev/null || echo "")
            if [[ "$MAKER" =~ $ALICE_ADDRESS ]]; then
                print_status "This is your escrow!"
                
                # Check escrow state
                STATE=$(cast call $ESCROW_ADDR "currentState()" --rpc-url $BASE_RPC_URL 2>/dev/null || echo "0x0")
                case $STATE in
                    "0x0000000000000000000000000000000000000000000000000000000000000000")
                        echo "  State: Created (funds locked)"
                        ;;
                    "0x0000000000000000000000000000000000000000000000000000000000000001")
                        echo "  State: Withdrawn (completed)"
                        ;;
                    "0x0000000000000000000000000000000000000000000000000000000000000002")
                        echo "  State: Cancelled (funds returned)"
                        ;;
                    *)
                        echo "  State: Unknown ($STATE)"
                        ;;
                esac
                
                # Check if we can cancel (after timelock)
                CANCEL_TIME=$(cast call $ESCROW_ADDR "cancelTime()" --rpc-url $BASE_RPC_URL 2>/dev/null || echo "0x0")
                CURRENT_TIME=$(date +%s)
                CANCEL_TIME_DEC=$(cast to-dec $CANCEL_TIME 2>/dev/null || echo "0")
                
                if [ "$CANCEL_TIME_DEC" -gt "0" ] && [ "$CURRENT_TIME" -gt "$CANCEL_TIME_DEC" ]; then
                    print_info "Timelock expired! You can cancel and recover funds."
                    echo ""
                    echo "To cancel and recover funds, run:"
                    echo "cast send $ESCROW_ADDR \"cancel()\" --private-key \$ALICE_PRIVATE_KEY --rpc-url $BASE_RPC_URL"
                fi
            fi
        fi
    done
else
    print_info "No recent source escrows found on Base"
fi

# Check for destination escrows on Etherlink
print_info "Scanning for destination escrows on Etherlink..."
CURRENT_BLOCK_ETHERLINK=$(cast block-number --rpc-url $ETHERLINK_RPC_URL)
FROM_BLOCK_ETHERLINK=$((CURRENT_BLOCK_ETHERLINK - 10000))

DST_ESCROWS=$(cast logs \
    --from-block $FROM_BLOCK_ETHERLINK \
    --to-block latest \
    --address $MAINNET_ESCROW_FACTORY \
    "DstEscrowCreated(address,uint256,bytes32,address,address,uint256,uint256)" \
    --rpc-url $ETHERLINK_RPC_URL 2>/dev/null || echo "")

if [ ! -z "$DST_ESCROWS" ]; then
    print_info "Found destination escrow events. Checking if any are for you..."
    echo "$DST_ESCROWS" | while read -r log; do
        if [[ $log =~ address:\ (0x[a-fA-F0-9]{40}) ]]; then
            ESCROW_ADDR="${BASH_REMATCH[1]}"
            print_info "Found destination escrow at: $ESCROW_ADDR"
            
            # Check if we're the taker (Bob would set us as taker)
            TAKER=$(cast call $ESCROW_ADDR "taker()" --rpc-url $ETHERLINK_RPC_URL 2>/dev/null || echo "")
            if [[ "$TAKER" =~ $ALICE_ADDRESS ]]; then
                print_status "This escrow is for you!"
                
                # Check escrow state
                STATE=$(cast call $ESCROW_ADDR "currentState()" --rpc-url $ETHERLINK_RPC_URL 2>/dev/null || echo "0x0")
                case $STATE in
                    "0x0000000000000000000000000000000000000000000000000000000000000000")
                        echo "  State: Created (ready for withdrawal)"
                        print_info "You can withdraw using your secret!"
                        ;;
                    "0x0000000000000000000000000000000000000000000000000000000000000001")
                        echo "  State: Withdrawn (completed)"
                        ;;
                    "0x0000000000000000000000000000000000000000000000000000000000000002")
                        echo "  State: Cancelled"
                        ;;
                    *)
                        echo "  State: Unknown ($STATE)"
                        ;;
                esac
            fi
        fi
    done
else
    print_info "No recent destination escrows found on Etherlink"
fi

# Check alice-state.json for any pending orders
print_header "Checking Saved Order State"

if [ -f "$PROJECT_ROOT/alice-state.json" ]; then
    print_info "Found alice-state.json"
    echo ""
    # Display order information with better formatting
    echo "Saved Orders:"
    cat "$PROJECT_ROOT/alice-state.json" | jq -r '.orders[] | .[1] | 
        "Order ID: \(.id)\n" +
        "  Status: \(.status)\n" +
        "  Chain: \(if .params.srcChainId == 8453 then "Base" elif .params.srcChainId == 42793 then "Etherlink" elif .params.srcChainId == 1337 then "Local Chain A" elif .params.srcChainId == 1338 then "Local Chain B" else "Unknown" end) (ID: \(.params.srcChainId))\n" +
        "  Amount: \(.params.srcAmount | tonumber / 1e18) BMN\n" +
        "  Escrow: \(if .srcEscrowAddress == "0x0000000000000000000000000000000000000000" then "Not created" else .srcEscrowAddress end)\n"'
else
    print_info "No alice-state.json found"
fi

# Calculate totals
if [ -f "$PROJECT_ROOT/alice-state.json" ]; then
    TOTAL_PENDING=$(cat "$PROJECT_ROOT/alice-state.json" | jq '[.orders[] | .[1] | select(.params.srcChainId == 8453 and .srcEscrowAddress == "0x0000000000000000000000000000000000000000") | .params.srcAmount | tonumber] | add // 0 | . / 1e18')
    if [ "$TOTAL_PENDING" != "0" ]; then
        print_info "Total BMN in pending orders on Base: $TOTAL_PENDING BMN"
    fi
fi

# Recovery options
print_header "Recovery Options"

echo "1. If you have pending orders that Bob hasn't filled:"
echo "   - The tokens are still in your wallet (no escrow created)"
echo "   - Simply create a new order or cancel the approval"
echo ""
echo "2. If you have a source escrow created but Bob didn't respond:"
echo "   - Wait for the timelock to expire (check above)"
echo "   - Then call cancel() on the escrow contract"
echo ""
echo "3. If you have a destination escrow waiting for you:"
echo "   - Use the withdraw command with your secret"
echo "   - deno task alice:withdraw --order-id <order-hash>"
echo ""
echo "4. To revoke token approvals:"
echo "   cast send $MAINNET_BMN_TOKEN \"approve(address,uint256)\" $MAINNET_ESCROW_FACTORY 0 --private-key \$ALICE_PRIVATE_KEY --rpc-url $BASE_RPC_URL"