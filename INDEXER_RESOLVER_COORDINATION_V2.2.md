# Indexer-Resolver Coordination for v2.2.0

## Overview

This document outlines the coordination points between the resolver and indexer
for the v2.2.0 PostInteraction update.

## Key Changes in v2.2.0

### Resolver Changes (Completed)

1. **Factory Address Updated**: `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68`
2. **PostInteraction Integration**: Orders now use PostInteraction for atomic
   escrow creation
3. **Token Approvals**: Resolver approves factory for token transfers
4. **Event Monitoring**: Added PostInteractionExecuted event monitoring
5. **Error Handling**: Comprehensive error handling with retry logic

### Indexer Requirements

#### 1. New Events to Index

**PostInteractionExecuted Event**

```solidity
event PostInteractionExecuted(
    bytes32 indexed orderHash,
    address indexed taker,
    address srcEscrow,
    address dstEscrow
)
```

- **Source**: SimplifiedEscrowFactory
  (0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68)
- **Purpose**: Links orders to their created escrows
- **Critical Fields**: orderHash, srcEscrow, dstEscrow

**PostInteractionFailed Event** (Optional but recommended)

```solidity
event PostInteractionFailed(
    bytes32 indexed orderHash,
    address indexed taker,
    string reason
)
```

- **Source**: SimplifiedEscrowFactory
- **Purpose**: Track failed PostInteraction attempts for debugging

#### 2. Database Schema Updates

**Suggested new tables/columns:**

```sql
-- Add to existing orders table
ALTER TABLE limit_orders ADD COLUMN post_interaction_tx_hash VARCHAR(66);
ALTER TABLE limit_orders ADD COLUMN post_interaction_status VARCHAR(20); -- 'pending', 'executed', 'failed'
ALTER TABLE limit_orders ADD COLUMN src_escrow_address VARCHAR(42);
ALTER TABLE limit_orders ADD COLUMN dst_escrow_address VARCHAR(42);

-- New table for PostInteraction events
CREATE TABLE post_interaction_events (
    id SERIAL PRIMARY KEY,
    order_hash VARCHAR(66) NOT NULL,
    taker_address VARCHAR(42) NOT NULL,
    src_escrow VARCHAR(42),
    dst_escrow VARCHAR(42),
    status VARCHAR(20) NOT NULL, -- 'executed', 'failed'
    failure_reason TEXT,
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_hash (order_hash),
    INDEX idx_taker (taker_address),
    INDEX idx_escrows (src_escrow, dst_escrow)
);
```

#### 3. Event Processing Flow

1. **Monitor SimpleLimitOrderProtocol** for order fills
2. **In same transaction**, check for PostInteractionExecuted events
3. **Link escrows** to orders using the orderHash
4. **Update order status** to reflect PostInteraction result

#### 4. API Endpoints to Update

**GET /api/orders/{orderHash}** Add fields:

- `postInteractionStatus`: Status of PostInteraction execution
- `srcEscrow`: Source escrow address (if created)
- `dstEscrow`: Destination escrow address (if created)
- `postInteractionTxHash`: Transaction that executed PostInteraction

**GET /api/escrows/by-order/{orderHash}** New endpoint to get escrows created
for a specific order

**GET /api/post-interactions** List all PostInteraction events with filtering
options

## Coordination Points

### 1. Order Hash Consistency

- **Resolver**: Calculates order hash using 1inch protocol's hashOrder function
- **Indexer**: Must use same hash calculation or extract from events
- **Critical**: Order hash links orders to escrows via PostInteraction

### 2. Event Timing

- PostInteractionExecuted occurs in SAME transaction as order fill
- Escrow creation events (EscrowCreated) also in same transaction
- Indexer should process all events from a transaction atomically

### 3. Error Scenarios

- If PostInteraction fails, order is still filled but no escrows created
- Indexer should track these failures for debugging
- Resolver will retry with new order if PostInteraction fails

### 4. Backward Compatibility

- Old orders (pre-v2.2.0) won't have PostInteraction events
- Indexer should handle both old and new order formats
- Use factory address to determine version

## Implementation Checklist for Indexer

- [ ] Update factory address to v2.2.0 address
- [ ] Add PostInteractionExecuted event listener
- [ ] Add PostInteractionFailed event listener (optional)
- [ ] Update database schema with new fields
- [ ] Link orders to escrows via orderHash
- [ ] Update API to expose PostInteraction data
- [ ] Handle backward compatibility for old orders
- [ ] Test with both successful and failed PostInteractions
- [ ] Add monitoring for PostInteraction success rate

## Testing Coordination

### Test Scenarios

1. **Happy Path**: Order filled → PostInteraction executed → Escrows created
2. **Failure Case**: Order filled → PostInteraction failed → No escrows
3. **Retry Case**: Failed PostInteraction → New order → Success
4. **Mixed Version**: Some orders with PostInteraction, some without

### Test Data

- Resolver will create test orders with known hashes
- Indexer should verify correct linking of orders to escrows
- Both should verify same escrow addresses calculated

## Monitoring & Alerts

### Key Metrics

1. PostInteraction success rate
2. Average time from order to escrow creation
3. Number of orphaned orders (filled but no escrows)
4. Factory approval status for resolvers

### Alerts

- PostInteraction failure rate > 5%
- Resolver not whitelisted on factory
- Factory paused
- Escrow creation events without PostInteraction

## Deployment Sequence

1. **Indexer Update**: Deploy indexer with v2.2.0 support
2. **Database Migration**: Add new fields and tables
3. **Resolver Update**: Deploy resolver with PostInteraction
4. **Monitoring**: Enable alerts and metrics
5. **Testing**: Run test transactions on mainnet
6. **Go Live**: Enable for production orders

## Contact Points

- **Resolver Issues**: Check this document and resolver logs
- **Indexer Issues**: Check indexer logs and database
- **Coordination**: Both teams should communicate during deployment

## Appendix: Key Addresses

- **Factory v2.2.0**: `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68`
- **Factory v2.1.0** (old, deprecated):
  `0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A`
- **Limit Order Protocol Base**: `0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06`
- **Limit Order Protocol Optimism**:
  `0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7`
- **BMN Token**: `0x8287CD2aC7E227D9D927F998EB600a0683a832A1`
