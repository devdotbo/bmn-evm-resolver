# Bridge-Me-Not Resolver (v2.3)

Cross-chain atomic swap resolver for BMN token exchanges between Base and Optimism using 1inch Limit Orders with PostInteraction.

## 📊 Status

**⚠️ BLOCKED** - See [CURRENT_STATUS.md](CURRENT_STATUS.md) and [Active Issues](ISSUES/active/)

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

## Usage

### Run Resolver (Bob - Liquidity Provider)

```bash
deno task resolver
```

### Alice Client Commands

Create an order:

```bash
deno task alice --action create --resolver 0xYourResolverAddress
```

List orders:

```bash
deno task alice --action list
```

Withdraw from destination (reveals secret):

```bash
deno task alice --action withdraw --order 0xOrderHash
```

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

- Factory: `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68` (SimplifiedEscrowFactory
  v2.2.0)
- BMN Token: `0x8287CD2aC7E227D9D927F998EB600a0683a832A1`
