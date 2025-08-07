# Implementation Plan: Resolver State Management

## Overview

This document provides a step-by-step implementation plan to migrate the resolver from using the indexer as state storage to managing its own state properly.

## Phase 1: Database Setup (Day 1-2)

### Step 1.1: Add SQLite Dependency
```typescript
// deno.json
{
  "imports": {
    "sqlite": "https://deno.land/x/sqlite@v3.8/mod.ts",
    "kysely": "npm:kysely@^0.27.0",
    "kysely-sqlite": "npm:better-sqlite3@^9.0.0"
  }
}
```

### Step 1.2: Create Database Module
```typescript
// src/database/connection.ts
import { Database } from "sqlite";
import { Kysely, SqliteDialect } from "kysely";

export class ResolverDatabase {
  private db: Kysely<ResolverSchema>;
  
  constructor(dbPath: string = "./resolver.db") {
    this.db = new Kysely<ResolverSchema>({
      dialect: new SqliteDialect({
        database: new Database(dbPath)
      })
    });
  }
  
  async initialize() {
    await this.runMigrations();
    await this.createIndexes();
  }
}
```

### Step 1.3: Define Schema Types
```typescript
// src/database/schema.ts
export interface ResolverSchema {
  revealed_secrets: RevealedSecretsTable;
  monitored_swaps: MonitoredSwapsTable;
  resolver_decisions: ResolverDecisionsTable;
  gas_estimates: GasEstimatesTable;
}

export interface RevealedSecretsTable {
  id: Generated<number>;
  hashlock: string;
  secret: string;
  order_hash: string;
  escrow_address: string;
  chain_id: number;
  revealed_at: number;
  revealed_by: string;
  tx_hash: string | null;
  status: 'pending' | 'confirmed' | 'failed';
  gas_used: bigint | null;
  created_at: Generated<number>;
  updated_at: Generated<number>;
}
```

## Phase 2: SecretManager Implementation (Day 3-4)

### Step 2.1: Core SecretManager Class
```typescript
// src/state/SecretManager.ts
import { ResolverDatabase } from '../database/connection.ts';
import { keccak256, type Hex } from 'viem';

export class SecretManager {
  private memCache: Map<string, SecretRecord>;
  
  constructor(private db: ResolverDatabase) {
    this.memCache = new Map();
    this.loadCache();
  }
  
  private async loadCache() {
    const recent = await this.db
      .selectFrom('revealed_secrets')
      .where('revealed_at', '>', Date.now() - 24 * 60 * 60 * 1000)
      .selectAll()
      .execute();
    
    recent.forEach(record => {
      this.memCache.set(record.hashlock, record);
    });
  }
  
  async storeSecret(params: {
    secret: Hex;
    orderHash: Hex;
    escrowAddress: string;
    chainId: number;
  }): Promise<SecretRecord> {
    const hashlock = keccak256(params.secret);
    
    const record = {
      hashlock,
      secret: params.secret,
      order_hash: params.orderHash,
      escrow_address: params.escrowAddress,
      chain_id: params.chainId,
      revealed_at: Date.now(),
      revealed_by: 'resolver',
      status: 'pending' as const,
      tx_hash: null,
      gas_used: null
    };
    
    await this.db
      .insertInto('revealed_secrets')
      .values(record)
      .execute();
    
    this.memCache.set(hashlock, record);
    return record;
  }
  
  async confirmSecret(hashlock: string, txHash: string, gasUsed: bigint) {
    await this.db
      .updateTable('revealed_secrets')
      .set({
        status: 'confirmed',
        tx_hash: txHash,
        gas_used: gasUsed,
        updated_at: Date.now()
      })
      .where('hashlock', '=', hashlock)
      .execute();
    
    const cached = this.memCache.get(hashlock);
    if (cached) {
      cached.status = 'confirmed';
      cached.tx_hash = txHash;
      cached.gas_used = gasUsed;
    }
  }
  
  async getSecretByHashlock(hashlock: string): Promise<string | null> {
    // Check memory first
    const cached = this.memCache.get(hashlock);
    if (cached) return cached.secret;
    
    // Check database
    const record = await this.db
      .selectFrom('revealed_secrets')
      .where('hashlock', '=', hashlock)
      .selectAll()
      .executeTakeFirst();
    
    return record?.secret || null;
  }
  
  async getRevealedSecrets(): Promise<SecretRecord[]> {
    // Get from OUR database, not the indexer!
    return await this.db
      .selectFrom('revealed_secrets')
      .where('revealed_by', '=', 'resolver')
      .orderBy('revealed_at', 'desc')
      .selectAll()
      .execute();
  }
}
```

### Step 2.2: Integration with Resolver
```typescript
// src/resolver/simple-resolver.ts
import { SecretManager } from '../state/SecretManager.ts';

export class SimpleResolver {
  private secretManager: SecretManager;
  
  constructor(config: ResolverConfig) {
    const db = new ResolverDatabase(config.dbPath);
    this.secretManager = new SecretManager(db);
  }
  
  private async withdrawFromSource(escrow: SrcEscrow, secret: string) {
    // Store secret BEFORE revealing on-chain
    await this.secretManager.storeSecret({
      secret,
      orderHash: escrow.orderHash,
      escrowAddress: escrow.escrowAddress,
      chainId: escrow.chainId
    });
    
    try {
      // Execute on-chain withdrawal
      const tx = await this.contracts.escrow.withdraw(secret);
      
      // Confirm in our database
      await this.secretManager.confirmSecret(
        keccak256(secret),
        tx.hash,
        tx.gasUsed
      );
    } catch (error) {
      // Mark as failed in our database
      await this.secretManager.markFailed(keccak256(secret), error.message);
      throw error;
    }
  }
  
  private async checkForRevealedSecrets() {
    // Get from OUR database, not the indexer!
    const ourSecrets = await this.secretManager.getRevealedSecrets();
    
    for (const secret of ourSecrets) {
      if (secret.status === 'pending') {
        // Retry pending reveals
        await this.retryReveal(secret);
      }
    }
  }
}
```

## Phase 3: Swap Monitoring (Day 5-6)

### Step 3.1: SwapMonitor Class
```typescript
// src/state/SwapMonitor.ts
export class SwapMonitor {
  constructor(private db: ResolverDatabase) {}
  
  async startMonitoring(swap: {
    orderHash: string;
    hashlock: string;
    srcEscrow: string;
    dstEscrow: string;
    srcChainId: number;
    dstChainId: number;
    expectedProfit: bigint;
  }) {
    await this.db
      .insertInto('monitored_swaps')
      .values({
        order_hash: swap.orderHash,
        hashlock: swap.hashlock,
        src_escrow_address: swap.srcEscrow,
        dst_escrow_address: swap.dstEscrow,
        src_chain_id: swap.srcChainId,
        dst_chain_id: swap.dstChainId,
        expected_profit_wei: swap.expectedProfit.toString(),
        status: 'monitoring',
        monitoring_started_at: Date.now(),
        our_role: 'taker'
      })
      .execute();
  }
  
  async getActiveSwaps() {
    return await this.db
      .selectFrom('monitored_swaps')
      .where('status', 'in', ['monitoring', 'executing'])
      .selectAll()
      .execute();
  }
  
  async completeSwap(orderHash: string, actualProfit: bigint, reason: string) {
    await this.db
      .updateTable('monitored_swaps')
      .set({
        status: 'completed',
        actual_profit_wei: actualProfit.toString(),
        completion_reason: reason,
        updated_at: Date.now()
      })
      .where('order_hash', '=', orderHash)
      .execute();
  }
}
```

### Step 3.2: Decision Recorder
```typescript
// src/state/DecisionRecorder.ts
export class DecisionRecorder {
  constructor(private db: ResolverDatabase) {}
  
  async recordDecision(decision: {
    orderHash: string;
    action: 'reveal' | 'withdraw' | 'cancel' | 'skip';
    chainId: number;
    escrowAddress?: string;
    reason: string;
    gasEstimate?: bigint;
    priorityFee?: bigint;
  }) {
    await this.db
      .insertInto('resolver_decisions')
      .values({
        order_hash: decision.orderHash,
        action_type: decision.action,
        chain_id: decision.chainId,
        escrow_address: decision.escrowAddress,
        decision_reason: decision.reason,
        gas_estimate: decision.gasEstimate,
        priority_fee: decision.priorityFee,
        created_at: Date.now()
      })
      .execute();
  }
  
  async getDecisionHistory(orderHash: string) {
    return await this.db
      .selectFrom('resolver_decisions')
      .where('order_hash', '=', orderHash)
      .orderBy('created_at', 'desc')
      .selectAll()
      .execute();
  }
}
```

## Phase 4: Remove Indexer Dependencies (Day 7-8)

### Step 4.1: Update PonderClient
```typescript
// src/indexer/ponder-client.ts
export class PonderClient {
  // Remove these methods:
  // ❌ async getRevealedSecrets() - Use SecretManager instead
  // ❌ async getResolverState() - Use local database
  
  // Keep these methods for historical queries:
  // ✅ async getHistoricalSwaps()
  // ✅ async getChainStatistics()
  // ✅ async getProtocolMetrics()
}
```

### Step 4.2: Update Resolver Logic
```typescript
// src/resolver/simple-resolver.ts
export class SimpleResolver {
  async start() {
    // Before: Query indexer for our secrets
    // ❌ const secrets = await this.ponderClient.getRevealedSecrets();
    
    // After: Query our database
    // ✅ const secrets = await this.secretManager.getRevealedSecrets();
    
    // Use indexer only for historical context
    const historicalSwaps = await this.ponderClient.getHistoricalSwaps({
      limit: 100,
      orderBy: 'createdAt_DESC'
    });
    
    // Combine with our data for decisions
    const ourParticipation = await this.swapMonitor.getActiveSwaps();
    const decisions = await this.analyzeOpportunities(
      historicalSwaps,
      ourParticipation
    );
  }
}
```

## Phase 5: Testing & Migration (Day 9-10)

### Step 5.1: Unit Tests
```typescript
// tests/SecretManager.test.ts
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { SecretManager } from "../src/state/SecretManager.ts";

Deno.test("SecretManager stores and retrieves secrets", async () => {
  const db = new ResolverDatabase(":memory:");
  const manager = new SecretManager(db);
  
  const secret = "0x1234...";
  const hashlock = keccak256(secret);
  
  await manager.storeSecret({
    secret,
    orderHash: "0xabc...",
    escrowAddress: "0xdef...",
    chainId: 8453
  });
  
  const retrieved = await manager.getSecretByHashlock(hashlock);
  assertEquals(retrieved, secret);
});

Deno.test("SecretManager does not query indexer", async () => {
  const indexerSpy = spy(ponderClient, "query");
  
  const manager = new SecretManager(db);
  await manager.getRevealedSecrets();
  
  assertSpyCalls(indexerSpy, 0);
});
```

### Step 5.2: Integration Tests
```typescript
// tests/integration/withdrawal-flow.test.ts
Deno.test("Withdrawal flow maintains consistent state", async () => {
  const resolver = new SimpleResolver(testConfig);
  
  // Start with clean state
  const initialSecrets = await resolver.secretManager.getRevealedSecrets();
  assertEquals(initialSecrets.length, 0);
  
  // Execute withdrawal
  await resolver.withdrawFromSource(mockEscrow, testSecret);
  
  // Verify stored locally
  const afterSecrets = await resolver.secretManager.getRevealedSecrets();
  assertEquals(afterSecrets.length, 1);
  assertEquals(afterSecrets[0].secret, testSecret);
  
  // Verify NOT querying indexer for own state
  const indexerCalls = getIndexerCallLog();
  const ownStateCalls = indexerCalls.filter(
    call => call.includes("getRevealedSecrets")
  );
  assertEquals(ownStateCalls.length, 0);
});
```

## Phase 6: Monitoring & Observability (Day 11-12)

### Step 6.1: Add Metrics
```typescript
// src/monitoring/metrics.ts
export class ResolverMetrics {
  private secretsRevealed = new Counter({
    name: 'resolver_secrets_revealed_total',
    help: 'Total number of secrets revealed'
  });
  
  private stateQueryLatency = new Histogram({
    name: 'resolver_state_query_duration_ms',
    help: 'Latency of state queries',
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000]
  });
  
  trackSecretReveal() {
    this.secretsRevealed.inc();
  }
  
  trackQueryLatency(duration: number) {
    this.stateQueryLatency.observe(duration);
  }
}
```

### Step 6.2: Add Logging
```typescript
// src/state/SecretManager.ts
import { logger } from '../utils/logger.ts';

export class SecretManager {
  async storeSecret(params: SecretParams) {
    const start = Date.now();
    
    logger.info('Storing secret', {
      orderHash: params.orderHash,
      chainId: params.chainId,
      escrowAddress: params.escrowAddress
    });
    
    // ... store logic ...
    
    const duration = Date.now() - start;
    logger.debug('Secret stored', { duration });
    metrics.trackQueryLatency(duration);
  }
}
```

## Rollout Schedule

### Week 1
- **Day 1-2**: Database setup and migrations
- **Day 3-4**: SecretManager implementation
- **Day 5-6**: SwapMonitor and DecisionRecorder

### Week 2  
- **Day 7-8**: Remove indexer dependencies
- **Day 9-10**: Testing and migration scripts
- **Day 11-12**: Monitoring and observability

### Week 3
- **Day 13-14**: Staging deployment
- **Day 15-16**: Production rollout (canary)
- **Day 17-18**: Full production deployment

## Success Metrics

1. **Performance**
   - State query latency < 20ms (currently 450ms)
   - Memory usage < 100MB (currently 250MB)
   
2. **Reliability**
   - Zero state inconsistencies
   - 100% secret recovery rate
   
3. **Independence**
   - Resolver operates with indexer offline
   - No circular dependencies detected

## Rollback Plan

If issues arise:

1. **Immediate**: Switch back to querying indexer (feature flag)
2. **Day 1**: Export all state from resolver DB to indexer
3. **Day 2**: Revert code changes
4. **Day 3**: Post-mortem and revised approach

## Next Steps

After successful implementation:

1. Document new architecture
2. Train team on new patterns
3. Apply same pattern to other services
4. Consider distributed state management for multi-resolver setup