# Bridge-Me-Not Resolver (v2.3)

Cross-chain atomic swap resolver for BMN token exchanges between Base and Optimism using 1inch Limit Orders with PostInteraction.

## 📊 Status

**✅ ACTIVE** — Core flow unblocked. Lint/type-check gates enabled. See updated [STATUS.md](STATUS.md) and [CHANGELOG.md](CHANGELOG.md).

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

# Generate contract types (required by CLI tools)
deno task wagmi:generate

# Or watch mode for development
deno task wagmi:watch
```

## Usage

```bash
# File-based CLI (preferred)
# - Services are optional and not wired as tasks; use CLIs below

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

### End-to-end CLI flow (copy-paste)

Use this sequence to run a full Base → Optimism swap locally with the CLI.

```bash
# 1) One-time setup
cp .env.example .env
# Edit .env → set ALICE_PRIVATE_KEY, BOB_PRIVATE_KEY or RESOLVER_PRIVATE_KEY, and ANKR_API_KEY

# 2) Generate TypeScript contract bindings (required by CLIs)
deno task wagmi:generate

# (optional) Preflight checks
deno task check:balances
deno run -A --unstable-kv --env-file=.env cli/check-allowances.ts
deno task approvals:ensure

# 3) Create an order (set your resolver/taker address!)
export SRC=8453 DST=10
export RESOLVER=0x...   # replace with your taker key address
export SRC_AMT=10000000000000000    # 0.01 BMN
export DST_AMT=10000000000000000    # 0.01 BMN
HASH=$(deno task order:create -- --src $SRC --dst $DST --srcAmount $SRC_AMT --dstAmount $DST_AMT --resolver $RESOLVER | tail -1)

# 4) Bob/Resolver executes: approvals → fill → create destination escrow
deno task swap:execute -- --file ./data/orders/pending/$HASH.json

# 5) Alice withdraws on destination (waits until window opens)
deno task withdraw:dst -- --hashlock $HASH --wait

# 6) Bob/Resolver withdraws on source
deno task withdraw:src -- --hashlock $HASH

# 7) Check status anytime (omit --hashlock to list all)
deno task status -- --hashlock $HASH
```

Notes:
- The `resolver` you pass to `order:create` must match the taker key used at `swap:execute`.
- CLIs automatically use `--env-file=.env` and RPCs derived from `ANKR_API_KEY`.
- Optional cast-based variants for debugging: `deno task cast:fill`, `deno task create:dst`, `deno task cast:withdraw:dst`.

Notes:
- For PoC, secrets are also written to `data/secrets/{hashlock}.json`.
- CLIs use wagmi-generated actions from `src/generated/contracts.ts` and RPCs derived from `ANKR_API_KEY` via `cli/cli-config.ts`.
- On errors, CLIs log full error chains and revert selector/data via `cli/logging.ts`. Catch handlers print full errors.
- PostInteraction parsing: strip a 32-byte offsets header, then read 20-byte factory + ABI payload.

## Linting & Formatting

- We use `deno lint` and `deno fmt` per Deno best practices.
- Authored code is linted; generated/indexer artifacts are excluded via `deno.json`.
- See Deno docs for configuration and formatting: [Deno Configuration → Formatting](https://docs.deno.com/runtime/fundamentals/configuration/#formatting).

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

// Example: use generated action
const orderHash = await readSimpleLimitOrderProtocolHashOrder(config, {
  chainId: 8453,
  args: [order],
});

// Traditional approach (viem)
const orderHash2 = await client.readContract({
  address: simpleLimitOrderProtocolAddress[8453],
  abi: simpleLimitOrderProtocolAbi,
  functionName: "hashOrder",
  args: [order],
});
```

See [WAGMI_MIGRATION_GUIDE.md](docs/WAGMI_MIGRATION_GUIDE.md) for migration details.
