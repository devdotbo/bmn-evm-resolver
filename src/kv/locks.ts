/**
 * Distributed locking mechanism for multi-instance coordination
 * Implements mutex-style locks with TTL and automatic expiry
 */

export interface KvLock {
  holder: string;              // Instance ID holding the lock
  acquiredAt: number;          // Timestamp when acquired
  expiresAt: number;          // Timestamp when lock expires
  version: number;            // Version for optimistic concurrency
  metadata?: Record<string, unknown>; // Optional metadata
}

export interface LockOptions {
  ttlMs?: number;             // Time to live in milliseconds (default: 30s)
  retryAttempts?: number;     // Number of retry attempts (default: 3)
  retryDelayMs?: number;      // Delay between retries (default: 100ms)
  metadata?: Record<string, unknown>; // Optional metadata to store with lock
}

export class KvDistributedLock {
  private readonly defaultTtlMs = 30000; // 30 seconds
  private readonly defaultRetryAttempts = 3;
  private readonly defaultRetryDelayMs = 100;
  
  constructor(
    private kv: Deno.Kv,
    private instanceId: string
  ) {}

  /**
   * Acquire a distributed lock
   * @param resource The resource identifier to lock
   * @param options Lock options
   * @returns True if lock acquired, false otherwise
   */
  async acquire(
    resource: string, 
    options: LockOptions = {}
  ): Promise<boolean> {
    const ttlMs = options.ttlMs ?? this.defaultTtlMs;
    const retryAttempts = options.retryAttempts ?? this.defaultRetryAttempts;
    const retryDelayMs = options.retryDelayMs ?? this.defaultRetryDelayMs;
    
    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      if (await this.tryAcquire(resource, ttlMs, options.metadata)) {
        return true;
      }
      
      if (attempt < retryAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
    
    return false;
  }

  /**
   * Try to acquire a lock once
   * @param resource The resource identifier
   * @param ttlMs Time to live
   * @param metadata Optional metadata
   * @returns True if acquired
   */
  private async tryAcquire(
    resource: string,
    ttlMs: number,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    const lockKey = ["locks", resource];
    const now = Date.now();
    
    const lock: KvLock = {
      holder: this.instanceId,
      acquiredAt: now,
      expiresAt: now + ttlMs,
      version: 1,
      metadata,
    };

    // Try to acquire lock atomically
    const existing = await this.kv.get<KvLock>(lockKey);
    
    if (existing.value) {
      // Check if existing lock is expired
      if (existing.value.expiresAt < now) {
        // Try to take over expired lock
        const atomic = this.kv.atomic();
        atomic.check(existing);
        atomic.set(lockKey, lock);
        const result = await atomic.commit();
        
        if (result.ok) {
          await this.logLockEvent("acquired_expired", resource, lock);
        }
        
        return result.ok;
      }
      
      // Lock is held by someone else
      return false;
    }

    // No existing lock, try to acquire
    const atomic = this.kv.atomic();
    atomic.check({ key: lockKey, versionstamp: null });
    atomic.set(lockKey, lock);
    const result = await atomic.commit();
    
    if (result.ok) {
      await this.logLockEvent("acquired", resource, lock);
    }
    
    return result.ok;
  }

  /**
   * Release a held lock
   * @param resource The resource identifier
   * @returns True if released, false if not held by this instance
   */
  async release(resource: string): Promise<boolean> {
    const lockKey = ["locks", resource];
    const existing = await this.kv.get<KvLock>(lockKey);
    
    if (!existing.value || existing.value.holder !== this.instanceId) {
      return false;
    }

    const atomic = this.kv.atomic();
    atomic.check(existing);
    atomic.delete(lockKey);
    const result = await atomic.commit();
    
    if (result.ok) {
      await this.logLockEvent("released", resource, existing.value);
    }
    
    return result.ok;
  }

  /**
   * Extend the TTL of a held lock
   * @param resource The resource identifier
   * @param ttlMs New TTL from now
   * @returns True if extended
   */
  async extend(resource: string, ttlMs: number): Promise<boolean> {
    const lockKey = ["locks", resource];
    const existing = await this.kv.get<KvLock>(lockKey);
    
    if (!existing.value || existing.value.holder !== this.instanceId) {
      return false;
    }

    const updatedLock: KvLock = {
      ...existing.value,
      expiresAt: Date.now() + ttlMs,
      version: existing.value.version + 1,
    };

    const atomic = this.kv.atomic();
    atomic.check(existing);
    atomic.set(lockKey, updatedLock);
    const result = await atomic.commit();
    
    if (result.ok) {
      await this.logLockEvent("extended", resource, updatedLock);
    }
    
    return result.ok;
  }

  /**
   * Check if a resource is locked
   * @param resource The resource identifier
   * @returns Lock details if locked, null otherwise
   */
  async isLocked(resource: string): Promise<KvLock | null> {
    const lockKey = ["locks", resource];
    const result = await this.kv.get<KvLock>(lockKey);
    
    if (!result.value) {
      return null;
    }
    
    // Check if lock is expired
    if (result.value.expiresAt < Date.now()) {
      return null;
    }
    
    return result.value;
  }

  /**
   * Check if this instance holds a lock
   * @param resource The resource identifier
   * @returns True if held by this instance
   */
  async isHeldByMe(resource: string): Promise<boolean> {
    const lock = await this.isLocked(resource);
    return lock !== null && lock.holder === this.instanceId;
  }

  /**
   * Execute a function with a lock
   * @param resource The resource to lock
   * @param fn The function to execute
   * @param options Lock options
   * @returns The function result
   * @throws Error if lock cannot be acquired
   */
  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const acquired = await this.acquire(resource, options);
    if (!acquired) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }

    try {
      return await fn();
    } finally {
      await this.release(resource);
    }
  }

  /**
   * List all active locks
   * @returns Array of active locks
   */
  async listLocks(): Promise<{ resource: string; lock: KvLock }[]> {
    const locks: { resource: string; lock: KvLock }[] = [];
    const now = Date.now();
    
    const iter = this.kv.list<KvLock>({ prefix: ["locks"] });
    
    for await (const entry of iter) {
      if (entry.value && entry.value.expiresAt > now) {
        const resource = entry.key[1] as string;
        locks.push({ resource, lock: entry.value });
      }
    }
    
    return locks;
  }

  /**
   * Clean up expired locks
   * @returns Number of locks cleaned up
   */
  async cleanupExpiredLocks(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;
    
    const iter = this.kv.list<KvLock>({ prefix: ["locks"] });
    
    for await (const entry of iter) {
      if (entry.value && entry.value.expiresAt < now) {
        const atomic = this.kv.atomic();
        atomic.check(entry);
        atomic.delete(entry.key);
        
        const result = await atomic.commit();
        if (result.ok) {
          cleaned++;
          const resource = entry.key[1] as string;
          await this.logLockEvent("cleaned", resource, entry.value);
        }
      }
    }
    
    return cleaned;
  }

  /**
   * Force release a lock (admin operation)
   * @param resource The resource identifier
   * @returns True if released
   */
  async forceRelease(resource: string): Promise<boolean> {
    const lockKey = ["locks", resource];
    const existing = await this.kv.get<KvLock>(lockKey);
    
    if (!existing.value) {
      return false;
    }

    const atomic = this.kv.atomic();
    atomic.check(existing);
    atomic.delete(lockKey);
    const result = await atomic.commit();
    
    if (result.ok) {
      await this.logLockEvent("force_released", resource, existing.value);
    }
    
    return result.ok;
  }

  /**
   * Log lock events for monitoring
   * @param event The event type
   * @param resource The resource
   * @param lock The lock details
   */
  private async logLockEvent(
    event: "acquired" | "acquired_expired" | "released" | "extended" | "cleaned" | "force_released",
    resource: string,
    lock: KvLock
  ): Promise<void> {
    const logEntry = {
      event,
      resource,
      lock,
      timestamp: Date.now(),
      instanceId: this.instanceId,
    };
    
    // Store with TTL (keep for 24 hours)
    await this.kv.set(
      ["lock_events", logEntry.timestamp.toString(), resource],
      logEntry,
      { expireIn: 24 * 60 * 60 * 1000 }
    );
  }

  /**
   * Get lock statistics
   * @returns Lock statistics
   */
  async getStatistics(): Promise<{
    activeLocks: number;
    locksByHolder: Record<string, number>;
    avgHoldTime: number;
    expiredLocks: number;
  }> {
    const now = Date.now();
    let activeLocks = 0;
    let expiredLocks = 0;
    const locksByHolder: Record<string, number> = {};
    const holdTimes: number[] = [];
    
    const iter = this.kv.list<KvLock>({ prefix: ["locks"] });
    
    for await (const entry of iter) {
      if (entry.value) {
        if (entry.value.expiresAt > now) {
          activeLocks++;
          locksByHolder[entry.value.holder] = (locksByHolder[entry.value.holder] || 0) + 1;
          holdTimes.push(now - entry.value.acquiredAt);
        } else {
          expiredLocks++;
        }
      }
    }
    
    const avgHoldTime = holdTimes.length > 0
      ? Math.round(holdTimes.reduce((sum, time) => sum + time, 0) / holdTimes.length)
      : 0;
    
    return {
      activeLocks,
      locksByHolder,
      avgHoldTime,
      expiredLocks,
    };
  }
}