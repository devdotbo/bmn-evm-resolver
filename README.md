# Bridge-Me-Not Resolver (v2.3)

Cross-chain atomic swap resolver for BMN token exchanges between Base and Optimism using 1inch Limit Orders with PostInteraction.

## 📊 Status

**✅ ACTIVE** — Core flow unblocked. See updated [STATUS.md](STATUS.md) and [CHANGELOG.md](CHANGELOG.md).

## 🚀 Features

- **Type-safe contract interactions** via Wagmi CLI code generation
  - Auto-generated TypeScript bindings for all contracts
  - Pre-built action functions for cleaner code
- **Cross-chain atomic swaps** between Base and Optimism
- **1inch Limit Order Protocol** integration with PostInteraction
- **Automated escrow management** for secure token transfers
- **Event monitoring** via Ponder indexer

## Setup

1. Copy environment configuration:

```bash
cp .env.example .env
```

2. Configure environment variables in `.env`:
   - `ALICE_PRIVATE_KEY` - Alice wallet private key
   - `BOB_PRIVATE_KEY` - Bob/Resolver wallet private key  
   - `ANKR_API_KEY` - Ankr API key for RPC access
   - `INDEXER_URL` - Ponder indexer URL (default: Railway hosted)

3. Generate TypeScript contract bindings:

```bash
# Install dependencies
deno install

# Generate contract types
deno task wagmi:generate

# Or watch mode for development
deno task wagmi:watch
```

## Usage

```bash
# Bob‑Resolver (taker/coordinator)
deno task bob

# Alice service (initiator)
deno task alice

# File-based CLI (per plan.md, fresh context)
# 1) Create order
deno task order:create -- --src 8453 --dst 10 --srcAmount 10000000000000000 --dstAmount 10000000000000000 --resolver 0x...

# 2) Execute swap (fill + create dst escrow)
deno task swap:execute -- --file ./data/orders/pending/0xHASHLOCK.json

# 3) Withdraw on destination (Alice)
deno task withdraw:dst -- --hashlock 0xHASHLOCK

# 4) Withdraw on source (Bob)
deno task withdraw:src -- --hashlock 0xHASHLOCK

# 5) Status
deno task status -- --hashlock 0xHASHLOCK
```

Notes:
- For PoC, secrets are also written to `data/secrets/{hashlock}.json`.
- On-chain simulation in `swap:execute` may revert without funded keys/allowances; wiring is in place using wagmi actions.

Services:
- Alice API: http://localhost:8001/health and http://localhost:8001/docs
- Bob-Resolver API: http://localhost:8002/health

### Create an order

Use the oRPC API (Scalar UI at `/docs`) or the new CLIs (see `plan.md`).

For contributors: read `STATUS.md` first each session. It contains a short runbook and grep commands to verify state.

## Architecture (Two-Party Atomic Swaps)

- **Bob-Resolver**: Unified service that acts as both coordinator and
  counterparty
  - Monitors orders via indexer
  - Fills profitable limit orders
  - Deploys destination escrows
  - Claims source funds when secrets are revealed
- **Alice**: Creates orders, withdraws from destination by revealing secret
- **Indexer**: Ponder-based indexer tracking on-chain events (SQL over HTTP)
  - Client uses `@ponder/client` to query SQL-over-HTTP at `/sql` (per docs)

## Contract Addresses (CREATE3 - same on all chains)

- Factory: `0xdebE6F4bC7BaAD2266603Ba7AfEB3BB6dDA9FE0A` (SimplifiedEscrowFactory v2.3.0)
- BMN Token: `0x8287CD2aC7E227D9D927F998EB600a0683a832A1`
- Limit Order Protocol: `0xe767105dcfB3034a346578afd2aFD8e583171489`

## Development

### Type-Safe Contract Interactions

This project uses Wagmi CLI for automatic TypeScript generation from contract ABIs:

```typescript
// Import generated types and actions
import {
  simpleLimitOrderProtocolAddress,
  readSimpleLimitOrderProtocolHashOrder,
} from "./src/generated/contracts.ts";

// Option 1: Use generated action functions (NEW!)
const orderHash = await readSimpleLimitOrderProtocolHashOrder(config, {
  address: simpleLimitOrderProtocolAddress[8453], // Base
  args: [order], // Type-checked!
});

// Option 2: Traditional approach with ABIs
const orderHash = await client.readContract({
  address: simpleLimitOrderProtocolAddress[8453],
  abi: simpleLimitOrderProtocolAbi,
  functionName: "hashOrder", // Auto-completed!
  args: [order],
});
```

See [WAGMI_MIGRATION_GUIDE.md](docs/WAGMI_MIGRATION_GUIDE.md) for migration details.
