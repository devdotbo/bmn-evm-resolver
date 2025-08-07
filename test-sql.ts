#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

import { createClient, eq } from "@ponder/client";
import * as schema from "./src/indexer/ponder.schema.ts";

const INDEXER_URL = Deno.env.get("INDEXER_URL") || "http://localhost:42069";

console.log("🔍 Testing SQL over HTTP connection");
console.log(`📍 Server: ${INDEXER_URL}`);
console.log("=".repeat(50));

async function testConnection() {
  try {
    // Debug: Check what's in the schema
    console.log("📋 Available tables in schema:");
    console.log(Object.keys(schema));
    
    // Create client
    const client = createClient(`${INDEXER_URL}/sql`, { schema });
    console.log("✅ Client created successfully\n");

    // Test 1: Simple query to atomicSwap table
    console.log("📊 Test 1: Querying atomicSwap table...");
    try {
      const swaps = await client.db
        .select()
        .from(schema.atomicSwap)
        .limit(5)
        .execute();
      
      console.log(`  ✅ Found ${swaps.length} atomic swaps`);
    } catch (error) {
      console.error("  ❌ Error querying atomicSwap:", error);
    }

    // Test 2: Query srcEscrow table
    console.log("\n📊 Test 2: Querying srcEscrow table...");
    try {
      const escrows = await client.db
        .select()
        .from(schema.srcEscrow)
        .limit(5)
        .execute();
      
      console.log(`  ✅ Found ${escrows.length} source escrows`);
    } catch (error) {
      console.error("  ❌ Error querying srcEscrow:", error);
    }

    console.log("\n✨ Connection test completed!");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    Deno.exit(1);
  }
}

await testConnection();