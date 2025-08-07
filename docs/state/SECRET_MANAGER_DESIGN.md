# SecretManager Design Document

## Purpose

The SecretManager is the core component responsible for managing all secrets revealed by the resolver. It provides a clean interface for storing, retrieving, and tracking the lifecycle of secrets used in atomic swaps.

## Design Principles

1. **Single Source of Truth**: All secret-related state lives in the resolver's database
2. **Memory-First Access**: Hot data cached in memory for sub-millisecond access
3. **Audit Trail**: Complete history of all secret operations
4. **Failure Recovery**: Ability to retry failed reveals and recover from crashes

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    SecretManager                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐       ┌─────────────────────┐        │
│  │ Memory Cache │◄─────►│   Core Logic        │        │
│  │              │       │                     │        │
│  │ Hot Secrets  │       │ • Store Secret     │        │
│  │ Recent 24h   │       │ • Confirm Secret   │        │
│  │ LRU Eviction │       │ • Retrieve Secret  │        │
│  └──────────────┘       │ • Validate Secret  │        │
│                         └──────────┬──────────┘        │
│                                    │                    │
│                         ┌──────────▼──────────┐        │
│                         │   SQLite Database   │        │
│                         │                     │        │
│                         │ • revealed_secrets  │        │
│                         │ • secret_metadata   │        │
│                         │ • audit_log        │        │
│                         └─────────────────────┘        │
└──────────────────────────────────────────────────────────┘
```

## Core Interface

```typescript
interface ISecretManager {
  // Write Operations
  storeSecret(params: StoreSecretParams): Promise<SecretRecord>;
  confirmSecret(hashlock: string, txHash: string, gasUsed: bigint): Promise<void>;
  markFailed(hashlock: string, error: string): Promise<void>;
  
  // Read Operations
  getSecretByHashlock(hashlock: string): Promise<string | null>;
  getSecretByOrderHash(orderHash: string): Promise<string | null>;
  getRevealedSecrets(filter?: SecretFilter): Promise<SecretRecord[]>;
  hasSecret(hashlock: string): Promise<boolean>;
  
  // Lifecycle Operations
  pruneOldSecrets(olderThan: Date): Promise<number>;
  exportSecrets(path: string): Promise<void>;
  importSecrets(path: string): Promise<void>;
  
  // Analytics
  getStatistics(): Promise<SecretStatistics>;
  getRevealPatterns(): Promise<RevealPattern[]>;
}
```

## Data Structures

### SecretRecord
```typescript
interface SecretRecord {
  // Identity
  id: number;
  hashlock: string;         // keccak256(secret)
  secret: string;           // The actual secret
  
  // Context
  orderHash: string;        // Associated swap order
  escrowAddress: string;    // Where it was revealed
  chainId: number;          // Which chain
  
  // Lifecycle
  revealedAt: Date;         // When we decided to reveal
  revealedBy: 'resolver' | 'manual' | 'recovery';
  confirmedAt?: Date;       // When blockchain confirmed
  
  // Transaction
  txHash?: string;          // Blockchain transaction
  blockNumber?: number;     // Block it was included
  gasUsed?: bigint;         // Actual gas consumed
  gasPriceWei?: bigint;     // Gas price paid
  
  // Status
  status: SecretStatus;
  errorMessage?: string;
  retryCount: number;
  
  // Metadata
  competitorCount?: number; // How many others revealed
  profitabilityWei?: bigint; // Expected profit
  mevProtection?: boolean;  // If flashbots used
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

type SecretStatus = 
  | 'pending'      // Stored but not on-chain yet
  | 'submitted'    // Transaction sent
  | 'confirmed'    // On-chain confirmation
  | 'failed'       // Transaction failed
  | 'expired';     // Deadline passed
```

### Memory Cache Structure
```typescript
class MemoryCache {
  private cache: Map<string, CachedSecret>;
  private lru: LRUCache<string, CachedSecret>;
  private hotSecrets: Set<string>; // Frequently accessed
  
  interface CachedSecret {
    secret: string;
    lastAccessed: number;
    accessCount: number;
    size: number;
  }
}
```

## Implementation Details

### 1. Secret Storage Flow

```typescript
async storeSecret(params: StoreSecretParams): Promise<SecretRecord> {
  // 1. Validate inputs
  this.validateSecret(params.secret);
  this.validateOrderHash(params.orderHash);
  
  // 2. Calculate hashlock
  const hashlock = keccak256(params.secret);
  
  // 3. Check for duplicates
  const existing = await this.getSecretByHashlock(hashlock);
  if (existing) {
    logger.warn('Secret already exists', { hashlock });
    return existing;
  }
  
  // 4. Begin transaction
  const tx = await this.db.transaction();
  
  try {
    // 5. Store in database
    const record = await tx
      .insertInto('revealed_secrets')
      .values({
        hashlock,
        secret: params.secret,
        order_hash: params.orderHash,
        escrow_address: params.escrowAddress,
        chain_id: params.chainId,
        revealed_at: new Date(),
        revealed_by: params.revealedBy || 'resolver',
        status: 'pending',
        retry_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*')
      .executeTakeFirstOrThrow();
    
    // 6. Add to audit log
    await tx
      .insertInto('audit_log')
      .values({
        action: 'secret_stored',
        entity_type: 'secret',
        entity_id: hashlock,
        metadata: JSON.stringify(params),
        timestamp: new Date()
      })
      .execute();
    
    // 7. Commit transaction
    await tx.commit();
    
    // 8. Update memory cache
    this.memCache.set(hashlock, {
      secret: params.secret,
      lastAccessed: Date.now(),
      accessCount: 0,
      size: params.secret.length
    });
    
    // 9. Emit event
    this.emit('secret:stored', record);
    
    return record;
  } catch (error) {
    await tx.rollback();
    throw new SecretStorageError('Failed to store secret', error);
  }
}
```

### 2. Secret Retrieval Flow

```typescript
async getSecretByHashlock(hashlock: string): Promise<string | null> {
  const start = performance.now();
  
  // 1. Check memory cache first (O(1))
  const cached = this.memCache.get(hashlock);
  if (cached) {
    cached.lastAccessed = Date.now();
    cached.accessCount++;
    
    // Promote to hot set if frequently accessed
    if (cached.accessCount > HOT_THRESHOLD) {
      this.hotSecrets.add(hashlock);
    }
    
    metrics.cacheHit();
    metrics.retrievalLatency(performance.now() - start);
    return cached.secret;
  }
  
  // 2. Check database (O(log n) with index)
  const record = await this.db
    .selectFrom('revealed_secrets')
    .where('hashlock', '=', hashlock)
    .select(['secret', 'status'])
    .executeTakeFirst();
  
  if (!record) {
    metrics.cacheMiss();
    return null;
  }
  
  // 3. Validate status
  if (record.status === 'expired') {
    logger.warn('Accessing expired secret', { hashlock });
  }
  
  // 4. Update cache
  this.memCache.set(hashlock, {
    secret: record.secret,
    lastAccessed: Date.now(),
    accessCount: 1,
    size: record.secret.length
  });
  
  // 5. Manage cache size
  if (this.memCache.size > MAX_CACHE_SIZE) {
    this.evictLRU();
  }
  
  metrics.cacheMiss();
  metrics.retrievalLatency(performance.now() - start);
  return record.secret;
}
```

### 3. Confirmation Flow

```typescript
async confirmSecret(hashlock: string, txHash: string, gasUsed: bigint): Promise<void> {
  const tx = await this.db.transaction();
  
  try {
    // 1. Update secret record
    await tx
      .updateTable('revealed_secrets')
      .set({
        status: 'confirmed',
        tx_hash: txHash,
        gas_used: gasUsed,
        confirmed_at: new Date(),
        updated_at: new Date()
      })
      .where('hashlock', '=', hashlock)
      .where('status', 'in', ['pending', 'submitted'])
      .execute();
    
    // 2. Record confirmation metrics
    await tx
      .insertInto('secret_confirmations')
      .values({
        hashlock,
        tx_hash: txHash,
        gas_used: gasUsed,
        confirmation_time: Date.now() - revealedAt,
        block_delay: currentBlock - revealBlock
      })
      .execute();
    
    // 3. Update statistics
    await this.updateStatistics(tx, {
      confirmed: 1,
      totalGas: gasUsed
    });
    
    await tx.commit();
    
    // 4. Update cache
    const cached = this.memCache.get(hashlock);
    if (cached) {
      cached.status = 'confirmed';
    }
    
    // 5. Emit event
    this.emit('secret:confirmed', { hashlock, txHash });
    
  } catch (error) {
    await tx.rollback();
    throw new ConfirmationError('Failed to confirm secret', error);
  }
}
```

## Cache Management

### LRU Eviction Policy
```typescript
private evictLRU(): void {
  let oldest: string | null = null;
  let oldestTime = Infinity;
  
  for (const [hashlock, cached] of this.memCache.entries()) {
    // Never evict hot secrets
    if (this.hotSecrets.has(hashlock)) continue;
    
    // Never evict pending secrets
    if (cached.status === 'pending') continue;
    
    if (cached.lastAccessed < oldestTime) {
      oldest = hashlock;
      oldestTime = cached.lastAccessed;
    }
  }
  
  if (oldest) {
    this.memCache.delete(oldest);
    logger.debug('Evicted from cache', { hashlock: oldest });
  }
}
```

### Cache Warming
```typescript
async warmCache(): Promise<void> {
  // Load recent secrets
  const recent = await this.db
    .selectFrom('revealed_secrets')
    .where('revealed_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .where('status', 'in', ['pending', 'confirmed'])
    .select(['hashlock', 'secret'])
    .execute();
  
  for (const record of recent) {
    this.memCache.set(record.hashlock, {
      secret: record.secret,
      lastAccessed: Date.now(),
      accessCount: 0,
      size: record.secret.length
    });
  }
  
  logger.info(`Cache warmed with ${recent.length} secrets`);
}
```

## Error Handling

### Retry Logic
```typescript
async retryFailedSecrets(): Promise<void> {
  const failed = await this.db
    .selectFrom('revealed_secrets')
    .where('status', '=', 'failed')
    .where('retry_count', '<', MAX_RETRIES)
    .where('revealed_at', '>', new Date(Date.now() - RETRY_WINDOW))
    .selectAll()
    .execute();
  
  for (const secret of failed) {
    try {
      await this.resubmitSecret(secret);
      
      await this.db
        .updateTable('revealed_secrets')
        .set({
          retry_count: secret.retry_count + 1,
          status: 'submitted',
          updated_at: new Date()
        })
        .where('hashlock', '=', secret.hashlock)
        .execute();
        
    } catch (error) {
      logger.error('Retry failed', { hashlock: secret.hashlock, error });
    }
  }
}
```

## Security Considerations

### Encryption at Rest
```typescript
class EncryptedSecretManager extends SecretManager {
  private cipher: Cipher;
  
  async storeSecret(params: StoreSecretParams): Promise<SecretRecord> {
    // Encrypt before storing
    const encrypted = await this.cipher.encrypt(params.secret);
    
    return super.storeSecret({
      ...params,
      secret: encrypted
    });
  }
  
  async getSecretByHashlock(hashlock: string): Promise<string | null> {
    const encrypted = await super.getSecretByHashlock(hashlock);
    if (!encrypted) return null;
    
    // Decrypt before returning
    return await this.cipher.decrypt(encrypted);
  }
}
```

### Access Control
```typescript
class SecureSecretManager extends SecretManager {
  async getSecretByHashlock(
    hashlock: string,
    requester: string
  ): Promise<string | null> {
    // Audit access
    await this.db
      .insertInto('access_log')
      .values({
        resource_type: 'secret',
        resource_id: hashlock,
        requester,
        timestamp: new Date()
      })
      .execute();
    
    // Check permissions
    if (!this.hasPermission(requester, 'read:secrets')) {
      throw new UnauthorizedError('No permission to read secrets');
    }
    
    return super.getSecretByHashlock(hashlock);
  }
}
```

## Monitoring & Metrics

### Key Metrics
```typescript
interface SecretMetrics {
  // Performance
  cacheHitRate: number;      // Target: > 90%
  retrievalLatencyP50: number; // Target: < 5ms
  retrievalLatencyP99: number; // Target: < 20ms
  
  // Volume
  totalSecretsStored: number;
  secretsRevealedPerHour: number;
  pendingSecrets: number;
  
  // Reliability
  confirmationRate: number;  // Target: > 99%
  averageRetries: number;    // Target: < 1.1
  failureRate: number;       // Target: < 1%
  
  // Cache
  cacheSize: number;
  cacheMemoryMB: number;
  evictionRate: number;
}
```

### Alerting Rules
```yaml
alerts:
  - name: HighSecretRetrievalLatency
    condition: p99_latency > 50ms
    severity: warning
    
  - name: LowCacheHitRate
    condition: hit_rate < 80%
    severity: warning
    
  - name: SecretConfirmationFailure
    condition: confirmation_rate < 95%
    severity: critical
    
  - name: CacheMemoryHigh
    condition: cache_memory > 500MB
    severity: warning
```

## Testing Strategy

### Unit Tests
```typescript
describe('SecretManager', () => {
  it('should store and retrieve secrets', async () => {
    const manager = new SecretManager(testDb);
    const secret = '0x' + randomBytes(32).toString('hex');
    
    await manager.storeSecret({
      secret,
      orderHash: '0xabc',
      escrowAddress: '0xdef',
      chainId: 1
    });
    
    const retrieved = await manager.getSecretByHashlock(keccak256(secret));
    expect(retrieved).toBe(secret);
  });
  
  it('should handle cache eviction', async () => {
    const manager = new SecretManager(testDb, { maxCacheSize: 10 });
    
    // Fill cache beyond limit
    for (let i = 0; i < 15; i++) {
      await manager.storeSecret(generateTestSecret(i));
    }
    
    expect(manager.cacheSize).toBeLessThanOrEqual(10);
  });
});
```

## Migration from Current System

### Phase 1: Parallel Operation
Run SecretManager alongside current indexer queries:
```typescript
const secret = await Promise.race([
  secretManager.getSecretByHashlock(hashlock),
  ponderClient.getRevealedSecret(hashlock) // fallback
]);
```

### Phase 2: Gradual Migration
Migrate responsibilities one by one:
1. Start storing new secrets in SecretManager
2. Begin reading from SecretManager with indexer fallback  
3. Migrate historical secrets
4. Remove indexer dependency

### Phase 3: Cleanup
Remove old code and optimize:
1. Remove PonderClient secret methods
2. Optimize cache settings based on metrics
3. Add advanced features (encryption, sharding)