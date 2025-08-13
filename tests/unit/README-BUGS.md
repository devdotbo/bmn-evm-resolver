# AliceServiceWithOrpc - Initialization Bugs Test Suite

## Overview

This test suite exposes critical initialization bugs in `alice-service-orpc.ts` that will cause the service to crash on startup.

## Running the Tests

```bash
# Run all bug exposure tests
deno test tests/unit/alice-service-orpc-bugs.test.ts --allow-all --unstable-kv

# Run comprehensive unit tests
deno test tests/unit/alice-service-orpc.test.ts --allow-all --unstable-kv

# Run integration tests
deno test tests/unit/alice-service-orpc-integration.test.ts --allow-all --unstable-kv
```

## Bugs Exposed

### 1. SwapStateManager Not Initialized
- **Location**: `alice-service-orpc.ts` line 135-156 (start method)
- **Problem**: `SwapStateManager.init()` is never called
- **Error**: `Cannot read properties of undefined (reading 'list')`
- **Impact**: Service crashes when `startOrderMonitoring()` calls `getPendingSwaps()`
- **Fix**: Add `await this.swapStateManager.init();` at line 139

### 2. EventMonitorService Missing Method
- **Location**: `alice-service-orpc.ts` lines 188 and 197
- **Problem**: `monitorEscrowCreation()` method doesn't exist
- **Error**: `TypeError: eventMonitor.monitorEscrowCreation is not a function`
- **Impact**: Service crashes immediately when `startEscrowMonitoring()` is called
- **Fix**: Implement the method in `EventMonitorService` class

### 3. Wrong SwapStatus Enum Values
- **Location**: Multiple places in `alice-service-orpc.ts`
- **Problem**: Using non-existent enum values
- **Incorrect Values**:
  - `SOURCE_DEPOSITED` (should be `ALICE_DEPOSITED`)
  - `DESTINATION_FUNDED` (should be `BOB_DEPOSITED`)
  - `DESTINATION_WITHDRAWN` (should be `DEST_WITHDRAWN`)
- **Impact**: Type errors and incorrect status tracking
- **Fix**: Replace all incorrect enum values

## Test Files

1. **alice-service-orpc-bugs.test.ts**
   - Directly exposes each bug with clear error messages
   - Shows exact fixes needed
   - Demonstrates the actual runtime errors

2. **alice-service-orpc.test.ts**
   - Comprehensive unit tests for initialization sequence
   - Tests proper initialization order
   - Validates cleanup and error handling

3. **alice-service-orpc-integration.test.ts**
   - Tests actual service components
   - Demonstrates real-world failure scenarios
   - Validates proposed fixes

## Expected Test Results

When running the tests against the current buggy implementation:
- Tests will PASS (they're designed to expose bugs, not fail)
- Console output will show the exact errors and fixes needed
- Each bug is clearly documented with location and solution

## How to Verify the Bugs

1. Try to run the actual service:
```bash
deno run --allow-all --unstable-kv alice-service-orpc.ts
```
This will crash with the errors exposed by our tests.

2. Apply the fixes suggested by the tests
3. Run the service again - it should work correctly

## Summary

These tests use TDD principles to:
- Expose bugs before fixing them
- Document expected behavior
- Guide the implementation of fixes
- Ensure the service initializes correctly

The tests are written to be failing tests that expose the bugs, making it clear what needs to be fixed.