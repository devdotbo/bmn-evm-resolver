# Indexer Integration Guide

The Bridge-Me-Not Resolver supports optional integration with the Ponder indexer for enhanced monitoring capabilities.

## Overview

The resolver can operate in three modes:

1. **Event-Only Mode** (default): Uses WebSocket/RPC event monitoring
2. **Indexer-Only Mode**: Uses the Ponder indexer for order discovery and secret reveals
3. **Hybrid Mode**: Uses both indexer and events for redundancy

## Configuration

### Environment Variables

```bash
# Indexer Configuration
INDEXER_URL=http://localhost:42069/sql    # Ponder SQL endpoint
INDEXER_TABLE_PREFIX=                     # Optional table prefix

# Feature Flags
USE_INDEXER_FOR_ORDERS=false             # Use indexer for order discovery
USE_INDEXER_FOR_SECRETS=false            # Use indexer for secret reveals
HYBRID_MODE=false                         # Enable both indexer and events
ETH_SAFETY_DEPOSITS=true                  # Support ETH safety deposits

# Monitoring Configuration
INDEXER_POLLING_INTERVAL=5000             # Indexer polling interval (ms)
BLOCK_POLLING_INTERVAL=3000               # Event polling interval (ms)
EVENT_BATCH_SIZE=100                      # Event batch size

# Profitability Configuration
MIN_PROFIT_BPS=50                         # Minimum profit (0.5%)
MAX_SLIPPAGE_BPS=100                      # Maximum slippage (1%)
```

## Running with Indexer

### 1. Start the Indexer

First, ensure the Ponder indexer is running in the bmn-evm-indexer directory:

```bash
cd ../bmn-evm-indexer
pnpm dev
```

### 2. Enable Indexer Features

```bash
# Enable indexer for order discovery
export USE_INDEXER_FOR_ORDERS=true

# Enable indexer for secret reveals
export USE_INDEXER_FOR_SECRETS=true

# Or enable hybrid mode for redundancy
export HYBRID_MODE=true
```

### 3. Start the Resolver

```bash
deno task resolver:start
```

## Benefits of Indexer Integration

### 1. **Performance**
- Efficient querying of historical data
- Reduced RPC calls
- Faster order discovery

### 2. **Reliability**
- Handles chain reorganizations
- Persistent state across restarts
- No missed events

### 3. **Advanced Queries**
- Filter orders by profitability
- Query orders by status
- Aggregate statistics

## Indexer Queries Available

The resolver uses the following indexer queries:

- `getPendingOrders()` - Orders awaiting resolver action
- `getActiveOrders()` - Orders with both escrows deployed
- `getRevealedSecret()` - Get revealed secrets for orders
- `subscribeToNewOrders()` - Real-time order notifications
- `subscribeToSecretReveals()` - Real-time secret reveals

## Fallback Behavior

If the indexer is unavailable:
1. The resolver automatically falls back to event monitoring
2. A warning is logged but operation continues
3. The resolver periodically attempts to reconnect

## Testing Indexer Integration

Use the provided test script:

```bash
./scripts/test-indexer-integration.sh
```

This script:
- Checks indexer availability
- Shows current configuration
- Starts the resolver with appropriate settings

## Monitoring

The resolver provides statistics including indexer status:

```bash
deno task resolver:status
```

Output includes:
- Indexer connection status
- Latest indexed block
- Sync status
- Active monitoring mode

## Mainnet Configuration

For mainnet deployment:

```bash
# Base Mainnet
export INDEXER_URL=https://your-indexer.com/sql
export SRC_CHAIN_ID=8453
export DST_CHAIN_ID=42793

# Enable indexer features
export USE_INDEXER_FOR_ORDERS=true
export USE_INDEXER_FOR_SECRETS=true

# Production settings
export MIN_PROFIT_BPS=100  # 1% minimum
export MAX_CONCURRENT_ORDERS=20
```

## Troubleshooting

### Indexer Not Connecting
- Check `INDEXER_URL` is correct
- Verify indexer is running
- Check network connectivity

### Orders Not Being Discovered
- Verify `USE_INDEXER_FOR_ORDERS=true`
- Check indexer is synced to latest block
- Verify contract addresses match

### Performance Issues
- Adjust `INDEXER_POLLING_INTERVAL`
- Enable `HYBRID_MODE` for redundancy
- Check indexer query performance