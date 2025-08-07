#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

/**
 * Bob Service - Swap acceptor/taker service for cross-chain atomic swaps
 * 
 * This service runs continuously to:
 * - Monitor pending atomic swaps as the taker/acceptor
 * - Fill profitable orders from the taker perspective
 * - Create destination escrows in response to source escrows
 * - Complete swaps by revealing secrets
 * - Provide health check endpoints
 * 
 * Bob mode is essentially the resolver acting as the counterparty (taker)
 * rather than the coordinator/maker role.
 */

import { createResolver } from "./src/resolver/resolver.ts";
import { startHealthServer } from "./src/utils/health-server.ts";

// Configuration from environment variables
const config = {
  indexerUrl: Deno.env.get("INDEXER_URL") || "http://localhost:42069",
  privateKey: Deno.env.get("BOB_PRIVATE_KEY") || Deno.env.get("RESOLVER_PRIVATE_KEY"),
  ankrApiKey: Deno.env.get("ANKR_API_KEY"),
  pollingInterval: parseInt(Deno.env.get("BOB_POLLING_INTERVAL") || Deno.env.get("POLLING_INTERVAL") || "10000"),
  minProfitBps: parseInt(Deno.env.get("BOB_MIN_PROFIT_BPS") || Deno.env.get("MIN_PROFIT_BPS") || "0"),
  healthPort: parseInt(Deno.env.get("BOB_HEALTH_PORT") || "8002"),
};

// Validate configuration
if (!config.privateKey) {
  console.error("❌ Error: BOB_PRIVATE_KEY or RESOLVER_PRIVATE_KEY environment variable is required");
  console.log("\nPlease set the following environment variables:");
  console.log("  BOB_PRIVATE_KEY - Bob's private key for signing transactions");
  console.log("    (or RESOLVER_PRIVATE_KEY as fallback)");
  console.log("\nOptional environment variables:");
  console.log("  INDEXER_URL - Indexer URL (default: http://localhost:42069)");
  console.log("  BOB_POLLING_INTERVAL - Polling interval in ms (default: 10000)");
  console.log("  BOB_MIN_PROFIT_BPS - Minimum profit in basis points (default: 0 = 0%)");
  console.log("  BOB_HEALTH_PORT - Health check port (default: 8002)");
  console.log("  ANKR_API_KEY - Ankr API key for RPC endpoints");
  Deno.exit(1);
}

console.log("🤖 Starting Bob Service (Taker/Acceptor) with configuration:");
console.log(`  📡 Indexer URL: ${config.indexerUrl}`);
console.log(`  ⏱️  Polling Interval: ${config.pollingInterval}ms`);
console.log(`  💰 Min Profit: ${config.minProfitBps} bps (${config.minProfitBps / 100}%)`);
console.log(`  🏥 Health Port: ${config.healthPort}`);
console.log(`  🔑 Private Key: ${config.privateKey ? "Set" : "Not set"}`);
console.log(`  🔑 Ankr API Key: ${config.ankrApiKey ? "Set" : "Not set (using public endpoints)"}`);
console.log(`  🎭 Service Mode: Bob (Taker/Acceptor)`);

// Create the resolver in Bob mode
const resolver = createResolver(config);
let healthServer: Deno.HttpServer | null = null;

async function main() {
  try {
    // Start health check server
    console.log("\n🏥 Starting health check server...");
    healthServer = startHealthServer(config.healthPort, "bob");
    console.log("✅ Health server started successfully");

    // Start the resolver in Bob mode
    console.log("\n🚀 Starting Bob service...");
    console.log("   Bob will act as taker/acceptor for atomic swaps");
    console.log("   Creating destination escrows and completing swaps");
    console.log("   Press Ctrl+C to stop\n");
    
    await resolver.start();

    // Keep the process alive and handle graceful shutdown
    await new Promise<void>((resolve) => {
      const shutdown = async () => {
        console.log("\n🛑 Shutting down Bob service gracefully...");
        
        // Stop the resolver
        try {
          await resolver.stop();
        } catch (error) {
          console.error("Error stopping Bob resolver:", error);
        }
        
        // Close health server
        try {
          if (healthServer) {
            await healthServer.shutdown();
          }
        } catch (error) {
          console.error("Error closing health server:", error);
        }
        
        console.log("✅ Bob service stopped");
        resolve();
      };

      // Register signal handlers
      Deno.addSignalListener("SIGINT", shutdown);
      Deno.addSignalListener("SIGTERM", shutdown);
    });

  } catch (error) {
    console.error("❌ Fatal error in Bob service:", error);
    
    // Cleanup on error
    try {
      await resolver.stop();
    } catch {}
    
    try {
      if (healthServer) {
        await healthServer.shutdown();
      }
    } catch {}
    
    Deno.exit(1);
  }
}

// Start the service
if (import.meta.main) {
  main().catch(console.error);
}