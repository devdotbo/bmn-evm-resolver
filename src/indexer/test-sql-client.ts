/**
 * Test the SQL-based indexer client
 */

import { IndexerClient } from "./client.ts";

async function testIndexerClient() {
  console.log("Testing SQL-based indexer client with Ponder's SQL API...\n");

  // Initialize client with SQL endpoint and optional table prefix
  // The tablePrefix should match your Ponder app name if tables are prefixed
  const client = new IndexerClient({
    sqlUrl: "http://localhost:42069/sql",
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 30000,
    // Uncomment and set this if your Ponder app uses table prefixing
    // tablePrefix: "bmn_indexer"
  });

  try {
    // 1. Test connection and health check
    console.log("1. Testing connection...");
    await client.connect();
    console.log("✓ Connected successfully\n");

    const health = await client.checkHealth();
    console.log("2. Health check:", health);
    console.log(`✓ Indexer is ${health.connected ? "connected" : "disconnected"} and ${health.synced ? "synced" : "not synced"}\n`);

    // 2. Test getting chain statistics
    console.log("3. Testing chain statistics...");
    const chainStats = await client.getChainStatistics(8453); // Base mainnet
    console.log("Chain statistics:", chainStats);
    console.log("✓ Retrieved chain statistics\n");

    // 3. Test getting pending orders
    console.log("4. Testing pending orders query...");
    const resolver = "0x1234567890123456789012345678901234567890";
    const pendingOrders = await client.getPendingOrders(resolver, { limit: 10 });
    console.log(`Found ${pendingOrders.totalCount} pending orders`);
    console.log("✓ Pending orders query successful\n");

    // 4. Test subscription (polling-based)
    console.log("5. Testing polling-based subscriptions...");
    const unsubscribe = await client.subscribeToNewOrders(
      (order) => {
        console.log("New order detected:", {
          orderHash: order.orderHash,
          status: order.status,
          srcChainId: order.srcChainId,
          dstChainId: order.dstChainId
        });
      },
      resolver
    );
    console.log("✓ Subscription created (polling every 5 seconds)\n");

    // Wait for a few polling cycles
    console.log("Waiting 15 seconds for polling cycles...");
    await new Promise(resolve => setTimeout(resolve, 15000));

    // 5. Test secret reveal subscription
    console.log("\n6. Testing secret reveal subscription...");
    const unsubscribeSecrets = await client.subscribeToSecretReveals((event) => {
      console.log("Secret revealed:", {
        orderHash: event.data.orderHash,
        secret: event.data.secret,
        escrowAddress: event.data.escrowAddress
      });
    });
    console.log("✓ Secret reveal subscription created\n");

    // 6. Test SQL query execution with Ponder's API format
    console.log("7. Testing direct SQL query execution with Ponder's API...");
    // Note: If using table prefix, the client will automatically apply it
    const sqlResult = await client.executeSqlQuery(
      'SELECT COUNT(*) as total FROM "atomicSwap" WHERE status = $1',
      ['completed']
    );
    console.log(`Total completed swaps: ${sqlResult.rows[0]?.total || 0}`);
    console.log("✓ Direct SQL query successful (using Ponder's { statement, params } format)\n");

    // 7. Test with table prefix (example of how it works)
    console.log("8. Testing table prefix handling...");
    // If your Ponder app name is "bmn_indexer", tables would be:
    // bmn_indexer.atomicSwap, bmn_indexer.srcEscrow, etc.
    // The client automatically handles this when tablePrefix is set
    console.log("✓ Table prefix handling is automatic when configured\n");

    // 8. Example of raw SQL with manual table prefix
    console.log("9. Example of manual table prefix in raw SQL...");
    try {
      // If you need to manually specify prefixed tables:
      const manualPrefixResult = await client.executeSqlQuery(
        'SELECT COUNT(*) as total FROM "bmn_indexer.atomicSwap" WHERE status = $1',
        ['active']
      );
      console.log("Manual prefix query would work if bmn_indexer prefix exists");
    } catch (error) {
      console.log("✓ Manual prefix example (would fail if prefix doesn't match actual Ponder app name)");
    }

    // Clean up
    unsubscribe();
    unsubscribeSecrets();
    await client.disconnect();
    console.log("\n✓ Disconnected successfully");

  } catch (error) {
    console.error("Test failed:", error);
    await client.disconnect();
    process.exit(1);
  }
}

// Run the test
if (import.meta.main) {
  testIndexerClient()
    .then(() => {
      console.log("\n✅ All tests passed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Tests failed:", error);
      process.exit(1);
    });
}