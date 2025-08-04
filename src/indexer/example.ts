/**
 * Example usage of the IndexerClient
 */

import { createIndexerClient, AtomicSwapStatus } from "./index.ts";
import type { Address } from "viem";

// Example resolver address
const BOB_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

async function main() {
  // Create indexer client
  const indexer = createIndexerClient("http://localhost:42069/graphql", {
    websocketUrl: "ws://localhost:42069/graphql-ws",
    retryAttempts: 3,
    timeout: 30000
  });

  try {
    // Connect to indexer
    console.log("Connecting to indexer...");
    await indexer.connect();

    // Check health
    const health = await indexer.checkHealth();
    console.log("Indexer health:", health);

    // Query pending orders
    console.log("\nQuerying pending orders for resolver:", BOB_ADDRESS);
    const pendingOrders = await indexer.getPendingOrders(BOB_ADDRESS, {
      limit: 10
    });
    console.log(`Found ${pendingOrders.totalCount || 0} pending orders`);

    // Get active orders
    console.log("\nQuerying active orders...");
    const activeOrders = await indexer.getActiveOrders(BOB_ADDRESS);
    console.log(`Found ${activeOrders.items.length} active orders`);

    // Subscribe to new orders
    console.log("\nSubscribing to new orders...");
    const unsubscribe = await indexer.subscribeToNewOrders(
      (order) => {
        console.log("New order received:", {
          orderHash: order.orderHash,
          srcAmount: order.srcAmount.toString(),
          dstAmount: order.dstAmount.toString(),
          status: order.status
        });
      },
      BOB_ADDRESS
    );

    // Subscribe to secret reveals
    console.log("Subscribing to secret reveals...");
    const unsubscribeSecrets = await indexer.subscribeToSecretReveals(
      (event) => {
        console.log("Secret revealed:", {
          orderHash: event.data.orderHash,
          secret: event.data.secret,
          escrowAddress: event.data.escrowAddress
        });
      }
    );

    // Query orders by maker
    console.log("\nQuerying orders by maker...");
    const makerOrders = await indexer.getOrdersByMaker(
      BOB_ADDRESS,
      [AtomicSwapStatus.SRC_CREATED, AtomicSwapStatus.BOTH_CREATED],
      5
    );
    console.log(`Found ${makerOrders.totalCount || 0} orders for maker`);

    // Get chain statistics
    console.log("\nGetting chain statistics...");
    const stats = await indexer.getChainStatistics(8453); // Base
    if (stats) {
      console.log("Base chain statistics:", {
        totalSrcEscrows: stats.totalSrcEscrows.toString(),
        totalDstEscrows: stats.totalDstEscrows.toString(),
        totalVolumeLocked: stats.totalVolumeLocked.toString()
      });
    }

    // Query with custom filters
    console.log("\nQuerying with custom filters...");
    const customQuery = await indexer.query(
      "atomicSwaps",
      ["orderHash", "srcAmount", "dstAmount", "status"],
      {
        status_in: ["src_created", "both_created"],
        srcAmount_gt: 1000000000000000000n // > 1 token
      },
      {
        limit: 5,
        orderBy: "srcCreatedAt",
        orderDirection: "desc"
      }
    );
    console.log(`Found ${customQuery.items.length} high-value orders`);

    // Monitor for timelock approaching orders
    console.log("\nChecking for orders approaching timelock...");
    const timelockOrders = await indexer.getTimelockApproachingOrders(300); // 5 minutes
    console.log(`Found ${timelockOrders.length} orders approaching timelock`);

    // Keep running for 30 seconds to receive subscription events
    console.log("\nListening for events for 30 seconds...");
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Cleanup
    console.log("\nCleaning up...");
    unsubscribe();
    unsubscribeSecrets();
    await indexer.disconnect();

  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the example
if (import.meta.main) {
  main().catch(console.error);
}