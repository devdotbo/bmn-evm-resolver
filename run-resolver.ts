#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

/**
 * Main entry point for running the unified resolver
 * 
 * This resolver:
 * - Uses PonderClient for SQL over HTTP indexer queries
 * - Integrates with SimpleLimitOrderProtocol for order filling
 * - Uses SecretManager for local state management
 * - Monitors and fills profitable atomic swaps
 * - Withdraws funds when secrets are revealed
 */

import { createResolver } from "./src/resolver/resolver.ts";

// Configuration from environment variables
const config = {
  indexerUrl: Deno.env.get("INDEXER_URL") || "http://localhost:42069",
  privateKey: Deno.env.get("RESOLVER_PRIVATE_KEY"),
  ankrApiKey: Deno.env.get("ANKR_API_KEY"),
  pollingInterval: parseInt(Deno.env.get("POLLING_INTERVAL") || "10000"),
  minProfitBps: parseInt(Deno.env.get("MIN_PROFIT_BPS") || "0"), // 0% default - no profit required
};

// Validate configuration
if (!config.privateKey) {
  console.error("❌ Error: RESOLVER_PRIVATE_KEY environment variable is required");
  console.log("\nUsage:");
  console.log("  RESOLVER_PRIVATE_KEY=0x... ANKR_API_KEY=... deno run --allow-all run-resolver.ts");
  console.log("\nOptional environment variables:");
  console.log("  INDEXER_URL - Indexer URL (default: http://localhost:42069)");
  console.log("  POLLING_INTERVAL - Polling interval in ms (default: 10000)");
  console.log("  MIN_PROFIT_BPS - Minimum profit in basis points (default: 0 = 0%)");
  Deno.exit(1);
}

console.log("🔧 Starting Unified Resolver with configuration:");
console.log(`  📡 Indexer URL: ${config.indexerUrl}`);
console.log(`  ⏱️  Polling Interval: ${config.pollingInterval}ms`);
console.log(`  💰 Min Profit: ${config.minProfitBps} bps (${config.minProfitBps / 100}%)`);
console.log(`  🔑 Ankr API Key: ${config.ankrApiKey ? "Set" : "Not set (using public endpoints)"}`);

// Create and start the resolver
const resolver = createResolver(config);

// Handle graceful shutdown
const shutdown = async () => {
  console.log("\n🛑 Shutting down gracefully...");
  await resolver.stop();
  Deno.exit(0);
};

// Register signal handlers
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

// Start the resolver
try {
  console.log("\n🚀 Starting resolver...\n");
  await resolver.start();
} catch (error) {
  console.error("❌ Fatal error:", error);
  await resolver.stop();
  Deno.exit(1);
}