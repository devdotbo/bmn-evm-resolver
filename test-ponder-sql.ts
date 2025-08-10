#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Test script to verify Ponder SQL-over-HTTP endpoint using @ponder/client.
 * Uses UNTYPED queries (no local schema dependency), matching docs:
 * https://ponder.sh/docs/query/sql-over-http#sql-over-http
 */

import { createClient, sql } from "@ponder/client";

function pretty(obj: unknown) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

async function main() {
  const indexerBase = Deno.env.get("INDEXER_URL") || "https://index-bmn.up.railway.app";
  const sqlUrl = `${indexerBase.replace(/\/$/, "")}/sql`;

  console.log("🧪 Testing Ponder SQL over HTTP via @ponder/client (untyped)");
  console.log("=".repeat(50));
  console.log(`📍 SQL URL: ${sqlUrl}`);

  // Create client
  const client = createClient(sqlUrl);

  try {
    // Smoke test
    console.log("\nTest 1: SELECT 1 as ok");
    const r1 = await client.db.execute(sql`SELECT 1 as ok;`);
    console.log("✅ Result:", pretty(r1));

    // List a known table if exists
    console.log("\nTest 2: SELECT * FROM atomic_swap LIMIT 3");
    const r2 = await client.db.execute(sql`SELECT * FROM atomic_swap LIMIT 3;`);
    console.log("✅ Rows:", r2.length);
    if (r2.length > 0) console.log("Sample:", pretty(r2[0]));

    // Another table
    console.log("\nTest 3: SELECT * FROM src_escrow LIMIT 3");
    const r3 = await client.db.execute(sql`SELECT * FROM src_escrow LIMIT 3;`);
    console.log("✅ Rows:", r3.length);
    if (r3.length > 0) console.log("Sample:", pretty(r3[0]));

    console.log("\n" + "=".repeat(50));
    console.log("✅ Untyped tests completed");
  } catch (err) {
    console.error("❌ Test failed:", err);
    if (err instanceof Error) {
      console.error("Details:", err.message);
    }
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}