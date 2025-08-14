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

### Contract Implementation: Timelocks Packing in SimplifiedEscrowFactory

⚠️ **IMPORTANT**: The actual contract implementation differs from the conceptual JavaScript example above. Here's how timelocks are actually managed in the smart contracts:

#### Location: `../bmn-evm-contracts/contracts/SimplifiedEscrowFactory.sol`

The `postInteraction` method (lines 201-276) handles timelocks packing when creating source escrows after a limit order fill:

```solidity
// SimplifiedEscrowFactory.sol:237-245
// Build timelocks for source escrow by packing values
uint256 packedTimelocks = uint256(uint32(block.timestamp)) << 224; // deployedAt
packedTimelocks |= uint256(uint32(300)) << 0;     // srcWithdrawal: 5 minutes offset (hardcoded)
packedTimelocks |= uint256(uint32(600)) << 32;    // srcPublicWithdrawal: 10 minutes offset (hardcoded)
packedTimelocks |= uint256(uint32(srcCancellationTimestamp - block.timestamp)) << 64; // srcCancellation offset (calculated)
packedTimelocks |= uint256(uint32(srcCancellationTimestamp - block.timestamp + 300)) << 96; // srcPublicCancellation offset
packedTimelocks |= uint256(uint32(dstWithdrawalTimestamp - block.timestamp)) << 128; // dstWithdrawal offset (calculated)
packedTimelocks |= uint256(uint32(dstWithdrawalTimestamp - block.timestamp + 300)) << 160; // dstPublicWithdrawal offset
packedTimelocks |= uint256(uint32(7200)) << 192;  // dstCancellation: 2 hours offset (hardcoded)
```

#### Key Differences from JavaScript Example:

1. **Hardcoded Offsets**: The contract uses fixed offsets for some stages:
   - Source withdrawal: 300 seconds (5 minutes)
   - Source public withdrawal: 600 seconds (10 minutes)  
   - Destination cancellation: 7200 seconds (2 hours)

2. **Input Parameters Extraction** (lines 215-222):
   ```solidity
   // Decode the extraData containing escrow parameters
   (bytes32 hashlock, uint256 dstChainId, address dstToken, 
    uint256 deposits, uint256 timelocks) = 
       abi.decode(extraData, (bytes32, uint256, address, uint256, uint256));
   ```

3. **Timestamp Extraction** (lines 231-233):
   ```solidity
   // Extract timelocks (packed as: srcCancellation << 128 | dstWithdrawal)
   uint256 dstWithdrawalTimestamp = timelocks & type(uint128).max;
   uint256 srcCancellationTimestamp = timelocks >> 128;
   ```

4. **Offset Calculation**: The contract calculates offsets from `block.timestamp` at deployment time:
   - `srcCancellationTimestamp - block.timestamp` gives the offset for source cancellation
   - `dstWithdrawalTimestamp - block.timestamp` gives the offset for destination withdrawal

#### TimelocksLib Usage in Escrow Contracts

The packed timelocks are later used by escrow contracts through the `TimelocksLib` library:

**Location: `../bmn-evm-contracts/contracts/libraries/TimelocksLib.sol`**

```solidity
// TimelocksLib.sol:75-80
function get(Timelocks timelocks, Stage stage) internal pure returns (uint256) {
    uint256 data = Timelocks.unwrap(timelocks);
    uint256 bitShift = uint256(stage) * 32;
    // Extract deployedAt and add the stage offset
    return (data >> _DEPLOYED_AT_OFFSET) + uint32(data >> bitShift);
}
```

**Usage in EscrowDst.sol** (lines 37-38, 51-52, 79):
```solidity
// EscrowDst.sol:37-38 - Withdrawal window check
onlyAfter(immutables.timelocks.get(TimelocksLib.Stage.DstWithdrawal))
onlyBefore(immutables.timelocks.get(TimelocksLib.Stage.DstCancellation))
```

#### Important Implementation Notes:

1. **CREATE2 Salt**: The immutables hash is used as the CREATE2 salt (SimplifiedEscrowFactory.sol:287):
   ```solidity
   bytes32 salt = keccak256(abi.encode(srcImmutables));
   escrow = ESCROW_SRC_IMPLEMENTATION.cloneDeterministic(salt);
   ```

2. **Duplicate Prevention**: The factory tracks escrows by hashlock to prevent duplicates (SimplifiedEscrowFactory.sol:224):
   ```solidity
   require(escrows[hashlock] == address(0), "Escrow already exists");
   ```

3. **Token Transfer Flow** (SimplifiedEscrowFactory.sol:266):
   ```solidity
   // Tokens flow: maker → protocol → resolver → escrow
   IERC20(order.makerAsset.get()).safeTransferFrom(taker, escrowAddress, makingAmount);
   ```

#### Complete PostInteraction Timelocks Flow

The `postInteraction` method orchestrates the entire timelocks packing process:

**Step 1: Decode Input Parameters** (SimplifiedEscrowFactory.sol:215-222)
```solidity
// extraData contains: hashlock, dstChainId, dstToken, deposits, timelocks
(bytes32 hashlock, uint256 dstChainId, address dstToken, 
 uint256 deposits, uint256 timelocks) = abi.decode(extraData, ...);
```

**Step 2: Extract Safety Deposits** (SimplifiedEscrowFactory.sol:228-229)
```solidity
uint256 srcSafetyDeposit = deposits & type(uint128).max;  // Lower 128 bits
uint256 dstSafetyDeposit = deposits >> 128;               // Upper 128 bits
```

**Step 3: Extract Critical Timestamps** (SimplifiedEscrowFactory.sol:231-233)
```solidity
uint256 dstWithdrawalTimestamp = timelocks & type(uint128).max;  // When dst can withdraw
uint256 srcCancellationTimestamp = timelocks >> 128;             // When src can cancel
```

**Step 4: Build Complete Timelocks Structure** (SimplifiedEscrowFactory.sol:237-245)
- Each stage gets 32 bits in the packed uint256
- DeployedAt (current block.timestamp) occupies bits 224-255
- All other stages store offsets from deployedAt

**Step 5: Create Immutables and Deploy Escrow** (SimplifiedEscrowFactory.sol:249-262)
```solidity
IBaseEscrow.Immutables memory srcImmutables = IBaseEscrow.Immutables({
    orderHash: orderHash,
    hashlock: hashlock,
    maker: Address.wrap(uint160(order.maker.get())),
    taker: Address.wrap(uint160(taker)),
    token: order.makerAsset,
    amount: makingAmount,
    safetyDeposit: srcSafetyDeposit,
    timelocks: srcTimelocks
});
```

#### Timelocks Validation in Escrow Contracts

When escrow methods are called, timelocks are validated using modifiers:

**Location: `../bmn-evm-contracts/contracts/BaseEscrow.sol`**

```solidity
// BaseEscrow.sol:60-68
modifier onlyAfter(uint256 start) {
    if (block.timestamp < start) revert InvalidTime();
    _;
}

modifier onlyBefore(uint256 stop) {
    if (block.timestamp >= stop) revert InvalidTime();
    _;
}
```

These modifiers work with `TimelocksLib.get()` to enforce time windows:

**Example from EscrowDst.sol:34-40** (Withdrawal):
```solidity
function withdraw(bytes32 secret, Immutables calldata immutables)
    external
    onlyTaker(immutables)
    onlyAfter(immutables.timelocks.get(TimelocksLib.Stage.DstWithdrawal))
    onlyBefore(immutables.timelocks.get(TimelocksLib.Stage.DstCancellation))
{
    _withdraw(secret, immutables);
}
```

This ensures withdrawals can only occur within the designated time window.

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

## TypeScript Implementation Insights

### Critical Discovery: DeployedAt Mismatch Issue

⚠️ **CRITICAL BUG RISK**: The TypeScript implementation reveals a fundamental issue with immutables reconstruction:

**Location: `cli/withdraw-dst.ts:144-146`**
```typescript
// WARNING: This uses current timestamp, NOT original deployedAt!
const deployedAt = BigInt(Math.floor(Date.now() / 1000));
const deployedAt32 = deployedAt & 0xFFFFFFFFn;
```

This reconstruction will **NEVER** match the original immutables because:
1. The escrow was created at time T1 with `deployedAt = T1`
2. Withdrawal attempt at time T2 uses `deployedAt = T2`
3. The immutables hash will differ, causing `InvalidImmutables()` error

**Solution Implemented**: `cli/swap-execute.ts:267-283`
```typescript
// Store exact immutables during escrow creation
await atomicWriteJson(`${dstDir}/${order.hashlock}.json`, {
  immutables: {
    orderHash: order.orderHash,
    hashlock: order.hashlock,
    maker: order.order.maker,
    receiver: order.order.receiver,
    token: dstToken,
    amount: order.order.takingAmount,
    safetyDeposit: dstSafetyDeposit.toString(),
    timelocks: dstTimelocks.toString(),  // Store EXACT timelocks with correct deployedAt
  }
});
```

### Timelock Format Duality

The TypeScript implementation uses **two different timelock formats** for different purposes:

#### 1. User-Facing Format (Absolute Timestamps)
**Location: `cli/timelock-utils.ts:10-17`**
```typescript
export function parseTimelocks(timelocksPacked: bigint): {
  srcCancellation: bigint;
  dstWithdrawal: bigint;
} {
  const dstWithdrawal = timelocksPacked & ((1n << 128n) - 1n);
  const srcCancellation = timelocksPacked >> 128n;
  return { srcCancellation, dstWithdrawal };
}
```
- Used for checking if windows are open
- Contains absolute Unix timestamps
- Format: `srcCancellation << 128 | dstWithdrawal`

#### 2. Contract Format (Offset-Based)
**Location: `cli/swap-execute.ts:224-235`**
```typescript
// Calculate offsets from deployedAt
const dstWithdrawalOffset = (dstWithdrawalTimestamp > deployedAt) 
  ? (dstWithdrawalTimestamp - deployedAt) & 0xFFFFFFFFn 
  : 0n;
const dstCancellationOffset = (srcCancellationTimestamp > deployedAt) 
  ? (srcCancellationTimestamp - deployedAt) & 0xFFFFFFFFn 
  : 0n;

// Pack with deployedAt and offsets for contract
const dstTimelocks = (deployedAt32 << 224n) | 
                     (dstCancellationOffset << 192n) | 
                     (dstWithdrawalOffset << 128n);
```

### Extension Data Processing Pattern

Consistent pattern across all CLI files for handling extension data:

**Location: `cli/swap-execute.ts:198-202`**
```typescript
let extensionForParsing = order.extensionData;
if (extensionForParsing.startsWith("0x000000")) {
  // Has offsets header, skip first 4 bytes
  extensionForParsing = "0x" + extensionForParsing.slice(10) as Hex;
}
```

This pattern appears in:
- `cli/swap-execute.ts:198-202`
- `cli/withdraw-dst.ts:117-121`
- `src/utils/escrow-creation.ts:52-54` (implicitly via slice operations)

### Timelock Utility Functions

**Location: `cli/timelock-utils.ts`**

The CLI provides comprehensive utility functions for timelock management:

1. **Window Status Checking** (lines 24-37):
   ```typescript
   export function isDstWithdrawWindowOpen(dstWithdrawal: bigint): boolean {
     const now = BigInt(Math.floor(Date.now() / 1000));
     return now >= dstWithdrawal;
   }
   ```

2. **Automatic Waiting** (lines 89-110):
   ```typescript
   export async function waitUntilDstWithdrawWindow(
     dstWithdrawal: bigint,
     checkInterval = 10000,  // 10 seconds default
     maxWait = 3600          // 1 hour max wait
   ): Promise<void>
   ```

3. **Human-Readable Formatting** (lines 66-80):
   ```typescript
   export function formatTimeRemaining(seconds: bigint): string {
     // Returns "5m 30s", "1h 20m", or "ready"
   }
   ```

### PostInteraction Data Encoding

**Location: `cli/postinteraction.ts`**

Helper functions for creating PostInteraction data:

1. **Timelock Packing** (lines 70-75):
   ```typescript
   export function packTimelocks(srcCancellationDelay: number, dstWithdrawalDelay: number): bigint {
     const now = Math.floor(Date.now() / 1000);
     const srcCancellationTimestamp = BigInt(now + srcCancellationDelay);
     const dstWithdrawalTimestamp = BigInt(now + dstWithdrawalDelay);
     return (srcCancellationTimestamp << 128n) | dstWithdrawalTimestamp;
   }
   ```

2. **Deposit Packing** (lines 77-79):
   ```typescript
   export function packDeposits(srcSafetyDeposit: bigint, dstSafetyDeposit: bigint): bigint {
     return (dstSafetyDeposit << 128n) | srcSafetyDeposit;
   }
   ```

3. **Extension Encoding** (lines 52-68):
   ```typescript
   export function encode1inchExtension(postInteractionData: Hex): Hex {
     // Creates the 32-byte offsets header
     const offsets = new Uint8Array(32);
     const postLen = (postInteractionData.length - 2) >>> 1;
     // ... packs cumulative lengths
     return concat([offsetsHex, postInteractionData]);
   }
   ```

### Type Safety Pattern

Consistent type handling across all CLI files:

**Location: `cli/swap-execute.ts:237-246`**
```typescript
const immutablesTuple = [
  order.orderHash as Hex,           // Hex type for bytes32
  order.hashlock as Hex,            // Hex type for bytes32
  order.order.maker as Address,     // Address type, NOT BigInt
  order.order.receiver as Address,  // Address type, NOT BigInt
  dstToken as Address,              // Address type, NOT BigInt
  BigInt(order.order.takingAmount), // BigInt for amounts
  dstSafetyDeposit,                 // BigInt for amounts
  dstTimelocks,                     // BigInt for packed timelocks
];
```

### Withdrawal Safety Check Pattern

**Location: `cli/withdraw-dst.ts:168-185`**
```typescript
const timelockStatus = getTimelockStatus(originalTimelocks);

if (!timelockStatus.dstWithdrawal.isOpen) {
  console.log(`Time remaining: ${timelockStatus.dstWithdrawal.formatted}`);
  
  const shouldWait = Deno.args.includes("--wait");
  if (shouldWait) {
    await waitUntilDstWithdrawWindow(timelockStatus.dstWithdrawal.timestamp);
    console.log("Window is now open, proceeding with withdrawal");
  } else {
    console.log("Use --wait flag to automatically wait for the window to open");
    Deno.exit(1);
  }
}
```

## Key Takeaways

1. **Immutables must be exact**: Any difference in immutables causes validation failure
2. **Timelocks use offsets**: Not absolute timestamps, but offsets from deployedAt
3. **Store creation data**: Always store exact immutables during escrow creation
4. **Type consistency**: Keep addresses as Address type, not BigInt
5. **Extension data padding**: Remember to skip 28-byte padding after offsets header
6. **DeployedAt reconstruction is impossible**: You cannot reconstruct the original deployedAt timestamp, so always store the exact immutables
7. **Two timelock formats exist**: User-facing (absolute timestamps) vs Contract (offset-based)
8. **Consistent extension data handling**: Always check for and strip the `0x000000` offsets header

## References

- TimelocksLib: `bmn-evm-contracts/contracts/libraries/TimelocksLib.sol`
- Escrow contracts: `bmn-evm-contracts/contracts/EscrowDst.sol`
- PostInteraction: `src/utils/escrow-creation.ts`