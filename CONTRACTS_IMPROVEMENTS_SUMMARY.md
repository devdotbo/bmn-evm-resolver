# Contract Side Improvements Summary

## Overview
This document summarizes the recent improvements made on the contract side that should benefit the resolver implementation.

## 1. 1-Second Block Mining Implementation

### What Changed
Both Anvil chains now mine blocks every second automatically:
```yaml
# contracts/mprocs.yaml
anvil-chain-a:
  shell: anvil --port 8545 --chain-id 1337 --block-time 1 --hardfork shanghai
anvil-chain-b:
  shell: anvil --port 8546 --chain-id 1338 --block-time 1 --hardfork shanghai
```

### Benefits for Resolver
- **Automatic Event Detection**: No need to manually mine blocks - events appear within 1 second
- **Consistent Timing**: Both chains stay synchronized with predictable block times
- **Faster Testing**: Can test full swap flows in under a minute
- **Reduced Race Conditions**: More predictable state changes

## 2. Optimized Timelock Configuration

### What Changed
Timelocks now use seconds and are optimized for 1-second blocks:
```solidity
// LiveTestChains.s.sol
uint256 constant SRC_WITHDRAWAL_START = 0;
uint256 constant SRC_PUBLIC_WITHDRAWAL_START = 10; // 10 seconds
uint256 constant SRC_CANCELLATION_START = 30; // 30 seconds
uint256 constant SRC_PUBLIC_CANCELLATION_START = 45; // 45 seconds
uint256 constant DST_WITHDRAWAL_START = 0;
uint256 constant DST_PUBLIC_WITHDRAWAL_START = 10; // 10 seconds
uint256 constant DST_CANCELLATION_START = 30; // 30 seconds
```

### Benefits for Resolver
- **Immediate Withdrawals**: No waiting period for withdrawals (0 second start)
- **Fast Cancellation Protection**: 30-second window before cancellation is possible
- **Clear Time Windows**: Easy to calculate when actions are allowed

## 3. Automatic ABI Updates

### What Changed
The deployment script now automatically copies ABIs to the resolver:
```bash
# scripts/deploy-both-chains.sh
# After deployment, automatically runs:
./scripts/copy-abis-to-resolver.sh
```

### Benefits for Resolver
- **Always Up-to-Date**: No manual ABI copying needed
- **Consistent Interfaces**: Ensures resolver uses correct contract interfaces
- **Reduced Errors**: Prevents ABI mismatch issues

## 4. Enhanced Test Scripts

### New/Updated Scripts
- `scripts/test-live-swap.sh`: Full 5-step atomic swap test with detailed logging
- `scripts/check-deployment.sh`: Verifies deployment and shows balances
- `scripts/sync-chain-times.sh`: Aligns chain timestamps (useful for testing)

### Benefits for Resolver
- **Better Testing**: Can verify resolver behavior with comprehensive test flows
- **Debug Support**: Enhanced logging helps identify issues
- **Balance Tracking**: Easy verification of token movements

## 5. Critical Discovery: CREATE2 Address Mismatch

### The Issue
**IMPORTANT**: There's a mismatch between predicted and actual destination escrow addresses:
- `addressOfEscrowDst` predicts one address
- Actual deployment goes to a different address
- Tokens are at the actual address, not the predicted one

### Workaround for Resolver
See `CREATE2_ADDRESS_MISMATCH_FINDINGS.md` for details. Key points:
1. Parse actual address from `DstEscrowCreated` event
2. Don't rely on `addressOfEscrowDst` for destination escrows
3. Store actual deployed addresses in resolver state

## 6. Contract Stability Improvements

### What Changed
- Fixed timestamp handling in escrow creation
- Added 5-minute timestamp tolerance for cross-chain drift
- Improved error messages for debugging

### Benefits for Resolver
- **More Reliable**: Handles chain timestamp differences gracefully
- **Better Error Handling**: Clearer error messages when things go wrong
- **Consistent Behavior**: Less edge cases to handle

## 7. Test State Management

### What Changed
Test scripts now use JSON state files for coordination:
```json
// deployments/test-state.json
{
  "secret": "0x...",
  "hashlock": "0x...",
  "orderHash": "0x...",
  "srcEscrow": "0x...",
  "dstEscrow": "0x...",
  "srcDeployTime": 1754175650,
  "dstDeployTime": 1754175713
}
```

### Benefits for Resolver
- **State Sharing**: Can read test state for debugging
- **Coordination**: Easier to sync with test scripts
- **Debugging**: Can inspect exact values used in tests

## Recommended Actions for Resolver

1. **Update Event Parsing**: Handle actual escrow addresses from events, not predictions
2. **Leverage 1-Second Blocks**: Adjust polling intervals and timeouts
3. **Use New Timelocks**: Update hardcoded timelock values to match contracts
4. **Test with New Scripts**: Use `test-live-swap.sh` to verify resolver behavior
5. **Monitor State Files**: Can read test state files for debugging

## Testing the Improvements

1. Start chains (with 1-second mining):
   ```bash
   cd ../bmn-evm-contracts
   mprocs
   ```

2. Deploy contracts (ABIs auto-copied):
   ```bash
   ./scripts/deploy-both-chains.sh
   ```

3. Test resolver with new timing:
   ```bash
   cd ../bmn-evm-resolver
   ./scripts/test-flow.sh -y
   ```

## Questions or Issues?

If you encounter issues related to:
- CREATE2 address mismatch → See CREATE2_ADDRESS_MISMATCH_FINDINGS.md
- Timing problems → Check 1-second block mining is active
- ABI mismatches → Re-run deployment script to update ABIs
- Test failures → Check TIMING_TROUBLESHOOTING.md in contracts repo