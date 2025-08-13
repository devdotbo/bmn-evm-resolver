#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

/**
 * Trigger Atomic Swap Script (oRPC Version)
 * 
 * This script triggers a complete atomic swap between Alice and Bob services
 * using the type-safe oRPC client for communication.
 * 
 * Benefits over the old version:
 * - Full type safety and autocomplete
 * - Automatic parameter validation
 * - Better error handling with typed errors
 * - No manual fetch calls or JSON parsing
 */

import { createORPCClient } from "npm:@orpc/client@latest";
import { RPCLink } from "npm:@orpc/client/fetch";
import { type RouterClient } from "npm:@orpc/server@latest";
import { type AliceRouter } from "../src/utils/alice-orpc-server.ts";

// ============================================================================
// Configuration
// ============================================================================

const ALICE_API_URL = "http://localhost:8001/api/alice";
const BOB_API_URL = "http://localhost:8002/api/bob";

// ============================================================================
// Create oRPC Clients
// ============================================================================

/**
 * Create Alice service client with proper typing
 */
function createAliceClient(): RouterClient<AliceRouter> {
  const link = new RPCLink({
    url: ALICE_API_URL,
    headers: {
      "Content-Type": "application/json",
    },
  });
  
  return createORPCClient(link) as RouterClient<AliceRouter>;
}

// For now, we'll keep Bob as a simple fetch client since we haven't implemented oRPC for Bob yet
async function checkBobHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BOB_API_URL.replace("/api/bob", "")}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Monitor swap progress
 */
async function monitorSwap(
  client: RouterClient<AliceRouter>,
  hashlock: string,
  timeoutMs: number = 300000
): Promise<void> {
  console.log(`\n📊 Monitoring swap with hashlock: ${hashlock}`);
  
  const startTime = Date.now();
  let lastStatus = "";
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      // Use the type-safe oRPC client
      const [error, status] = await client.getSwapStatus({ hashlock });
      
      if (error) {
        if (error.code === "SWAP_NOT_FOUND") {
          console.log("⏳ Waiting for swap to be detected...");
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        console.error("❌ Error checking swap status:", error.message);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      if (!status) {
        console.log("⏳ Waiting for swap data...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      // Print status update if changed
      if (status.status !== lastStatus) {
        lastStatus = status.status;
        console.log(`\n✅ Status: ${status.status}`);
        
        if (status.sourceEscrow) {
          console.log(`   Source Escrow: ${status.sourceEscrow}`);
        }
        if (status.destinationEscrow) {
          console.log(`   Destination Escrow: ${status.destinationEscrow}`);
        }
        if (status.secret) {
          console.log(`   Secret Revealed: ${status.secret}`);
        }
      }
      
      // Check if swap is completed
      if (status.completed) {
        console.log("\n🎉 Swap completed successfully!");
        return;
      }
      
    } catch (err) {
      console.error("Error during monitoring:", err);
    }
    
    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.error("\n❌ Swap timed out");
}

/**
 * Check service health
 */
async function checkServiceHealth(client: RouterClient<AliceRouter>): Promise<boolean> {
  try {
    const [aliceError, aliceHealth] = await client.health();
    const bobHealthy = await checkBobHealth();
    
    if (aliceError) {
      console.error("❌ Alice service error:", aliceError.message);
      return false;
    }
    
    if (!aliceHealth || aliceHealth.status !== "healthy") {
      console.error("❌ Alice service is not healthy");
      return false;
    }
    
    if (!bobHealthy) {
      console.error("❌ Bob service is not healthy");
      return false;
    }
    
    console.log("✅ Both services are healthy");
    return true;
    
  } catch (error) {
    console.error("❌ Failed to check service health:", error);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("🚀 Starting Atomic Swap Trigger (oRPC Version)\n");
  
  // Create Alice client
  const aliceClient = createAliceClient();
  
  // Check services are running
  console.log("🏥 Checking service health...");
  const healthy = await checkServiceHealth(aliceClient);
  
  if (!healthy) {
    console.error("\n❌ Services are not healthy. Please ensure both Alice and Bob services are running.");
    console.error("   Run: docker-compose up -d --build");
    Deno.exit(1);
  }
  
  // Parse command line arguments
  const args = Deno.args;
  let sourceChain = 8453; // Base
  let destinationChain = 10; // Optimism
  let amount = "10000000000000000"; // 0.01 tokens in wei
  
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: deno run --allow-net --allow-env scripts/trigger-atomic-swap-orpc.ts [options]

Options:
  --source <chainId>       Source chain ID (default: 8453 for Base)
  --dest <chainId>         Destination chain ID (default: 10 for Optimism)
  --amount <wei>           Amount in wei (default: 10000000000000000)
  --reverse                Swap from Optimism to Base instead
  --help, -h               Show this help message

Examples:
  # Default swap (Base to Optimism)
  deno run --allow-net --allow-env scripts/trigger-atomic-swap-orpc.ts
  
  # Reverse swap (Optimism to Base)
  deno run --allow-net --allow-env scripts/trigger-atomic-swap-orpc.ts --reverse
  
  # Custom amount
  deno run --allow-net --allow-env scripts/trigger-atomic-swap-orpc.ts --amount 50000000000000000
`);
    Deno.exit(0);
  }
  
  // Parse arguments
  if (args.includes("--reverse")) {
    sourceChain = 10; // Optimism
    destinationChain = 8453; // Base
    console.log("🔄 Using reverse direction: Optimism → Base");
  }
  
  const sourceIdx = args.indexOf("--source");
  if (sourceIdx >= 0 && args[sourceIdx + 1]) {
    sourceChain = parseInt(args[sourceIdx + 1]);
  }
  
  const destIdx = args.indexOf("--dest");
  if (destIdx >= 0 && args[destIdx + 1]) {
    destinationChain = parseInt(args[destIdx + 1]);
  }
  
  const amountIdx = args.indexOf("--amount");
  if (amountIdx >= 0 && args[amountIdx + 1]) {
    amount = args[amountIdx + 1];
  }
  
  // Display swap parameters
  console.log("\n📋 Swap Parameters:");
  console.log(`   Source Chain: ${sourceChain === 8453 ? "Base" : "Optimism"} (${sourceChain})`);
  console.log(`   Destination Chain: ${destinationChain === 8453 ? "Base" : "Optimism"} (${destinationChain})`);
  console.log(`   Amount: ${amount} wei (${parseFloat(amount) / 1e18} tokens)`);
  
  // Trigger Alice to create order using oRPC client
  console.log("\n🚀 Triggering Alice to create order...");
  
  const [createError, orderResult] = await aliceClient.createOrder({
    srcChainId: sourceChain as 10 | 8453,
    dstChainId: destinationChain as 10 | 8453,
    srcAmount: amount,
    dstAmount: amount, // Same amount for both sides
  });
  
  if (createError) {
    console.error("\n❌ Failed to create order:");
    console.error(`   Error Code: ${createError.code}`);
    console.error(`   Message: ${createError.message}`);
    
    // Handle specific error types with typed data
    if (createError.code === "INSUFFICIENT_BALANCE" && createError.data) {
      console.error(`   Required: ${createError.data.required} wei`);
      console.error(`   Available: ${createError.data.available} wei`);
      console.error(`   Token: ${createError.data.token}`);
    } else if (createError.code === "ORDER_CREATION_FAILED" && createError.data) {
      console.error(`   Reason: ${createError.data.reason}`);
      if (createError.data.details) {
        console.error(`   Details:`, createError.data.details);
      }
    } else if (createError.code === "INPUT_VALIDATION_FAILED" && createError.data) {
      console.error(`   Field Errors:`, createError.data.fieldErrors);
      console.error(`   Form Errors:`, createError.data.formErrors);
    }
    
    Deno.exit(1);
  }
  
  if (!orderResult || !orderResult.success) {
    console.error("\n❌ Order creation failed unexpectedly");
    Deno.exit(1);
  }
  
  console.log("\n✅ Order created successfully!");
  console.log(`   Order Hash: ${orderResult.orderHash}`);
  console.log(`   Hashlock: ${orderResult.hashlock}`);
  if (orderResult.filePath) {
    console.log(`   File Path: ${orderResult.filePath}`);
  }
  
  // Monitor the swap progress
  await monitorSwap(aliceClient, orderResult.hashlock);
  
  // Get final status
  console.log("\n📊 Getting final swap status...");
  const [statusError, finalStatus] = await aliceClient.getSwapStatus({
    hashlock: orderResult.hashlock,
  });
  
  if (!statusError && finalStatus) {
    console.log("\n📋 Final Swap Details:");
    console.log(`   Status: ${finalStatus.status}`);
    console.log(`   Completed: ${finalStatus.completed}`);
    if (finalStatus.sourceEscrow) {
      console.log(`   Source Escrow: ${finalStatus.sourceEscrow}`);
    }
    if (finalStatus.destinationEscrow) {
      console.log(`   Destination Escrow: ${finalStatus.destinationEscrow}`);
    }
    if (finalStatus.secret) {
      console.log(`   Secret: ${finalStatus.secret}`);
    }
    
    const duration = finalStatus.sourceWithdrawnAt 
      ? (finalStatus.sourceWithdrawnAt - finalStatus.createdAt) / 1000
      : (Date.now() - finalStatus.createdAt) / 1000;
    console.log(`   Total Duration: ${duration.toFixed(1)} seconds`);
  }
  
  console.log("\n✨ Atomic swap trigger completed!");
}

// Run the main function
if (import.meta.main) {
  main().catch(console.error);
}