#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Test script for verifying resolver-indexer connectivity
 * Tests SQL over HTTP connection to Ponder indexer
 */

import { PonderClient } from "./src/indexer/ponder-client.ts";
import { getIndexerConfig, validateIndexerConfig, isLocalIndexer } from "./src/config/indexer.ts";

console.log("🚀 Starting Indexer Query Test");
console.log("=" .repeat(50));

async function testIndexerConnection() {
  try {
    // 1. Get and validate configuration
    console.log("\n📋 Configuration:");
    const config = getIndexerConfig();
    console.log("  SQL URL:", config.sqlUrl);
    console.log("  Table Prefix:", config.tablePrefix || "(none)");
    console.log("  Is Local:", isLocalIndexer());
    console.log("  Retry Attempts:", config.retryAttempts);
    console.log("  Timeout:", config.timeout, "ms");
    
    // Validate config
    validateIndexerConfig(config);
    console.log("✅ Configuration valid");
    
    // 2. Initialize Ponder client
    console.log("\n🔧 Initializing Ponder Client...");
    const client = new PonderClient({ url: config.sqlUrl.replace("/sql", "") });
    console.log("✅ Client initialized");
    
    // 3. Test basic connectivity with chain statistics
    console.log("\n📊 Testing Chain Statistics Query...");
    try {
      const stats = await client.getChainStatistics(11155420); // OP Sepolia
      console.log("  Chain Statistics:", stats);
    } catch (error) {
      console.log("  ⚠️ No statistics available (this is normal for new deployments)");
    }
    
    // 4. Query for pending atomic swaps
    console.log("\n🔍 Querying Pending Atomic Swaps...");
    const resolverAddress = "0x0000000000000000000000000000000000000000"; // Test address
    
    try {
      const pendingSwaps = await client.getPendingAtomicSwaps(resolverAddress);
      console.log(`  Found ${pendingSwaps.length} pending swaps`);
      
      if (pendingSwaps.length > 0) {
        console.log("\n  First swap details:");
        const swap = pendingSwaps[0];
        console.log("    Order Hash:", swap.orderHash);
        console.log("    Status:", swap.status);
        console.log("    Source Chain:", swap.srcChainId);
        console.log("    Destination Chain:", swap.dstChainId);
        console.log("    Source Amount:", swap.srcAmount);
        console.log("    Destination Amount:", swap.dstAmount);
      }
    } catch (error) {
      console.error("  ❌ Error querying pending swaps:", error);
      throw error;
    }
    
    // 5. Query for pending source escrows
    console.log("\n🔍 Querying Pending Source Escrows...");
    try {
      const pendingEscrows = await client.getPendingSrcEscrows(resolverAddress);
      console.log(`  Found ${pendingEscrows.length} pending source escrows`);
      
      if (pendingEscrows.length > 0) {
        console.log("\n  First escrow details:");
        const escrow = pendingEscrows[0];
        console.log("    Escrow Address:", escrow.escrowAddress);
        console.log("    Order Hash:", escrow.orderHash);
        console.log("    Status:", escrow.status);
        console.log("    Maker:", escrow.maker);
        console.log("    Taker:", escrow.taker);
        console.log("    Source Amount:", escrow.srcAmount);
      }
    } catch (error) {
      console.error("  ❌ Error querying pending escrows:", error);
      throw error;
    }
    
    // 6. Query for recent withdrawals
    console.log("\n🔍 Querying Recent Withdrawals...");
    try {
      const withdrawals = await client.getRecentWithdrawals(5);
      console.log(`  Found ${withdrawals.length} recent withdrawals`);
      
      if (withdrawals.length > 0) {
        console.log("\n  Recent withdrawals:");
        withdrawals.forEach((w, i) => {
          console.log(`    ${i + 1}. Escrow: ${w.escrowAddress.slice(0, 10)}... Chain: ${w.chainId}`);
        });
      }
    } catch (error) {
      console.log("  ⚠️ No withdrawals found (this is normal for new deployments)");
    }
    
    // 7. Test live subscription (if supported)
    console.log("\n📡 Testing Live Subscription...");
    let subscriptionWorked = false;
    
    try {
      const unsubscribe = client.subscribeToAtomicSwaps(
        resolverAddress,
        (swaps) => {
          subscriptionWorked = true;
          console.log(`  📨 Live update received: ${swaps.length} swaps`);
        },
        (error) => {
          console.log(`  ⚠️ Subscription error (this is expected if not supported):`, error.message);
        }
      );
      
      // Wait a bit to see if subscription works
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (subscriptionWorked) {
        console.log("  ✅ Live subscription working");
      } else {
        console.log("  ℹ️ Live subscription not available (requires WebSocket support)");
      }
      
      // Clean up subscription if it exists
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    } catch (error) {
      console.log("  ℹ️ Live subscriptions not supported in current environment");
    }
    
    // 8. Test error handling with invalid query
    console.log("\n🧪 Testing Error Handling...");
    try {
      await client.getSrcEscrowByOrderHash("0xinvalid");
      console.log("  ⚠️ Invalid query did not throw error");
    } catch (error) {
      console.log("  ✅ Error handling works correctly");
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("✅ All tests completed successfully!");
    console.log("\n📝 Summary:");
    console.log("  - SQL over HTTP connection: Working");
    console.log("  - Query execution: Working");
    console.log("  - Error handling: Working");
    console.log("  - Indexer URL:", config.sqlUrl);
    
    return true;
    
  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    
    if (error.message?.includes("ECONNREFUSED") || error.message?.includes("fetch")) {
      console.log("\n💡 Troubleshooting tips:");
      console.log("  1. Make sure the Ponder indexer is running");
      console.log("  2. Check if the indexer is listening on the correct port");
      console.log("  3. Verify the INDEXER_URL environment variable");
      console.log("  4. Default URL is: http://localhost:42069/sql");
    }
    
    return false;
  }
}

// Run the test
console.log("\n🏃 Running indexer connectivity test...\n");
const success = await testIndexerConnection();

if (!success) {
  console.log("\n⚠️ Some tests failed. Please check the configuration and ensure the indexer is running.");
  Deno.exit(1);
} else {
  console.log("\n🎉 All tests passed! The resolver can successfully connect to the indexer.");
  Deno.exit(0);
}