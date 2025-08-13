# Wagmi Core Integration Guide

## Overview

We've integrated `@wagmi/cli` to automatically generate TypeScript bindings for all smart contracts. This provides:

- ✅ Type-safe contract interactions
- ✅ Auto-completion for function names and arguments
- ✅ Compile-time error checking
- ✅ Automatic ABI synchronization
- ✅ Support for multiple chains

## Setup

### 1. Installation

Dependencies are already added to `deno.json`:

```json
{
  "imports": {
    "@wagmi/core": "npm:@wagmi/core@^2.19.0",
    "@wagmi/cli": "npm:@wagmi/cli@^2.4.0"
  }
}
```

### 2. Generate Contract Types

```bash
# Generate TypeScript bindings
deno task wagmi:generate

# Watch mode for development
deno task wagmi:watch
```

This creates `src/generated/contracts.ts` with all contract ABIs and addresses.

## Migration Examples

### Before: Manual ABI Import

```typescript
// Old way - manual ABI import
import SimpleLimitOrderProtocolAbi from "../../abis/SimpleLimitOrderProtocol.json" with { type: "json" };

const result = await client.readContract({
  address: "0xe767105dcfB3034a346578afd2aFD8e583171489",
  abi: SimpleLimitOrderProtocolAbi.abi,
  functionName: "hashOrder",
  args: [order],
});
```

### After: Using Generated Types

```typescript
// New way - using generated types
import {
  simpleLimitOrderProtocolAbi,
  simpleLimitOrderProtocolAddress,
} from "../generated/contracts.ts";

const result = await client.readContract({
  address: simpleLimitOrderProtocolAddress[chainId],
  abi: simpleLimitOrderProtocolAbi,
  functionName: "hashOrder", // Type-safe with auto-completion!
  args: [order], // Type-checked arguments!
});
```

## Using @wagmi/core

### Option 1: Direct with Viem (Current Approach)

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { simpleLimitOrderProtocolAbi, simpleLimitOrderProtocolAddress } from "../generated/contracts.ts";

const client = createPublicClient({
  chain: base,
  transport: http(),
});

// Use generated ABI and addresses
const orderHash = await client.readContract({
  address: simpleLimitOrderProtocolAddress[8453],
  abi: simpleLimitOrderProtocolAbi,
  functionName: "hashOrder",
  args: [order],
});
```

### Option 2: Using @wagmi/core

```typescript
import { createConfig, readContract, writeContract } from "@wagmi/core";
import { base, optimism } from "viem/chains";
import {
  simpleLimitOrderProtocolAbi,
  simpleLimitOrderProtocolAddress,
} from "../generated/contracts.ts";

// Create config once
const config = createConfig({
  chains: [base, optimism],
  transports: {
    [base.id]: http(),
    [optimism.id]: http(),
  },
});

// Read contract
const orderHash = await readContract(config, {
  chainId: 8453,
  address: simpleLimitOrderProtocolAddress[8453],
  abi: simpleLimitOrderProtocolAbi,
  functionName: "hashOrder",
  args: [order],
});

// Write contract
const hash = await writeContract(config, {
  chainId: 8453,
  account,
  address: simpleLimitOrderProtocolAddress[8453],
  abi: simpleLimitOrderProtocolAbi,
  functionName: "fillOrderArgs",
  args: [order, r, vs, amount, takerTraits, args],
});
```

## Available Generated Contracts

The following contracts are available in `src/generated/contracts.ts`:

### Core Contracts

- `simpleLimitOrderProtocolAbi` / `simpleLimitOrderProtocolAddress`
- `simplifiedEscrowFactoryV2_3Abi` / `simplifiedEscrowFactoryV2_3Address`
- `simplifiedEscrowFactoryAbi`

### Escrow Contracts

- `escrowSrcV2Abi`
- `escrowDstV2Abi`
- `escrowDstAbi`

### Token Interfaces

- `ierc20Abi`

## Benefits of Using Generated Types

### 1. Type Safety

```typescript
// ❌ Old way - no type checking
await client.readContract({
  functionName: "hashOrdr", // Typo! Runtime error
  args: ["wrong", "types"], // Wrong args! Runtime error
});

// ✅ New way - compile-time checking
await client.readContract({
  functionName: "hashOrder", // Auto-completed
  args: [order], // Type-checked
});
```

### 2. Auto-completion

All function names, argument types, and return types are auto-completed in your IDE.

### 3. Automatic Updates

When ABIs change, just re-run generation:

```bash
deno task wagmi:generate
```

### 4. Multi-chain Support

```typescript
// Addresses are available for each chain
const baseAddress = simpleLimitOrderProtocolAddress[8453];
const optimismAddress = simpleLimitOrderProtocolAddress[10];
```

## Configuration

The wagmi configuration is in `wagmi.config.ts`:

```typescript
export default defineConfig({
  out: "src/generated/contracts.ts",
  contracts: [
    {
      name: "SimpleLimitOrderProtocol",
      abi: loadAbi("./abis/SimpleLimitOrderProtocol.json"),
      address: {
        10: "0xe767105dcfB3034a346578afd2aFD8e583171489",
        8453: "0xe767105dcfB3034a346578afd2aFD8e583171489",
      },
    },
    // ... more contracts
  ],
});
```

## Best Practices

1. **Always use generated types** instead of manual ABI imports
2. **Run generation** after updating ABIs: `deno task wagmi:generate`
3. **Use chain-specific addresses**: `contractAddress[chainId]`
4. **Leverage type safety**: Let TypeScript catch errors at compile time
5. **Keep ABIs updated**: Run `deno task abis:sync` regularly

## Example: Complete Migration

### Before

```typescript
// src/utils/limit-order.ts
import SimpleLimitOrderProtocolAbi from "../../abis/SimpleLimitOrderProtocol.json" with {
  type: "json",
};

export async function fillLimitOrder(
  client: PublicClient,
  wallet: WalletClient,
  protocolAddress: Address,
  params: FillOrderParams,
  factoryAddress: Address,
): Promise<FillOrderResult> {
  const { request } = await client.simulateContract({
    address: protocolAddress,
    abi: SimpleLimitOrderProtocolAbi.abi,
    functionName: "fillOrderArgs",
    args: [order, r, vs, amount, takerTraits, args],
  });
  // ...
}
```

### After

```typescript
// src/utils/limit-order.ts
import {
  simpleLimitOrderProtocolAbi,
  simpleLimitOrderProtocolAddress,
} from "../generated/contracts.ts";

export async function fillLimitOrder(
  client: PublicClient,
  wallet: WalletClient,
  chainId: 8453 | 10,
  params: FillOrderParams,
  factoryAddress: Address,
): Promise<FillOrderResult> {
  const { request } = await client.simulateContract({
    address: simpleLimitOrderProtocolAddress[chainId],
    abi: simpleLimitOrderProtocolAbi,
    functionName: "fillOrderArgs", // Type-safe!
    args: [order, r, vs, amount, takerTraits, args], // Type-checked!
  });
  // ...
}
```

## Troubleshooting

### Issue: Generated file not updating

```bash
# Clear cache and regenerate
rm -rf node_modules
deno cache --reload deno.json
deno task wagmi:generate
```

### Issue: Type errors after generation

Make sure to:
1. Update imports to use generated contracts
2. Use correct chain IDs (8453 for Base, 10 for Optimism)
3. Match function signatures exactly

### Issue: Missing contract in generation

Add it to `wagmi.config.ts`:

```typescript
{
  name: "YourContract",
  abi: loadAbi("./abis/YourContract.json"),
  address: {
    10: "0x...", // Optimism
    8453: "0x...", // Base
  },
}
```

## Next Steps

1. ✅ Generated contracts are ready at `src/generated/contracts.ts`
2. 🔄 Migrate existing code to use generated types
3. 🚀 Enjoy type-safe contract interactions!
4. 📚 See `src/utils/wagmi-contracts.ts` for usage examples