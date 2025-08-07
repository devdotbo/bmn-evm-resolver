#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

/**
 * Resolver Service - Main coordination service for cross-chain atomic swaps
 * 
 * This service runs continuously to:
 * - Monitor pending atomic swaps from the indexer
 * - Fill profitable limit orders
 * - Create escrows and manage swap flow
 * - Withdraw funds when secrets are revealed
 * - Provide health check endpoints
 */

import { createResolver } from "./src/resolver/resolver.ts";
import { startHealthServer } from "./src/utils/health-server.ts";

// Configuration from environment variables
const config = {
  indexerUrl: Deno.env.get("INDEXER_URL") || "http://localhost:42069",
  privateKey: Deno.env.get("RESOLVER_PRIVATE_KEY"),
  ankrApiKey: Deno.env.get("ANKR_API_KEY"),
  pollingInterval: parseInt(Deno.env.get("POLLING_INTERVAL") || "10000"),
  minProfitBps: parseInt(Deno.env.get("MIN_PROFIT_BPS") || "0"), // 0% default - no profit required
  healthPort: parseInt(Deno.env.get("RESOLVER_HEALTH_PORT") || "8000"),
};

// Validate configuration
if (!config.privateKey) {
  console.error("❌ Error: RESOLVER_PRIVATE_KEY environment variable is required");
  console.log("\nPlease set the following environment variables:");
  console.log("  RESOLVER_PRIVATE_KEY - Resolver's private key for signing transactions");
  console.log("\nOptional environment variables:");
  console.log("  INDEXER_URL - Indexer URL (default: http://localhost:42069)");
  console.log("  POLLING_INTERVAL - Polling interval in ms (default: 10000)");
  console.log("  MIN_PROFIT_BPS - Minimum profit in basis points (default: 0 = 0%)");
  console.log("  RESOLVER_HEALTH_PORT - Health check port (default: 8000)");
  console.log("  ANKR_API_KEY - Ankr API key for RPC endpoints");
  Deno.exit(1);
}

console.log("🔧 Starting Resolver Service with configuration:");
console.log(`  📡 Indexer URL: ${config.indexerUrl}`);
console.log(`  ⏱️  Polling Interval: ${config.pollingInterval}ms`);
console.log(`  💰 Min Profit: ${config.minProfitBps} bps (${config.minProfitBps / 100}%)`);
console.log(`  🏥 Health Port: ${config.healthPort}`);
console.log(`  🔑 Private Key: ${config.privateKey ? "Set" : "Not set"}`);
console.log(`  🔑 Ankr API Key: ${config.ankrApiKey ? "Set" : "Not set (using public endpoints)"}`);

// Create the resolver
const resolver = createResolver(config);
let healthServer: Deno.HttpServer | null = null;

async function main() {
  try {
    // Start health check server
    console.log("\n🏥 Starting health check server...");
    healthServer = startHealthServer(config.healthPort, "resolver");
    console.log("✅ Health server started successfully");

    // Start the resolver
    console.log("\n🚀 Starting resolver...");
    console.log("   Resolver will monitor and fill profitable atomic swaps");
    console.log("   Press Ctrl+C to stop\n");
    
    await resolver.start();

    // Keep the process alive and handle graceful shutdown
    await new Promise<void>((resolve) => {
      const shutdown = async () => {
        console.log("\n🛑 Shutting down Resolver service gracefully...");
        
        // Stop the resolver
        try {
          await resolver.stop();
        } catch (error) {
          console.error("Error stopping resolver:", error);
        }
        
        // Close health server
        try {
          if (healthServer) {
            await healthServer.shutdown();
          }
        } catch (error) {
          console.error("Error closing health server:", error);
        }
        
        console.log("✅ Resolver service stopped");
        resolve();
      };

      // Register signal handlers
      Deno.addSignalListener("SIGINT", shutdown);
      Deno.addSignalListener("SIGTERM", shutdown);
    });

  } catch (error) {
    console.error("❌ Fatal error in Resolver service:", error);
    
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