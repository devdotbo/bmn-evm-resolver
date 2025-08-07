#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

/**
 * Test script for the unified resolver
 * Verifies configuration and connectivity without actually processing orders
 */

import { createResolver } from "./src/resolver/resolver.ts";
import { PonderClient } from "./src/indexer/ponder-client.ts";
import { CREATE3_ADDRESSES } from "./src/config/contracts.ts";
import { createPublicClient, http } from "viem";
import { base, optimism } from "viem/chains";

console.log("🧪 Testing Unified Resolver Configuration\n");

// Test 1: Check environment variables
console.log("1️⃣ Checking environment variables...");
const privateKey = Deno.env.get("RESOLVER_PRIVATE_KEY");
const ankrApiKey = Deno.env.get("ANKR_API_KEY");
const indexerUrl = Deno.env.get("INDEXER_URL") || "http://localhost:42069";

if (!privateKey) {
  console.error("   ❌ RESOLVER_PRIVATE_KEY not set");
} else {
  console.log("   ✅ RESOLVER_PRIVATE_KEY is set");
}

if (!ankrApiKey) {
  console.warn("   ⚠️  ANKR_API_KEY not set (will use public endpoints)");
} else {
  console.log("   ✅ ANKR_API_KEY is set");
}

console.log(`   📡 Indexer URL: ${indexerUrl}`);

// Test 2: Check contract addresses
console.log("\n2️⃣ Checking contract addresses...");
console.log(`   Factory V2: ${CREATE3_ADDRESSES.ESCROW_FACTORY_V2}`);
console.log(`   Base SimpleLimitOrderProtocol: ${CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_BASE}`);
console.log(`   Optimism SimpleLimitOrderProtocol: ${CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_OPTIMISM}`);

// Test 3: Test indexer connectivity
console.log("\n3️⃣ Testing indexer connectivity...");
try {
  const ponderClient = new PonderClient({ url: indexerUrl });
  
  // Try to get chain statistics
  const baseStats = await ponderClient.getChainStatistics(base.id);
  console.log(`   ✅ Indexer connected - Base stats: ${JSON.stringify(baseStats)}`);
} catch (error) {
  console.error(`   ❌ Failed to connect to indexer: ${error}`);
}

// Test 4: Test RPC connectivity
console.log("\n4️⃣ Testing RPC connectivity...");

// Test Base RPC
try {
  const baseClient = createPublicClient({
    chain: base,
    transport: http(`https://rpc.ankr.com/base/${ankrApiKey || ""}`),
  });
  
  const baseBlockNumber = await baseClient.getBlockNumber();
  console.log(`   ✅ Base RPC connected - Block: ${baseBlockNumber}`);
} catch (error) {
  console.error(`   ❌ Failed to connect to Base RPC: ${error}`);
}

// Test Optimism RPC
try {
  const optimismClient = createPublicClient({
    chain: optimism,
    transport: http(`https://rpc.ankr.com/optimism/${ankrApiKey || ""}`),
  });
  
  const optimismBlockNumber = await optimismClient.getBlockNumber();
  console.log(`   ✅ Optimism RPC connected - Block: ${optimismBlockNumber}`);
} catch (error) {
  console.error(`   ❌ Failed to connect to Optimism RPC: ${error}`);
}

// Test 5: Create resolver instance
console.log("\n5️⃣ Creating resolver instance...");
if (privateKey) {
  try {
    const resolver = createResolver({
      indexerUrl,
      privateKey,
      ankrApiKey,
      pollingInterval: 10000,
      minProfitBps: 50,
    });
    
    const stats = await resolver.getStatistics();
    console.log(`   ✅ Resolver created successfully`);
    console.log(`   📊 Resolver stats: ${JSON.stringify(stats, null, 2)}`);
    
    // Stop the resolver
    await resolver.stop();
  } catch (error) {
    console.error(`   ❌ Failed to create resolver: ${error}`);
  }
} else {
  console.log("   ⏭️  Skipping resolver creation (no private key)");
}

console.log("\n✅ Test complete!");
console.log("\nTo run the resolver:");
console.log("  RESOLVER_PRIVATE_KEY=0x... ANKR_API_KEY=... deno run --allow-all run-resolver.ts");