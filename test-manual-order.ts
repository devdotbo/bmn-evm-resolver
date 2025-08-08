#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

/**
 * Manual test script to create a mock order for the resolver to process
 * This simulates what would happen if proper on-chain events were emitted
 */

import { UnifiedResolver } from "./src/resolver/resolver.ts";
// import { keccak256, toHex } from "viem";

async function createManualOrder() {
  console.log("🔧 Creating manual test order for resolver...");
  
  // Initialize resolver
  const resolver = new UnifiedResolver();
  
  // Create test order data matching what Alice created
  // const secret = "0x307861373938363435313664366435393539653161313939633439333066353630333434666666383865643863663062613065343966623234313464613864323764";
  const hashlock = "0xda974201617bc68d29fe2ff211f725a55dcfad0dcbdab5347cb171404e8e0841";
  const orderHash = "0x6bc85fea9ec88eea7ff09e304db4ef2d6139b3660203f7e48353c2ce780f9109";
  
  // Manually process the order by deploying destination escrow
  console.log("📝 Processing order manually...");
  console.log(`   Order Hash: ${orderHash}`);
  console.log(`   Hashlock: ${hashlock}`);
  
  // Create a mock swap object that the resolver would normally get from the indexer
  const mockSwap = {
    orderHash: orderHash,
    hashlock: hashlock,
    srcMaker: "0x240E2588e35FB9D3D60B283B45108a49972FFFd8", // Alice
    srcTaker: "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5", // Resolver
    srcToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1",
    srcAmount: "1000000000000000000",
    srcSafetyDeposit: "0",
    dstChainId: "10", // Optimism
    dstToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1",
    dstAmount: "1000000000000000000",
    dstSafetyDeposit: "0",
    status: "src_created",
    srcCreatedAt: new Date().toISOString(),
  };
  
  // Deploy destination escrow
  console.log("🚀 Deploying destination escrow on Optimism...");
  
  try {
    // Call the resolver's deployDestinationEscrow method directly
    // @ts-ignore - accessing private method for testing
    await resolver.deployDestinationEscrow(mockSwap);
    
    console.log("✅ Destination escrow deployment initiated!");
    console.log("   Alice's monitor should detect this and auto-withdraw");
  } catch (error) {
    console.error("❌ Error deploying destination escrow:", error);
  }
}

// Run the manual order creation
await createManualOrder();
console.log("\n✅ Manual order processing complete!");
console.log("   Check the resolver and Alice monitor logs for activity");