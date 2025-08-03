console.log("Bridge-Me-Not Resolver v1.0");
console.log("Run 'deno task' to see available commands.");

// Export main types and utilities for external use
export * from "./src/types/index.ts";
export * from "./src/utils/secrets.ts";
export * from "./src/utils/timelocks.ts";
export * from "./src/utils/contracts.ts";
export * from "./src/resolver/index.ts";
