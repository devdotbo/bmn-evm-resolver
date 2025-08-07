#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

/**
 * Alice Service - Continuous monitoring service for cross-chain atomic swaps
 * 
 * This service runs continuously to:
 * - Monitor pending orders
 * - Auto-withdraw when destination escrows are ready
 * - Provide health check endpoints
 */

import { LimitOrderAlice } from "./src/alice/limit-order-alice.ts";
import { startHealthServer } from "./src/utils/health-server.ts";

// Configuration from environment variables
const config = {
  pollingInterval: parseInt(Deno.env.get("ALICE_POLLING_INTERVAL") || "10000"),
  healthPort: parseInt(Deno.env.get("ALICE_HEALTH_PORT") || "8001"),
  privateKey: Deno.env.get("ALICE_PRIVATE_KEY"),
  ankrApiKey: Deno.env.get("ANKR_API_KEY"),
  indexerUrl: Deno.env.get("INDEXER_URL") || "http://localhost:42069",
};

// Validate configuration
if (!config.privateKey) {
  console.error("❌ Error: ALICE_PRIVATE_KEY environment variable is required");
  console.log("\nPlease set the following environment variables:");
  console.log("  ALICE_PRIVATE_KEY - Alice's private key for signing transactions");
  console.log("\nOptional environment variables:");
  console.log("  ALICE_POLLING_INTERVAL - Polling interval in ms (default: 10000)");
  console.log("  ALICE_HEALTH_PORT - Health check port (default: 8001)");
  console.log("  ANKR_API_KEY - Ankr API key for RPC endpoints");
  console.log("  INDEXER_URL - Indexer URL (default: http://localhost:42069)");
  Deno.exit(1);
}

console.log("🎭 Starting Alice Service with configuration:");
console.log(`  📡 Indexer URL: ${config.indexerUrl}`);
console.log(`  ⏱️  Polling Interval: ${config.pollingInterval}ms`);
console.log(`  🏥 Health Port: ${config.healthPort}`);
console.log(`  🔑 Private Key: ${config.privateKey ? "Set" : "Not set"}`);
console.log(`  🔑 Ankr API Key: ${config.ankrApiKey ? "Set" : "Not set (using public endpoints)"}`);

// Initialize Alice
const alice = new LimitOrderAlice();
let isRunning = true;
let monitoringPromise: Promise<void> | null = null;

async function main() {
  try {
    // Initialize Alice (connects to SecretManager)
    console.log("\n📦 Initializing Alice service...");
    await alice.init();
    console.log("✅ Alice initialized successfully");

    // Start health check server
    console.log("\n🏥 Starting health check server...");
    const healthServer = startHealthServer(config.healthPort, "alice");

    // Start monitoring loop
    console.log("\n👁️  Starting monitoring loop...");
    console.log("   Alice will automatically withdraw when destination escrows are ready");
    console.log("   Press Ctrl+C to stop\n");

    // Run monitoring in a way that can be interrupted
    monitoringPromise = runMonitoringLoop();

    // Keep the process alive and handle graceful shutdown
    await new Promise<void>((resolve) => {
      const shutdown = async () => {
        console.log("\n🛑 Shutting down Alice service gracefully...");
        isRunning = false;
        
        // Wait for current monitoring iteration to complete
        if (monitoringPromise) {
          try {
            await Promise.race([
              monitoringPromise,
              new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
            ]);
          } catch (error) {
            console.error("Error during shutdown:", error);
          }
        }
        
        // Close health server
        try {
          await healthServer.shutdown();
        } catch (error) {
          console.error("Error closing health server:", error);
        }
        
        console.log("✅ Alice service stopped");
        resolve();
      };

      // Register signal handlers
      Deno.addSignalListener("SIGINT", shutdown);
      Deno.addSignalListener("SIGTERM", shutdown);
    });

  } catch (error) {
    console.error("❌ Fatal error in Alice service:", error);
    Deno.exit(1);
  }
}

async function runMonitoringLoop(): Promise<void> {
  while (isRunning) {
    try {
      // Get all pending orders
      const orders = await alice.listOrders();
      
      if (orders.length === 0) {
        console.log(`[${new Date().toISOString()}] No pending orders found`);
      } else {
        console.log(`[${new Date().toISOString()}] Monitoring ${orders.length} order(s)`);
        
        // Check each order for withdrawal opportunities
        for (const order of orders) {
          if (!isRunning) break;
          
          try {
            // Get swap details from indexer
            const ponderClient = alice["ponderClient"]; // Access private property
            const swap = await ponderClient.getAtomicSwapByOrderHash(order.orderHash);
            
            if (swap && swap.dstEscrowAddress && swap.status === 'dst_created') {
              console.log(`\n🎯 Found destination escrow for order ${order.orderHash}`);
              console.log(`   Chain: ${swap.dstChain}`);
              console.log(`   Escrow: ${swap.dstEscrowAddress}`);
              console.log(`   Auto-withdrawing...`);
              
              try {
                await alice.withdrawFromDestination(order.orderHash);
                console.log(`✅ Successfully auto-withdrew from order ${order.orderHash}!`);
              } catch (error) {
                console.error(`❌ Auto-withdrawal failed for order ${order.orderHash}:`, error);
              }
            } else if (swap) {
              console.log(`  Order ${order.orderHash.slice(0, 10)}... - Status: ${swap.status || 'pending'}`);
            }
          } catch (error) {
            console.error(`Error checking order ${order.orderHash}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("❌ Error in monitoring iteration:", error);
    }
    
    // Wait for next polling interval
    if (isRunning) {
      await new Promise(resolve => setTimeout(resolve, config.pollingInterval));
    }
  }
}

// Start the service
if (import.meta.main) {
  main().catch(console.error);
}