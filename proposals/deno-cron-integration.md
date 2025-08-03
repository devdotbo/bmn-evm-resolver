# Deno Cron Integration for Bridge-Me-Not Resolver

## Executive Summary

This proposal outlines the integration of Deno Cron into the Bridge-Me-Not resolver to handle scheduled maintenance tasks, timelock monitoring, and operational health checks. By leveraging Deno's native cron capabilities, we can improve system reliability, reduce missed timelock opportunities, and maintain optimal performance through scheduled cleanup operations.

### Key Benefits
- **Reliable Scheduling**: Native Deno runtime support with automatic retry capabilities
- **Reduced Latency**: Timely execution of time-sensitive operations
- **Better Resource Management**: Scheduled cleanup and optimization tasks
- **Enhanced Monitoring**: Regular health checks and metrics collection
- **Simplified Operations**: No external dependencies for scheduling

## Current State Analysis

### Existing Periodic Tasks
The resolver currently uses `setInterval` for periodic tasks:

```typescript
// From src/resolver/index.ts
private startPeriodicTasks(): void {
  // Save state every minute
  setInterval(async () => {
    await this.stateManager.saveToFile();
  }, 60000);

  // Clean up old orders every 5 minutes
  setInterval(() => {
    const removed = this.stateManager.cleanupOldOrders(MAX_ORDER_AGE_SECONDS * 1000);
  }, 300000);

  // Check cancellable orders every 30 seconds
  setInterval(async () => {
    await this.checkCancellableOrders();
  }, 30000);
}
```

### Limitations of Current Approach
1. **No execution guarantees** - Tasks may overlap or be skipped
2. **No error recovery** - Failed tasks aren't retried
3. **Poor visibility** - No centralized monitoring of scheduled tasks
4. **Resource inefficiency** - Continuous polling even when unnecessary
5. **No timezone awareness** - Important for cross-chain coordination

## Scheduled Task Requirements

### Critical Time-Sensitive Operations

#### 1. Timelock Monitoring
- **Purpose**: Monitor approaching timelock expirations
- **Frequency**: Every 10 seconds (for test), every minute (for mainnet)
- **Priority**: Critical - missed timelocks mean lost funds

#### 2. Order State Synchronization
- **Purpose**: Ensure resolver state matches blockchain reality
- **Frequency**: Every 30 seconds
- **Priority**: High - prevents double-spending and missed opportunities

#### 3. Cancellation Window Monitoring
- **Purpose**: Execute cancellations before expiry
- **Frequency**: Every 15 seconds (test), every 2 minutes (mainnet)
- **Priority**: Critical - recovers locked funds

### Maintenance Operations

#### 4. State Persistence
- **Purpose**: Save resolver state to disk
- **Frequency**: Every minute
- **Priority**: Medium - prevents data loss

#### 5. Order Cleanup
- **Purpose**: Remove completed/expired orders
- **Frequency**: Every 5 minutes
- **Priority**: Low - memory optimization

#### 6. Balance Monitoring
- **Purpose**: Check resolver token balances
- **Frequency**: Every 5 minutes
- **Priority**: Medium - ensures liquidity

### Monitoring & Health

#### 7. Health Checks
- **Purpose**: Verify system components are operational
- **Frequency**: Every minute
- **Priority**: High - early problem detection

#### 8. Performance Metrics
- **Purpose**: Collect and aggregate performance data
- **Frequency**: Every 5 minutes
- **Priority**: Low - operational insights

## Cron Job Architecture

### Core Components

```typescript
// src/scheduler/cron-manager.ts
export class CronManager {
  private jobs: Map<string, CronJob> = new Map();
  private kv: Deno.Kv;
  
  async initialize() {
    this.kv = await Deno.openKv();
    await this.registerJobs();
  }
  
  private async registerJobs() {
    // Register all cron jobs
    await this.registerTimelockMonitor();
    await this.registerStateSync();
    await this.registerHealthCheck();
    // ... other jobs
  }
}
```

### Job Registration Pattern

```typescript
interface CronJob {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
  config: CronJobConfig;
}

interface CronJobConfig {
  retryCount?: number;
  backoffSchedule?: number[];
  timeout?: number;
  exclusive?: boolean; // Prevent overlap
}
```

## Implementation Examples

### 1. Timelock Monitor

```typescript
// src/scheduler/jobs/timelock-monitor.ts
export class TimelockMonitorJob {
  constructor(
    private stateManager: OrderStateManager,
    private executor: OrderExecutor,
    private kv: Deno.Kv
  ) {}

  async register(): Promise<void> {
    const schedule = isMainnetMode() ? "*/1 * * * *" : "*/10 * * * * *"; // Every minute (mainnet) or 10 seconds (test)
    
    Deno.cron("timelock-monitor", schedule, {
      backoffSchedule: [1000, 5000, 10000] // Retry up to 3 times
    }, async () => {
      await this.execute();
    });
  }

  private async execute(): Promise<void> {
    const lockKey = ["cron", "lock", "timelock-monitor"];
    const lock = await this.kv.atomic()
      .check({ key: lockKey, versionstamp: null })
      .set(lockKey, { locked: true, timestamp: Date.now() })
      .commit();

    if (!lock.ok) {
      console.log("Timelock monitor already running, skipping");
      return;
    }

    try {
      await this.checkApproachingTimelocks();
      await this.executeCriticalCancellations();
    } finally {
      await this.kv.delete(lockKey);
    }
  }

  private async checkApproachingTimelocks(): Promise<void> {
    const activeOrders = this.stateManager.getActiveOrders();
    const now = BigInt(Math.floor(Date.now() / 1000));
    
    for (const order of activeOrders) {
      const timelocks = order.immutables.timelocks;
      
      // Check destination cancellation approaching (most critical)
      const dstTimeRemaining = timelocks.dstCancellation - now;
      if (dstTimeRemaining > 0n && dstTimeRemaining < 300n) { // 5 minutes warning
        await this.alertApproachingDeadline(order, "DST_CANCELLATION", dstTimeRemaining);
      }
      
      // Check source cancellation
      const srcTimeRemaining = timelocks.srcCancellation - now;
      if (srcTimeRemaining > 0n && srcTimeRemaining < 300n) {
        await this.alertApproachingDeadline(order, "SRC_CANCELLATION", srcTimeRemaining);
      }
    }
  }

  private async executeCriticalCancellations(): Promise<void> {
    const orders = this.stateManager.getOrdersByStatus(OrderStatus.DstEscrowDeployed);
    
    for (const order of orders) {
      if (this.shouldCancelImmediately(order)) {
        console.log(`CRITICAL: Executing immediate cancellation for order ${order.id}`);
        const escrowAddress = order.actualDstEscrowAddress || order.dstEscrowAddress;
        if (escrowAddress) {
          await this.executor.cancelDestinationEscrow(escrowAddress);
          this.stateManager.updateOrderStatus(order.id, OrderStatus.Cancelled);
        }
      }
    }
  }

  private shouldCancelImmediately(order: OrderState): boolean {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const timeUntilExpiry = order.immutables.timelocks.dstCancellation - now;
    
    // Cancel if less than 30 seconds remain (block time buffer)
    return timeUntilExpiry > 0n && timeUntilExpiry < 30n;
  }

  private async alertApproachingDeadline(
    order: OrderState, 
    type: string, 
    timeRemaining: bigint
  ): Promise<void> {
    // Store alert in KV for deduplication
    const alertKey = ["alerts", "timelock", order.id, type];
    const existing = await this.kv.get(alertKey);
    
    if (!existing.value) {
      console.warn(`⚠️ TIMELOCK WARNING: Order ${order.id} has ${timeRemaining}s until ${type}`);
      await this.kv.set(alertKey, { 
        timestamp: Date.now(),
        timeRemaining: timeRemaining.toString()
      }, { expireIn: 600_000 }); // Expire after 10 minutes
    }
  }
}
```

### 2. State Synchronization

```typescript
// src/scheduler/jobs/state-sync.ts
export class StateSyncJob {
  constructor(
    private stateManager: OrderStateManager,
    private publicClients: { src: PublicClient, dst: PublicClient },
    private kv: Deno.Kv
  ) {}

  async register(): Promise<void> {
    Deno.cron("state-sync", "*/30 * * * * *", { // Every 30 seconds
      backoffSchedule: [2000, 5000]
    }, async () => {
      await this.execute();
    });
  }

  private async execute(): Promise<void> {
    const metrics = {
      ordersChecked: 0,
      discrepanciesFound: 0,
      syncErrors: 0
    };

    try {
      const activeOrders = this.stateManager.getActiveOrders();
      
      for (const order of activeOrders) {
        metrics.ordersChecked++;
        
        // Verify source escrow state
        if (order.srcEscrowAddress) {
          const srcState = await this.verifyEscrowState(
            order.srcEscrowAddress, 
            this.publicClients.src
          );
          
          if (srcState.withdrawn && order.status !== OrderStatus.Completed) {
            console.log(`Discrepancy: Order ${order.id} withdrawn on-chain but not completed`);
            this.stateManager.updateOrderStatus(order.id, OrderStatus.Completed);
            metrics.discrepanciesFound++;
          }
        }
        
        // Verify destination escrow state
        if (order.dstEscrowAddress || order.actualDstEscrowAddress) {
          const dstAddress = order.actualDstEscrowAddress || order.dstEscrowAddress!;
          const dstState = await this.verifyEscrowState(
            dstAddress,
            this.publicClients.dst
          );
          
          if (dstState.withdrawn && !order.secretRevealed) {
            console.log(`Discrepancy: Secret revealed on-chain but not in state`);
            // Trigger secret reveal handling
            metrics.discrepanciesFound++;
          }
        }
      }
      
      // Store metrics
      await this.kv.set(
        ["metrics", "state-sync", Date.now()], 
        metrics,
        { expireIn: 86400_000 } // 24 hours
      );
      
    } catch (error) {
      console.error("State sync error:", error);
      metrics.syncErrors++;
    }
  }

  private async verifyEscrowState(
    escrowAddress: Address,
    client: PublicClient
  ): Promise<{ withdrawn: boolean; cancelled: boolean }> {
    // Check escrow contract state
    // Implementation depends on contract interface
    return { withdrawn: false, cancelled: false };
  }
}
```

### 3. Health Check System

```typescript
// src/scheduler/jobs/health-check.ts
export class HealthCheckJob {
  constructor(
    private components: {
      stateManager: OrderStateManager,
      monitor: OrderMonitor,
      executor: OrderExecutor,
      publicClients: { src: PublicClient, dst: PublicClient }
    },
    private kv: Deno.Kv
  ) {}

  async register(): Promise<void> {
    Deno.cron("health-check", "* * * * *", { // Every minute
      backoffSchedule: [1000, 3000]
    }, async () => {
      await this.execute();
    });
  }

  private async execute(): Promise<void> {
    const health = {
      timestamp: Date.now(),
      components: {} as Record<string, ComponentHealth>,
      overall: "healthy" as "healthy" | "degraded" | "unhealthy"
    };

    // Check RPC connectivity
    health.components.srcRpc = await this.checkRpcHealth(this.components.publicClients.src);
    health.components.dstRpc = await this.checkRpcHealth(this.components.publicClients.dst);

    // Check state manager
    health.components.stateManager = this.checkStateManagerHealth();

    // Check resolver balance
    health.components.balance = await this.checkBalanceHealth();

    // Determine overall health
    const unhealthyCount = Object.values(health.components)
      .filter(c => c.status === "unhealthy").length;
    
    if (unhealthyCount > 0) {
      health.overall = unhealthyCount > 1 ? "unhealthy" : "degraded";
    }

    // Store health status
    await this.kv.set(["health", "latest"], health);
    
    // Alert on status change
    const previous = await this.kv.get(["health", "previous"]);
    if (previous.value?.overall !== health.overall) {
      console.log(`Health status changed: ${previous.value?.overall} -> ${health.overall}`);
      await this.kv.set(["health", "previous"], health);
    }
  }

  private async checkRpcHealth(client: PublicClient): Promise<ComponentHealth> {
    try {
      const start = Date.now();
      const blockNumber = await client.getBlockNumber();
      const latency = Date.now() - start;
      
      return {
        status: latency < 1000 ? "healthy" : "degraded",
        latency,
        details: { blockNumber: blockNumber.toString() }
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message
      };
    }
  }

  private checkStateManagerHealth(): ComponentHealth {
    const stats = this.components.stateManager.getStatistics();
    const activeOrders = stats[OrderStatus.DstEscrowDeployed] || 0;
    
    return {
      status: activeOrders < MAX_CONCURRENT_ORDERS * 0.9 ? "healthy" : "degraded",
      details: stats
    };
  }

  private async checkBalanceHealth(): Promise<ComponentHealth> {
    // Check resolver has sufficient balance for operations
    // Implementation depends on token configuration
    return { status: "healthy" };
  }
}

interface ComponentHealth {
  status: "healthy" | "degraded" | "unhealthy";
  latency?: number;
  error?: string;
  details?: any;
}
```

### 4. Balance Monitor

```typescript
// src/scheduler/jobs/balance-monitor.ts
export class BalanceMonitorJob {
  constructor(
    private walletClients: { src: WalletClient, dst: WalletClient },
    private tokens: Map<string, { address: Address, decimals: number }>,
    private kv: Deno.Kv
  ) {}

  async register(): Promise<void> {
    Deno.cron("balance-monitor", "*/5 * * * *", { // Every 5 minutes
      backoffSchedule: [2000]
    }, async () => {
      await this.execute();
    });
  }

  private async execute(): Promise<void> {
    const balances = {
      timestamp: Date.now(),
      chains: {} as Record<string, ChainBalances>
    };

    // Check source chain balances
    balances.chains.source = await this.checkChainBalances(
      this.walletClients.src.account!.address,
      this.walletClients.src
    );

    // Check destination chain balances
    balances.chains.destination = await this.checkChainBalances(
      this.walletClients.dst.account!.address,
      this.walletClients.dst
    );

    // Store balance snapshot
    await this.kv.set(
      ["balances", "snapshots", Date.now()],
      balances,
      { expireIn: 604800_000 } // 7 days
    );

    // Check for low balances
    await this.checkLowBalanceAlerts(balances);
  }

  private async checkChainBalances(
    address: Address,
    client: WalletClient
  ): Promise<ChainBalances> {
    const balances: ChainBalances = {
      native: "0",
      tokens: {}
    };

    // Get native balance
    const nativeBalance = await client.getBalance({ address });
    balances.native = nativeBalance.toString();

    // Get token balances
    for (const [symbol, token] of this.tokens) {
      const tokenContract = createERC20Token(
        token.address,
        client,
        client
      );
      
      const balance = await tokenContract.read.balanceOf([address]);
      balances.tokens[symbol] = {
        balance: balance.toString(),
        formatted: formatTokenAmount(balance, token.decimals)
      };
    }

    return balances;
  }

  private async checkLowBalanceAlerts(balances: any): Promise<void> {
    // Define minimum thresholds
    const thresholds = {
      native: 0.1, // ETH
      TKA: 1000,
      TKB: 1000
    };

    // Check and alert on low balances
    for (const [chain, chainBalances] of Object.entries(balances.chains)) {
      // Check native balance
      const nativeBalance = Number(chainBalances.native) / 1e18;
      if (nativeBalance < thresholds.native) {
        await this.createAlert(`Low native balance on ${chain}: ${nativeBalance} ETH`);
      }

      // Check token balances
      for (const [token, tokenData] of Object.entries(chainBalances.tokens)) {
        const balance = Number(tokenData.formatted);
        if (thresholds[token] && balance < thresholds[token]) {
          await this.createAlert(`Low ${token} balance on ${chain}: ${balance}`);
        }
      }
    }
  }

  private async createAlert(message: string): Promise<void> {
    const alertKey = ["alerts", "balance", message];
    const existing = await this.kv.get(alertKey);
    
    if (!existing.value) {
      console.warn(`💰 BALANCE ALERT: ${message}`);
      await this.kv.set(alertKey, { 
        timestamp: Date.now(),
        message 
      }, { expireIn: 3600_000 }); // 1 hour
    }
  }
}

interface ChainBalances {
  native: string;
  tokens: Record<string, { balance: string; formatted: string }>;
}
```

### 5. Metrics Aggregator

```typescript
// src/scheduler/jobs/metrics-aggregator.ts
export class MetricsAggregatorJob {
  constructor(
    private stateManager: OrderStateManager,
    private kv: Deno.Kv
  ) {}

  async register(): Promise<void> {
    Deno.cron("metrics-aggregator", "*/5 * * * *", { // Every 5 minutes
      backoffSchedule: [1000]
    }, async () => {
      await this.execute();
    });
  }

  private async execute(): Promise<void> {
    const endTime = Date.now();
    const startTime = endTime - 300_000; // Last 5 minutes
    
    const metrics = {
      timestamp: endTime,
      period: { start: startTime, end: endTime },
      orders: await this.aggregateOrderMetrics(startTime, endTime),
      performance: await this.aggregatePerformanceMetrics(startTime, endTime),
      errors: await this.aggregateErrorMetrics(startTime, endTime)
    };

    // Store aggregated metrics
    await this.kv.set(
      ["metrics", "aggregated", endTime],
      metrics,
      { expireIn: 2592000_000 } // 30 days
    );

    // Update rolling averages
    await this.updateRollingAverages(metrics);
  }

  private async aggregateOrderMetrics(start: number, end: number) {
    const orders = this.stateManager.getAllOrders()
      .filter(o => o.createdAt >= start && o.createdAt <= end);
    
    return {
      created: orders.length,
      completed: orders.filter(o => o.status === OrderStatus.Completed).length,
      failed: orders.filter(o => o.status === OrderStatus.Failed).length,
      averageCompletionTime: this.calculateAverageCompletionTime(orders),
      totalVolume: this.calculateTotalVolume(orders)
    };
  }

  private async aggregatePerformanceMetrics(start: number, end: number) {
    // Collect performance metrics from KV
    const iter = this.kv.list({ prefix: ["performance"] });
    const metrics = [];
    
    for await (const entry of iter) {
      if (entry.value.timestamp >= start && entry.value.timestamp <= end) {
        metrics.push(entry.value);
      }
    }

    return {
      avgRpcLatency: this.average(metrics.map(m => m.rpcLatency || 0)),
      avgTxConfirmationTime: this.average(metrics.map(m => m.txConfirmTime || 0)),
      gasUsed: metrics.reduce((sum, m) => sum + (m.gasUsed || 0), 0)
    };
  }

  private calculateAverageCompletionTime(orders: OrderState[]): number {
    const completed = orders.filter(o => o.status === OrderStatus.Completed);
    if (completed.length === 0) return 0;
    
    const times = completed.map(o => o.completedAt! - o.createdAt);
    return this.average(times);
  }

  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }
}
```

## Schedule Recommendations

### Development/Test Environment
```typescript
const TEST_SCHEDULES = {
  timelockMonitor: "*/10 * * * * *",      // Every 10 seconds
  stateSync: "*/30 * * * * *",            // Every 30 seconds
  cancellationCheck: "*/15 * * * * *",    // Every 15 seconds
  statePersistence: "* * * * *",          // Every minute
  orderCleanup: "*/5 * * * *",            // Every 5 minutes
  balanceMonitor: "*/5 * * * *",          // Every 5 minutes
  healthCheck: "* * * * *",               // Every minute
  metricsAggregator: "*/5 * * * *",       // Every 5 minutes
};
```

### Production/Mainnet Environment
```typescript
const MAINNET_SCHEDULES = {
  timelockMonitor: "* * * * *",           // Every minute
  stateSync: "*/2 * * * *",               // Every 2 minutes
  cancellationCheck: "*/2 * * * *",       // Every 2 minutes
  statePersistence: "*/5 * * * *",        // Every 5 minutes
  orderCleanup: "*/30 * * * *",           // Every 30 minutes
  balanceMonitor: "*/15 * * * *",         // Every 15 minutes
  healthCheck: "*/5 * * * *",             // Every 5 minutes
  metricsAggregator: "*/15 * * * *",      // Every 15 minutes
  dailyReport: "0 0 * * *",               // Daily at midnight
};
```

## Monitoring Strategy

### Job Execution Tracking
```typescript
// src/scheduler/monitoring.ts
export class CronMonitor {
  constructor(private kv: Deno.Kv) {}

  async recordExecution(jobName: string, result: ExecutionResult) {
    const key = ["cron", "executions", jobName, Date.now()];
    await this.kv.set(key, result, { expireIn: 86400_000 }); // 24 hours
    
    // Update job statistics
    const statsKey = ["cron", "stats", jobName];
    const stats = await this.kv.get(statsKey);
    const current = stats.value || { success: 0, failure: 0, total: 0 };
    
    current.total++;
    if (result.success) current.success++;
    else current.failure++;
    
    await this.kv.set(statsKey, current);
  }

  async getJobHealth(jobName: string): Promise<JobHealth> {
    const stats = await this.kv.get(["cron", "stats", jobName]);
    const lastExecution = await this.getLastExecution(jobName);
    
    return {
      successRate: stats.value.success / stats.value.total,
      lastRun: lastExecution?.timestamp,
      consecutiveFailures: await this.getConsecutiveFailures(jobName),
      isHealthy: this.determineHealth(stats.value, lastExecution)
    };
  }
}
```

### Alert System
```typescript
// src/scheduler/alerts.ts
export class CronAlertManager {
  async checkJobHealth() {
    const jobs = ["timelock-monitor", "state-sync", "health-check"];
    
    for (const job of jobs) {
      const health = await this.monitor.getJobHealth(job);
      
      if (!health.isHealthy) {
        await this.sendAlert({
          type: "cron-job-unhealthy",
          job,
          details: health,
          severity: job === "timelock-monitor" ? "critical" : "warning"
        });
      }
      
      // Check for missed executions
      if (this.isMissedExecution(job, health.lastRun)) {
        await this.sendAlert({
          type: "cron-job-missed",
          job,
          lastRun: health.lastRun,
          severity: "warning"
        });
      }
    }
  }
}
```

## Best Practices

### 1. Idempotent Operations
All cron jobs should be idempotent to handle potential duplicate executions:

```typescript
async execute() {
  const executionId = crypto.randomUUID();
  const lockKey = ["execution", this.jobName, executionId];
  
  // Use KV atomic operations for idempotency
  const result = await this.kv.atomic()
    .check({ key: lockKey, versionstamp: null })
    .set(lockKey, { timestamp: Date.now() })
    .commit();
    
  if (!result.ok) {
    console.log(`Job ${this.jobName} already processed with ID ${executionId}`);
    return;
  }
  
  // Proceed with execution
}
```

### 2. Graceful Degradation
Handle failures without affecting core resolver operations:

```typescript
try {
  await this.executeJob();
} catch (error) {
  console.error(`Cron job ${this.jobName} failed:`, error);
  
  // Record failure but don't crash
  await this.monitor.recordExecution(this.jobName, {
    success: false,
    error: error.message,
    timestamp: Date.now()
  });
  
  // Check if critical job
  if (this.isCritical) {
    await this.alertManager.sendCriticalAlert(this.jobName, error);
  }
}
```

### 3. Resource Management
Prevent resource exhaustion:

```typescript
export class ResourceAwareCronJob {
  async execute() {
    // Check system resources
    const memoryUsage = Deno.memoryUsage();
    if (memoryUsage.heapUsed > MAX_HEAP_USAGE) {
      console.warn("High memory usage, deferring job execution");
      return;
    }
    
    // Limit concurrent executions
    const activeJobs = await this.getActiveJobCount();
    if (activeJobs >= MAX_CONCURRENT_JOBS) {
      console.warn("Too many active jobs, deferring execution");
      return;
    }
    
    // Execute with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JOB_TIMEOUT);
    
    try {
      await this.performWork({ signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

## Integration with Queue System

### Job Queue Integration
```typescript
// src/scheduler/queue-integration.ts
export class QueueIntegratedCronJob {
  constructor(
    private queue: Deno.Kv,
    private queueName: string
  ) {}

  async execute() {
    // Collect work items
    const workItems = await this.collectWorkItems();
    
    // Enqueue for processing
    for (const item of workItems) {
      await this.queue.enqueue(item, {
        delay: 0,
        keysIfUndelivered: [["failed-jobs", this.queueName, item.id]]
      });
    }
    
    // Monitor queue depth
    const queueDepth = await this.getQueueDepth();
    if (queueDepth > QUEUE_DEPTH_THRESHOLD) {
      console.warn(`Queue ${this.queueName} depth high: ${queueDepth}`);
    }
  }
}
```

### Coordination with Indexer
```typescript
// src/scheduler/indexer-coordination.ts
export class IndexerCoordinatedJob {
  async execute() {
    // Check indexer status
    const indexerStatus = await this.checkIndexerStatus();
    
    if (indexerStatus.lastBlock < this.requiredBlock) {
      console.log("Waiting for indexer to catch up");
      return;
    }
    
    // Coordinate with indexer for data consistency
    const indexerData = await this.fetchIndexerData();
    const localData = await this.fetchLocalData();
    
    const discrepancies = this.findDiscrepancies(indexerData, localData);
    if (discrepancies.length > 0) {
      await this.reconcileData(discrepancies);
    }
  }
}
```

## Migration Plan

### Phase 1: Core Jobs (Week 1)
1. Implement CronManager base infrastructure
2. Migrate timelock monitoring
3. Migrate state persistence
4. Add basic monitoring

### Phase 2: Maintenance Jobs (Week 2)
1. Implement order cleanup job
2. Add balance monitoring
3. Implement health checks
4. Add metrics collection

### Phase 3: Advanced Features (Week 3)
1. Integrate with Queue system
2. Add indexer coordination
3. Implement alert system
4. Performance optimization

### Rollback Strategy
```typescript
// Maintain backward compatibility
export class HybridScheduler {
  private useCron = Deno.env.get("USE_CRON_SCHEDULER") === "true";
  
  async start() {
    if (this.useCron) {
      await this.cronManager.initialize();
    } else {
      this.startLegacyIntervals();
    }
  }
}
```

## Conclusion

Integrating Deno Cron into the Bridge-Me-Not resolver provides a robust scheduling foundation for critical time-sensitive operations and maintenance tasks. The native retry capabilities, combined with proper monitoring and alerting, will significantly improve system reliability and operational efficiency.

Key benefits include:
- **Improved reliability** through automatic retries and failure handling
- **Better observability** with centralized job monitoring
- **Resource efficiency** through proper job coordination
- **Operational safety** with timelock monitoring and alerts

The phased migration approach ensures minimal disruption while providing immediate value through critical job improvements.