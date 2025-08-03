# Deno KV Integration Proposal for Bridge-Me-Not Resolver

## Executive Summary

This proposal outlines the integration of Deno KV as the primary state management solution for the Bridge-Me-Not resolver, replacing the current file-based system. Deno KV provides atomic operations, real-time updates via watch functionality, built-in TTL support, and seamless scaling capabilities - all critical features for a production-ready cross-chain swap resolver.

### Key Benefits
- **Atomic Operations**: Ensure data consistency during concurrent order processing
- **Real-time Updates**: Use KV watch for event-driven architecture
- **Built-in TTL**: Automatic cleanup of expired orders and temporary data
- **Multi-instance Support**: Enable horizontal scaling without file locking issues
- **Performance**: Sub-millisecond reads with strong consistency guarantees
- **Deployment Ready**: Native integration with Deno Deploy

## Current State Management Analysis

### Existing Architecture
The current implementation uses file-based state management with the following characteristics:

1. **File Storage**:
   - `resolver-state.json`: Resolver order tracking
   - `alice-state.json`: Test client state and secrets
   - Manual JSON serialization/deserialization

2. **Access Patterns**:
   - Frequent reads for order status checks
   - Writes on order state transitions
   - Batch operations for statistics and reporting
   - No concurrent access protection

3. **Limitations**:
   - Race conditions during concurrent updates
   - No real-time synchronization between instances
   - Manual cleanup of expired data
   - Performance degradation with large state files
   - No built-in versioning or rollback

## KV Architecture Design

### Key Space Design

```typescript
// Key structure follows hierarchical patterns for efficient queries
type KvKey = 
  | ["orders", orderId: string]                           // Individual order
  | ["orders_by_status", status: string, orderId: string] // Status index
  | ["orders_by_chain", chainId: string, orderId: string] // Chain index
  | ["secrets", orderId: string]                          // Order secrets
  | ["escrows", "src", orderId: string]                   // Source escrows
  | ["escrows", "dst", orderId: string]                   // Destination escrows
  | ["metrics", "daily", date: string]                    // Daily metrics
  | ["config", "resolver", key: string]                   // Configuration
  | ["locks", resource: string]                           // Distributed locks
  | ["events", timestamp: string, eventId: string]        // Event log
```

### Schema Design with TypeScript Types

```typescript
// Core domain types remain unchanged
import { OrderState, OrderStatus, OrderParams, Immutables } from "../types/index.ts";

// KV-specific types
interface KvOrderState extends OrderState {
  version: number;              // For optimistic concurrency control
  lastModified: number;         // Unix timestamp
  expiresAt?: number;          // TTL timestamp
}

interface KvSecret {
  orderId: string;
  secret: `0x${string}`;
  createdAt: number;
  expiresAt: number;           // Auto-cleanup after order completion
}

interface KvEscrowRecord {
  orderId: string;
  address: `0x${string}`;
  chainId: number;
  deployedAt: number;
  deployTxHash: `0x${string}`;
}

interface KvMetrics {
  date: string;                // ISO date
  ordersCreated: number;
  ordersCompleted: number;
  ordersFailed: number;
  totalVolume: bigint;
  avgProcessingTime: number;
}

interface KvLock {
  holder: string;              // Instance ID
  acquiredAt: number;
  expiresAt: number;
  version: number;
}

interface KvEventRecord {
  id: string;
  timestamp: number;
  type: "order_created" | "escrow_deployed" | "secret_revealed" | "order_completed";
  orderId: string;
  data: Record<string, unknown>;
}
```

## Implementation Examples

### 1. KV Initialization and Configuration

```typescript
// src/kv/client.ts
export class KvClient {
  private kv: Deno.Kv;
  private instanceId: string;

  constructor(private path?: string) {
    this.instanceId = crypto.randomUUID();
  }

  async connect(): Promise<void> {
    this.kv = await Deno.openKv(this.path);
    console.log(`KV connected: ${this.path || "default"} (instance: ${this.instanceId})`);
  }

  async close(): Promise<void> {
    await this.kv.close();
  }

  getDb(): Deno.Kv {
    return this.kv;
  }

  getInstanceId(): string {
    return this.instanceId;
  }
}

// Singleton for application-wide access
export const kvClient = new KvClient();
```

### 2. Order State Management with KV

```typescript
// src/kv/order-store.ts
export class KvOrderStore {
  constructor(private kv: Deno.Kv) {}

  async getOrder(orderId: string): Promise<KvOrderState | null> {
    const result = await this.kv.get<KvOrderState>(["orders", orderId]);
    return result.value;
  }

  async createOrder(order: OrderState): Promise<void> {
    const kvOrder: KvOrderState = {
      ...order,
      version: 1,
      lastModified: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    const atomic = this.kv.atomic();
    
    // Main order record
    atomic.set(["orders", order.id], kvOrder);
    
    // Status index
    atomic.set(["orders_by_status", order.status, order.id], order.id);
    
    // Chain indexes
    atomic.set(["orders_by_chain", order.params.srcChainId.toString(), order.id], order.id);
    atomic.set(["orders_by_chain", order.params.dstChainId.toString(), order.id], order.id);
    
    // Event log
    const event: KvEventRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "order_created",
      orderId: order.id,
      data: { status: order.status },
    };
    atomic.set(["events", event.timestamp.toString(), event.id], event, {
      expireIn: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const result = await atomic.commit();
    if (!result.ok) {
      throw new Error("Failed to create order");
    }
  }

  async updateOrderStatus(
    orderId: string, 
    newStatus: OrderStatus,
    additionalUpdates?: Partial<OrderState>
  ): Promise<boolean> {
    const existing = await this.kv.get<KvOrderState>(["orders", orderId]);
    if (!existing.value) return false;

    const order = existing.value;
    const oldStatus = order.status;

    const updatedOrder: KvOrderState = {
      ...order,
      ...additionalUpdates,
      status: newStatus,
      version: order.version + 1,
      lastModified: Date.now(),
    };

    const atomic = this.kv.atomic();
    
    // Check version for optimistic concurrency control
    atomic.check(existing);
    
    // Update main record
    atomic.set(["orders", orderId], updatedOrder);
    
    // Update indexes
    atomic.delete(["orders_by_status", oldStatus, orderId]);
    atomic.set(["orders_by_status", newStatus, orderId], orderId);
    
    // Log state transition
    const event: KvEventRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "order_completed",
      orderId,
      data: { oldStatus, newStatus },
    };
    atomic.set(["events", event.timestamp.toString(), event.id], event, {
      expireIn: 7 * 24 * 60 * 60 * 1000,
    });

    const result = await atomic.commit();
    return result.ok;
  }

  async getOrdersByStatus(status: OrderStatus): Promise<KvOrderState[]> {
    const orders: KvOrderState[] = [];
    
    // Get order IDs from index
    const iter = this.kv.list<string>({ 
      prefix: ["orders_by_status", status] 
    });
    
    const orderIds: string[] = [];
    for await (const entry of iter) {
      orderIds.push(entry.value);
    }
    
    // Batch get the full order records
    const results = await Promise.all(
      orderIds.map(id => this.kv.get<KvOrderState>(["orders", id]))
    );
    
    for (const result of results) {
      if (result.value) {
        orders.push(result.value);
      }
    }
    
    return orders;
  }

  async getActiveOrders(): Promise<KvOrderState[]> {
    const activeStatuses = [
      OrderStatus.Created,
      OrderStatus.SrcEscrowDeployed,
      OrderStatus.DstEscrowDeployed,
      OrderStatus.SecretRevealed,
    ];

    const allOrders = await Promise.all(
      activeStatuses.map(status => this.getOrdersByStatus(status))
    );

    return allOrders.flat();
  }

  async cleanupExpiredOrders(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    const iter = this.kv.list<KvOrderState>({ prefix: ["orders"] });
    
    for await (const entry of iter) {
      const order = entry.value;
      if (order.expiresAt && order.expiresAt < now) {
        const atomic = this.kv.atomic();
        atomic.delete(["orders", order.id]);
        atomic.delete(["orders_by_status", order.status, order.id]);
        atomic.delete(["orders_by_chain", order.params.srcChainId.toString(), order.id]);
        atomic.delete(["orders_by_chain", order.params.dstChainId.toString(), order.id]);
        
        const result = await atomic.commit();
        if (result.ok) cleaned++;
      }
    }

    return cleaned;
  }
}
```

### 3. Real-time Updates with Watch

```typescript
// src/kv/watchers.ts
export class KvOrderWatcher {
  private controller?: ReadableStreamDefaultController<WatchEvent>;
  
  constructor(
    private kv: Deno.Kv,
    private handler: OrderEventHandler
  ) {}

  async start(): Promise<void> {
    // Watch for all order updates
    const watchKeys = [
      ["orders"],
      ["orders_by_status", OrderStatus.SrcEscrowDeployed],
      ["secrets"],
    ];

    const stream = this.kv.watch(watchKeys.map(key => ({ key })));
    
    for await (const entries of stream) {
      for (const entry of entries) {
        await this.handleWatchEvent(entry);
      }
    }
  }

  private async handleWatchEvent(entry: Deno.KvEntryMaybe<unknown>): Promise<void> {
    if (!entry.value) return;

    const [prefix, ...rest] = entry.key;
    
    switch (prefix) {
      case "orders": {
        const order = entry.value as KvOrderState;
        await this.handler.onOrderUpdate(order);
        break;
      }
      
      case "orders_by_status": {
        const [, status, orderId] = entry.key;
        if (status === OrderStatus.SrcEscrowDeployed) {
          await this.handler.onOrderNeedsAction(orderId as string);
        }
        break;
      }
      
      case "secrets": {
        const [, orderId] = entry.key;
        const secret = entry.value as KvSecret;
        await this.handler.onSecretRevealed(orderId as string, secret.secret);
        break;
      }
    }
  }
}

interface OrderEventHandler {
  onOrderUpdate(order: KvOrderState): Promise<void>;
  onOrderNeedsAction(orderId: string): Promise<void>;
  onSecretRevealed(orderId: string, secret: `0x${string}`): Promise<void>;
}
```

### 4. Distributed Locking

```typescript
// src/kv/locks.ts
export class KvDistributedLock {
  constructor(
    private kv: Deno.Kv,
    private instanceId: string
  ) {}

  async acquire(
    resource: string, 
    ttlMs: number = 30000
  ): Promise<boolean> {
    const lockKey = ["locks", resource];
    const now = Date.now();
    
    const lock: KvLock = {
      holder: this.instanceId,
      acquiredAt: now,
      expiresAt: now + ttlMs,
      version: 1,
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
        return result.ok;
      }
      return false;
    }

    // No existing lock, try to acquire
    const atomic = this.kv.atomic();
    atomic.check({ key: lockKey, versionstamp: null });
    atomic.set(lockKey, lock);
    const result = await atomic.commit();
    return result.ok;
  }

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
    return result.ok;
  }

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
    return result.ok;
  }
}
```

### 5. Secret Management with TTL

```typescript
// src/kv/secret-store.ts
export class KvSecretStore {
  constructor(private kv: Deno.Kv) {}

  async storeSecret(
    orderId: string, 
    secret: `0x${string}`,
    ttlMs: number = 24 * 60 * 60 * 1000 // 24 hours
  ): Promise<void> {
    const kvSecret: KvSecret = {
      orderId,
      secret,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };

    await this.kv.set(["secrets", orderId], kvSecret, {
      expireIn: ttlMs,
    });
  }

  async getSecret(orderId: string): Promise<`0x${string}` | null> {
    const result = await this.kv.get<KvSecret>(["secrets", orderId]);
    return result.value?.secret || null;
  }

  async revealSecret(orderId: string): Promise<`0x${string}` | null> {
    const result = await this.kv.get<KvSecret>(["secrets", orderId]);
    if (!result.value) return null;

    // Atomically mark as revealed
    const atomic = this.kv.atomic();
    atomic.check(result);
    atomic.delete(["secrets", orderId]);
    
    // Emit event
    const event: KvEventRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "secret_revealed",
      orderId,
      data: { revealedAt: Date.now() },
    };
    atomic.set(["events", event.timestamp.toString(), event.id], event, {
      expireIn: 7 * 24 * 60 * 60 * 1000,
    });

    const commitResult = await atomic.commit();
    return commitResult.ok ? result.value.secret : null;
  }
}
```

### 6. Metrics and Analytics

```typescript
// src/kv/metrics.ts
export class KvMetricsStore {
  constructor(private kv: Deno.Kv) {}

  async recordOrderMetric(
    type: "created" | "completed" | "failed",
    volume?: bigint,
    processingTime?: number
  ): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const key = ["metrics", "daily", date];
    
    const existing = await this.kv.get<KvMetrics>(key);
    const current = existing.value || {
      date,
      ordersCreated: 0,
      ordersCompleted: 0,
      ordersFailed: 0,
      totalVolume: 0n,
      avgProcessingTime: 0,
    };

    // Update metrics
    switch (type) {
      case "created":
        current.ordersCreated++;
        break;
      case "completed":
        current.ordersCompleted++;
        if (volume) current.totalVolume += volume;
        if (processingTime) {
          const totalTime = current.avgProcessingTime * (current.ordersCompleted - 1);
          current.avgProcessingTime = (totalTime + processingTime) / current.ordersCompleted;
        }
        break;
      case "failed":
        current.ordersFailed++;
        break;
    }

    // Use atomic operation for consistency
    const atomic = this.kv.atomic();
    if (existing.value) {
      atomic.check(existing);
    }
    atomic.set(key, current);
    await atomic.commit();
  }

  async getMetrics(days: number = 7): Promise<KvMetrics[]> {
    const metrics: KvMetrics[] = [];
    const endDate = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(endDate);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const result = await this.kv.get<KvMetrics>(["metrics", "daily", dateStr]);
      if (result.value) {
        metrics.push(result.value);
      }
    }
    
    return metrics.reverse();
  }

  async aggregateMetrics(metrics: KvMetrics[]): Promise<{
    totalOrders: number;
    successRate: number;
    totalVolume: string;
    avgProcessingTime: number;
  }> {
    const totalOrders = metrics.reduce((sum, m) => sum + m.ordersCreated, 0);
    const totalCompleted = metrics.reduce((sum, m) => sum + m.ordersCompleted, 0);
    const totalVolume = metrics.reduce((sum, m) => sum + m.totalVolume, 0n);
    const avgProcessingTime = metrics.reduce((sum, m, i) => {
      return (sum * i + m.avgProcessingTime) / (i + 1);
    }, 0);

    return {
      totalOrders,
      successRate: totalOrders > 0 ? (totalCompleted / totalOrders) * 100 : 0,
      totalVolume: totalVolume.toString(),
      avgProcessingTime,
    };
  }
}
```

## Migration Strategy

### Phase 1: Parallel Operation (Week 1-2)
1. Implement KV stores alongside existing file-based system
2. Write to both systems, read from files
3. Validate KV data integrity
4. Monitor performance metrics

### Phase 2: Read Migration (Week 3)
1. Switch reads to KV with file fallback
2. Implement data reconciliation
3. Test concurrent access patterns
4. Validate watch functionality

### Phase 3: Write Migration (Week 4)
1. Switch writes to KV primary
2. Keep file writes as backup
3. Implement KV-to-file export
4. Test failure scenarios

### Phase 4: Full Migration (Week 5)
1. Remove file-based dependencies
2. Archive historical data
3. Enable multi-instance deployment
4. Performance optimization

### Migration Script Example

```typescript
// scripts/migrate-to-kv.ts
import { kvClient } from "../src/kv/client.ts";
import { KvOrderStore } from "../src/kv/order-store.ts";
import { OrderStateManager } from "../src/resolver/state.ts";
import { AliceStateManager } from "../src/alice/state.ts";

async function migrateToKv() {
  console.log("Starting migration to Deno KV...");
  
  // Connect to KV
  await kvClient.connect();
  const kv = kvClient.getDb();
  const orderStore = new KvOrderStore(kv);
  
  // Load existing file-based state
  const resolverState = new OrderStateManager();
  const aliceState = new AliceStateManager();
  
  await resolverState.loadFromFile();
  await aliceState.loadFromFile();
  
  // Migrate resolver orders
  console.log("Migrating resolver orders...");
  const resolverOrders = resolverState.getAllOrders();
  for (const order of resolverOrders) {
    await orderStore.createOrder(order);
    console.log(`Migrated order: ${order.id}`);
  }
  
  // Migrate Alice orders and secrets
  console.log("Migrating Alice state...");
  const aliceOrders = aliceState.getAllOrders();
  for (const order of aliceOrders) {
    await orderStore.createOrder(order);
    
    const secret = aliceState.getSecret(order.id);
    if (secret) {
      const secretStore = new KvSecretStore(kv);
      await secretStore.storeSecret(order.id, secret);
    }
    console.log(`Migrated Alice order: ${order.id}`);
  }
  
  // Verify migration
  const kvOrders = await orderStore.getActiveOrders();
  console.log(`Migration complete. Total orders in KV: ${kvOrders.length}`);
  
  await kvClient.close();
}

if (import.meta.main) {
  migrateToKv().catch(console.error);
}
```

## Performance Benchmarks

### Expected Performance Improvements

| Operation | File-based | Deno KV | Improvement |
|-----------|------------|---------|-------------|
| Single Read | 5-10ms | <1ms | 10x |
| Single Write | 10-20ms | 1-2ms | 10x |
| Concurrent Reads (100) | 500ms | 10ms | 50x |
| Concurrent Writes (10) | Failed | 20ms | ∞ |
| Status Query (1000 orders) | 50ms | 5ms | 10x |
| Watch Latency | N/A | <10ms | N/A |

### Benchmark Script

```typescript
// scripts/benchmark-kv.ts
async function benchmarkKv() {
  const kv = await Deno.openKv(":memory:");
  const iterations = 1000;
  
  // Write benchmark
  const writeStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await kv.set(["bench", i.toString()], {
      id: i,
      data: "x".repeat(1000),
      timestamp: Date.now(),
    });
  }
  const writeTime = performance.now() - writeStart;
  
  // Read benchmark
  const readStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await kv.get(["bench", i.toString()]);
  }
  const readTime = performance.now() - readStart;
  
  // List benchmark
  const listStart = performance.now();
  const items = [];
  for await (const entry of kv.list({ prefix: ["bench"] })) {
    items.push(entry);
  }
  const listTime = performance.now() - listStart;
  
  console.log({
    writes: {
      total: `${writeTime.toFixed(2)}ms`,
      perOp: `${(writeTime / iterations).toFixed(3)}ms`,
    },
    reads: {
      total: `${readTime.toFixed(2)}ms`,
      perOp: `${(readTime / iterations).toFixed(3)}ms`,
    },
    list: {
      total: `${listTime.toFixed(2)}ms`,
      items: items.length,
    },
  });
  
  await kv.close();
}
```

## Best Practices

### 1. Key Design
- Use hierarchical keys for efficient prefix queries
- Keep keys short but descriptive
- Include version/timestamp in keys when needed
- Avoid special characters in dynamic key parts

### 2. Atomic Operations
- Always use atomic operations for related updates
- Implement optimistic concurrency control
- Handle commit failures gracefully
- Batch operations when possible

### 3. Watch Patterns
- Use specific key prefixes to minimize overhead
- Implement backpressure handling
- Consider watch reconnection logic
- Filter events early in the pipeline

### 4. TTL Usage
- Set appropriate TTLs for temporary data
- Use TTL for automatic cleanup
- Consider timezone implications
- Document TTL policies

### 5. Error Handling
- Implement retry logic with exponential backoff
- Log all KV operation failures
- Monitor KV health metrics
- Have fallback strategies

## Integration with Queues and Cron

### Queue Integration

```typescript
// src/kv/queue-integration.ts
interface QueuedOrder {
  orderId: string;
  action: "process" | "retry" | "cleanup";
  attempt: number;
  scheduledAt: number;
}

export class KvOrderQueue {
  constructor(private kv: Deno.Kv) {}

  async enqueueOrder(order: QueuedOrder): Promise<void> {
    await this.kv.enqueue(order, {
      delay: Math.max(0, order.scheduledAt - Date.now()),
      keysIfUndelivered: [["failed_queue", order.orderId]],
    });
  }

  async listenQueue(handler: (order: QueuedOrder) => Promise<void>): Promise<void> {
    await this.kv.listenQueue(async (msg: unknown) => {
      const order = msg as QueuedOrder;
      
      try {
        await handler(order);
      } catch (error) {
        console.error(`Queue processing error for ${order.orderId}:`, error);
        
        // Retry with exponential backoff
        if (order.attempt < 3) {
          await this.enqueueOrder({
            ...order,
            attempt: order.attempt + 1,
            scheduledAt: Date.now() + Math.pow(2, order.attempt) * 1000,
          });
        }
      }
    });
  }
}
```

### Cron Integration

```typescript
// src/kv/cron-tasks.ts
export class KvCronTasks {
  constructor(
    private kv: Deno.Kv,
    private orderStore: KvOrderStore,
    private metricsStore: KvMetricsStore
  ) {}

  async setupCronJobs(): Promise<void> {
    // Cleanup expired orders every hour
    Deno.cron("cleanup-orders", "0 * * * *", async () => {
      const cleaned = await this.orderStore.cleanupExpiredOrders();
      console.log(`Cleaned up ${cleaned} expired orders`);
    });

    // Generate daily reports
    Deno.cron("daily-metrics", "0 0 * * *", async () => {
      const metrics = await this.metricsStore.getMetrics(1);
      const summary = await this.metricsStore.aggregateMetrics(metrics);
      console.log("Daily metrics:", summary);
      
      // Store report
      await this.kv.set(
        ["reports", "daily", new Date().toISOString().split('T')[0]], 
        summary,
        { expireIn: 90 * 24 * 60 * 60 * 1000 } // 90 days
      );
    });

    // Health check every 5 minutes
    Deno.cron("health-check", "*/5 * * * *", async () => {
      const testKey = ["health", "check"];
      const testValue = { timestamp: Date.now(), status: "healthy" };
      
      try {
        await this.kv.set(testKey, testValue);
        const result = await this.kv.get(testKey);
        
        if (result.value?.timestamp !== testValue.timestamp) {
          throw new Error("Health check failed: value mismatch");
        }
        
        await this.kv.delete(testKey);
      } catch (error) {
        console.error("KV health check failed:", error);
        // Trigger alerts
      }
    });
  }
}
```

## Conclusion

Deno KV provides a robust, scalable solution for state management in the Bridge-Me-Not resolver. The migration from file-based storage to KV will enable:

1. **Reliability**: Atomic operations and consistency guarantees
2. **Scalability**: Multi-instance deployment support
3. **Performance**: Sub-millisecond operations
4. **Real-time**: Event-driven architecture with watch
5. **Maintainability**: Simplified state management
6. **Operations**: Built-in metrics and monitoring

The phased migration approach ensures zero downtime and allows for validation at each step. With proper implementation of the patterns outlined in this proposal, the resolver will be ready for production deployment at scale.