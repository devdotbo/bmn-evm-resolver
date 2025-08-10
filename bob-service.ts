#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

/**
 * Bob-Resolver Unified Service - Combined taker and resolver service for cross-chain atomic swaps
 * 
 * This unified service runs continuously to:
 * - Act as RESOLVER: Monitor and fill Alice's limit orders
 * - Act as BOB: Create destination escrows and complete swaps
 * - Fill profitable orders using SimpleLimitOrderProtocol
 * - Create destination escrows in response to source escrows
 * - Withdraw from source escrows by revealing secrets
 * - Monitor for profitable swaps from both maker and taker perspectives
 * - Manage keys, secrets, and order processing
 * - Provide health check endpoints on port 8002
 * 
 * This service combines both Bob (taker/acceptor) and Resolver (coordinator) roles
 * into a single unified service for simplified deployment and operation.
 */

import { createResolver } from "./src/resolver/resolver.ts";
import { startHealthServer } from "./src/utils/health-server.ts";
import { fillLimitOrder, ensureLimitOrderApprovals } from "./src/utils/limit-order.ts";

// Configuration from environment variables
const config = {
  indexerUrl: Deno.env.get("INDEXER_URL") || "http://localhost:42069",
  privateKey: Deno.env.get("BOB_PRIVATE_KEY") || Deno.env.get("RESOLVER_PRIVATE_KEY"),
  ankrApiKey: Deno.env.get("ANKR_API_KEY"),
  pollingInterval: parseInt(Deno.env.get("BOB_POLLING_INTERVAL") || Deno.env.get("POLLING_INTERVAL") || "10000"),
  minProfitBps: parseInt(Deno.env.get("BOB_MIN_PROFIT_BPS") || Deno.env.get("MIN_PROFIT_BPS") || "0"),
  healthPort: parseInt(Deno.env.get("BOB_HEALTH_PORT") || "8002"),
  // Unified mode enables both resolver and bob capabilities
  unifiedMode: true,
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

console.log("🤖 Starting Bob-Resolver Unified Service with configuration:");
console.log(`  📡 Indexer URL: ${config.indexerUrl}`);
console.log(`  ⏱️  Polling Interval: ${config.pollingInterval}ms`);
console.log(`  💰 Min Profit: ${config.minProfitBps} bps (${config.minProfitBps / 100}%)`);
console.log(`  🏥 Health Port: ${config.healthPort}`);
console.log(`  🔑 Private Key: ${config.privateKey ? "Set" : "Not set"}`);
console.log(`  🔑 Ankr API Key: ${config.ankrApiKey ? "Set" : "Not set (using public endpoints)"}`);
console.log(`  🎭 Service Mode: Unified Bob-Resolver (Taker + Coordinator)`);
console.log(`  ✨ Capabilities: Fill limit orders, create escrows, withdraw funds`);

// Create the unified resolver with both Bob and Resolver capabilities
const resolver = createResolver(config);
let healthServer: Deno.HttpServer | null = null;

// Setup HTTP endpoints for direct order processing
async function setupHttpEndpoints() {
  const server = Deno.serve({ port: config.healthPort }, async (req) => {
    const url = new URL(req.url);
    
    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ 
        status: "healthy", 
        service: "bob-resolver-unified",
        mode: "taker+coordinator",
        capabilities: ["fill-orders", "create-escrows", "withdraw-funds"],
        timestamp: new Date().toISOString() 
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Fill order endpoint (resolver capability)
    if (url.pathname === "/fill-order" && req.method === "POST") {
      try {
        const orderData = await req.json();
        console.log("📝 Received order to fill:", orderData);
        // Process the order through the resolver
        const result = await resolver.processOrder(orderData);
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Error filling order:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    
    // Withdraw endpoint (bob capability)
    if (url.pathname === "/withdraw" && req.method === "POST") {
      try {
        const withdrawData = await req.json();
        console.log("💸 Received withdrawal request:", withdrawData);
        // Process withdrawal through the resolver
        const result = await resolver.processWithdrawal(withdrawData);
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Error processing withdrawal:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    
    return new Response("Not Found", { status: 404 });
  });
  
  return server;
}

async function main() {
  try {
    // Start HTTP server with endpoints
    console.log("\n🏥 Starting unified service with HTTP endpoints...");
    healthServer = await setupHttpEndpoints();
    console.log("✅ HTTP server started successfully on port", config.healthPort);
    console.log("   Available endpoints:");
    console.log("   - GET  /health       - Health check");
    console.log("   - POST /fill-order   - Fill a limit order (resolver)");
    console.log("   - POST /withdraw     - Withdraw from escrow (bob)");

    // Start the unified resolver service
    console.log("\n🚀 Starting Bob-Resolver unified service...");
    console.log("   Service will operate in dual mode:");
    console.log("   - RESOLVER: Fill Alice's limit orders");
    console.log("   - BOB: Create destination escrows and complete swaps");
    console.log("   Press Ctrl+C to stop\n");
    
    await resolver.start();

    // Keep the process alive and handle graceful shutdown
    await new Promise<void>((resolve) => {
      const shutdown = async () => {
        console.log("\n🛑 Shutting down Bob-Resolver unified service gracefully...");
        
        // Stop the resolver
        try {
          await resolver.stop();
        } catch (error) {
          console.error("Error stopping unified resolver:", error);
        }
        
        // Close HTTP server
        try {
          if (healthServer) {
            await healthServer.shutdown();
          }
        } catch (error) {
          console.error("Error closing HTTP server:", error);
        }
        
        console.log("✅ Bob-Resolver unified service stopped");
        resolve();
      };

      // Register signal handlers
      Deno.addSignalListener("SIGINT", shutdown);
      Deno.addSignalListener("SIGTERM", shutdown);
    });

  } catch (error) {
    console.error("❌ Fatal error in Bob-Resolver unified service:", error);
    
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