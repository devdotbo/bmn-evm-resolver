# Bridge-Me-Not Resolver (Simplified)

Minimal cross-chain atomic swap resolver for Base <-> Optimism using the Bridge-Me-Not protocol.

## Setup

1. Copy environment configuration:
```bash
cp .env.example .env
```

2. Ensure the indexer is running:
```bash
cd ../bmn-evm-contracts-indexer
npm run dev
```

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

## Architecture

- **Resolver**: Monitors orders via indexer, deploys destination escrows, claims source funds
- **Alice**: Creates orders, withdraws from destination by revealing secret
- **Indexer**: Ponder-based indexer tracking on-chain events (SQL over HTTP)

## Contract Addresses (CREATE3 - same on all chains)

- Factory: `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68` (SimplifiedEscrowFactory v2.2.0)
- BMN Token: `0x8287CD2aC7E227D9D927F998EB600a0683a832A1`