# Integration Status & Architecture

> **📚 ARCHIVED DOCUMENT - HISTORICAL REFERENCE**
>
> **This document reflects the integration status before the PostInteraction fix
> on 2025-08-08.**
>
> The PostInteraction integration issues mentioned here have been resolved. See
> current documentation:
>
> - **Fix Details**:
>   [../POSTINTERACTION_FIX_2025-08-08.md](../POSTINTERACTION_FIX_2025-08-08.md)
> - **Current System**: All components now fully integrated and operational

---

## Current State Analysis (Historical - Pre-Fix)

### ✅ Components Available

1. **Indexer**:
   - PonderClient integrated in resolver (`src/indexer/ponder-client.ts`)
   - Used for monitoring orders and events

2. **Factory v2.1.0**:
   - Address: `0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A` (Base & Optimism)
   - Features: Whitelist, emergency pause, VERSION = "2.1.0-bmn-secure"
   - Your resolver IS WHITELISTED ✅

3. **SimpleLimitOrderProtocol**:
   - Base: `0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06`
   - Optimism: `0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7`
   - Deployed and verified on mainnet

4. **ABIs Updated**:
   - ✅ CrossChainEscrowFactoryV2.json (v2.1.0 with security features)
   - ✅ SimpleLimitOrderProtocol.json (from bmn-evm-contracts-limit-order)
   - ✅ EscrowSrcV2.json & EscrowDstV2.json (v2 implementations)

### ❌ Issues Found

1. **Wrong Factory ABI**: The resolver is using old v1.1.0 ABI without security
   functions
2. **Missing Integration**: Resolver doesn't interact with
   SimpleLimitOrderProtocol
3. **Incomplete Flow**: Not monitoring limit orders from protocol

## Architecture Flow

```
1. Alice creates limit order → SimpleLimitOrderProtocol
   ↓
2. Order includes factory extension data (postInteraction)
   ↓
3. Indexer monitors OrderFilled events
   ↓
4. Resolver fills order via SimpleLimitOrderProtocol.fillOrder()
   ↓
5. Protocol triggers factory.postInteraction()
   ↓
6. Factory creates source escrow (atomic swap initiated)
   ↓
7. Resolver creates destination escrow
   ↓
8. Atomic swap completes
```

## Required Updates

### 1. Update Factory ABI Usage

```typescript
// Old (wrong)
import CrossChainEscrowFactoryAbi from "../../abis/CrossChainEscrowFactory.json";

// New (correct)
import CrossChainEscrowFactoryV2Abi from "../../abis/CrossChainEscrowFactoryV2.json";
```

### 2. Add SimpleLimitOrderProtocol Integration

```typescript
import SimpleLimitOrderProtocolAbi from "../../abis/SimpleLimitOrderProtocol.json";

const limitOrderProtocol = {
  base: "0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06",
  optimism: "0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7",
};
```

### 3. Monitor Limit Order Events

```typescript
// Monitor OrderFilled events from SimpleLimitOrderProtocol
const orderFilledEvents = await client.getLogs({
  address: limitOrderProtocol[chain],
  event: parseAbiItem(
    "event OrderFilled(bytes32 orderHash, uint256 remainingAmount)",
  ),
  fromBlock: "latest",
});
```

### 4. Fill Orders Through Protocol

```typescript
// Instead of direct factory interaction
await limitOrderProtocol.fillOrder(
  order, // Order struct
  r, // Signature r
  vs, // Signature vs
  amount, // Making amount
  takerTraits, // Taker configuration
);
```

## Indexer Integration

The resolver already uses PonderClient but needs to:

1. Monitor SimpleLimitOrderProtocol events
2. Track orders with factory extensions
3. Identify cross-chain swap opportunities

## Security Considerations

1. **Pre-operation checks**: Already implemented in BaseResolver ✅
2. **Whitelist monitoring**: FactorySecurityMonitor active ✅
3. **Error handling**: NotWhitelistedError, FactoryPausedError ✅

## Next Steps

1. Update resolver to use correct v2 ABIs
2. Add SimpleLimitOrderProtocol interaction
3. Modify indexer queries for limit order events
4. Test complete flow on mainnet
5. Monitor for successful cross-chain swaps

## Testing on Mainnet

Since you're whitelisted and everything is deployed:

1. Create a test limit order with factory extension
2. Fill it through SimpleLimitOrderProtocol
3. Verify source escrow creation
4. Complete destination escrow
5. Monitor atomic swap completion

## Files to Update

- `src/resolver/simple-resolver.ts` - Use new ABIs and limit order protocol
- `src/indexer/ponder-client.ts` - Query limit order events
- `src/config/contracts.ts` - Already has correct addresses ✅

The infrastructure is ready, just needs the resolver logic to connect through
the SimpleLimitOrderProtocol instead of direct factory interaction.
