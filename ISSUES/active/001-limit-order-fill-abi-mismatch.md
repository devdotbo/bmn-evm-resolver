# ISSUE-001: Limit Order Fill ABI Mismatch

**Status**: Resolved  
**Priority**: HIGH  
**Created**: 2025-01-12
**Updated**: 2025-01-13
**Blocked By**: Unknown EIP-712 domain configuration in deployed protocol

## Problem

The resolver is calling the wrong function on SimpleLimitOrderProtocol, causing all limit order fills to revert with unknown error selector `0xb2d25e49`.

## Impact

- Complete blockage of atomic swap flow
- 4+ pending orders stuck and cannot be processed
- System non-functional for production use

## Root Cause

**Current (Wrong)**:
```typescript
// src/utils/limit-order.ts
protocol.fillOrderArgs(order, r, vs, amount, takerTraits, extensionData)
```

**Required (Correct)**:
```typescript
protocol.fillContractOrderArgs(order, signature, amount, takerTraits, extensionData)
```

The deployed SimpleLimitOrderProtocol on Optimism (`0xe767105dcfB3034a346578afd2aFD8e583171489`) expects:
- Single `bytes signature` parameter
- Different function selector

Our code splits signature into `r` and `vs` components for a different function that doesn't exist.

## Environment

- Chain: Base (8453) and Optimism (10)
- Protocol: `0xe767105dcfB3034a346578afd2aFD8e583171489`
- Factory: `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68` (v2.3)
- Resolver: `0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5`

## Solution

1. Update `src/utils/limit-order.ts`:
   - Change function call from `fillOrderArgs` to `fillContractOrderArgs`
   - Pass signature as single bytes parameter (no splitting)
   - Keep extensionData unchanged

2. Update `scripts/simulate-fill.ts` to match

3. Ensure ABI includes `fillContractOrderArgs` function

## Testing

```bash
# After fix, test with existing pending order
deno run --allow-all scripts/simulate-fill.ts \
  pending-orders/0xf759119bee651fd4aab04b3df70f80a3c3c187b4e2ea461d4bc0c449ae6694e1.json

# Should succeed without revert
```

## Resolution Summary

- Fixed EIP‑712 domain and signing via `walletClient.signTypedData()`
- Selected correct protocol function per account type in `src/utils/limit-order.ts`
- Added robust revert decoding and diagnostics

Verification: successful fills in simulation and main flow contingent on balances/allowances.

## Files to Update

- [ ] `src/utils/limit-order.ts` - Main fix
- [ ] `scripts/simulate-fill.ts` - Testing tool
- [ ] `abis/SimpleLimitOrderProtocol.json` - Verify has correct function