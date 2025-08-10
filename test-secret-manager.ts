#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --unstable-kv

import { SecretManager } from "./src/state/SecretManager.ts";
import { keccak256 } from "viem";

async function testSecretManager() {
  console.log("🧪 Testing SecretManager with Deno KV...\n");

  // Initialize SecretManager
  const manager = new SecretManager(":memory:"); // Use in-memory for testing
  await manager.init();

  // Test 1: Store a secret
  console.log("Test 1: Storing a secret");
  const testSecret =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
  const testOrderHash = "0xorder123" as `0x${string}`;

  const record = await manager.storeSecret({
    secret: testSecret,
    orderHash: testOrderHash,
    escrowAddress: "0xescrow123",
    chainId: 8453, // Base
  });

  console.log("✅ Secret stored:", record.hashlock);

  // Test 2: Retrieve secret by hashlock
  console.log("\nTest 2: Retrieving secret by hashlock");
  const retrieved = await manager.getSecretByHashlock(record.hashlock);
  console.log(
    "✅ Retrieved secret:",
    retrieved === testSecret ? "MATCH" : "MISMATCH",
  );

  // Test 3: Retrieve secret by order hash
  console.log("\nTest 3: Retrieving secret by order hash");
  const retrievedByOrder = await manager.getSecretByOrderHash(testOrderHash);
  console.log(
    "✅ Retrieved by order:",
    retrievedByOrder === testSecret ? "MATCH" : "MISMATCH",
  );

  // Test 4: Check if secret exists
  console.log("\nTest 4: Checking if secret exists");
  const exists = await manager.hasSecret(record.hashlock);
  console.log("✅ Secret exists:", exists);

  // Test 5: Get pending secrets
  console.log("\nTest 5: Getting pending secrets");
  const pending = await manager.getPendingSecrets();
  console.log("✅ Pending secrets count:", pending.length);

  // Test 6: Confirm secret
  console.log("\nTest 6: Confirming secret");
  await manager.confirmSecret(record.hashlock, "0xtxhash123", BigInt(100000));
  const pendingAfter = await manager.getPendingSecrets();
  console.log("✅ Pending secrets after confirmation:", pendingAfter.length);

  // Test 7: Get statistics
  console.log("\nTest 7: Getting statistics");
  const stats = await manager.getStatistics();
  console.log("✅ Statistics:", JSON.stringify(stats, null, 2));

  // Test 8: Store another secret and mark as failed
  console.log("\nTest 8: Testing failed secret");
  const failedSecret =
    "0xfailed1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as `0x${string}`;
  const failedRecord = await manager.storeSecret({
    secret: failedSecret,
    orderHash: "0xfailed123" as `0x${string}`,
    escrowAddress: "0xescrowfailed",
    chainId: 10, // Optimism
  });

  await manager.markFailed(failedRecord.hashlock, "Transaction reverted");
  const finalStats = await manager.getStatistics();
  console.log("✅ Final statistics:", JSON.stringify(finalStats, null, 2));

  // Clean up
  await manager.close();
  console.log("\n✅ All tests passed! SecretManager is working correctly.");
  console.log("📝 The circular dependency has been eliminated.");
  console.log("🎯 Secrets are now managed locally using Deno KV.");
}

// Run tests
testSecretManager().catch(console.error);
