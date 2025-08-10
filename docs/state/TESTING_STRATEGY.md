# Testing Strategy for Resolver State Management

## Overview

This document outlines the comprehensive testing strategy for migrating the
resolver from indexer-dependent to self-managed state. The strategy covers unit
tests, integration tests, end-to-end tests, and production validation.

## Testing Principles

1. **Test Independence**: Resolver tests should not depend on indexer
   availability
2. **State Isolation**: Each test should have isolated state
3. **Deterministic Results**: Tests should be reproducible
4. **Performance Validation**: Include benchmarks and load tests
5. **Failure Scenarios**: Test error conditions and recovery

## Test Categories

### 1. Unit Tests

#### SecretManager Tests

```typescript
// tests/unit/SecretManager.test.ts
import {
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std/testing/asserts.ts";
import { SecretManager } from "../../src/state/SecretManager.ts";
import { createTestDatabase } from "../helpers/database.ts";
import { generateTestSecret } from "../helpers/generators.ts";

Deno.test("SecretManager - Store and retrieve secret", async () => {
  const db = await createTestDatabase();
  const manager = new SecretManager(db);

  const secret = generateTestSecret();
  const stored = await manager.storeSecret({
    secret: secret.value,
    orderHash: secret.orderHash,
    escrowAddress: secret.escrowAddress,
    chainId: 8453,
  });

  assertExists(stored.id);
  assertEquals(stored.secret, secret.value);
  assertEquals(stored.status, "pending");

  const retrieved = await manager.getSecretByHashlock(stored.hashlock);
  assertEquals(retrieved, secret.value);
});

Deno.test("SecretManager - Prevent duplicate secrets", async () => {
  const db = await createTestDatabase();
  const manager = new SecretManager(db);

  const secret = generateTestSecret();

  // First store should succeed
  await manager.storeSecret(secret);

  // Second store should return existing
  const duplicate = await manager.storeSecret(secret);
  assertEquals(duplicate.secret, secret.secret);

  // Should only have one record
  const all = await manager.getRevealedSecrets();
  assertEquals(all.length, 1);
});

Deno.test("SecretManager - Confirm secret", async () => {
  const db = await createTestDatabase();
  const manager = new SecretManager(db);

  const secret = generateTestSecret();
  const stored = await manager.storeSecret(secret);

  await manager.confirmSecret(
    stored.hashlock,
    "0xtxhash123",
    BigInt(50000),
  );

  const confirmed = await manager.getSecretByHashlock(stored.hashlock);
  assertEquals(confirmed.status, "confirmed");
  assertEquals(confirmed.txHash, "0xtxhash123");
  assertEquals(confirmed.gasUsed, BigInt(50000));
});

Deno.test("SecretManager - Handle failed secret", async () => {
  const db = await createTestDatabase();
  const manager = new SecretManager(db);

  const secret = generateTestSecret();
  const stored = await manager.storeSecret(secret);

  await manager.markFailed(
    stored.hashlock,
    "Transaction reverted: insufficient funds",
  );

  const failed = await manager.getSecretByHashlock(stored.hashlock);
  assertEquals(failed.status, "failed");
  assertEquals(failed.errorMessage, "Transaction reverted: insufficient funds");
});

Deno.test("SecretManager - Cache performance", async () => {
  const db = await createTestDatabase();
  const manager = new SecretManager(db);

  // Store secret
  const secret = generateTestSecret();
  const stored = await manager.storeSecret(secret);

  // First read (from database)
  const start1 = performance.now();
  await manager.getSecretByHashlock(stored.hashlock);
  const dbTime = performance.now() - start1;

  // Second read (from cache)
  const start2 = performance.now();
  await manager.getSecretByHashlock(stored.hashlock);
  const cacheTime = performance.now() - start2;

  // Cache should be at least 10x faster
  assert(
    cacheTime < dbTime / 10,
    `Cache (${cacheTime}ms) not faster than DB (${dbTime}ms)`,
  );
});

Deno.test("SecretManager - Prune old secrets", async () => {
  const db = await createTestDatabase();
  const manager = new SecretManager(db);

  // Store old secret
  const oldSecret = generateTestSecret();
  await db.insertInto("revealed_secrets")
    .values({
      ...oldSecret,
      revealed_at: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
    })
    .execute();

  // Store recent secret
  const recentSecret = generateTestSecret();
  await manager.storeSecret(recentSecret);

  // Prune secrets older than 30 days
  const pruned = await manager.pruneOldSecrets(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  );

  assertEquals(pruned, 1);

  const remaining = await manager.getRevealedSecrets();
  assertEquals(remaining.length, 1);
  assertEquals(remaining[0].orderHash, recentSecret.orderHash);
});
```

#### SwapMonitor Tests

```typescript
// tests/unit/SwapMonitor.test.ts
Deno.test("SwapMonitor - Start and stop monitoring", async () => {
  const db = await createTestDatabase();
  const monitor = new SwapMonitor(db);

  const swap = generateTestSwap();
  await monitor.startMonitoring(swap);

  const active = await monitor.getActiveSwaps();
  assertEquals(active.length, 1);
  assertEquals(active[0].status, "monitoring");

  await monitor.stopMonitoring(swap.orderHash);

  const afterStop = await monitor.getActiveSwaps();
  assertEquals(afterStop.length, 0);
});

Deno.test("SwapMonitor - Track profitability", async () => {
  const db = await createTestDatabase();
  const monitor = new SwapMonitor(db);

  const swap = generateTestSwap({
    expectedProfit: BigInt("1000000000000000000"), // 1 ETH
  });

  await monitor.startMonitoring(swap);
  await monitor.completeSwap(
    swap.orderHash,
    BigInt("800000000000000000"), // 0.8 ETH actual
    "Gas prices increased",
  );

  const completed = await monitor.getSwapByOrderHash(swap.orderHash);
  assertEquals(completed.status, "completed");
  assertEquals(completed.actualProfitWei, "800000000000000000");
  assertEquals(completed.completionReason, "Gas prices increased");
});
```

### 2. Integration Tests

#### Database Integration

```typescript
// tests/integration/database.test.ts
Deno.test("Database - Transaction rollback on error", async () => {
  const db = await createRealDatabase("./test.db");
  const manager = new SecretManager(db);

  // Start transaction
  const trx = await db.transaction();

  try {
    await trx.insertInto("revealed_secrets").values(invalidData);
    await trx.commit();
    assert(false, "Should have thrown");
  } catch (error) {
    await trx.rollback();
  }

  // Verify nothing was saved
  const secrets = await manager.getRevealedSecrets();
  assertEquals(secrets.length, 0);
});

Deno.test("Database - Concurrent access", async () => {
  const db = await createRealDatabase("./test.db");

  // Simulate concurrent writes
  const promises = Array(10).fill(0).map((_, i) => {
    const manager = new SecretManager(db);
    return manager.storeSecret(generateTestSecret(i));
  });

  const results = await Promise.all(promises);

  // All should succeed
  assertEquals(results.length, 10);
  results.forEach((r, i) => {
    assertExists(r.id);
  });
});
```

#### Indexer Independence Tests

```typescript
// tests/integration/independence.test.ts
Deno.test("Resolver operates without indexer", async () => {
  // Don't start indexer
  const resolver = new SimpleResolver({
    dbPath: "./test.db",
    indexerUrl: null, // No indexer
  });

  await resolver.start();

  // Should work without indexer
  const secret = generateTestSecret();
  await resolver.secretManager.storeSecret(secret);

  const retrieved = await resolver.secretManager.getRevealedSecrets();
  assertEquals(retrieved.length, 1);

  await resolver.stop();
});

Deno.test("Resolver continues when indexer fails", async () => {
  const mockIndexer = createMockIndexer();
  mockIndexer.failAfter(5); // Fail after 5 calls

  const resolver = new SimpleResolver({
    dbPath: "./test.db",
    indexer: mockIndexer,
  });

  await resolver.start();

  // First 5 calls work
  for (let i = 0; i < 5; i++) {
    await resolver.checkMarketConditions();
  }

  // Indexer now failing, resolver should continue
  const secret = generateTestSecret();
  await resolver.secretManager.storeSecret(secret);

  // Should work despite indexer failure
  assertExists(secret);
});
```

### 3. End-to-End Tests

#### Complete Flow Test

```typescript
// tests/e2e/complete-flow.test.ts
Deno.test("E2E - Complete atomic swap flow", async () => {
  // Setup
  const testnet = await createTestBlockchain();
  const indexer = await createTestIndexer();
  const resolver = await createTestResolver();

  // Deploy contracts
  const factory = await testnet.deploy(CrossChainEscrowFactory);
  const srcToken = await testnet.deploy(TestToken);
  const dstToken = await testnet.deploy(TestToken);

  // Create atomic swap
  const swap = await factory.createAtomicSwap({
    srcToken: srcToken.address,
    dstToken: dstToken.address,
    srcAmount: parseEther("1"),
    dstAmount: parseEther("0.9"),
    deadline: Date.now() + 3600000,
  });

  // Wait for indexer
  await waitForIndexer(indexer, swap.orderHash);

  // Resolver should detect and monitor
  await resolver.start();
  await sleep(1000);

  const monitored = await resolver.swapMonitor.getActiveSwaps();
  assertEquals(monitored.length, 1);
  assertEquals(monitored[0].orderHash, swap.orderHash);

  // Simulate revealing secret
  const secret = generateSecret();
  await resolver.revealSecret(swap.escrowAddress, secret);

  // Verify secret stored locally
  const stored = await resolver.secretManager.getSecretByHashlock(
    keccak256(secret),
  );
  assertEquals(stored, secret);

  // Verify on-chain
  const onChain = await swap.escrow.secret();
  assertEquals(onChain, secret);

  // Cleanup
  await resolver.stop();
  await indexer.stop();
  await testnet.stop();
});
```

### 4. Performance Tests

#### Load Testing

```typescript
// tests/performance/load.test.ts
Deno.test("Performance - Handle 1000 secrets/second", async () => {
  const db = await createTestDatabase();
  const manager = new SecretManager(db);

  const secrets = Array(1000).fill(0).map(() => generateTestSecret());

  const start = performance.now();

  for (const secret of secrets) {
    await manager.storeSecret(secret);
  }

  const duration = performance.now() - start;

  console.log(`Stored 1000 secrets in ${duration}ms`);
  console.log(`Rate: ${1000 / (duration / 1000)} secrets/second`);

  assert(duration < 1000, `Too slow: ${duration}ms`);
});

Deno.test("Performance - Query latency", async () => {
  const db = await createTestDatabase();
  const manager = new SecretManager(db);

  // Populate database
  for (let i = 0; i < 10000; i++) {
    await manager.storeSecret(generateTestSecret(i));
  }

  // Measure query performance
  const measurements = [];

  for (let i = 0; i < 100; i++) {
    const hashlock = keccak256(`secret${Math.floor(Math.random() * 10000)}`);
    const start = performance.now();
    await manager.getSecretByHashlock(hashlock);
    measurements.push(performance.now() - start);
  }

  const p50 = percentile(measurements, 50);
  const p95 = percentile(measurements, 95);
  const p99 = percentile(measurements, 99);

  console.log(`Query Latency - P50: ${p50}ms, P95: ${p95}ms, P99: ${p99}ms`);

  assert(p50 < 5, `P50 too high: ${p50}ms`);
  assert(p95 < 20, `P95 too high: ${p95}ms`);
  assert(p99 < 50, `P99 too high: ${p99}ms`);
});
```

#### Memory Tests

```typescript
// tests/performance/memory.test.ts
Deno.test("Performance - Memory usage under load", async () => {
  const db = await createTestDatabase();
  const manager = new SecretManager(db);

  const initialMemory = Deno.memoryUsage();

  // Store many secrets
  for (let i = 0; i < 10000; i++) {
    await manager.storeSecret(generateTestSecret(i));
  }

  const afterStoreMemory = Deno.memoryUsage();

  // Access to populate cache
  for (let i = 0; i < 1000; i++) {
    const hashlock = keccak256(`secret${i}`);
    await manager.getSecretByHashlock(hashlock);
  }

  const afterCacheMemory = Deno.memoryUsage();

  const storeIncrease = (afterStoreMemory.heapUsed - initialMemory.heapUsed) /
    1024 / 1024;
  const cacheIncrease =
    (afterCacheMemory.heapUsed - afterStoreMemory.heapUsed) / 1024 / 1024;

  console.log(`Memory increase after store: ${storeIncrease.toFixed(2)}MB`);
  console.log(`Memory increase after cache: ${cacheIncrease.toFixed(2)}MB`);

  assert(
    cacheIncrease < 100,
    `Cache using too much memory: ${cacheIncrease}MB`,
  );
});
```

### 5. Migration Tests

#### Dual Write Tests

```typescript
// tests/migration/dual-write.test.ts
Deno.test("Migration - Dual write to both stores", async () => {
  const indexerDb = createMockIndexerDb();
  const resolverDb = await createTestDatabase();

  const resolver = new SimpleResolver({
    db: resolverDb,
    indexer: indexerDb,
    features: {
      DUAL_WRITE: true,
    },
  });

  const secret = generateTestSecret();
  await resolver.revealSecret(secret);

  // Should be in both stores
  const inResolver = await resolver.secretManager.getSecretByHashlock(
    secret.hashlock,
  );
  const inIndexer = await indexerDb.getSecret(secret.hashlock);

  assertEquals(inResolver, secret.value);
  assertEquals(inIndexer, secret.value);
});

Deno.test("Migration - Fallback to indexer", async () => {
  const indexerDb = createMockIndexerDb();
  const resolverDb = await createTestDatabase();

  // Add secret only to indexer
  const secret = generateTestSecret();
  await indexerDb.addSecret(secret);

  const resolver = new SimpleResolver({
    db: resolverDb,
    indexer: indexerDb,
    features: {
      INDEXER_FALLBACK: true,
    },
  });

  // Should fall back to indexer
  const retrieved = await resolver.getSecret(secret.hashlock);
  assertEquals(retrieved, secret.value);
});
```

### 6. Failure & Recovery Tests

#### Error Handling

```typescript
// tests/failure/error-handling.test.ts
Deno.test("Failure - Database corruption recovery", async () => {
  const dbPath = "./test-corrupt.db";
  let db = await createRealDatabase(dbPath);
  const manager = new SecretManager(db);

  // Store some secrets
  await manager.storeSecret(generateTestSecret(1));
  await manager.storeSecret(generateTestSecret(2));

  // Corrupt database
  await db.close();
  await corruptDatabase(dbPath);

  // Should detect and recover
  db = await createRealDatabase(dbPath);
  const newManager = new SecretManager(db);

  const integrity = await newManager.checkIntegrity();
  assertEquals(integrity.status, "recovered");
});

Deno.test("Failure - Network partition handling", async () => {
  const resolver = new SimpleResolver({
    dbPath: "./test.db",
    indexerUrl: "http://indexer:42069",
  });

  // Simulate network partition
  await blockNetwork("indexer");

  // Resolver should continue with local state
  const secret = generateTestSecret();
  await resolver.secretManager.storeSecret(secret);

  const retrieved = await resolver.secretManager.getRevealedSecrets();
  assertEquals(retrieved.length, 1);

  // Restore network
  await restoreNetwork("indexer");
});
```

#### Recovery Tests

```typescript
// tests/failure/recovery.test.ts
Deno.test("Recovery - Replay pending secrets", async () => {
  const db = await createTestDatabase();
  const manager = new SecretManager(db);

  // Store secrets with pending status
  const pending1 = await manager.storeSecret(generateTestSecret(1));
  const pending2 = await manager.storeSecret(generateTestSecret(2));

  // Simulate restart
  const newManager = new SecretManager(db);
  await newManager.recoverPendingSecrets();

  // Should retry pending secrets
  const recovered = await newManager.getRevealedSecrets();
  assertEquals(recovered.filter((s) => s.status === "submitted").length, 2);
});
```

## Test Data Management

### Test Data Generators

```typescript
// tests/helpers/generators.ts
export function generateTestSecret(index?: number): TestSecret {
  const i = index ?? Math.floor(Math.random() * 1000000);
  return {
    value: `0x${randomBytes(32).toString("hex")}`,
    orderHash: `0xorder${i}`,
    escrowAddress: `0xescrow${i}`,
    chainId: 8453,
    hashlock: keccak256(`secret${i}`),
  };
}

export function generateTestSwap(overrides?: Partial<TestSwap>): TestSwap {
  return {
    orderHash: `0x${randomBytes(32).toString("hex")}`,
    srcChainId: 8453,
    dstChainId: 10,
    srcToken: "0x" + "1".repeat(40),
    dstToken: "0x" + "2".repeat(40),
    srcAmount: parseEther("1"),
    dstAmount: parseEther("0.9"),
    deadline: Date.now() + 3600000,
    expectedProfit: parseEther("0.1"),
    ...overrides,
  };
}
```

### Test Database Helper

```typescript
// tests/helpers/database.ts
export async function createTestDatabase(): Promise<ResolverDatabase> {
  const db = new ResolverDatabase(":memory:");
  await db.runMigrations();
  return db;
}

export async function createSeededDatabase(): Promise<ResolverDatabase> {
  const db = await createTestDatabase();

  // Seed with test data
  for (let i = 0; i < 10; i++) {
    await db.insertInto("revealed_secrets")
      .values(generateTestSecret(i))
      .execute();
  }

  return db;
}
```

## Continuous Integration

### CI Pipeline

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      - run: deno test tests/unit --allow-all

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      - run: deno test tests/integration --allow-all

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      - run: |
          # Start test environment
          docker-compose -f docker-compose.test.yml up -d
          # Run tests
          deno test tests/e2e --allow-all
          # Cleanup
          docker-compose -f docker-compose.test.yml down

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      - run: deno test tests/performance --allow-all
      - uses: actions/upload-artifact@v3
        with:
          name: performance-results
          path: performance-results.json
```

## Test Coverage

### Coverage Requirements

- Unit Tests: 90% coverage minimum
- Integration Tests: 80% coverage minimum
- Critical Paths: 100% coverage required

### Generate Coverage Report

```bash
# Run tests with coverage
deno test --coverage=coverage --allow-all

# Generate HTML report
deno coverage coverage --html

# Check coverage threshold
deno coverage coverage --json | jq '.percentage'
```

## Production Validation

### Canary Testing

```typescript
// scripts/canary-test.ts
async function canaryTest() {
  const resolver = new SimpleResolver({
    dbPath: "./canary.db",
    mode: "canary",
  });

  // Test basic operations
  const tests = [
    testSecretStorage,
    testSecretRetrieval,
    testSwapMonitoring,
    testDecisionRecording,
  ];

  for (const test of tests) {
    try {
      await test(resolver);
      console.log(`✅ ${test.name} passed`);
    } catch (error) {
      console.error(`❌ ${test.name} failed:`, error);
      return false;
    }
  }

  return true;
}
```

### Shadow Mode Validation

```typescript
// scripts/shadow-validation.ts
async function validateShadowMode() {
  const metrics = await getMetrics();

  const checks = [
    {
      name: "Shadow write success rate",
      value: metrics.shadowWriteSuccessRate,
      threshold: 0.99,
    },
    {
      name: "State discrepancy rate",
      value: metrics.stateDiscrepancyRate,
      threshold: 0.01,
    },
    {
      name: "Performance impact",
      value: metrics.latencyIncrease,
      threshold: 0.1, // Max 10% increase
    },
  ];

  for (const check of checks) {
    if (check.value > check.threshold) {
      console.error(
        `❌ ${check.name} failed: ${check.value} > ${check.threshold}`,
      );
      return false;
    }
  }

  return true;
}
```

## Test Documentation

### Test Naming Convention

```
<Category>_<Component>_<Scenario>_<ExpectedResult>

Examples:
- Unit_SecretManager_StoreSecret_Success
- Integration_Database_ConcurrentAccess_NoConflicts
- E2E_AtomicSwap_CompleteFlow_SecretsStored
- Performance_Load_1000SecretsPerSecond_UnderThreshold
```

### Test Documentation Template

```typescript
/**
 * Test: Verify SecretManager handles duplicate secrets correctly
 *
 * Given: A secret already exists in the database
 * When: The same secret is stored again
 * Then: No duplicate is created and existing secret is returned
 *
 * Validates: Requirement #REQ-001 (No duplicate secrets)
 */
Deno.test("SecretManager prevents duplicates", async () => {
  // Test implementation
});
```

## Troubleshooting Guide

### Common Test Failures

#### Issue: Database locked

```
Solution: Ensure previous test cleaned up properly
await db.close();
```

#### Issue: Port already in use

```
Solution: Use dynamic port allocation
const port = await getAvailablePort();
```

#### Issue: Flaky timing tests

```
Solution: Use deterministic time
await useFakeTimers();
```

## Conclusion

This comprehensive testing strategy ensures:

1. **Correctness**: All functionality works as expected
2. **Independence**: Resolver doesn't depend on indexer
3. **Performance**: Meets latency and throughput requirements
4. **Reliability**: Handles failures gracefully
5. **Migration Safety**: Smooth transition from old to new architecture

Following this strategy provides confidence that the resolver's state management
is robust, performant, and maintainable.
