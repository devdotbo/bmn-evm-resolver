/**
 * Metrics collection and aggregation
 * Tracks system performance, order statistics, and operational metrics
 */

export interface KvMetrics {
  date: string;                // ISO date (YYYY-MM-DD)
  ordersCreated: number;
  ordersCompleted: number;
  ordersFailed: number;
  ordersCancelled: number;
  totalVolume: bigint;         // Total volume in wei
  avgProcessingTime: number;   // Average time in ms
  avgGasUsed: bigint;         // Average gas used per order
  successRate: number;         // Percentage (0-100)
}

export interface KvOperationMetric {
  operation: string;
  timestamp: number;
  duration: number;            // Duration in ms
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface KvChainMetrics {
  chainId: number;
  blockNumber: bigint;
  gasPrice: bigint;
  pendingOrders: number;
  completedOrders: number;
  failedOrders: number;
  lastUpdated: number;
}

export class KvMetricsStore {
  constructor(private kv: Deno.Kv) {}

  /**
   * Record an order metric
   * @param type The metric type
   * @param volume Optional volume for completed orders
   * @param processingTime Optional processing time in ms
   * @param gasUsed Optional gas used
   */
  async recordOrderMetric(
    type: "created" | "completed" | "failed" | "cancelled",
    volume?: bigint,
    processingTime?: number,
    gasUsed?: bigint
  ): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const key = ["metrics", "daily", date];
    
    let retries = 3;
    while (retries > 0) {
      const existing = await this.kv.get<KvMetrics>(key);
      const current = existing.value || this.createEmptyMetrics(date);

      // Update metrics based on type
      switch (type) {
        case "created":
          current.ordersCreated++;
          break;
        case "completed":
          current.ordersCompleted++;
          if (volume) current.totalVolume += volume;
          if (processingTime) {
            const totalTime = current.avgProcessingTime * (current.ordersCompleted - 1);
            current.avgProcessingTime = Math.round((totalTime + processingTime) / current.ordersCompleted);
          }
          if (gasUsed) {
            const totalGas = current.avgGasUsed * BigInt(current.ordersCompleted - 1);
            current.avgGasUsed = (totalGas + gasUsed) / BigInt(current.ordersCompleted);
          }
          break;
        case "failed":
          current.ordersFailed++;
          break;
        case "cancelled":
          current.ordersCancelled++;
          break;
      }

      // Update success rate
      const totalProcessed = current.ordersCompleted + current.ordersFailed + current.ordersCancelled;
      if (totalProcessed > 0) {
        current.successRate = Math.round((current.ordersCompleted / totalProcessed) * 100);
      }

      // Use atomic operation for consistency
      const atomic = this.kv.atomic();
      if (existing.value) {
        atomic.check(existing);
      }
      atomic.set(key, current);
      
      const result = await atomic.commit();
      if (result.ok) break;
      
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Record an operation metric
   * @param operation The operation name
   * @param duration Duration in milliseconds
   * @param success Whether the operation succeeded
   * @param error Optional error message
   * @param metadata Optional metadata
   */
  async recordOperationMetric(
    operation: string,
    duration: number,
    success: boolean,
    error?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const metric: KvOperationMetric = {
      operation,
      timestamp: Date.now(),
      duration,
      success,
      error,
      metadata,
    };

    // Store with TTL (keep for 7 days)
    await this.kv.set(
      ["metrics", "operations", operation, metric.timestamp.toString()],
      metric,
      { expireIn: 7 * 24 * 60 * 60 * 1000 }
    );

    // Update operation summary
    await this.updateOperationSummary(operation, duration, success);
  }

  /**
   * Update chain-specific metrics
   * @param chainId The chain ID
   * @param metrics The chain metrics to update
   */
  async updateChainMetrics(
    chainId: number,
    metrics: Partial<KvChainMetrics>
  ): Promise<void> {
    const key = ["metrics", "chains", chainId.toString()];
    const existing = await this.kv.get<KvChainMetrics>(key);
    
    const updated: KvChainMetrics = {
      chainId,
      blockNumber: metrics.blockNumber ?? existing.value?.blockNumber ?? 0n,
      gasPrice: metrics.gasPrice ?? existing.value?.gasPrice ?? 0n,
      pendingOrders: metrics.pendingOrders ?? existing.value?.pendingOrders ?? 0,
      completedOrders: metrics.completedOrders ?? existing.value?.completedOrders ?? 0,
      failedOrders: metrics.failedOrders ?? existing.value?.failedOrders ?? 0,
      lastUpdated: Date.now(),
    };

    await this.kv.set(key, updated);
  }

  /**
   * Get metrics for a date range
   * @param days Number of days to retrieve (default 7)
   * @returns Array of daily metrics
   */
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
      } else {
        // Include empty metrics for missing days
        metrics.push(this.createEmptyMetrics(dateStr));
      }
    }
    
    return metrics.reverse(); // Return in chronological order
  }

  /**
   * Get operation metrics for a specific operation
   * @param operation The operation name
   * @param hours Number of hours to look back (default 24)
   * @returns Array of operation metrics
   */
  async getOperationMetrics(
    operation: string,
    hours: number = 24
  ): Promise<KvOperationMetric[]> {
    const metrics: KvOperationMetric[] = [];
    const startTime = Date.now() - (hours * 60 * 60 * 1000);
    
    const iter = this.kv.list<KvOperationMetric>({
      prefix: ["metrics", "operations", operation],
      start: ["metrics", "operations", operation, startTime.toString()],
    });
    
    for await (const entry of iter) {
      metrics.push(entry.value);
    }
    
    return metrics;
  }

  /**
   * Get chain metrics
   * @param chainId Optional chain ID, returns all if not specified
   * @returns Chain metrics
   */
  async getChainMetrics(chainId?: number): Promise<KvChainMetrics[]> {
    const metrics: KvChainMetrics[] = [];
    
    if (chainId !== undefined) {
      const result = await this.kv.get<KvChainMetrics>(["metrics", "chains", chainId.toString()]);
      if (result.value) {
        metrics.push(result.value);
      }
    } else {
      const iter = this.kv.list<KvChainMetrics>({ prefix: ["metrics", "chains"] });
      for await (const entry of iter) {
        metrics.push(entry.value);
      }
    }
    
    return metrics;
  }

  /**
   * Aggregate metrics over a period
   * @param metrics Array of daily metrics
   * @returns Aggregated statistics
   */
  async aggregateMetrics(metrics: KvMetrics[]): Promise<{
    totalOrders: number;
    totalCompleted: number;
    totalFailed: number;
    totalCancelled: number;
    totalVolume: string;
    avgProcessingTime: number;
    avgGasUsed: string;
    overallSuccessRate: number;
    dailyAvgOrders: number;
  }> {
    const totalOrders = metrics.reduce((sum, m) => sum + m.ordersCreated, 0);
    const totalCompleted = metrics.reduce((sum, m) => sum + m.ordersCompleted, 0);
    const totalFailed = metrics.reduce((sum, m) => sum + m.ordersFailed, 0);
    const totalCancelled = metrics.reduce((sum, m) => sum + m.ordersCancelled, 0);
    const totalVolume = metrics.reduce((sum, m) => sum + m.totalVolume, 0n);
    
    // Calculate weighted averages
    let totalProcessingTime = 0;
    let totalProcessedOrders = 0;
    let totalGasUsed = 0n;
    let totalGasOrders = 0;
    
    for (const metric of metrics) {
      if (metric.ordersCompleted > 0) {
        totalProcessingTime += metric.avgProcessingTime * metric.ordersCompleted;
        totalProcessedOrders += metric.ordersCompleted;
        totalGasUsed += metric.avgGasUsed * BigInt(metric.ordersCompleted);
        totalGasOrders += metric.ordersCompleted;
      }
    }
    
    const avgProcessingTime = totalProcessedOrders > 0 
      ? Math.round(totalProcessingTime / totalProcessedOrders) 
      : 0;
    
    const avgGasUsed = totalGasOrders > 0
      ? totalGasUsed / BigInt(totalGasOrders)
      : 0n;
    
    const totalProcessed = totalCompleted + totalFailed + totalCancelled;
    const overallSuccessRate = totalProcessed > 0
      ? Math.round((totalCompleted / totalProcessed) * 100)
      : 0;
    
    const dailyAvgOrders = metrics.length > 0
      ? Math.round(totalOrders / metrics.length)
      : 0;

    return {
      totalOrders,
      totalCompleted,
      totalFailed,
      totalCancelled,
      totalVolume: totalVolume.toString(),
      avgProcessingTime,
      avgGasUsed: avgGasUsed.toString(),
      overallSuccessRate,
      dailyAvgOrders,
    };
  }

  /**
   * Get system health metrics
   * @returns Health status and metrics
   */
  async getHealthMetrics(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    metrics: {
      recentSuccessRate: number;
      avgResponseTime: number;
      activeOrders: number;
      errorRate: number;
    };
    issues: string[];
  }> {
    // Get recent metrics (last 24 hours)
    const recentMetrics = await this.getMetrics(1);
    const todayMetrics = recentMetrics[0] || this.createEmptyMetrics(new Date().toISOString().split('T')[0]);
    
    // Get recent operation metrics
    const operations = await this.getOperationMetrics("processOrder", 1);
    const avgResponseTime = operations.length > 0
      ? Math.round(operations.reduce((sum, op) => sum + op.duration, 0) / operations.length)
      : 0;
    
    const errorRate = operations.length > 0
      ? Math.round((operations.filter(op => !op.success).length / operations.length) * 100)
      : 0;
    
    // Determine health status
    const issues: string[] = [];
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    
    if (todayMetrics.successRate < 90) {
      issues.push(`Low success rate: ${todayMetrics.successRate}%`);
      status = "degraded";
    }
    
    if (errorRate > 10) {
      issues.push(`High error rate: ${errorRate}%`);
      status = "degraded";
    }
    
    if (avgResponseTime > 5000) {
      issues.push(`Slow response time: ${avgResponseTime}ms`);
      status = "degraded";
    }
    
    if (todayMetrics.successRate < 50 || errorRate > 50) {
      status = "unhealthy";
    }
    
    return {
      status,
      metrics: {
        recentSuccessRate: todayMetrics.successRate,
        avgResponseTime,
        activeOrders: todayMetrics.ordersCreated - todayMetrics.ordersCompleted - todayMetrics.ordersFailed - todayMetrics.ordersCancelled,
        errorRate,
      },
      issues,
    };
  }

  /**
   * Create empty metrics object
   * @param date The date string
   * @returns Empty metrics object
   */
  private createEmptyMetrics(date: string): KvMetrics {
    return {
      date,
      ordersCreated: 0,
      ordersCompleted: 0,
      ordersFailed: 0,
      ordersCancelled: 0,
      totalVolume: 0n,
      avgProcessingTime: 0,
      avgGasUsed: 0n,
      successRate: 0,
    };
  }

  /**
   * Update operation summary statistics
   * @param operation The operation name
   * @param duration Duration in ms
   * @param success Whether successful
   */
  private async updateOperationSummary(
    operation: string,
    duration: number,
    success: boolean
  ): Promise<void> {
    const key = ["metrics", "operation_summary", operation];
    const existing = await this.kv.get<{
      totalCalls: number;
      successfulCalls: number;
      totalDuration: number;
      avgDuration: number;
      successRate: number;
      lastUpdated: number;
    }>(key);
    
    const current = existing.value || {
      totalCalls: 0,
      successfulCalls: 0,
      totalDuration: 0,
      avgDuration: 0,
      successRate: 0,
      lastUpdated: 0,
    };
    
    current.totalCalls++;
    if (success) current.successfulCalls++;
    current.totalDuration += duration;
    current.avgDuration = Math.round(current.totalDuration / current.totalCalls);
    current.successRate = Math.round((current.successfulCalls / current.totalCalls) * 100);
    current.lastUpdated = Date.now();
    
    await this.kv.set(key, current);
  }
}