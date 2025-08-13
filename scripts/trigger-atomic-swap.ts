#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

/**
 * Trigger Atomic Swap Script
 * 
 * This script triggers a complete atomic swap between Alice and Bob services
 * running in Docker containers.
 * 
 * Flow:
 * 1. Triggers Alice to create an order via API
 * 2. Monitors the swap progress
 * 3. Reports status updates
 */

import { type Address, type Hex } from "viem";

const ALICE_API = "http://localhost:8001";
const BOB_API = "http://localhost:8002";

interface SwapParams {
  sourceChain: number;
  destinationChain: number;
  amount: bigint;
  tokenAddress?: Address;
}

interface OrderResponse {
  success: boolean;
  orderHash?: string;
  hashlock?: string;
  error?: string;
}

interface SwapStatus {
  hashlock: string;
  status: string;
  sourceEscrow?: Address;
  destinationEscrow?: Address;
  secret?: Hex;
  completed: boolean;
}

async function triggerAliceOrder(params: SwapParams): Promise<OrderResponse> {
  console.log("🚀 Triggering Alice to create order...");
  
  try {
    const response = await fetch(`${ALICE_API}/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceChainId: params.sourceChain,
        destinationChainId: params.destinationChain,
        amount: params.amount.toString(),
        tokenAddress: params.tokenAddress || "0x8287CD2aC7E227D9D927F998EB600a0683a832A1", // BMN token
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Alice API error: ${error}`);
    }
    
    const data = await response.json();
    return {
      success: true,
      orderHash: data.orderHash,
      hashlock: data.hashlock,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkSwapStatus(hashlock: string): Promise<SwapStatus | null> {
  try {
    // Check Alice's view of the swap
    const aliceResponse = await fetch(`${ALICE_API}/swap-status/${hashlock}`);
    if (aliceResponse.ok) {
      return await aliceResponse.json();
    }
    
    // Check Bob's view of the swap
    const bobResponse = await fetch(`${BOB_API}/swap-status/${hashlock}`);
    if (bobResponse.ok) {
      return await bobResponse.json();
    }
    
    return null;
  } catch (error) {
    console.error("Error checking swap status:", error);
    return null;
  }
}

async function monitorSwap(hashlock: string, timeoutMs: number = 300000): Promise<void> {
  console.log(`\n📊 Monitoring swap with hashlock: ${hashlock}`);
  
  const startTime = Date.now();
  let lastStatus = "";
  
  while (Date.now() - startTime < timeoutMs) {
    const status = await checkSwapStatus(hashlock);
    
    if (!status) {
      console.log("⏳ Waiting for swap to be detected...");
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
    
    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.error("\n❌ Swap timed out");
}

async function checkServiceHealth(): Promise<boolean> {
  try {
    const [aliceHealth, bobHealth] = await Promise.all([
      fetch(`${ALICE_API}/health`).then(r => r.ok),
      fetch(`${BOB_API}/health`).then(r => r.ok),
    ]);
    
    if (!aliceHealth) {
      console.error("❌ Alice service is not healthy");
      return false;
    }
    if (!bobHealth) {
      console.error("❌ Bob service is not healthy");
      return false;
    }
    
    console.log("✅ Both services are healthy");
    return true;
  } catch (error) {
    console.error("❌ Could not reach services:", error);
    return false;
  }
}

async function main() {
  console.log("🔄 Bridge-Me-Not Atomic Swap Trigger");
  console.log("=====================================\n");
  
  // Check service health
  if (!await checkServiceHealth()) {
    console.error("\n⚠️  Please ensure both Alice and Bob services are running:");
    console.error("   docker-compose up -d --build");
    Deno.exit(1);
  }
  
  // Parse command line arguments
  const sourceChain = parseInt(Deno.args[0] || "8453"); // Default: Base
  const destinationChain = parseInt(Deno.args[1] || "10"); // Default: Optimism
  const amountEther = Deno.args[2] || "0.01"; // Default: 0.01 BMN
  
  const swapParams: SwapParams = {
    sourceChain,
    destinationChain,
    amount: BigInt(Math.floor(parseFloat(amountEther) * 1e18)),
  };
  
  console.log("\n📋 Swap Parameters:");
  console.log(`   Source Chain: ${sourceChain === 8453 ? "Base" : "Chain " + sourceChain}`);
  console.log(`   Destination Chain: ${destinationChain === 10 ? "Optimism" : "Chain " + destinationChain}`);
  console.log(`   Amount: ${amountEther} BMN`);
  console.log();
  
  // Trigger Alice to create order
  const orderResult = await triggerAliceOrder(swapParams);
  
  if (!orderResult.success) {
    console.error("❌ Failed to create order:", orderResult.error);
    Deno.exit(1);
  }
  
  console.log(`✅ Order created successfully!`);
  console.log(`   Hashlock: ${orderResult.hashlock}`);
  console.log(`   Order Hash: ${orderResult.orderHash}`);
  
  // Monitor the swap progress
  await monitorSwap(orderResult.hashlock!, 300000); // 5 minute timeout
}

// Run the script
if (import.meta.main) {
  main().catch(error => {
    console.error("Fatal error:", error);
    Deno.exit(1);
  });
}