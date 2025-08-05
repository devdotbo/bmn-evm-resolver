#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

import { SimpleResolver } from "./src/resolver/simple-resolver.ts";

async function main() {
  console.log("🚀 Bridge-Me-Not Resolver (Simplified)");
  console.log("=====================================");
  
  const resolver = new SimpleResolver();

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