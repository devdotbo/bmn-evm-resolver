# Migration Strategy: From Indexer Dependency to Self-Managed State

## Executive Summary

This document outlines the migration strategy to transform the resolver from
depending on the indexer for state management to maintaining its own operational
database. The migration is designed to be zero-downtime, reversible, and
incrementally deployable.

## Migration Principles

1. **Zero Downtime**: The resolver continues operating throughout migration
2. **Incremental Rollout**: Each phase can be deployed independently
3. **Reversibility**: Each step can be rolled back without data loss
4. **Data Integrity**: No secrets or state will be lost during migration
5. **Monitoring**: Every step is observable and measurable

## Current State Analysis

### What Needs Migration

```typescript
// Current (Broken) Dependencies
class SimpleResolver {
  // ❌ Depends on indexer for secrets
  await this.ponderClient.getRevealedSecrets();
  
  // ❌ Complex joins for own data
  await this.ponderClient.getSecretWithHashlock();
  
  // ❌ No local state persistence
  this.secrets = new Map(); // Lost on restart
}
```

### Data to Migrate

1. **Historical Secrets**: Any secrets previously revealed (if recoverable)
2. **Active Monitoring**: Swaps currently being watched
3. **Decision History**: Past resolver decisions (if logged)
4. **Configuration**: Runtime settings currently in environment variables

## Migration Phases

### Phase 0: Preparation (Day 1)

**Goal**: Set up infrastructure without changing behavior

```typescript
// 1. Add dependencies
import { Database } from "sqlite";
import { Kysely } from "kysely";

// 2. Create database module (inactive)
class ResolverDatabase {
  // Implementation ready but not used
}

// 3. Deploy database schema
await runMigrations("./migrations/001_initial_schema.sql");

// 4. Add feature flags
const FEATURES = {
  USE_LOCAL_STATE: process.env.USE_LOCAL_STATE === "true",
  DUAL_WRITE: process.env.DUAL_WRITE === "true",
  INDEXER_FALLBACK: process.env.INDEXER_FALLBACK === "true",
};
```

**Validation**:

- [ ] Database file created
- [ ] Schema deployed
- [ ] Feature flags working
- [ ] No behavior change

### Phase 1: Shadow Mode (Day 2-3)

**Goal**: Write to local database without reading from it

```typescript
class SimpleResolver {
  async withdrawFromSource(escrow: SrcEscrow, secret: string) {
    // Existing behavior unchanged
    const result = await this.contracts.escrow.withdraw(secret);

    // NEW: Also write to local database (shadow write)
    if (FEATURES.DUAL_WRITE) {
      try {
        await this.secretManager.storeSecret({
          secret,
          orderHash: escrow.orderHash,
          escrowAddress: escrow.escrowAddress,
          chainId: escrow.chainId,
        });
      } catch (error) {
        // Log but don't fail the operation
        logger.warn("Shadow write failed", error);
      }
    }

    return result;
  }
}
```

**Monitoring**:

```typescript
// Track shadow write success rate
metrics.shadowWriteSuccess.inc();
metrics.shadowWriteLatency.observe(duration);

// Alert if shadow writes failing
if (shadowWriteSuccessRate < 0.95) {
  alert("Shadow writes degraded");
}
```

**Validation**:

- [ ] Local database populating
- [ ] No impact on resolver performance
- [ ] Shadow write success rate > 99%
- [ ] Data integrity verified

### Phase 2: Dual Read (Day 4-5)

**Goal**: Read from both sources, compare results

```typescript
class SecretManager {
  async getRevealedSecrets(): Promise<SecretRecord[]> {
    if (!FEATURES.USE_LOCAL_STATE) {
      // Still using indexer
      return await this.ponderClient.getRevealedSecrets();
    }

    // Read from both sources
    const [localSecrets, indexerSecrets] = await Promise.all([
      this.db.selectFrom("revealed_secrets").selectAll().execute(),
      FEATURES.INDEXER_FALLBACK
        ? this.ponderClient.getRevealedSecrets().catch(() => [])
        : Promise.resolve([]),
    ]);

    // Compare and log discrepancies
    const discrepancies = this.findDiscrepancies(localSecrets, indexerSecrets);
    if (discrepancies.length > 0) {
      logger.warn("State discrepancy detected", discrepancies);
      metrics.stateDiscrepancy.inc(discrepancies.length);
    }

    // Use local as primary, indexer as fallback
    return localSecrets.length > 0 ? localSecrets : indexerSecrets;
  }
}
```

**Reconciliation**:

```typescript
// Automated reconciliation job
async function reconcileState() {
  const local = await secretManager.getRevealedSecrets();
  const indexer = await ponderClient.getRevealedSecrets();

  for (const indexerSecret of indexer) {
    const exists = local.find((s) => s.hashlock === indexerSecret.hashlock);
    if (!exists) {
      // Missing in local, add it
      await secretManager.importSecret(indexerSecret);
      logger.info("Imported missing secret", indexerSecret.hashlock);
    }
  }
}

// Run every hour
setInterval(reconcileState, 60 * 60 * 1000);
```

**Validation**:

- [ ] Discrepancy rate < 1%
- [ ] Performance metrics stable
- [ ] Fallback working correctly
- [ ] Reconciliation completing

### Phase 3: Local Primary (Day 6-7)

**Goal**: Use local database as primary source

```typescript
class SimpleResolver {
  constructor(config: ResolverConfig) {
    // Initialize local state manager
    this.db = new ResolverDatabase(config.dbPath);
    this.secretManager = new SecretManager(this.db);
    this.swapMonitor = new SwapMonitor(this.db);

    // Indexer now optional
    if (config.indexerUrl) {
      this.indexer = new PonderClient({ url: config.indexerUrl });
    }
  }

  async checkForRevealedSecrets() {
    // PRIMARY: Read from local database
    const ourSecrets = await this.secretManager.getRevealedSecrets();

    // Process our secrets
    for (const secret of ourSecrets) {
      await this.processSecret(secret);
    }

    // OPTIONAL: Check indexer for missed events
    if (FEATURES.INDEXER_FALLBACK && this.indexer) {
      try {
        const missedEvents = await this.checkForMissedEvents();
        if (missedEvents.length > 0) {
          logger.warn("Found missed events", missedEvents);
        }
      } catch (error) {
        // Indexer failure doesn't affect operation
        logger.debug("Indexer check failed (non-critical)", error);
      }
    }
  }
}
```

**Cutover Checklist**:

- [ ] Set `USE_LOCAL_STATE=true`
- [ ] Monitor error rates
- [ ] Verify secret reveals working
- [ ] Check performance metrics
- [ ] Confirm no data loss

### Phase 4: Remove Indexer Dependency (Day 8-9)

**Goal**: Complete independence from indexer for state

```typescript
// BEFORE: src/indexer/ponder-client.ts
export class PonderClient {
  async getRevealedSecrets() {/* ... */} // ❌ Remove
  async getResolverState() {/* ... */} // ❌ Remove

  // Keep only historical queries
  async getHistoricalSwaps() {/* ... */} // ✅ Keep
  async getChainStatistics() {/* ... */} // ✅ Keep
}

// AFTER: Clean separation
export class PonderClient {
  // Only historical and analytical queries
  async getProtocolHistory(filter: HistoryFilter) {/* ... */}
  async getMarketMetrics() {/* ... */}
}
```

**Code Cleanup**:

```typescript
// Remove feature flags
- if (FEATURES.USE_LOCAL_STATE) {
-   return await this.secretManager.getRevealedSecrets();
- } else {
-   return await this.ponderClient.getRevealedSecrets();
- }
+ return await this.secretManager.getRevealedSecrets();

// Remove dual write
- if (FEATURES.DUAL_WRITE) {
-   await this.shadowWrite(secret);
- }

// Remove indexer fallback
- const indexerSecrets = FEATURES.INDEXER_FALLBACK 
-   ? await this.ponderClient.getRevealedSecrets()
-   : [];
```

**Validation**:

- [ ] All tests passing
- [ ] No references to removed methods
- [ ] Resolver operating independently
- [ ] Performance improved

### Phase 5: Optimization (Day 10)

**Goal**: Optimize for production performance

```typescript
// 1. Optimize cache settings
class SecretManager {
  constructor(db: ResolverDatabase) {
    this.cache = new LRUCache({
      max: 1000, // Maximum items
      maxAge: 3600000, // 1 hour TTL
      updateAgeOnGet: true,
    });
  }
}

// 2. Add database indexes
await db.schema.createIndex("idx_secrets_composite")
  .on("revealed_secrets")
  .columns(["chain_id", "status", "revealed_at"]);

// 3. Implement connection pooling
const dbPool = new DatabasePool({
  min: 2,
  max: 10,
  idleTimeout: 30000,
});

// 4. Add query batching
class BatchedSecretManager extends SecretManager {
  private batch: SecretBatch = [];

  async storeSecret(secret: Secret) {
    this.batch.push(secret);

    if (this.batch.length >= BATCH_SIZE) {
      await this.flush();
    }
  }

  async flush() {
    if (this.batch.length === 0) return;

    await this.db.transaction(async (trx) => {
      for (const secret of this.batch) {
        await trx.insertInto("revealed_secrets").values(secret);
      }
    });

    this.batch = [];
  }
}
```

## Rollback Strategy

### Instant Rollback (< 1 minute)

```typescript
// Environment variable toggle
export USE_LOCAL_STATE=false
export INDEXER_FALLBACK=true

// Resolver immediately reverts to indexer
```

### Phase Rollback (< 1 hour)

```bash
#!/bin/bash
# rollback.sh

# 1. Stop resolver
systemctl stop resolver

# 2. Revert configuration
cp /backups/resolver.env.backup /etc/resolver/.env

# 3. Optionally revert code
git checkout tags/pre-migration

# 4. Restart
systemctl start resolver
```

### Data Recovery (< 1 day)

```sql
-- Export local state
.output /tmp/resolver_state.sql
.dump revealed_secrets monitored_swaps resolver_decisions
.output stdout

-- Import to indexer if needed
psql indexer_db < /tmp/resolver_state.sql
```

## Testing Strategy

### Unit Tests

```typescript
describe("Migration", () => {
  it("should write to both stores in dual-write mode", async () => {
    process.env.DUAL_WRITE = "true";

    const resolver = new SimpleResolver(config);
    await resolver.revealSecret(testSecret);

    // Verify both stores have the secret
    const local = await resolver.secretManager.getSecretByHashlock(hashlock);
    const indexer = await resolver.ponderClient.getSecret(hashlock);

    expect(local).toBe(testSecret);
    expect(indexer).toBe(testSecret);
  });
});
```

### Integration Tests

```typescript
describe("Failover", () => {
  it("should fall back to indexer if local fails", async () => {
    // Corrupt local database
    await corruptDatabase(resolver.db);

    // Should still work via indexer
    const secrets = await resolver.getRevealedSecrets();
    expect(secrets.length).toBeGreaterThan(0);
  });
});
```

### Load Tests

```typescript
describe("Performance", () => {
  it("should handle 1000 secrets/second", async () => {
    const start = Date.now();

    for (let i = 0; i < 1000; i++) {
      await secretManager.storeSecret(generateSecret());
    }

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });
});
```

## Monitoring During Migration

### Key Metrics

```typescript
// Migration progress
const migrationMetrics = {
  // Data metrics
  secretsInLocal: Gauge,
  secretsInIndexer: Gauge,
  discrepancyCount: Counter,

  // Performance metrics
  localQueryLatency: Histogram,
  indexerQueryLatency: Histogram,
  dualWriteLatency: Histogram,

  // Reliability metrics
  localFailures: Counter,
  indexerFailures: Counter,
  fallbackTriggers: Counter,

  // Business metrics
  secretsRevealedPerHour: Gauge,
  successRate: Gauge,
};
```

### Alerting Rules

```yaml
alerts:
  - name: HighDiscrepancyRate
    expr: rate(discrepancy_count[5m]) > 0.01
    severity: warning
    message: "State discrepancy rate above 1%"

  - name: LocalDatabaseDown
    expr: up{job="resolver_db"} == 0
    severity: critical
    message: "Local database is down"

  - name: PerformanceDegraded
    expr: local_query_latency_p99 > 100
    severity: warning
    message: "Local query latency above 100ms"

  - name: MigrationStalled
    expr: secrets_in_local - secrets_in_indexer > 100
    severity: warning
    message: "Local database falling behind"
```

### Dashboard

```
┌─────────────────────────────────────────────────────┐
│                Migration Dashboard                   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Progress: ████████████████░░░░  75%                │
│                                                      │
│  Phase: Local Primary (Day 6/10)                    │
│                                                      │
│  ┌──────────────────┐  ┌──────────────────┐       │
│  │ Local Database    │  │ Indexer          │       │
│  │                  │  │                  │       │
│  │ Secrets: 1,234   │  │ Secrets: 1,230   │       │
│  │ Latency: 12ms    │  │ Latency: 145ms   │       │
│  │ Success: 99.9%   │  │ Success: 98.1%   │       │
│  └──────────────────┘  └──────────────────┘       │
│                                                      │
│  Discrepancies: 4 (0.3%)                           │
│  Last Sync: 2 minutes ago                          │
│  Status: ✅ Healthy                                 │
└─────────────────────────────────────────────────────┘
```

## Success Criteria

### Phase 0-1: Shadow Mode

- [ ] Zero impact on production
- [ ] Shadow write success > 99%
- [ ] No increase in error rate

### Phase 2-3: Dual Operation

- [ ] Discrepancy rate < 1%
- [ ] Local query latency < 20ms
- [ ] Successful failover tested

### Phase 4-5: Independence

- [ ] Resolver operates with indexer offline
- [ ] Performance improved by 50%+
- [ ] Zero data loss

## Timeline

| Phase             | Duration | Risk   | Rollback Time |
| ----------------- | -------- | ------ | ------------- |
| Preparation       | 1 day    | None   | N/A           |
| Shadow Mode       | 2 days   | Low    | Instant       |
| Dual Read         | 2 days   | Low    | < 1 min       |
| Local Primary     | 2 days   | Medium | < 5 min       |
| Remove Dependency | 2 days   | Medium | < 1 hour      |
| Optimization      | 1 day    | Low    | < 10 min      |

**Total Duration**: 10 days **Buffer Time**: 5 days **Target Completion**: 15
days

## Post-Migration

### Documentation Updates

1. Update architecture diagrams
2. Remove deprecated API methods
3. Update runbooks
4. Train team on new architecture

### Lessons Learned

1. Document what worked well
2. Identify improvement areas
3. Create best practices guide
4. Share with other teams

### Next Steps

1. Apply pattern to other services
2. Consider distributed state for HA
3. Implement cross-region replication
4. Plan for horizontal scaling

## Conclusion

This migration strategy provides a safe, incremental path from indexer
dependency to self-managed state. Each phase is designed to be:

- **Observable**: Metrics and monitoring at every step
- **Reversible**: Quick rollback if issues arise
- **Validated**: Clear success criteria
- **Low Risk**: Gradual transition with fallbacks

The key to success is patience and thorough validation at each phase. Moving too
quickly risks data loss or service disruption. Following this plan ensures a
smooth transition to a more performant, reliable, and maintainable architecture.
