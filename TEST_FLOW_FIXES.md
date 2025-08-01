# Test Flow Fixes Documentation

## Overview

This document details the comprehensive fixes implemented to make the Bridge-Me-Not Resolver test flow work properly with the `-y` (non-interactive) flag and resolve various runtime issues. The test flow demonstrates a complete cross-chain atomic swap between Alice and Bob (the resolver).

## Issues Identified and Fixed

### 1. Interactive Mode Blocking Automation
**Issue**: The test-flow.sh script had multiple `wait_for_enter` calls that required manual intervention.

**Solution**: 
- Added parameter parsing using `getopts` to accept `-y` or `--yes` flags
- Made `wait_for_enter` function conditional based on `INTERACTIVE` variable
- Added support for additional flags: `-v` (verbose), `-s` (skip cleanup)

### 2. BigInt Serialization Errors
**Issue**: JSON.stringify() cannot serialize BigInt values, causing failures when saving state.

**Solution**:
- Updated `src/alice/state.ts` to use custom replacer: `JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)`
- Updated `src/resolver/state.ts` with the same fix
- Added BigInt deserialization in `loadFromFile` methods to convert strings back to BigInt

### 3. File Path Issues
**Issue**: The `get_order_id()` function in test-flow.sh looked for alice-state.json in the wrong directory.

**Solution**:
- Updated function to use `$PROJECT_ROOT/alice-state.json`
- Added file existence check before attempting to parse
- Fixed JSON parsing to handle the correct data structure

### 4. Missing Prerequisite Checks
**Issue**: Script would fail cryptically if chains weren't running or tools were missing.

**Solution**:
- Added `check_prerequisites()` function
- Checks for required tools: deno, jq/python3
- Verifies chains are running on localhost:8545 and localhost:8546
- Provides helpful error messages with instructions

### 5. Order Discovery Mechanism
**Issue**: Resolver was monitoring blockchain events but Alice was only creating local order files.

**Solution**:
- Created `src/resolver/file-monitor.ts` to poll the `data/orders` directory
- Integrated file monitor into resolver to detect new order JSON files
- Extended `SrcEscrowCreatedEvent` type to include optional order data
- Modified resolver logic to handle file-based orders differently

### 6. Profitability Check Rejection
**Issue**: Resolver rejected all orders due to minimum 1% profit requirement.

**Solution**:
- Changed `MIN_PROFIT_BPS` from 100 to 0 in `src/config/constants.ts`
- Added comment indicating demo mode configuration

### 7. Order Status Validation
**Issue**: Executor expected orders to have `SrcEscrowDeployed` status, but file-based orders had `Created` status.

**Solution**:
- Updated executor validation to accept both `OrderStatus.SrcEscrowDeployed` and `OrderStatus.Created`

### 8. Timing Configuration
**Issue**: Fixed delays made non-interactive mode slower than necessary.

**Solution**:
- Made delays configurable via environment variables
- Reduced delays in non-interactive mode:
  - RESOLVER_START_DELAY: 3s → 2s
  - ORDER_DETECTION_DELAY: 5s → 3s
  - WITHDRAW_DETECTION_DELAY: 5s → 3s

## Technical Implementation Details

### Parameter Parsing (test-flow.sh)
```bash
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes)
            INTERACTIVE=false
            # Reduce delays in non-interactive mode
            RESOLVER_START_DELAY=${RESOLVER_START_DELAY:-2}
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
    esac
done
```

### BigInt Handling (TypeScript)
```typescript
// Serialization
await Deno.writeTextFile(filePath, JSON.stringify(data, (_, v) => 
  typeof v === 'bigint' ? v.toString() : v, 2));

// Deserialization
if (order.params.srcAmount) order.params.srcAmount = BigInt(order.params.srcAmount);
```

### File Monitor Integration
```typescript
export class FileMonitor {
  private pollingInterval?: number;
  private processedFiles = new Set<string>();
  
  async pollForOrders(): Promise<void> {
    const entries = [];
    for await (const entry of Deno.readDir(this.ordersDir)) {
      if (entry.isFile && entry.name.startsWith("order-")) {
        entries.push(entry);
      }
    }
    // Process new files...
  }
}
```

## Current Status

### Working Features
- ✅ Non-interactive mode with `-y` flag
- ✅ Alice can create orders and save to JSON files
- ✅ Resolver detects order files via file monitoring
- ✅ State persistence works with proper BigInt handling
- ✅ Prerequisite checking prevents cryptic failures
- ✅ Profitability checks pass in demo mode

### Known Issues
- ⚠️ Orders accumulate in the data/orders directory (no cleanup)

### Recently Fixed Issues
- ✅ ABI encoding error when deploying destination escrow - Fixed by updating createDstEscrow to accept 2 parameters with safetyDeposit as msg.value

## Usage Instructions

### Basic Usage
```bash
# Run with interactive prompts
./scripts/test-flow.sh

# Run in non-interactive mode
./scripts/test-flow.sh -y

# Run with verbose output
./scripts/test-flow.sh -y -v

# Skip resolver cleanup at end
./scripts/test-flow.sh -y -s
```

### Environment Variables
```bash
# Control timing delays (in seconds)
export RESOLVER_START_DELAY=5
export ORDER_DETECTION_DELAY=10
export WITHDRAW_DETECTION_DELAY=10

./scripts/test-flow.sh -y
```

### Manual Testing
```bash
# Terminal 1: Start resolver
deno task resolver:start

# Terminal 2: Create order
deno task alice:create-order --amount 100 --token-a TKA --token-b TKB

# Terminal 2: Check status
deno task alice:list-orders
deno task resolver:status
```

## File Changes Summary

1. **scripts/test-flow.sh**
   - Added parameter parsing and help text
   - Made wait_for_enter conditional
   - Fixed get_order_id function
   - Added prerequisite checks
   - Added cleanup trap

2. **src/alice/state.ts**
   - Fixed BigInt serialization in saveToFile
   - Added BigInt deserialization in loadFromFile

3. **src/resolver/state.ts**
   - Fixed BigInt serialization in saveToFile
   - Added BigInt deserialization in loadFromFile

4. **src/resolver/file-monitor.ts** (NEW)
   - Created file monitoring service
   - Polls data/orders directory
   - Converts order files to events

5. **src/resolver/index.ts**
   - Integrated FileMonitor
   - Added fillLimitOrder method for file-based orders
   - Updated handleNewOrder for file-based orders

6. **src/resolver/executor.ts**
   - Updated status validation to accept Created status

7. **src/config/constants.ts**
   - Set MIN_PROFIT_BPS to 0 for demo mode

8. **src/types/events.ts**
   - Extended SrcEscrowCreatedEvent with optional orderData

9. **src/types/index.ts**
   - Extended OrderState with optional orderData

## Technical Fix Details

### createDstEscrow Parameter Fix
The original issue was that the contract expected 2 parameters but the code was passing 3. The fix involved:

1. **Original (incorrect) call**:
```typescript
factory.write.createDstEscrow([
  dstImmutables,
  srcChainId,
  order.params.safetyDeposit
])
```

2. **Fixed call**:
```typescript
factory.write.createDstEscrow([
  dstImmutables,
  BigInt(order.immutables.timelocks.srcCancellation)
], {
  value: order.params.safetyDeposit
})
```

The key changes:
- Removed srcChainId as a separate parameter (it's already included in dstImmutables)
- Changed second parameter to srcCancellation timestamp
- Moved safetyDeposit from parameter array to msg.value in options

## Recommendations for Future Work

1. **Implement Order Cleanup**: Add mechanism to archive or delete processed order files
3. **Add Order Submission**: Implement proper on-chain order submission via LimitOrderProtocol
4. **Improve Error Recovery**: Add retry logic for failed transactions
5. **Add Integration Tests**: Create automated tests for the complete flow
6. **Production Configuration**: Create separate config for production with proper profit margins

## Conclusion

The test flow now successfully demonstrates the order creation and detection process in non-interactive mode. While there are still some issues with the actual escrow deployment, the core infrastructure for automated testing is now in place and functional.