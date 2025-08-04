/**
 * Example: Using the indexer client directly
 * This shows how to query the indexer for order data
 */

import { createLocalIndexerClient } from "../src/indexer/local-setup.ts";
import { BOB_ADDRESS } from "../src/config/chains.ts";
import { formatUnits } from "viem";

async function main() {
  console.log("🔍 Indexer Client Usage Example");
  console.log("==============================\n");

  // Create and connect to indexer
  const indexer = await createLocalIndexerClient({
    sqlUrl: Deno.env.get("INDEXER_URL") || "http://localhost:42069/sql",
  });

  try {
    await indexer.connect();
    console.log("✅ Connected to indexer\n");

    // 1. Check health
    console.log("📊 Checking indexer health...");
    const health = await indexer.checkHealth();
    console.log({
      connected: health.connected,
      synced: health.synced,
      latestBlock: health.latestBlock.toString(),
      chainId: health.chainId,
    });
    console.log();

    // 2. Get pending orders for Bob
    console.log("📦 Fetching pending orders for Bob...");
    const pendingOrders = await indexer.getPendingOrders(BOB_ADDRESS);
    console.log(`Found ${pendingOrders.totalCount} pending orders`);
    
    if (pendingOrders.items.length > 0) {
      const order = pendingOrders.items[0];
      console.log("First order:", {
        orderHash: order.orderHash,
        srcAmount: formatUnits(order.srcAmount, 18),
        dstAmount: formatUnits(order.dstAmount, 18),
        status: order.status,
      });
    }
    console.log();

    // 3. Get active orders
    console.log("⚡ Fetching active orders...");
    const activeOrders = await indexer.getActiveOrders(BOB_ADDRESS);
    console.log(`Found ${activeOrders.totalCount} active orders`);
    console.log();

    // 4. Get chain statistics
    console.log("📈 Fetching chain statistics...");
    const stats1337 = await indexer.getChainStatistics(1337);
    const stats1338 = await indexer.getChainStatistics(1338);
    
    if (stats1337) {
      console.log("Chain 1337:", {
        totalSrcEscrows: stats1337.totalSrcEscrows.toString(),
        totalDstEscrows: stats1337.totalDstEscrows.toString(),
        totalVolumeLocked: formatUnits(stats1337.totalVolumeLocked, 18),
      });
    }
    
    if (stats1338) {
      console.log("Chain 1338:", {
        totalSrcEscrows: stats1338.totalSrcEscrows.toString(),
        totalDstEscrows: stats1338.totalDstEscrows.toString(),
        totalVolumeLocked: formatUnits(stats1338.totalVolumeLocked, 18),
      });
    }
    console.log();

    // 5. Subscribe to new orders
    console.log("👀 Subscribing to new orders (10 seconds)...");
    const unsubscribeOrders = await indexer.subscribeToNewOrders(
      (order) => {
        console.log("📦 New order detected:", {
          orderHash: order.orderHash,
          srcAmount: formatUnits(order.srcAmount, 18),
          dstAmount: formatUnits(order.dstAmount, 18),
        });
      },
      BOB_ADDRESS
    );

    // 6. Subscribe to secret reveals
    console.log("🔓 Subscribing to secret reveals (10 seconds)...");
    const unsubscribeSecrets = await indexer.subscribeToSecretReveals(
      (event) => {
        console.log("🔑 Secret revealed:", {
          orderHash: event.orderHash,
          secret: event.secret,
          chainId: event.chainId,
        });
      }
    );

    // Wait 10 seconds for events
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Cleanup
    unsubscribeOrders();
    unsubscribeSecrets();
    
    console.log("\n✅ Example completed successfully!");

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await indexer.disconnect();
  }
}

// Run the example
if (import.meta.main) {
  main().catch(console.error);
}