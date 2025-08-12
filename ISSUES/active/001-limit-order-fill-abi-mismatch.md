# ISSUE-001: Limit Order Fill ABI Mismatch

**Status**: Active
**Priority**: CRITICAL  
**Created**: 2025-01-12
**Updated**: 2025-01-12
**Blocked By**: Token balances (Alice and Bob have 0 BMN tokens)

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

## Current Status

### ✅ Fixed
- Changed function from `fillOrderArgs` to `fillContractOrderArgs` 
- Updated to pass signature as single bytes parameter
- Corrected factory address to v2.3: `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68`

### ❌ New Blocker
- Alice has 0 BMN tokens on Base
- Bob has 0 BMN tokens on Base  
- Orders cannot be filled without token balances

## Verification

The fillContractOrderArgs function is now being called correctly, but reverts due to insufficient token balances.

## Files to Update

- [ ] `src/utils/limit-order.ts` - Main fix
- [ ] `scripts/simulate-fill.ts` - Testing tool
- [ ] `abis/SimpleLimitOrderProtocol.json` - Verify has correct function