# SQL-Based Indexer Client

This directory contains the implementation of a SQL-based indexer client for the Bridge-Me-Not protocol. The client uses Ponder's direct SQL API over HTTP for querying indexed blockchain data.

## Overview

The indexer client provides:
- Direct SQL query execution using Ponder's SQL API format (`{ statement, params }`)
- Automatic table prefix handling for Ponder's schema isolation
- Polling-based subscriptions that simulate real-time updates
- Type-safe query results with automatic mapping to TypeScript types
- Retry logic and error handling
- Connection health monitoring

## Ponder SQL API Integration

The client is specifically designed to work with Ponder's SQL endpoint:
- **Endpoint**: `/sql` (e.g., `http://localhost:42069/sql`)
- **Request Format**: `POST` with JSON body `{ statement: "SELECT ...", params: [...] }`
- **Response Format**: `{ rows: [...] }`
- **Table Prefixing**: Ponder automatically prefixes tables with the app name (e.g., `myapp.atomicSwap`)

## Architecture

### Components

1. **IndexerClient** (`client.ts`)
   - Main client class for interacting with the SQL endpoint
   - Provides high-level methods for common queries
   - Handles connection management and health checks
   - Maps SQL results to TypeScript types

2. **SQL Queries** (`queries.ts`)
   - Contains all SQL queries as constants
   - Uses parameterized queries for safety
   - Optimized for the Ponder indexer's PostgreSQL schema

3. **SubscriptionManager** (`subscriptions.ts`)
   - Implements polling-based subscriptions
   - Simulates real-time updates by polling the database
   - Manages multiple concurrent subscriptions
   - Emits events for new data

4. **Types** (`types.ts`)
   - TypeScript type definitions for all entities
   - Matches the database schema from the indexer

## Usage

### Basic Setup

```typescript
import { IndexerClient } from "./indexer/client.ts";

const client = new IndexerClient({
  sqlUrl: "http://localhost:42069/sql",
  retryAttempts: 3,
  retryDelay: 1000,
  timeout: 30000,
  // Optional: Set if your Ponder app uses table prefixing
  tablePrefix: "bmn_indexer"
});

// Connect to the indexer
await client.connect();

// Check health
const health = await client.checkHealth();
console.log("Indexer synced:", health.synced);
```

### Querying Data

```typescript
// Get pending orders for a resolver
const pendingOrders = await client.getPendingOrders(resolverAddress, {
  limit: 100,
  offset: 0
});

// Get order details with escrow information
const orderDetails = await client.getOrderDetails(orderHash);

// Get revealed secret
const secret = await client.getRevealedSecret(orderHash);

// Get profitable orders
const profitableOrders = await client.getProfitableOrders(
  resolverAddress,
  minProfitMargin,
  supportedTokens,
  50 // limit
);
```

### Subscriptions (Polling-Based)

Since SQL doesn't support real-time subscriptions, we use polling:

```typescript
// Subscribe to new orders
const unsubscribe = await client.subscribeToNewOrders(
  (order) => {
    console.log("New order:", order.orderHash);
  },
  resolverAddress // optional filter
);

// Subscribe to secret reveals
const unsubscribeSecrets = await client.subscribeToSecretReveals((event) => {
  console.log("Secret revealed:", event.data.secret);
});

// Subscribe to order updates
const unsubscribeUpdates = await client.subscribeToOrderUpdates(
  orderHash,
  (update) => {
    console.log("Order updated:", update);
  }
);

// Clean up when done
unsubscribe();
unsubscribeSecrets();
unsubscribeUpdates();
```

### Direct SQL Queries

For custom queries not covered by the high-level API:

```typescript
const result = await client.executeSqlQuery(
  'SELECT * FROM "atomicSwap" WHERE src_maker = $1 LIMIT $2',
  [makerAddress, 10]
);

console.log("Results:", result.rows);
console.log("Row count:", result.rowCount);
```

## Database Schema

The indexer uses the following main tables:

- **atomicSwap**: Primary swap records
- **srcEscrow**: Source chain escrow details
- **dstEscrow**: Destination chain escrow details
- **escrowWithdrawal**: Withdrawal events with revealed secrets
- **chainStatistics**: Aggregate statistics per chain

## SQL Query Examples

All queries use PostgreSQL syntax with parameterized queries:

```sql
-- Get pending orders
SELECT a.*, s.escrow_address 
FROM "atomicSwap" a
JOIN "srcEscrow" s ON a.order_hash = s.order_hash
WHERE a.dst_maker = $1 
  AND a.status IN ('src_created', 'pending')
ORDER BY a.src_created_at DESC
LIMIT $2;

-- Get revealed secret
SELECT COALESCE(a.secret, w.secret) as secret
FROM "atomicSwap" a
LEFT JOIN "dstEscrow" d ON a.order_hash = d.order_hash
LEFT JOIN "escrowWithdrawal" w ON d.escrow_address = w.escrow_address
WHERE a.order_hash = $1;
```

## Migration from GraphQL

The main changes from the GraphQL implementation:

1. **Queries**: GraphQL queries replaced with SQL queries
2. **Subscriptions**: WebSocket subscriptions replaced with polling
3. **Response Format**: SQL results mapped to match GraphQL response structure
4. **Error Handling**: SQL-specific error handling added

## Performance Considerations

- Polling interval is configurable (default: 5 seconds)
- Batch queries where possible to reduce round trips
- Use indexed columns in WHERE clauses
- Limit result sets with LIMIT clauses
- Connection pooling handled by the indexer

## Testing

Run the test script to verify the implementation:

```bash
deno run --allow-net src/indexer/test-sql-client.ts
```

This will test:
- Connection and health checks
- Basic queries
- Polling-based subscriptions
- Direct SQL execution

## Error Handling

The client includes comprehensive error handling:

```typescript
try {
  const result = await client.getPendingOrders(resolver);
} catch (error) {
  if (error.code === IndexerErrorCode.QUERY_FAILED) {
    // Handle query errors
  } else if (error.code === IndexerErrorCode.CONNECTION_FAILED) {
    // Handle connection errors
  }
}
```

## Configuration

The client accepts the following configuration:

```typescript
interface IndexerClientConfig {
  sqlUrl: string;              // SQL endpoint URL (e.g., "http://localhost:42069/sql")
  retryAttempts?: number;      // Number of retry attempts (default: 3)
  retryDelay?: number;         // Delay between retries in ms (default: 1000)
  timeout?: number;            // Request timeout in ms (default: 30000)
  tablePrefix?: string;        // Ponder app name for table prefixing (e.g., "bmn_indexer")
}
```

## Security

- All queries use parameterized statements to prevent SQL injection
- The indexer provides read-only access to the database
- Connection uses HTTP POST with JSON body
- Sensitive data should not be logged