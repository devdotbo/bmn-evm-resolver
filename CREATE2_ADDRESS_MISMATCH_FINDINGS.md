# CREATE2 Address Mismatch Findings

## Critical Discovery from Contract Side Testing

During our testing of the cross-chain atomic swap protocol, we discovered a critical issue with CREATE2 address calculation that affects the resolver's ability to interact with destination escrows.

## The Problem

When the EscrowFactory deploys a destination escrow using `createDstEscrow`, there's a mismatch between:
1. The address calculated by `addressOfEscrowDst` (used by the resolver to predict where the escrow will be)
2. The actual address where the escrow is deployed (emitted in the `DstEscrowCreated` event)

### Example from Our Test:
```
Predicted by addressOfEscrowDst: 0x714fb51648abd53ee62a98210f45468a576b02e4
Actual deployment (from event):  0xed5ac5f74545700da580ee1272e5665f3cab50a5
Token location:                   0xed5ac5f74545700da580ee1272e5665f3cab50a5 (at event address)
```

## Root Cause Analysis

The issue appears to be related to how the proxy bytecode hash is calculated. The factory uses OpenZeppelin's `Clones.cloneDeterministic` which creates a minimal proxy with this bytecode:

```solidity
// From Clones.sol
0x3d602d80600a3d3981f3363d3d373d3d3d363d73<implementation>5af43d82803e903d91602b57fd5bf3
```

However, the `addressOfEscrowDst` function might be using a different bytecode hash calculation.

## Impact on Resolver

This mismatch means:
1. The resolver calculates the wrong destination escrow address
2. When trying to interact with the escrow (e.g., checking balances), it's looking at an empty address
3. The actual escrow with tokens is at a different address

## Temporary Workaround

We discovered that the actual deployed address is available in the `DstEscrowCreated` event data:
- The first 32 bytes of the event data contain the escrow address (padded to 32 bytes)
- This can be extracted from transaction receipts

### Extraction Script:
```bash
# From broadcast file
DST_ESCROW=$(cat "$BROADCAST_FILE" | jq -r '.receipts[1].logs[1].data' | cut -c 27-66 | sed 's/^/0x/')
```

## Recommended Solution for Resolver

Instead of relying on `addressOfEscrowDst` for predicting addresses, the resolver should:

1. **Listen to DstEscrowCreated Events**: Parse the actual deployed address from the event
   ```typescript
   const dstEscrowCreatedEvent = receipt.logs.find(log => 
     log.topics[0] === keccak256("DstEscrowCreated(address,bytes32,address)")
   );
   const dstEscrowAddress = '0x' + dstEscrowCreatedEvent.data.slice(26, 66);
   ```

2. **Store Deployed Addresses**: Save the actual deployed escrow addresses in the resolver state
   ```typescript
   interface OrderState {
     // ... existing fields
     actualDstEscrowAddress?: Address; // Add this field
   }
   ```

3. **Use Actual Addresses for Interactions**: When checking balances or interacting with the escrow, use the stored actual address instead of the calculated one

## Contract-Side Investigation Status

We've been investigating the bytecode hash calculation in:
- `/contracts/libraries/ProxyHashLib.sol` - Computes bytecode hash for proxies
- `/contracts/BaseEscrowFactory.sol` - Uses CREATE2 for deployment
- OpenZeppelin's `Clones.sol` - The actual deployment mechanism

The mismatch suggests that either:
1. The proxy bytecode hash calculation in `ProxyHashLib` doesn't match what `Clones` actually deploys
2. The salt calculation differs between deployment and address prediction
3. There's a state change between address calculation and actual deployment

## Test Evidence

From our test logs:
```
Step 3: Creating destination escrow on Chain B
Factory claims to deploy to: 0x714fb51648abd53ee62a98210f45468a576b02e4
Tokens actually sent to:      0xed5ac5f74545700da580ee1272e5665f3cab50a5
Code exists at:              0xed5ac5f74545700da580ee1272e5665f3cab50a5
```

## Recommendations

1. **Short-term**: Update resolver to parse actual addresses from events instead of predicting
2. **Medium-term**: Fix the bytecode hash calculation in the contracts to match actual deployment
3. **Long-term**: Add comprehensive tests to ensure address calculation always matches deployment

## Additional Notes

- This issue only affects destination escrows, not source escrows
- The issue is consistent across multiple test runs
- Token transfers work correctly - they go to the actual deployed address
- The factory's internal logic works, but external address calculation is broken

## Important Timing Update: 1-Second Block Mining

We've implemented 1-second block mining on both Anvil chains which significantly improves:

1. **Cross-Chain Synchronization**: 
   - Both chains now mine blocks every second, keeping timestamps closely aligned
   - Reduces timestamp drift between chains
   - Makes timelock windows more predictable

2. **Resolver Benefits**:
   - More responsive event detection (no need to wait for manual mining)
   - Consistent timing for state transitions
   - Better coordination between Alice and Bob actions
   - Reduced race conditions in cross-chain operations

3. **Configuration Changes**:
   ```yaml
   # mprocs.yaml
   anvil-chain-a:
     shell: anvil --port 8545 --chain-id 1337 --block-time 1 --hardfork shanghai
   anvil-chain-b:
     shell: anvil --port 8546 --chain-id 1338 --block-time 1 --hardfork shanghai
   ```

4. **Timelock Adjustments**:
   - All timelocks now use seconds instead of blocks
   - Withdrawal window: 0-30 seconds
   - Cancellation window: 30-45 seconds
   - Much faster testing cycles

This change should help the resolver maintain better synchronization with on-chain state and reduce timing-related issues.

## Related Files for Investigation

In the contracts repository:
- `/contracts/libraries/ProxyHashLib.sol`
- `/contracts/BaseEscrowFactory.sol` 
- `/contracts/EscrowFactory.sol`
- `/lib/openzeppelin-contracts/contracts/proxy/Clones.sol`

In the resolver:
- `/src/resolver/executor.ts` - Where destination escrow address is calculated
- `/src/utils/addresses.ts` - Address calculation utilities
- `/src/types/events.ts` - Event parsing logic

## Test Script Updates

We've updated our test script to work around this issue by:
1. Attempting to parse the actual address from broadcast files
2. Storing the actual deployed address in the state file
3. Using the actual address for withdrawal operations

However, the resolver will need similar updates to work correctly in production.