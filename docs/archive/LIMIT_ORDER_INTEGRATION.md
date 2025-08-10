# Limit Order Protocol Integration

> **📚 ARCHIVED DOCUMENTATION - FOR HISTORICAL REFERENCE**
>
> **This document describes the integration approach before the PostInteraction
> fix on 2025-08-08.**
>
> The PostInteraction functionality described here had implementation issues
> that have since been resolved.
>
> For current implementation details, see:
>
> - **Fix Documentation**:
>   [../POSTINTERACTION_FIX_2025-08-08.md](../POSTINTERACTION_FIX_2025-08-08.md)
> - **Troubleshooting Guide**:
>   [../POSTINTERACTION_TROUBLESHOOTING.md](../POSTINTERACTION_TROUBLESHOOTING.md)
> - **Current Status**: ✅ FULLY OPERATIONAL

---

## Overview (Historical Context)

This implementation integrates Bridge-Me-Not with the 1inch
SimpleLimitOrderProtocol to enable cross-chain atomic swaps using EIP-712 signed
limit orders with post-interaction hooks that trigger escrow creation.

## Key Components

### 1. SimpleLimitOrderProtocol Addresses

- **Base**: `0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06`
- **Optimism**: `0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7`

### 2. LimitOrderAlice (`src/alice/limit-order-alice.ts`)

The main class that handles:

- **EIP-712 Order Creation**: Creates properly formatted limit orders with
  EIP-712 signatures
- **Post-Interaction Integration**: Includes extension data that triggers
  `factory.postSourceEscrow()` after order fill
- **Secret Management**: Generates and stores secrets for HTLC atomic swaps
- **Order Monitoring**: Watches for destination escrow creation and
  auto-withdraws

### 3. Order Structure

```typescript
interface LimitOrder {
  salt: bigint; // Random nonce for uniqueness
  maker: Address; // Alice's address
  receiver: Address; // Who receives the tokens (also Alice)
  makerAsset: Address; // BMN token on source chain
  takerAsset: Address; // BMN token (same for atomic swap)
  makingAmount: bigint; // Amount Alice is selling
  takingAmount: bigint; // Amount Alice wants to receive
  makerTraits: bigint; // Flags including hasExtension bit
}
```

### 4. Post-Interaction Flow

1. **Order Creation**: Alice creates a limit order with extension data
2. **Extension Data**: Contains factory address and `postSourceEscrow` calldata
3. **Order Fill**: When resolver fills the order, the protocol executes the
   post-interaction
4. **Escrow Creation**: Factory creates source escrow with HTLC parameters
5. **Cross-Chain**: Resolver creates matching destination escrow
6. **Withdrawal**: Alice reveals secret to claim funds on destination

## Usage

### Create an Order

```bash
# Create order from Base to Optimism (1 BMN token)
deno run alice.ts --action create --resolver 0x123...

# Create order from Optimism to Base (10 BMN tokens)
deno run alice.ts --action create \
  --src-chain 10 \
  --dst-chain 8453 \
  --amount 10000000000000000000
```

### Monitor and Auto-Withdraw

```bash
# Start monitoring for destination escrows
deno run alice.ts --action monitor
```

### List Orders

```bash
# View all pending orders
deno run alice.ts --action list
```

## Security Features

1. **EIP-712 Signatures**: Orders are cryptographically signed using EIP-712
   standard
2. **HTLC Protection**: Hash-time-locked contracts ensure atomic execution
3. **Extension Validation**: Post-interactions are validated by the protocol
4. **Secret Management**: Secrets stored securely using Deno KV

## Technical Details

### EIP-712 Domain

```javascript
{
  name: "Bridge-Me-Not Orders",
  version: "1",
  chainId: chainId,
  verifyingContract: LIMIT_ORDER_PROTOCOL
}
```

### MakerTraits Encoding

- **Bit 255**: hasExtension flag (set to 1 for post-interaction)
- **Bits 0-79**: Expiration timestamp (0 for no expiration)
- **Bit 80**: allowPartialFill (0 for atomic swaps)

### Post-Interaction Encoding

```
[20 bytes: factory address][remaining bytes: postSourceEscrow calldata]
```

## Environment Variables

```bash
# Required
ALICE_PRIVATE_KEY=0x...     # Alice's private key
ANKR_API_KEY=...            # Ankr RPC API key

# Optional
INDEXER_URL=http://localhost:42069  # Ponder indexer URL
DRY_RUN=false                        # Set to false for real transactions
```

## Testing

### Dry Run Test

```bash
DRY_RUN=true deno run test-limit-order.ts
```

### Integration Test

```bash
# Requires funded account on mainnet
DRY_RUN=false deno run test-limit-order.ts
```

## Architecture Benefits

1. **Decentralized**: Uses 1inch's established limit order protocol
2. **Gas Efficient**: Single transaction creates order and triggers escrow
3. **Composable**: Post-interactions allow complex workflows
4. **Standard**: EIP-712 signatures are widely supported

## Next Steps

1. **Resolver Integration**: Update resolver to monitor and fill limit orders
2. **Order Book**: Integrate with 1inch API for order discovery
3. **Multi-Asset**: Support different tokens on source/destination
4. **Fee Structure**: Implement resolver incentives

## References

- [1inch Limit Order Protocol v4](https://docs.1inch.io/docs/limit-order-protocol/introduction)
- [EIP-712 Specification](https://eips.ethereum.org/EIPS/eip-712)
- [Bridge-Me-Not Contracts](https://github.com/bridge-me-not/bmn-evm-contracts)
