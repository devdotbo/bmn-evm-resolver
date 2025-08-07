#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

import { UnifiedResolver } from "./src/resolver/resolver.ts";

async function main() {
  console.log("🚀 Bridge-Me-Not Resolver (Unified)");
  console.log("=====================================");
  
  const resolver = new UnifiedResolver();

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\n📛 Shutting down resolver...");
    await resolver.stop();
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);

  try {
    await resolver.start();
  } catch (error) {
    console.error("❌ Fatal error:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}