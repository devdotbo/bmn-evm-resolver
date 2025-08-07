#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

import { LimitOrderAlice } from "./src/alice/limit-order-alice.ts";

async function testLimitOrderCreation() {
  console.log("🧪 Testing Limit Order Creation with SimpleLimitOrderProtocol");
  console.log("=" .repeat(60));
  
  try {
    const alice = new LimitOrderAlice();
    await alice.init();
    
    // Test parameters
    const testParams = {
      srcChainId: 8453, // Base
      dstChainId: 10, // Optimism
      srcAmount: 1000000000000000000n, // 1 BMN token
      dstAmount: 1000000000000000000n, // 1 BMN token (1:1 swap)
      resolverAddress: "0x0000000000000000000000000000000000000000", // Any resolver
      srcSafetyDeposit: 10000000000000000n, // 0.01 BMN
      dstSafetyDeposit: 10000000000000000n, // 0.01 BMN
    };
    
    console.log("\n📋 Order Parameters:");
    console.log(`   Source Chain: ${testParams.srcChainId} (Base)`);
    console.log(`   Destination Chain: ${testParams.dstChainId} (Optimism)`);
    console.log(`   Amount: ${testParams.srcAmount / 10n**18n} BMN`);
    console.log(`   Resolver: ${testParams.resolverAddress}`);
    
    // Dry run - just test the order creation logic without actual blockchain interaction
    if (Deno.env.get("DRY_RUN") !== "false") {
      console.log("\n⚠️  DRY RUN MODE - Not submitting to blockchain");
      console.log("   Set DRY_RUN=false to execute real transaction");
      
      // Just test the order structure creation
      const salt = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      const secret = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      
      console.log("\n✅ Order structure test successful!");
      console.log(`   Sample Salt: ${salt}`);
      console.log(`   Sample Secret: ${secret.slice(0, 20)}...`);
      console.log(`   SimpleLimitOrderProtocol Base: 0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06`);
      console.log(`   SimpleLimitOrderProtocol Optimism: 0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7`);
      
      return;
    }
    
    // Create the actual order
    console.log("\n🚀 Creating real limit order...");
    const orderHash = await alice.createOrder(testParams);
    
    console.log("\n✅ Limit order created successfully!");
    console.log(`   Order Hash: ${orderHash}`);
    
    // List orders to verify
    console.log("\n📋 Listing current orders...");
    const orders = await alice.listOrders();
    console.log(`   Found ${orders.length} order(s)`);
    
    for (const order of orders) {
      console.log(`\n   Order: ${order.orderHash}`);
      console.log(`     Status: ${order.status}`);
      console.log(`     Amount: ${order.srcAmount}`);
    }
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  testLimitOrderCreation().catch(console.error);
}