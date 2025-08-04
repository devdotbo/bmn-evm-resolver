/**
 * Example: Integrating with Ponder's SQL API
 * 
 * This example demonstrates how to properly use the IndexerClient
 * with Ponder's direct SQL API endpoint.
 */

import { IndexerClient } from "../client.ts";
import type { Address } from "viem";

// Example 1: Basic setup without table prefix
async function basicSetup() {
  const client = new IndexerClient({
    sqlUrl: "http://localhost:42069/sql",
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 30000
  });

  await client.connect();
  console.log("Connected to Ponder indexer");

  // Query pending orders
  const resolver: Address = "0x1234567890123456789012345678901234567890";
  const pendingOrders = await client.getPendingOrders(resolver, { limit: 10 });
  console.log(`Found ${pendingOrders.totalCount} pending orders`);

  await client.disconnect();
}

// Example 2: Setup with table prefix (for Ponder apps with prefixed tables)
async function setupWithTablePrefix() {
  // If your Ponder app is named "bmn_indexer", tables will be prefixed:
  // bmn_indexer.atomicSwap, bmn_indexer.srcEscrow, etc.
  const client = new IndexerClient({
    sqlUrl: "http://localhost:42069/sql",
    tablePrefix: "bmn_indexer", // Your Ponder app name
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 30000
  });

  await client.connect();

  // The client automatically applies the prefix to all queries
  const health = await client.checkHealth();
  console.log("Indexer health:", health);

  await client.disconnect();
}

// Example 3: Using raw SQL queries with Ponder's API
async function rawSqlQueries() {
  const client = new IndexerClient({
    sqlUrl: "http://localhost:42069/sql",
    tablePrefix: "bmn_indexer"
  });

  await client.connect();

  // Execute a raw SQL query
  // The client sends this as { statement: "...", params: [...] }
  const result = await client.executeSqlQuery(
    'SELECT * FROM "atomicSwap" WHERE status = $1 LIMIT $2',
    ['active', 10]
  );

  console.log(`Found ${result.rows.length} active swaps`);

  // With table prefix, the query is automatically transformed to:
  // SELECT * FROM "bmn_indexer.atomicSwap" WHERE status = $1 LIMIT $2

  await client.disconnect();
}

// Example 4: Real-time monitoring with polling
async function realtimeMonitoring() {
  const client = new IndexerClient({
    sqlUrl: "http://localhost:42069/sql",
    tablePrefix: "bmn_indexer"
  });

  await client.connect();

  // Subscribe to new orders (uses polling internally)
  const unsubscribe = await client.subscribeToNewOrders(
    (order) => {
      console.log("New order detected:", {
        orderHash: order.orderHash,
        srcChainId: order.srcChainId,
        dstChainId: order.dstChainId,
        status: order.status
      });
    },
    "0x1234567890123456789012345678901234567890" // resolver address
  );

  // Monitor for 30 seconds
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Clean up
  unsubscribe();
  await client.disconnect();
}

// Example 5: Handling different Ponder deployment scenarios
async function deploymentScenarios() {
  // Scenario 1: Local development (no prefix)
  const localClient = new IndexerClient({
    sqlUrl: "http://localhost:42069/sql"
  });

  // Scenario 2: Production with prefixed tables
  const prodClient = new IndexerClient({
    sqlUrl: "https://your-ponder-instance.com/sql",
    tablePrefix: "bmn_prod"
  });

  // Scenario 3: Multiple environments with different prefixes
  const stagingClient = new IndexerClient({
    sqlUrl: process.env.PONDER_SQL_URL || "http://localhost:42069/sql",
    tablePrefix: process.env.PONDER_TABLE_PREFIX // e.g., "bmn_staging"
  });

  // Use the appropriate client based on your environment
  const client = process.env.NODE_ENV === "production" ? prodClient : localClient;
  
  await client.connect();
  // ... use the client
  await client.disconnect();
}

// Example 6: Error handling
async function errorHandling() {
  const client = new IndexerClient({
    sqlUrl: "http://localhost:42069/sql",
    tablePrefix: "bmn_indexer",
    retryAttempts: 3,
    retryDelay: 1000
  });

  try {
    await client.connect();

    // Handle query errors
    try {
      const result = await client.executeSqlQuery(
        'SELECT * FROM "nonexistent_table"',
        []
      );
    } catch (error) {
      console.error("Query failed:", error);
      // The client automatically retries based on retryAttempts
    }

    // Check if indexer is healthy before critical operations
    if (!client.isHealthy()) {
      console.warn("Indexer is not healthy, waiting...");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

  } catch (error) {
    console.error("Connection failed:", error);
  } finally {
    await client.disconnect();
  }
}

// Run examples
if (import.meta.main) {
  console.log("Running Ponder integration examples...\n");

  await basicSetup();
  console.log("\n---\n");

  await setupWithTablePrefix();
  console.log("\n---\n");

  await rawSqlQueries();
  console.log("\n---\n");

  await errorHandling();
  
  console.log("\nExamples completed!");
}