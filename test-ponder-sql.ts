#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Test script to verify PonderClient SQL implementation
 * Tests the Direct SQL over HTTP endpoint using @ponder/client
 * Auto-exits after 10 seconds
 */

// Set 10-second timeout for auto-exit
setTimeout(() => {
  console.log("\n⏰ 10-second timeout reached. Exiting...");
  Deno.exit(0);
}, 10000);

import { createClient, eq, desc } from "@ponder/client";
import * as schema from "./src/indexer/ponder.schema.ts";

async function testPonderClient() {
  console.log("🧪 Testing PonderClient SQL implementation with @ponder/client\n");
  console.log("=" .repeat(50));
  
  // Initialize client with environment URL or default
  const indexerUrl = Deno.env.get("INDEXER_URL") || "https://index-bmn.up.railway.app";
  console.log(`📍 Indexer URL: ${indexerUrl}\n`);
  
  // Create client with schema - use /sql endpoint
  const client = createClient(`${indexerUrl}/sql`, { schema });
  console.log("✅ Client created successfully\n");
  
  try {
    // Test 1: Query srcEscrow table
    console.log("Test 1: Querying srcEscrow table...");
    const srcEscrows = await client.db
      .select()
      .from(schema.srcEscrow)
      .limit(5)
      .execute();
    
    console.log(`✅ Found ${srcEscrows.length} source escrows`);
    if (srcEscrows.length > 0) {
      console.log("Sample:", {
        id: srcEscrows[0].id,
        chain: srcEscrows[0].chainId,
        status: srcEscrows[0].status,
      });
    }
    console.log();
    
    // Test 2: Query dstEscrow table
    console.log("Test 2: Querying dstEscrow table...");
    const dstEscrows = await client.db
      .select()
      .from(schema.dstEscrow)
      .limit(5)
      .execute();
    
    console.log(`✅ Found ${dstEscrows.length} destination escrows`);
    console.log();
    
    // Test 3: Query with where clause - active escrows
    console.log("Test 3: Query active escrows...");
    const activeEscrows = await client.db
      .select()
      .from(schema.srcEscrow)
      .where(eq(schema.srcEscrow.status, "created"))
      .limit(5)
      .execute();
    
    console.log(`✅ Found ${activeEscrows.length} active escrows`);
    console.log();
    
    // Test 4: Query atomic swaps
    console.log("Test 4: Getting atomic swaps...");
    const atomicSwaps = await client.db
      .select()
      .from(schema.atomicSwap)
      .where(eq(schema.atomicSwap.status, "pending"))
      .limit(5)
      .execute();
    
    console.log(`✅ Found ${atomicSwaps.length} pending atomic swaps`);
    if (atomicSwaps.length > 0) {
      console.log("Sample swap:", {
        id: atomicSwaps[0].id,
        orderHash: atomicSwaps[0].orderHash,
        srcChainId: atomicSwaps[0].srcChainId,
        dstChainId: atomicSwaps[0].dstChainId,
        status: atomicSwaps[0].status,
      });
    }
    console.log();
    
    // Test 5: Get recent withdrawals
    console.log("Test 5: Getting recent withdrawals...");
    const withdrawals = await client.db
      .select()
      .from(schema.escrowWithdrawal)
      .limit(5)
      .execute();
    
    console.log(`✅ Found ${withdrawals.length} recent withdrawals`);
    if (withdrawals.length > 0) {
      console.log("Sample withdrawal:", {
        id: withdrawals[0].id,
        escrowAddress: withdrawals[0].escrowAddress,
        secret: withdrawals[0].secret,
      });
    }
    console.log();
    
    // Test 6: Get chain statistics
    console.log("Test 6: Getting chain statistics...");
    const stats = await client.db
      .select()
      .from(schema.chainStatistics)
      .execute();
    
    console.log(`✅ Found stats for ${stats.length} chains`);
    stats.forEach((stat: any) => {
      console.log(`  Chain ${stat.chainId}:`, {
        srcEscrows: stat.totalSrcEscrows,
        dstEscrows: stat.totalDstEscrows,
        withdrawals: stat.totalWithdrawals,
        cancellations: stat.totalCancellations,
      });
    });
    console.log();
    
    // Test 7: Query BMN token holders
    console.log("Test 7: Query BMN token holders...");
    const holders = await client.db
      .select()
      .from(schema.bmnTokenHolder)
      .limit(10)
      .execute();
    
    console.log(`✅ Found ${holders.length} BMN token holders`);
    if (holders.length > 0) {
      console.log("Top holder:", {
        address: holders[0].id,
        balance: holders[0].balance,
        chain: holders[0].chainId,
      });
    }
    console.log();
    
    // Test 8: Query BMN transfers
    console.log("Test 8: Query BMN transfers...");
    const transfers = await client.db
      .select()
      .from(schema.bmnTransfer)
      .limit(10)
      .execute();
    
    console.log(`✅ Found ${transfers.length} BMN transfers`);
    console.log();
    
    // Test 9: Query limit orders
    console.log("Test 9: Query limit orders...");
    const limitOrders = await client.db
      .select()
      .from(schema.limitOrder)
      .where(eq(schema.limitOrder.status, "active"))
      .limit(5)
      .execute();
    
    console.log(`✅ Found ${limitOrders.length} active limit orders`);
    if (limitOrders.length > 0) {
      console.log("Sample order:", {
        id: limitOrders[0].id,
        orderHash: limitOrders[0].orderHash,
        status: limitOrders[0].status,
      });
    }
    console.log();
    
    // Test 10: Live query subscription (optional test)
    console.log("Test 10: Testing live query...");
    const { unsubscribe } = client.live(
      (db) => db.select().from(schema.chainStatistics).execute(),
      (data) => {
        console.log("  📡 Live update received!");
        data.forEach((stat: any) => {
          console.log(`    Chain ${stat.chainId}: ${stat.totalSrcEscrows} escrows`);
        });
      },
      (error) => {
        console.error("  ⚠️ Live query error (this is normal for deployed indexers):", error.message);
      }
    );
    
    console.log("  ⏳ Waiting 2 seconds for live updates...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    unsubscribe();
    console.log("  ✅ Live query test completed");
    console.log();
    
    console.log("=" .repeat(50));
    console.log("✅ All tests completed successfully!");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("Details:", error.message);
    }
    Deno.exit(1);
  }
}

// Run tests
console.log("🚀 Starting PonderClient tests with @ponder/client...\n");

await testPonderClient();

console.log("\n🎉 Test suite completed!");
Deno.exit(0);