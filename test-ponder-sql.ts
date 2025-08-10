#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Test script to verify PonderClient SQL implementation
 * Tests the Direct SQL over HTTP endpoint
 */

import { PonderClient } from "./src/indexer/ponder-client.ts";

async function testPonderClient() {
  console.log("🧪 Testing PonderClient SQL implementation\n");
  console.log("=" .repeat(50));
  
  // Initialize client with environment URL or default
  const indexerUrl = Deno.env.get("INDEXER_URL") || "http://localhost:42069";
  console.log(`📍 Indexer URL: ${indexerUrl}\n`);
  
  const client = new PonderClient({ url: indexerUrl });
  
  try {
    // Test 1: Get active swaps
    console.log("Test 1: Getting active swaps...");
    const activeSwaps = await client.getActiveSwaps();
    console.log(`✅ Found ${activeSwaps.length} active swaps`);
    if (activeSwaps.length > 0) {
      console.log("Sample swap:", JSON.stringify(activeSwaps[0], null, 2));
    }
    console.log();
    
    // Test 2: Get pending atomic swaps for a resolver
    console.log("Test 2: Getting pending atomic swaps...");
    const resolverAddress = "0x0000000000000000000000000000000000000000"; // Test address
    const pendingSwaps = await client.getPendingAtomicSwaps(resolverAddress);
    console.log(`✅ Found ${pendingSwaps.length} pending swaps for resolver`);
    console.log();
    
    // Test 3: Get recent withdrawals
    console.log("Test 3: Getting recent withdrawals...");
    const withdrawals = await client.getRecentWithdrawals(5);
    console.log(`✅ Found ${withdrawals.length} recent withdrawals`);
    if (withdrawals.length > 0) {
      console.log("Sample withdrawal:", JSON.stringify(withdrawals[0], null, 2));
    }
    console.log();
    
    // Test 4: Get revealed secrets
    console.log("Test 4: Getting revealed secrets...");
    const secrets = await client.getRevealedSecrets();
    console.log(`✅ Found ${secrets.length} revealed secrets`);
    console.log();
    
    // Test 5: Get chain statistics
    console.log("Test 5: Getting chain statistics...");
    const stats = await client.getChainStatistics(8453); // Base chain
    console.log(`✅ Base chain statistics:`, JSON.stringify(stats, null, 2));
    console.log();
    
    console.log("=" .repeat(50));
    console.log("✅ All tests completed successfully!");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    Deno.exit(1);
  }
}

// Direct SQL test
async function testDirectSQL() {
  console.log("\n" + "=" .repeat(50));
  console.log("🔬 Testing Direct SQL endpoint\n");
  
  const indexerUrl = Deno.env.get("INDEXER_URL") || "http://localhost:42069";
  const sqlEndpoint = `${indexerUrl}/sql`;
  
  const testQueries = [
    "SELECT COUNT(*) as count FROM src_escrow",
    "SELECT * FROM src_escrow LIMIT 3",
    "SELECT * FROM atomic_swap WHERE status = 'pending' LIMIT 3",
  ];
  
  for (const query of testQueries) {
    console.log(`Query: ${query}`);
    
    try {
      const response = await fetch(sqlEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql: query }),
      });
      
      if (!response.ok) {
        const text = await response.text();
        console.error(`❌ HTTP ${response.status}: ${text}`);
        continue;
      }
      
      const result = await response.json();
      
      if (result.error) {
        console.error(`❌ Error: ${result.error}`);
      } else {
        const data = result.data || result.rows || [];
        console.log(`✅ Result: ${data.length} rows`);
        if (data.length > 0) {
          console.log("First row:", JSON.stringify(data[0], null, 2));
        }
      }
    } catch (error) {
      console.error(`❌ Failed:`, error);
    }
    
    console.log();
  }
}

// Run tests
console.log("🚀 Starting PonderClient tests...\n");

await testPonderClient();
await testDirectSQL();

console.log("\n🎉 Test suite completed!");