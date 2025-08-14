# Immutables and Timelocks Architecture

## Overview

This document explains the critical concepts of immutables and timelocks in the BMN EVM Resolver atomic swap system. Understanding these concepts is essential for maintaining and extending the codebase.

## Immutables Structure

### What are Immutables?

Immutables are the unchangeable parameters that define an escrow contract's behavior. They are used to:
1. Calculate deterministic escrow addresses (CREATE2)
2. Validate withdrawal attempts
3. Ensure consistency between source and destination escrows

### Immutables Fields

```typescript
interface Immutables {
  orderHash: bytes32;      // Hash of the limit order
  hashlock: bytes32;        // Hash of the secret (HTLC)
  maker: Address;           // Order creator (Alice)
  taker: Address;           // Order filler (Bob/Resolver) 
  token: Address;           // Token being escrowed
  amount: uint256;          // Amount of tokens
  safetyDeposit: uint256;   // Additional deposit for incentives
  timelocks: uint256;       // Packed timelock data (see below)
}
```

### Critical Type Requirements

⚠️ **IMPORTANT**: When constructing immutables:
- Keep addresses as `Address` type (NOT `BigInt`)
- Only convert amounts to `BigInt`
- Incorrect type conversion causes `InvalidCaller()` errors

## Timelocks Architecture

### TimelocksLib Structure

The timelocks field is a 256-bit packed value containing multiple timestamps:

```
Bits 0-31:    SrcWithdrawal (Stage 0)
Bits 32-63:   SrcPublicWithdrawal (Stage 1)
Bits 64-95:   SrcCancellation (Stage 2)
Bits 96-127:  SrcPublicCancellation (Stage 3)
Bits 128-159: DstWithdrawal (Stage 4)
Bits 160-191: DstPublicWithdrawal (Stage 5)
Bits 192-223: DstCancellation (Stage 6)
Bits 224-255: DeployedAt (base timestamp)
```

### Key Concept: Offset-Based Storage

⚠️ **CRITICAL**: TimelocksLib stores **offsets from deployedAt**, not absolute timestamps!

```solidity
// TimelocksLib.get() implementation
function get(Timelocks timelocks, Stage stage) returns (uint256) {
    uint256 data = Timelocks.unwrap(timelocks);
    uint256 deployedAt = data >> 224;  // Bits 224-255
    uint256 offset = uint32(data >> (stage * 32));  // Stage offset
    return deployedAt + offset;  // Absolute timestamp
}
```

### Packing Timelocks for Destination Escrow

```typescript
// Extract original timestamps
const dstWithdrawalTimestamp = originalTimelocks & ((1n << 128n) - 1n);
const srcCancellationTimestamp = originalTimelocks >> 128n;

// Use current time as deployedAt
const deployedAt = BigInt(Math.floor(Date.now() / 1000));
const deployedAt32 = deployedAt & 0xFFFFFFFFn;

// Calculate offsets from deployedAt
const dstWithdrawalOffset = (dstWithdrawalTimestamp - deployedAt) & 0xFFFFFFFFn;
const dstCancellationOffset = (srcCancellationTimestamp - deployedAt) & 0xFFFFFFFFn;

// Pack: deployedAt(224-255) | dstCancellation(192-223) | dstWithdrawal(128-159)
const dstTimelocks = (deployedAt32 << 224n) | 
                     (dstCancellationOffset << 192n) | 
                     (dstWithdrawalOffset << 128n);
```

## PostInteraction Extension Data

### Extension Data Structure

After removing the 4-byte offsets header (`0x000000b4`):

```
Bytes 0-27:   Padding (28 bytes)
Bytes 28-47:  Factory address (20 bytes)
Bytes 48+:    ABI-encoded payload
```

### Parsing PostInteraction Data

```typescript
function parsePostInteractionData(extensionData: Hex) {
  // Skip 28 bytes of padding (56 hex chars)
  const dataAfterPadding = extensionData.slice(2 + 56);
  
  // Extract factory (next 20 bytes = 40 hex chars)
  const factory = '0x' + dataAfterPadding.slice(0, 40);
  
  // Decode ABI payload
  const payload = '0x' + dataAfterPadding.slice(40);
  const [hashlock, dstChainId, dstToken, deposits, timelocks] = 
    decodeAbiParameters(
      parseAbiParameters('bytes32, uint256, address, uint256, uint256'),
      payload
    );
  
  return { factory, hashlock, dstChainId, dstToken, deposits, timelocks };
}
```

## Immutables Storage and Consistency

### Problem: Immutables Must Match Exactly

The escrow contract validates that provided immutables match the expected hash:

```solidity
modifier onlyValidImmutables(Immutables calldata immutables) {
    if (immutables.hash() != EXPECTED_IMMUTABLES_HASH) {
        revert InvalidImmutables();
    }
    _;
}
```

### Solution: Store Exact Immutables

During escrow creation (`swap-execute.ts`):

```typescript
// Store exact immutables used
await atomicWriteJson(`${dstDir}/${hashlock}.json`, {
  hashlock,
  escrowAddress,
  immutables: {
    orderHash,
    hashlock,
    maker,
    receiver,
    token,
    amount,
    safetyDeposit: safetyDeposit.toString(),
    timelocks: dstTimelocks.toString(),  // Store exact value
  },
});
```

During withdrawal (`withdraw-dst.ts`):

```typescript
if (dstJson.immutables) {
  // Use exact immutables from creation
  immutables = [
    dstJson.immutables.orderHash,
    dstJson.immutables.hashlock,
    dstJson.immutables.maker,
    dstJson.immutables.receiver,
    dstJson.immutables.token,
    BigInt(dstJson.immutables.amount),
    BigInt(dstJson.immutables.safetyDeposit),
    BigInt(dstJson.immutables.timelocks),
  ];
} else {
  // Fallback: reconstruct from order data
  // ... reconstruction logic ...
}
```

## Common Errors and Solutions

### InvalidTime()
- **Cause**: Attempting withdrawal outside the allowed timelock window
- **Solution**: Check timelocks and wait for window to open

### InvalidImmutables()
- **Cause**: Provided immutables don't match expected hash
- **Solution**: Use stored immutables from escrow creation

### InvalidCaller()
- **Cause**: Wrong address attempting withdrawal (taker mismatch)
- **Solution**: Ensure correct address types in immutables

### SafeTransferFromFailed()
- **Cause**: Wrong token address or insufficient balance/allowance
- **Solution**: Verify token address extraction from extension data

## Testing Timelocks

To debug timelock issues:

```javascript
const timelocks = BigInt("0x689d44f0..."); // Your packed value
const deployedAt = Number((timelocks >> 224n) & 0xFFFFFFFFn);
const dstWithdrawalOffset = Number((timelocks >> 128n) & 0xFFFFFFFFn);
const dstCancellationOffset = Number((timelocks >> 192n) & 0xFFFFFFFFn);

console.log('DeployedAt:', new Date(deployedAt * 1000));
console.log('DstWithdrawal:', new Date((deployedAt + dstWithdrawalOffset) * 1000));
console.log('DstCancellation:', new Date((deployedAt + dstCancellationOffset) * 1000));

const now = Math.floor(Date.now() / 1000);
const windowOpen = now >= deployedAt + dstWithdrawalOffset && 
                   now < deployedAt + dstCancellationOffset;
console.log('Window open?', windowOpen);
```

## Key Takeaways

1. **Immutables must be exact**: Any difference in immutables causes validation failure
2. **Timelocks use offsets**: Not absolute timestamps, but offsets from deployedAt
3. **Store creation data**: Always store exact immutables during escrow creation
4. **Type consistency**: Keep addresses as Address type, not BigInt
5. **Extension data padding**: Remember to skip 28-byte padding after offsets header

## References

- TimelocksLib: `bmn-evm-contracts/contracts/libraries/TimelocksLib.sol`
- Escrow contracts: `bmn-evm-contracts/contracts/EscrowDst.sol`
- PostInteraction: `src/utils/escrow-creation.ts`