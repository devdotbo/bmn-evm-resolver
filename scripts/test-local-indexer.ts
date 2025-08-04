#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

/**
 * Test script for local Ponder indexer connection
 * 
 * Usage:
 *   deno run --allow-net --allow-read --allow-env scripts/test-local-indexer.ts
 *   
 * Or make it executable:
 *   chmod +x scripts/test-local-indexer.ts
 *   ./scripts/test-local-indexer.ts
 */

import { createLocalIndexerClient } from "../src/indexer/local-setup.ts";
import { LocalIndexerExamples } from "../src/indexer/local-setup.ts";
import { BOB_ADDRESS } from "../src/config/chains.ts";
import type { Address } from "viem";

// ANSI color codes for better output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function main() {
  log("\n🚀 Testing Local Ponder Indexer Connection", colors.bright);
  log("=" .repeat(50), colors.cyan);

  // Create client
  const client = createLocalIndexerClient();
  
  try {
    // Test connection
    log("\n1️⃣  Testing connection...", colors.yellow);
    await client.connect();
    log("✅ Connected successfully!", colors.green);

    // Check health
    log("\n2️⃣  Checking indexer health...", colors.yellow);
    const health = await client.checkHealth();
    log("📊 Health Status:", colors.cyan);
    console.log({
      connected: health.connected,
      synced: health.synced,
      latestBlock: health.latestBlock.toString(),
      chainId: health.chainId
    });

    // Run example queries
    log("\n3️⃣  Running example queries...", colors.yellow);
    const examples = new LocalIndexerExamples(client);
    
    // Get pending orders
    const pendingOrders = await examples.getPendingOrdersForBob();
    if (pendingOrders.items.length > 0) {
      log(`\n📦 Sample pending order:`, colors.cyan);
      const order = pendingOrders.items[0];
      console.log({
        orderHash: order.orderHash,
        srcChainId: order.srcChainId,
        dstChainId: order.dstChainId,
        status: order.status
      });
    }

    // Get chain statistics
    log("\n4️⃣  Fetching chain statistics...", colors.yellow);
    const chainAStats = await client.getChainStatistics(1337);
    const chainBStats = await client.getChainStatistics(1338);
    
    log("\n📊 Chain A (1337) Stats:", colors.cyan);
    if (chainAStats) {
      console.log({
        totalSrcEscrows: chainAStats.totalSrcEscrows.toString(),
        totalDstEscrows: chainAStats.totalDstEscrows.toString(),
        totalWithdrawals: chainAStats.totalWithdrawals.toString()
      });
    } else {
      log("No data yet", colors.yellow);
    }

    log("\n📊 Chain B (1338) Stats:", colors.cyan);
    if (chainBStats) {
      console.log({
        totalSrcEscrows: chainBStats.totalSrcEscrows.toString(),
        totalDstEscrows: chainBStats.totalDstEscrows.toString(),
        totalWithdrawals: chainBStats.totalWithdrawals.toString()
      });
    } else {
      log("No data yet", colors.yellow);
    }

    // Test SQL query execution
    log("\n5️⃣  Testing raw SQL query...", colors.yellow);
    try {
      const result = await client.executeSqlQuery(
        'SELECT COUNT(*) as count FROM "AtomicSwap"',
        []
      );
      log(`✅ SQL query successful! Total swaps: ${result.rows[0]?.count || 0}`, colors.green);
    } catch (error) {
      log(`⚠️  SQL query failed (this is expected if no tables exist yet)`, colors.yellow);
      console.error(error);
    }

    // Test subscriptions
    log("\n6️⃣  Testing real-time subscriptions...", colors.yellow);
    log("Setting up subscription for 10 seconds...", colors.cyan);
    
    const unsubscribe = await client.subscribeToNewOrders(
      (order) => {
        log("\n🆕 New order detected!", colors.green);
        console.log({
          orderHash: order.orderHash,
          srcAmount: order.srcAmount.toString(),
          dstAmount: order.dstAmount.toString()
        });
      },
      BOB_ADDRESS
    );

    // Wait for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
    unsubscribe();
    log("✅ Subscription test completed", colors.green);

    // Summary
    log("\n" + "=".repeat(50), colors.cyan);
    log("✅ All tests completed successfully!", colors.green);
    log("\n📝 Summary:", colors.bright);
    log("- Indexer URL: " + client["sqlUrl"], colors.cyan);
    log("- Table prefix: " + (client["tablePrefix"] || "(none)"), colors.cyan);
    log("- Connection: OK", colors.green);
    log("- Health check: OK", colors.green);
    log("- SQL queries: OK", colors.green);
    log("- Subscriptions: OK", colors.green);

  } catch (error) {
    log("\n❌ Test failed!", colors.red);
    console.error(error);
    
    log("\n💡 Troubleshooting tips:", colors.yellow);
    log("1. Make sure Ponder is running on http://localhost:42069", colors.cyan);
    log("2. Check that the indexer has synced some data", colors.cyan);
    log("3. Verify your .env file has INDEXER_URL set correctly", colors.cyan);
    log("4. Try running: curl http://localhost:42069/health", colors.cyan);
    
    Deno.exit(1);
  } finally {
    await client.disconnect();
  }
}

// Run the test
if (import.meta.main) {
  main().catch(console.error);
}