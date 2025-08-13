# Critical Fix: fillOrderArgs vs fillContractOrderArgs

**Date**: 2025-01-13
**Issue**: BadSignature() error preventing atomic swaps
**Status**: Fixed (but order still reverting for other reasons)

## The Problem

The atomic swap system was completely blocked because we were calling the wrong function in SimpleLimitOrderProtocol. This caused every order fill to revert with `BadSignature()`.

## Root Cause Discovery

Through debugging with `cast run --debug`, we discovered:
```
Traces:
  [4417] SimpleLimitOrderProtocol::fillContractOrderArgs(...)
    ├─ [0] 0x240E2588e35FB9D3D60B283B45108a49972FFFd8::isValidSignature(...) [staticcall]
    │   └─ ← [Stop]
    └─ ← [Revert] BadSignature()
```

The protocol was calling `isValidSignature` (EIP-1271) on Alice's address, which is an EOA, not a smart contract.

## The Critical Distinction

SimpleLimitOrderProtocol has TWO different functions for different wallet types:

### 1. fillOrderArgs (for EOAs)
- Used when maker is an Externally Owned Account
- Signature validation: `ECDSA.recover(orderHash, r, vs)`
- Expects signature split into r (32 bytes) and vs (32 bytes)
- Code location: OrderMixin.sol lines 129-157

### 2. fillContractOrderArgs (for Smart Wallets)
- Used when maker is a smart contract wallet (Safe, Argent, etc.)
- Signature validation: `ECDSA.isValidSignature(maker, orderHash, signature)`
- Makes a call to `maker.isValidSignature()` (EIP-1271)
- Code location: OrderMixin.sol lines 194-219

## The Fix

### Before (WRONG for EOAs):
```typescript
// src/utils/limit-order.ts
functionName: "fillContractOrderArgs",
args: [
  params.order,
  params.signature,
  params.fillAmount,
  takerTraits,
  params.extensionData,
]
```

### After (CORRECT for EOAs):
```typescript
// src/utils/limit-order.ts
functionName: "fillOrderArgs",
args: [
  params.order,
  ('0x' + params.signature.slice(2, 66)) as Hex,    // r (32 bytes)
  ('0x' + params.signature.slice(66, 130)) as Hex,  // vs (32 bytes)
  params.fillAmount,
  takerTraits,
  params.extensionData,
]
```

## Signature Format

The signature must be split into components:
- **r**: First 32 bytes (characters 2-66 of hex string)
- **vs**: Next 32 bytes (characters 66-130 of hex string)
- The 'v' value is packed into 's' for compact representation (EIP-2098)

## How to Determine Which Function to Use

```typescript
// Check if maker is a contract
const code = await client.getCode({ address: makerAddress });
if (code && code !== '0x') {
  // Maker is a smart contract - use fillContractOrderArgs
  protocol.fillContractOrderArgs(order, signature, ...);
} else {
  // Maker is an EOA - use fillOrderArgs
  protocol.fillOrderArgs(order, r, vs, ...);
}
```

## Impact

This was a **critical blocker** that prevented ALL atomic swaps from working when the maker was an EOA. The system was trying to call a non-existent function on EOA addresses, causing immediate revert.

## Lessons Learned

1. **Always check wallet type**: EOAs and smart wallets require different handling
2. **Function naming matters**: "Contract" in `fillContractOrderArgs` specifically means smart contract wallets
3. **EIP-1271 is for contracts only**: The `isValidSignature` standard only applies to smart contracts
4. **Signature format varies**: EOAs need split r/vs, contracts can use full signature

## Current Status

✅ **Fixed**: Correct function is now being called for EOA makers
❌ **Still reverting**: Orders still fail, likely due to:
- PostInteraction callback implementation
- Factory whitelist configuration  
- Order parameter validation
- Extension data format

## Files Changed

- `src/utils/limit-order.ts`: Changed function call and signature handling
- `scripts/simulate-fill.ts`: Updated to match new signature format
- All references to `fillContractOrderArgs` changed to `fillOrderArgs` for EOA support

## Testing

To verify the fix works:
```bash
# Create a test order
deno run --allow-all --env-file=.env scripts/create-test-order.ts

# Simulate filling it
deno run --allow-all --env-file=.env scripts/simulate-fill.ts pending-orders/<order>.json

# Should no longer show BadSignature() error
```

## References

- SimpleLimitOrderProtocol source: bmn-evm-contracts-limit-order/contracts/OrderMixin.sol
- EIP-1271: Standard Signature Validation Method for Contracts
- EIP-2098: Compact Signature Representation