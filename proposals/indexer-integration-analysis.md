# Bridge-Me-Not Indexer Integration Analysis

## Executive Summary

This document analyzes the integration of the Ponder indexer (`bmn-evm-indexer`) with the Bridge-Me-Not resolver to enable efficient real-time monitoring and querying of cross-chain atomic swap events. The indexer currently indexes WETH9 events but needs to be configured to track Bridge-Me-Not protocol events across multiple chains. The integration will leverage Ponder's SQL over HTTP API and the `@ponder/client` npm package for type-safe, efficient data access.

## Technical Architecture Overview

### Current State
- **Indexer**: Ponder-based indexer configured for WETH9 contract events on mainnet, Base, Optimism, and Polygon
- **Resolver**: Viem-based resolver using polling to monitor events
- **Gap**: No Bridge-Me-Not specific events indexed, resolver relies on inefficient RPC polling

### Proposed Architecture
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   EVM Chains    │────▶│  Ponder Indexer  │────▶│    Resolver     │
│  (Events)       │     │  (PostgreSQL)    │     │  (@ponder/client)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │   API Endpoints  │
                        │  - SQL over HTTP │
                        │  - GraphQL       │
                        └──────────────────┘
```

## Available Endpoints and Queries

### 1. SQL over HTTP API
- **Endpoint**: `http://localhost:42069/sql/*`
- **Features**: 
  - Zero-codegen type inference
  - Live queries with real-time updates
  - Full SQL flexibility
  - Read-only transactions for security

### 2. GraphQL API
- **Endpoints**: 
  - `http://localhost:42069/`
  - `http://localhost:42069/graphql`
- **Features**: Standard GraphQL queries with auto-generated schema

## Critical Events to Index

### 1. Order Creation and Management
```solidity
// From LimitOrderProtocol
event OrderFilled(bytes32 orderHash, uint256 remainingAmount);
event OrderCancelled(bytes32 orderHash);
```

### 2. Escrow Deployment
```solidity
// From EscrowFactory
event SrcEscrowCreated(
    IBaseEscrow.Immutables srcImmutables,
    IEscrowFactory.DstImmutablesComplement dstImmutablesComplement
);

event DstEscrowCreated(
    address escrow,
    bytes32 hashlock,
    uint256 taker  // Address type stored as uint256
);
```

### 3. Escrow Operations
```solidity
// From EscrowSrc/EscrowDst
event EscrowWithdrawal(address token, address to, uint256 amount);
event EscrowCancelled();
event FundsRescued(address token, uint256 amount);
```

## Integration Approach with Code Examples

### 1. Update Ponder Configuration

First, configure the indexer to track Bridge-Me-Not contracts:

```typescript
// ponder.config.ts
import { createConfig } from "ponder";
import { limitOrderProtocolAbi } from "./abis/LimitOrderProtocol";
import { escrowFactoryAbi } from "./abis/EscrowFactory";
import { escrowSrcAbi } from "./abis/EscrowSrc";
import { escrowDstAbi } from "./abis/EscrowDst";

export default createConfig({
  ordering: "multichain",
  chains: {
    chainA: {
      id: 1337,
      rpc: process.env.PONDER_RPC_URL_1337 || "http://localhost:8545",
      ws: process.env.PONDER_WS_URL_1337 || "ws://localhost:8545",
    },
    chainB: {
      id: 1338,
      rpc: process.env.PONDER_RPC_URL_1338 || "http://localhost:8546",
      ws: process.env.PONDER_WS_URL_1338 || "ws://localhost:8546",
    },
    // Production chains
    mainnet: { id: 1, rpc: process.env.PONDER_RPC_URL_1 },
    base: { id: 8453, rpc: process.env.PONDER_RPC_URL_8453 },
    optimism: { id: 10, rpc: process.env.PONDER_RPC_URL_10 },
    polygon: { id: 137, rpc: process.env.PONDER_RPC_URL_137 },
  },
  contracts: {
    limitOrderProtocol: {
      abi: limitOrderProtocolAbi,
      startBlock: 0, // Or specific block for production
      chain: {
        chainA: { address: process.env.LIMIT_ORDER_PROTOCOL_CHAIN_A },
        chainB: { address: process.env.LIMIT_ORDER_PROTOCOL_CHAIN_B },
        // Add production addresses
      },
    },
    escrowFactory: {
      abi: escrowFactoryAbi,
      startBlock: 0,
      chain: {
        chainA: { address: process.env.ESCROW_FACTORY_CHAIN_A },
        chainB: { address: process.env.ESCROW_FACTORY_CHAIN_B },
      },
    },
    // Dynamic escrow contracts will be tracked via factory events
  },
});
```

### 2. Define Schema for Indexed Data

```typescript
// ponder.schema.ts
import { onchainTable } from "ponder";

// Orders table
export const orders = onchainTable("orders", (t) => ({
  orderHash: t.hex().primaryKey(),
  maker: t.hex().notNull(),
  receiver: t.hex().notNull(),
  makerAsset: t.hex().notNull(),
  takerAsset: t.hex().notNull(),
  makingAmount: t.bigint().notNull(),
  takingAmount: t.bigint().notNull(),
  remainingAmount: t.bigint().notNull(),
  sourceChainId: t.integer().notNull(),
  status: t.text().notNull(), // 'active', 'filled', 'cancelled'
  createdAt: t.bigint().notNull(),
  updatedAt: t.bigint().notNull(),
}));

// Source escrows table
export const srcEscrows = onchainTable("src_escrows", (t) => ({
  escrowAddress: t.hex().primaryKey(),
  orderHash: t.hex().notNull().references(() => orders.orderHash),
  hashlock: t.hex().notNull(),
  maker: t.hex().notNull(),
  taker: t.hex().notNull(),
  token: t.hex().notNull(),
  amount: t.bigint().notNull(),
  safetyDeposit: t.bigint().notNull(),
  timelocks: t.bigint().notNull(),
  chainId: t.integer().notNull(),
  status: t.text().notNull(), // 'active', 'withdrawn', 'cancelled', 'rescued'
  createdAt: t.bigint().notNull(),
  createdTxHash: t.hex().notNull(),
}));

// Destination escrows table
export const dstEscrows = onchainTable("dst_escrows", (t) => ({
  escrowAddress: t.hex().primaryKey(),
  orderHash: t.hex().notNull().references(() => orders.orderHash),
  hashlock: t.hex().notNull(),
  taker: t.hex().notNull(),
  srcChainId: t.integer().notNull(),
  dstChainId: t.integer().notNull(),
  dstToken: t.hex().notNull(),
  dstAmount: t.bigint().notNull(),
  dstSafetyDeposit: t.bigint().notNull(),
  status: t.text().notNull(), // 'active', 'withdrawn', 'cancelled', 'rescued'
  createdAt: t.bigint().notNull(),
  createdTxHash: t.hex().notNull(),
}));

// Withdrawals table (tracks secret reveals)
export const withdrawals = onchainTable("withdrawals", (t) => ({
  id: t.hex().primaryKey(), // txHash + logIndex
  escrowAddress: t.hex().notNull(),
  token: t.hex().notNull(),
  to: t.hex().notNull(),
  amount: t.bigint().notNull(),
  secret: t.hex(), // Extracted from transaction input data
  chainId: t.integer().notNull(),
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
}));

// Index for efficient queries
export const ordersByMaker = onchainTable("orders_by_maker", (t) => ({
  maker: t.hex().notNull(),
  orderHash: t.hex().notNull().references(() => orders.orderHash),
}));
```

### 3. Implement Event Indexing Logic

```typescript
// src/index.ts
import { ponder } from "ponder:registry";
import { orders, srcEscrows, dstEscrows, withdrawals } from "ponder:schema";

// Index order creation from SrcEscrowCreated events
ponder.on("escrowFactory:SrcEscrowCreated", async ({ event, context }) => {
  const { srcImmutables, dstImmutablesComplement } = event.args;
  
  // Create or update order
  await context.db
    .insert(orders)
    .values({
      orderHash: srcImmutables.orderHash,
      maker: context.decodeAddress(srcImmutables.maker),
      receiver: context.decodeAddress(srcImmutables.maker), // Assuming maker is receiver
      makerAsset: context.decodeAddress(srcImmutables.token),
      takerAsset: context.decodeAddress(dstImmutablesComplement.token),
      makingAmount: srcImmutables.amount,
      takingAmount: dstImmutablesComplement.amount,
      remainingAmount: srcImmutables.amount,
      sourceChainId: context.chainId,
      status: "active",
      createdAt: event.block.timestamp,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  // Calculate escrow address
  const escrowAddress = await calculateEscrowAddress(srcImmutables);
  
  // Index source escrow
  await context.db
    .insert(srcEscrows)
    .values({
      escrowAddress,
      orderHash: srcImmutables.orderHash,
      hashlock: srcImmutables.hashlock,
      maker: context.decodeAddress(srcImmutables.maker),
      taker: context.decodeAddress(srcImmutables.taker),
      token: context.decodeAddress(srcImmutables.token),
      amount: srcImmutables.amount,
      safetyDeposit: srcImmutables.safetyDeposit,
      timelocks: srcImmutables.timelocks,
      chainId: context.chainId,
      status: "active",
      createdAt: event.block.timestamp,
      createdTxHash: event.transaction.hash,
    });
});

// Index destination escrow creation
ponder.on("escrowFactory:DstEscrowCreated", async ({ event, context }) => {
  const { escrow, hashlock, taker } = event.args;
  
  // Find matching source escrow by hashlock
  const srcEscrow = await context.db
    .select()
    .from(srcEscrows)
    .where(eq(srcEscrows.hashlock, hashlock))
    .limit(1);
    
  if (srcEscrow.length > 0) {
    await context.db
      .insert(dstEscrows)
      .values({
        escrowAddress: escrow,
        orderHash: srcEscrow[0].orderHash,
        hashlock,
        taker: context.decodeAddress(taker),
        srcChainId: srcEscrow[0].chainId,
        dstChainId: context.chainId,
        // Additional fields would be populated from transaction data
        status: "active",
        createdAt: event.block.timestamp,
        createdTxHash: event.transaction.hash,
      });
  }
});

// Index withdrawals (secret reveals)
ponder.on("escrowDst:EscrowWithdrawal", async ({ event, context }) => {
  const { token, to, amount } = event.args;
  
  // Extract secret from transaction input data
  const secret = extractSecretFromCalldata(event.transaction.input);
  
  await context.db
    .insert(withdrawals)
    .values({
      id: `${event.transaction.hash}-${event.logIndex}`,
      escrowAddress: event.log.address,
      token,
      to,
      amount,
      secret,
      chainId: context.chainId,
      timestamp: event.block.timestamp,
      txHash: event.transaction.hash,
    });
    
  // Update escrow status
  await context.db
    .update(dstEscrows)
    .set({ status: "withdrawn" })
    .where(eq(dstEscrows.escrowAddress, event.log.address));
});
```

### 4. Resolver Integration Code

```typescript
// src/resolver/indexer-client.ts
import { createClient } from "@ponder/client";
import type * as schema from "../../bmn-evm-indexer/ponder.schema";

export class IndexerClient {
  private client: ReturnType<typeof createClient>;
  
  constructor(indexerUrl: string = "http://localhost:42069/sql") {
    this.client = createClient(indexerUrl, { schema });
  }
  
  // Query pending orders (orders without matching dst escrows)
  async getPendingOrders(takerAddress: string) {
    const query = `
      SELECT 
        o.*,
        se.escrowAddress as srcEscrowAddress,
        se.chainId as srcChainId
      FROM orders o
      JOIN src_escrows se ON o.orderHash = se.orderHash
      LEFT JOIN dst_escrows de ON o.orderHash = de.orderHash
      WHERE 
        de.orderHash IS NULL
        AND o.status = 'active'
        AND se.taker = $1
      ORDER BY o.createdAt DESC
    `;
    
    return await this.client.query(query, [takerAddress]);
  }
  
  // Subscribe to new orders in real-time
  async subscribeToNewOrders(callback: (order: any) => void) {
    const subscription = this.client.live(
      `SELECT * FROM orders WHERE status = 'active' ORDER BY createdAt DESC`,
      callback
    );
    
    return subscription;
  }
  
  // Get revealed secrets from withdrawals
  async getRevealedSecret(orderHash: string): Promise<string | null> {
    const query = `
      SELECT w.secret
      FROM withdrawals w
      JOIN dst_escrows de ON w.escrowAddress = de.escrowAddress
      WHERE de.orderHash = $1
      LIMIT 1
    `;
    
    const result = await this.client.query(query, [orderHash]);
    return result[0]?.secret || null;
  }
  
  // Get order details with escrow information
  async getOrderDetails(orderHash: string) {
    const query = `
      SELECT 
        o.*,
        se.escrowAddress as srcEscrowAddress,
        se.chainId as srcChainId,
        se.status as srcStatus,
        de.escrowAddress as dstEscrowAddress,
        de.dstChainId,
        de.status as dstStatus,
        w.secret
      FROM orders o
      LEFT JOIN src_escrows se ON o.orderHash = se.orderHash
      LEFT JOIN dst_escrows de ON o.orderHash = de.orderHash
      LEFT JOIN withdrawals w ON de.escrowAddress = w.escrowAddress
      WHERE o.orderHash = $1
    `;
    
    return await this.client.query(query, [orderHash]);
  }
  
  // Monitor for profitable orders
  async getProfitableOrders(minProfit: bigint, supportedTokens: string[]) {
    const query = `
      SELECT 
        o.*,
        se.escrowAddress,
        se.chainId as srcChainId,
        se.timelocks
      FROM orders o
      JOIN src_escrows se ON o.orderHash = se.orderHash
      WHERE 
        o.status = 'active'
        AND o.takerAsset = ANY($1)
        AND se.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM dst_escrows de 
          WHERE de.orderHash = o.orderHash
        )
      ORDER BY o.takingAmount / o.makingAmount DESC
    `;
    
    return await this.client.query(query, [supportedTokens]);
  }
}
```

### 5. Updated Resolver Implementation

```typescript
// src/resolver/monitoring.ts
import { IndexerClient } from './indexer-client';
import { OrderProcessor } from './order-processor';

export class EnhancedOrderMonitor {
  private indexerClient: IndexerClient;
  private orderProcessor: OrderProcessor;
  private subscriptions: Map<string, any> = new Map();
  
  constructor(
    indexerUrl: string,
    private config: ResolverConfig
  ) {
    this.indexerClient = new IndexerClient(indexerUrl);
    this.orderProcessor = new OrderProcessor(config);
  }
  
  async start() {
    // Subscribe to new orders
    const subscription = await this.indexerClient.subscribeToNewOrders(
      async (order) => {
        console.log('New order detected:', order.orderHash);
        await this.processOrder(order);
      }
    );
    
    this.subscriptions.set('newOrders', subscription);
    
    // Process existing pending orders
    const pendingOrders = await this.indexerClient.getPendingOrders(
      this.config.resolverAddress
    );
    
    for (const order of pendingOrders) {
      await this.processOrder(order);
    }
    
    // Monitor for secret reveals
    setInterval(async () => {
      await this.checkForSecretReveals();
    }, 5000); // Check every 5 seconds
  }
  
  private async processOrder(order: any) {
    // Check profitability
    const isProfitable = await this.orderProcessor.checkProfitability(order);
    
    if (isProfitable) {
      console.log(`Processing profitable order ${order.orderHash}`);
      
      try {
        // Deploy destination escrow
        const txHash = await this.orderProcessor.deployDestinationEscrow(order);
        console.log(`Deployed dst escrow for ${order.orderHash}: ${txHash}`);
      } catch (error) {
        console.error(`Failed to process order ${order.orderHash}:`, error);
      }
    }
  }
  
  private async checkForSecretReveals() {
    // Get all active orders where we deployed dst escrow
    const activeOrders = await this.indexerClient.query(`
      SELECT DISTINCT o.orderHash
      FROM orders o
      JOIN dst_escrows de ON o.orderHash = de.orderHash
      WHERE 
        o.status = 'active'
        AND de.status = 'active'
        AND de.taker = $1
    `, [this.config.resolverAddress]);
    
    for (const { orderHash } of activeOrders) {
      const secret = await this.indexerClient.getRevealedSecret(orderHash);
      
      if (secret) {
        console.log(`Secret revealed for order ${orderHash}`);
        await this.orderProcessor.claimSourceEscrow(orderHash, secret);
      }
    }
  }
  
  async stop() {
    for (const [key, subscription] of this.subscriptions) {
      await subscription.unsubscribe();
    }
    this.subscriptions.clear();
  }
}
```

## Performance Considerations

### 1. Indexing Performance
- **Multi-chain ordering**: Ponder's `ordering: "multichain"` ensures correct event ordering across chains
- **Parallel indexing**: Events from different chains are processed in parallel
- **PostgreSQL backend**: Efficient storage and querying for large datasets

### 2. Query Optimization
- **Indexed columns**: Ensure proper database indexes on frequently queried fields:
  - `orderHash` (primary key)
  - `maker`, `taker` addresses
  - `status` fields
  - `chainId` for cross-chain queries
- **Pagination**: Use limit/offset for large result sets
- **Prepared statements**: SQL client uses prepared statements for security and performance

### 3. Real-time Updates
- **WebSocket connections**: Live queries use WebSocket for real-time updates
- **Efficient polling**: Replace RPC polling with database queries
- **Event-driven architecture**: React to new data instead of constant polling

### 4. Scalability
- **Horizontal scaling**: Deploy multiple indexer instances
- **Read replicas**: Use PostgreSQL read replicas for query load balancing
- **Caching**: Implement Redis caching for frequently accessed data

## Recommendations for Resolver Updates

### 1. Replace RPC Polling with Indexer Queries
**Current approach**: Direct RPC calls to monitor events
**Recommended**: Use indexer for all historical data and monitoring

### 2. Implement Event-Driven Architecture
```typescript
// Before: Polling
setInterval(async () => {
  const logs = await client.getLogs({ ... });
  // Process logs
}, 10000);

// After: Event-driven
await indexerClient.subscribeToNewOrders((order) => {
  // Process order immediately
});
```

### 3. Add Retry and Error Handling
```typescript
class ResilientIndexerClient extends IndexerClient {
  async queryWithRetry(query: string, params: any[], maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.client.query(query, params);
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
  }
}
```

### 4. Implement Health Checks
```typescript
async function checkIndexerHealth(): Promise<boolean> {
  try {
    const result = await indexerClient.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
```

### 5. Add Monitoring and Metrics
- Track query performance
- Monitor indexer lag (latest indexed block vs chain head)
- Alert on indexing errors or delays

### 6. Security Considerations
- Use environment variables for indexer URLs
- Implement request rate limiting
- Validate all data from indexer before use
- Use read-only database connections

## Next Steps

1. **Update bmn-evm-indexer**:
   - Add Bridge-Me-Not contract ABIs
   - Configure contract addresses for all chains
   - Implement event indexing logic
   - Deploy and test indexer

2. **Update bmn-evm-resolver**:
   - Install `@ponder/client` package
   - Implement `IndexerClient` class
   - Replace polling logic with indexer queries
   - Add real-time subscriptions

3. **Testing**:
   - Test multi-chain event ordering
   - Verify data consistency
   - Load test with high transaction volume
   - Test failover scenarios

4. **Production Deployment**:
   - Deploy indexer to cloud infrastructure
   - Set up PostgreSQL with replication
   - Configure monitoring and alerting
   - Implement backup strategies

## Conclusion

Integrating the Ponder indexer with the Bridge-Me-Not resolver will significantly improve performance, reliability, and scalability. The SQL over HTTP API provides flexible querying capabilities while maintaining type safety through `@ponder/client`. This architecture enables real-time monitoring of cross-chain atomic swaps with minimal latency and resource usage.