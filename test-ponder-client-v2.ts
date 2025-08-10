#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Test script for PonderClientV2 using @ponder/client
 */

import { PonderClientV2 } from "./src/indexer/ponder-client-v2.ts";

async function testPonderClientV2() {
  console.log("🧪 Testing PonderClientV2 with @ponder/client\n");
  console.log("=" .repeat(50));
  
  // Initialize client with environment URL or default
  const indexerUrl = Deno.env.get("INDEXER_URL") || "https://index-bmn.up.railway.app";
  console.log(`📍 Using indexer: ${indexerUrl}\n`);
  
  const client = new PonderClientV2({ url: indexerUrl });
  
  try {
    // Test 1: Get active swaps
    console.log("Test 1: Getting active swaps...");
    const activeSwaps = await client.getActiveSwaps();
    console.log(`✅ Found ${activeSwaps.length} active swaps`);
    if (activeSwaps.length > 0) {
      console.log("Sample swap:", activeSwaps[0]);
    }
    console.log();
    
    // Test 2: Get pending atomic swaps for a resolver
    console.log("Test 2: Getting pending atomic swaps...");
    const resolverAddress = "0x0000000000000000000000000000000000000000";
    const pendingSwaps = await client.getPendingAtomicSwaps(resolverAddress);
    console.log(`✅ Found ${pendingSwaps.length} pending swaps for resolver`);
    console.log();
    
    // Test 3: Get recent withdrawals
    console.log("Test 3: Getting recent withdrawals...");
    const withdrawals = await client.getRecentWithdrawals(5);
    console.log(`✅ Found ${withdrawals.length} recent withdrawals`);
    if (withdrawals.length > 0) {
      console.log("Sample withdrawal:", withdrawals[0]);
    }
    console.log();
    
    // Test 4: Get revealed secrets
    console.log("Test 4: Getting revealed secrets...");
    const secrets = await client.getRevealedSecrets();
    console.log(`✅ Found ${secrets.length} revealed secrets`);
    console.log();
    
    // Test 5: Get chain statistics
    console.log("Test 5: Getting chain statistics...");
    const stats = await client.getChainStatistics(8453); // Base chain
    console.log(`✅ Base chain statistics:`, stats);
    console.log();
    
    // Test 6: Get BMN holders
    console.log("Test 6: Getting BMN token holders...");
    const holders = await client.getBMNHolders(5);
    console.log(`✅ Found ${holders.length} BMN holders`);
    if (holders.length > 0) {
      console.log("Top holder:", {
        address: holders[0].id,
        balance: holders[0].balance,
        chainId: holders[0].chainId,
      });
    }
    console.log();
    
    // Test 7: Get active limit orders
    console.log("Test 7: Getting active limit orders...");
    const orders = await client.getActiveLimitOrders(5);
    console.log(`✅ Found ${orders.length} active limit orders`);
    console.log();
    
    // Test 8: Check resolver whitelist
    console.log("Test 8: Checking resolver whitelist...");
    const isWhitelisted = await client.isResolverWhitelisted(
      "0x1234567890123456789012345678901234567890",
      8453
    );
    console.log(`✅ Resolver whitelisted: ${isWhitelisted}`);
    console.log();
    
    // Test 9: Get completed swaps
    console.log("Test 9: Getting completed swaps...");
    const completedSwaps = await client.getCompletedSwaps(5);
    console.log(`✅ Found ${completedSwaps.length} completed swaps`);
    console.log();
    
    // Test 10: Subscribe to atomic swaps (with timeout)
    console.log("Test 10: Testing subscription to atomic swaps...");
    const unsubscribe = client.subscribeToAtomicSwaps(
      resolverAddress,
      (swaps) => {
        console.log(`  📡 Update received: ${swaps.length} swaps`);
      },
      (error) => {
        console.log(`  ⚠️ Subscription error (expected for deployed indexers)`);
      }
    );
    
    console.log("  ⏳ Waiting 3 seconds for updates...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    unsubscribe();
    console.log("  ✅ Subscription test completed");
    console.log();
    
    console.log("=" .repeat(50));
    console.log("✅ All tests completed successfully!");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    Deno.exit(1);
  }
}

// Run tests
console.log("🚀 Starting PonderClientV2 tests...\n");

await testPonderClientV2();

console.log("\n🎉 Test suite completed!");
Deno.exit(0);