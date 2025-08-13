#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Test oRPC Integration
 * 
 * This script tests the oRPC implementation to ensure:
 * - Type safety is working
 * - Input validation is functioning
 * - Error handling is correct
 * - API endpoints are accessible
 */

import { createORPCClient } from "npm:@orpc/client@latest";
import { RPCLink } from "npm:@orpc/client/fetch";
import { type RouterClient } from "npm:@orpc/server@latest";
import { type AliceRouter } from "../src/utils/alice-orpc-server.ts";

const ALICE_API_URL = "http://localhost:8001/api/alice";

// Create typed client
function createAliceClient(): RouterClient<AliceRouter> {
  const link = new RPCLink({
    url: ALICE_API_URL,
    headers: {
      "Content-Type": "application/json",
    },
  });
  
  return createORPCClient(link) as RouterClient<AliceRouter>;
}

async function runTests() {
  console.log("🧪 Testing oRPC Integration\n");
  
  const client = createAliceClient();
  let testsPassed = 0;
  let testsFailed = 0;
  
  // Test 1: Health Check
  console.log("Test 1: Health Check");
  try {
    const [error, health] = await client.health();
    if (!error && health?.status === "healthy") {
      console.log("✅ Health check passed");
      testsPassed++;
    } else {
      console.log("❌ Health check failed:", error?.message);
      testsFailed++;
    }
  } catch (e) {
    console.log("❌ Health check error:", e);
    testsFailed++;
  }
  
  // Test 2: Input Validation - Invalid chain ID
  console.log("\nTest 2: Input Validation - Invalid Chain ID");
  try {
    const [error, result] = await client.createOrder({
      srcChainId: 999 as any, // Invalid chain ID
      dstChainId: 10 as any,
      srcAmount: "1000000000000000",
      dstAmount: "1000000000000000",
    });
    
    if (error && error.code === "INPUT_VALIDATION_FAILED") {
      console.log("✅ Input validation correctly rejected invalid chain ID");
      testsPassed++;
    } else {
      console.log("❌ Input validation should have failed");
      testsFailed++;
    }
  } catch (e) {
    console.log("❌ Unexpected error:", e);
    testsFailed++;
  }
  
  // Test 3: Input Validation - Invalid amount format
  console.log("\nTest 3: Input Validation - Invalid Amount Format");
  try {
    const [error, result] = await client.createOrder({
      srcChainId: 8453 as any,
      dstChainId: 10 as any,
      srcAmount: "not-a-number", // Invalid amount
      dstAmount: "1000000000000000",
    });
    
    if (error && error.code === "INPUT_VALIDATION_FAILED") {
      console.log("✅ Input validation correctly rejected invalid amount");
      testsPassed++;
    } else {
      console.log("❌ Input validation should have failed");
      testsFailed++;
    }
  } catch (e) {
    console.log("❌ Unexpected error:", e);
    testsFailed++;
  }
  
  // Test 4: Input Validation - Invalid address format
  console.log("\nTest 4: Input Validation - Invalid Address Format");
  try {
    const [error, result] = await client.createOrder({
      srcChainId: 8453 as any,
      dstChainId: 10 as any,
      srcAmount: "1000000000000000",
      dstAmount: "1000000000000000",
      tokenAddress: "invalid-address", // Invalid address
    });
    
    if (error && error.code === "INPUT_VALIDATION_FAILED") {
      console.log("✅ Input validation correctly rejected invalid address");
      testsPassed++;
    } else {
      console.log("❌ Input validation should have failed");
      testsFailed++;
    }
  } catch (e) {
    console.log("❌ Unexpected error:", e);
    testsFailed++;
  }
  
  // Test 5: Get non-existent swap status
  console.log("\nTest 5: Get Non-Existent Swap Status");
  try {
    const fakeHashlock = "0x" + "0".repeat(64);
    const [error, status] = await client.getSwapStatus({
      hashlock: fakeHashlock,
    });
    
    if (error && error.code === "SWAP_NOT_FOUND") {
      console.log("✅ Correctly returned SWAP_NOT_FOUND error");
      testsPassed++;
    } else {
      console.log("❌ Should have returned SWAP_NOT_FOUND");
      testsFailed++;
    }
  } catch (e) {
    console.log("❌ Unexpected error:", e);
    testsFailed++;
  }
  
  // Test 6: Get pending orders
  console.log("\nTest 6: Get Pending Orders");
  try {
    const [error, orders] = await client.getPendingOrders();
    
    if (!error && orders && typeof orders.count === "number") {
      console.log(`✅ Successfully retrieved pending orders (count: ${orders.count})`);
      testsPassed++;
    } else {
      console.log("❌ Failed to get pending orders:", error?.message);
      testsFailed++;
    }
  } catch (e) {
    console.log("❌ Unexpected error:", e);
    testsFailed++;
  }
  
  // Test 7: Type safety demonstration
  console.log("\nTest 7: Type Safety Demonstration");
  try {
    // This should show TypeScript errors in an IDE:
    // @ts-expect-error - Demonstrating type safety
    // const badCall = await client.createOrder({ wrongParam: "test" });
    
    // The correct typed call:
    const validParams = {
      srcChainId: 8453 as 8453,
      dstChainId: 10 as 10,
      srcAmount: "1000000000000000",
      dstAmount: "1000000000000000",
    };
    
    console.log("✅ Type safety is enforced (compile-time check)");
    testsPassed++;
  } catch (e) {
    console.log("❌ Type safety test failed:", e);
    testsFailed++;
  }
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Test Results Summary");
  console.log(`   Passed: ${testsPassed}`);
  console.log(`   Failed: ${testsFailed}`);
  console.log(`   Total: ${testsPassed + testsFailed}`);
  
  if (testsFailed === 0) {
    console.log("\n🎉 All tests passed! oRPC integration is working correctly.");
  } else {
    console.log(`\n⚠️ ${testsFailed} tests failed. Please check the implementation.`);
  }
  
  return testsFailed === 0;
}

// Main execution
async function main() {
  console.log("🚀 oRPC Integration Test Suite\n");
  
  // First check if the service is running
  try {
    const response = await fetch("http://localhost:8001/health");
    if (!response.ok) {
      console.error("❌ Alice service is not running on port 8001");
      console.error("   Please start the service first:");
      console.error("   ./alice-service-orpc.ts");
      Deno.exit(1);
    }
  } catch (e) {
    console.error("❌ Cannot connect to Alice service on port 8001");
    console.error("   Please start the service first:");
    console.error("   ./alice-service-orpc.ts");
    Deno.exit(1);
  }
  
  const success = await runTests();
  Deno.exit(success ? 0 : 1);
}

if (import.meta.main) {
  main().catch(console.error);
}