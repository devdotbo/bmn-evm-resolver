#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net

/**
 * Parallel operation script to run both file-based and KV systems simultaneously
 * 
 * This script:
 * 1. Runs both file-based and KV systems in parallel
 * 2. Compares operations and logs discrepancies
 * 3. Collects performance comparison metrics
 * 4. Provides shadow mode for testing
 */

import { KvClient } from "../src/kv/client.ts";
import { KvOrderStore } from "../src/kv/stores/order-store.ts";
import { KvSecretStore } from "../src/kv/stores/secret-store.ts";
import { KvMetricsStore } from "../src/kv/stores/metrics-store.ts";
import { OrderStateManager } from "../src/resolver/state.ts";
import { AliceStateManager } from "../src/alice/state.ts";
import { OrderStatus } from "../src/types/index.ts";
import type { OrderState } from "../src/types/index.ts";

interface OperationMetrics {
  operation: string;
  fileTime: number;
  kvTime: number;
  speedup: number;
  success: boolean;
  discrepancy?: string;
}

interface ParallelOperationConfig {
  shadowMode: boolean;  // If true, KV operations don't affect actual state
  logDiscrepancies: boolean;
  collectMetrics: boolean;
  metricsInterval: number; // ms
}

class ParallelOperationManager {
  private metrics: OperationMetrics[] = [];
  private discrepancies: Array<{
    timestamp: number;
    operation: string;
    details: any;
  }> = [];
  
  constructor(
    private fileState: OrderStateManager,
    private kvOrderStore: KvOrderStore,
    private kvSecretStore: KvSecretStore,
    private kvMetricsStore: KvMetricsStore,
    private config: ParallelOperationConfig
  ) {}
  
  /**
   * Execute operation on both systems and compare
   */
  async executeParallel<T>(
    operation: string,
    fileOp: () => Promise<T>,
    kvOp: () => Promise<T>,
    compareResults?: (fileResult: T, kvResult: T) => boolean
  ): Promise<{ fileResult: T; kvResult: T; metrics: OperationMetrics }> {
    // Execute file operation
    const fileStart = performance.now();
    const fileResult = await fileOp();
    const fileTime = performance.now() - fileStart;
    
    // Execute KV operation
    const kvStart = performance.now();
    let kvResult: T;
    if (this.config.shadowMode) {
      // In shadow mode, simulate the operation without actual changes
      kvResult = fileResult; // Return same result to avoid errors
    } else {
      kvResult = await kvOp();
    }
    const kvTime = performance.now() - kvStart;
    
    // Calculate metrics
    const speedup = fileTime / kvTime;
    let success = true;
    let discrepancy: string | undefined;
    
    // Compare results if comparison function provided
    if (compareResults && !this.config.shadowMode) {
      success = compareResults(fileResult, kvResult);
      if (!success) {
        discrepancy = `Results differ for ${operation}`;
        this.logDiscrepancy(operation, { fileResult, kvResult });
      }
    }
    
    const metrics: OperationMetrics = {
      operation,
      fileTime,
      kvTime,
      speedup,
      success,
      discrepancy,
    };
    
    if (this.config.collectMetrics) {
      this.metrics.push(metrics);
    }
    
    return { fileResult, kvResult, metrics };
  }
  
  /**
   * Log discrepancy between systems
   */
  private logDiscrepancy(operation: string, details: any): void {
    const discrepancy = {
      timestamp: Date.now(),
      operation,
      details,
    };
    
    this.discrepancies.push(discrepancy);
    
    if (this.config.logDiscrepancies) {
      console.error(`[DISCREPANCY] ${operation}:`, details);
    }
  }
  
  /**
   * Create order in parallel
   */
  async createOrder(order: OrderState): Promise<void> {
    await this.executeParallel(
      "createOrder",
      async () => {
        this.fileState.addOrder(order);
        await this.fileState.saveToFile();
      },
      async () => {
        await this.kvOrderStore.createOrder(order);
      }
    );
  }
  
  /**
   * Update order status in parallel
   */
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<boolean> {
    const result = await this.executeParallel(
      "updateOrderStatus",
      async () => {
        const success = this.fileState.updateOrderStatus(orderId, status);
        if (success) {
          await this.fileState.saveToFile();
        }
        return success;
      },
      async () => {
        return await this.kvOrderStore.updateOrderStatus(orderId, status);
      },
      (fileResult, kvResult) => fileResult === kvResult
    );
    
    return result.fileResult;
  }
  
  /**
   * Get order by ID in parallel
   */
  async getOrder(orderId: string): Promise<OrderState | undefined> {
    const result = await this.executeParallel(
      "getOrder",
      async () => this.fileState.getOrder(orderId),
      async () => await this.kvOrderStore.getOrder(orderId),
      (fileOrder, kvOrder) => {
        if (!fileOrder && !kvOrder) return true;
        if (!fileOrder || !kvOrder) return false;
        return this.compareOrders(fileOrder, kvOrder);
      }
    );
    
    return result.fileResult;
  }
  
  /**
   * Get orders by status in parallel
   */
  async getOrdersByStatus(status: OrderStatus): Promise<OrderState[]> {
    const result = await this.executeParallel(
      "getOrdersByStatus",
      async () => this.fileState.getOrdersByStatus(status),
      async () => await this.kvOrderStore.getOrdersByStatus(status),
      (fileOrders, kvOrders) => {
        if (fileOrders.length !== kvOrders.length) return false;
        
        const fileIds = new Set(fileOrders.map(o => o.id));
        const kvIds = new Set(kvOrders.map(o => o.id));
        
        // Check if same order IDs
        for (const id of fileIds) {
          if (!kvIds.has(id)) return false;
        }
        
        return true;
      }
    );
    
    return result.fileResult;
  }
  
  /**
   * Compare two orders for equality
   */
  private compareOrders(order1: OrderState, order2: OrderState): boolean {
    // Basic field comparison
    if (order1.id !== order2.id) return false;
    if (order1.status !== order2.status) return false;
    if (order1.createdAt !== order2.createdAt) return false;
    if (order1.secretRevealed !== order2.secretRevealed) return false;
    
    // Compare params if they exist
    if (order1.params && order2.params) {
      if (order1.params.srcChainId !== order2.params.srcChainId) return false;
      if (order1.params.dstChainId !== order2.params.dstChainId) return false;
      if (order1.params.hashlock !== order2.params.hashlock) return false;
      // Add more param comparisons as needed
    }
    
    return true;
  }
  
  /**
   * Get performance metrics
   */
  getMetrics(): {
    summary: {
      totalOperations: number;
      avgFileTime: number;
      avgKvTime: number;
      avgSpeedup: number;
      successRate: number;
    };
    operations: OperationMetrics[];
    discrepancies: typeof this.discrepancies;
  } {
    const totalOps = this.metrics.length;
    const avgFileTime = this.metrics.reduce((sum, m) => sum + m.fileTime, 0) / totalOps || 0;
    const avgKvTime = this.metrics.reduce((sum, m) => sum + m.kvTime, 0) / totalOps || 0;
    const avgSpeedup = this.metrics.reduce((sum, m) => sum + m.speedup, 0) / totalOps || 0;
    const successCount = this.metrics.filter(m => m.success).length;
    const successRate = (successCount / totalOps) * 100 || 0;
    
    return {
      summary: {
        totalOperations: totalOps,
        avgFileTime,
        avgKvTime,
        avgSpeedup,
        successRate,
      },
      operations: this.metrics,
      discrepancies: this.discrepancies,
    };
  }
  
  /**
   * Print metrics report
   */
  printMetricsReport(): void {
    const metrics = this.getMetrics();
    
    console.log("\n" + "=".repeat(60));
    console.log("PARALLEL OPERATION METRICS");
    console.log("=".repeat(60));
    console.log(`Total Operations: ${metrics.summary.totalOperations}`);
    console.log(`Success Rate: ${metrics.summary.successRate.toFixed(2)}%`);
    console.log(`\nPerformance Comparison:`);
    console.log(`  Average File Time: ${metrics.summary.avgFileTime.toFixed(3)}ms`);
    console.log(`  Average KV Time: ${metrics.summary.avgKvTime.toFixed(3)}ms`);
    console.log(`  Average Speedup: ${metrics.summary.avgSpeedup.toFixed(2)}x`);
    
    if (metrics.discrepancies.length > 0) {
      console.log(`\nDiscrepancies Found: ${metrics.discrepancies.length}`);
      metrics.discrepancies.forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.operation} at ${new Date(d.timestamp).toISOString()}`);
      });
    }
    
    // Show top slowest operations
    const slowestOps = [...metrics.operations]
      .sort((a, b) => b.fileTime - a.fileTime)
      .slice(0, 5);
    
    if (slowestOps.length > 0) {
      console.log(`\nSlowest File Operations:`);
      slowestOps.forEach((op, i) => {
        console.log(`  ${i + 1}. ${op.operation}: ${op.fileTime.toFixed(3)}ms (KV: ${op.kvTime.toFixed(3)}ms, ${op.speedup.toFixed(2)}x faster)`);
      });
    }
    
    console.log("=".repeat(60) + "\n");
  }
}

/**
 * Run test workload
 */
async function runTestWorkload(manager: ParallelOperationManager): Promise<void> {
  console.log("Running test workload...\n");
  
  // Create test orders
  const testOrders: OrderState[] = [];
  for (let i = 0; i < 10; i++) {
    const order: OrderState = {
      id: `test-order-${Date.now()}-${i}`,
      status: OrderStatus.Created,
      createdAt: Date.now(),
      params: {
        srcChainId: 1337,
        dstChainId: 1338,
        srcToken: "0x0000000000000000000000000000000000000001" as `0x${string}`,
        dstToken: "0x0000000000000000000000000000000000000002" as `0x${string}`,
        srcAmount: BigInt(1000),
        dstAmount: BigInt(1000),
        srcReceiver: "0x0000000000000000000000000000000000000003" as `0x${string}`,
        dstReceiver: "0x0000000000000000000000000000000000000004" as `0x${string}`,
        hashlock: "0x" + "0".repeat(64) as `0x${string}`,
        safetyDeposit: BigInt(100),
      },
      immutables: {
        maker: "0x0000000000000000000000000000000000000005" as `0x${string}`,
        amount: BigInt(1000),
        safetyDeposit: BigInt(100),
        timelocks: {
          srcWithdrawal: BigInt(Date.now() / 1000 + 300),
          srcPublicWithdrawal: BigInt(Date.now() / 1000 + 600),
          srcCancellation: BigInt(Date.now() / 1000 + 900),
          dstWithdrawal: BigInt(Date.now() / 1000 + 300),
          dstPublicWithdrawal: BigInt(Date.now() / 1000 + 600),
          dstCancellation: BigInt(Date.now() / 1000 + 900),
        },
      },
      secretRevealed: false,
    };
    testOrders.push(order);
  }
  
  // Test create operations
  console.log("Testing create operations...");
  for (const order of testOrders) {
    await manager.createOrder(order);
  }
  
  // Test read operations
  console.log("Testing read operations...");
  for (const order of testOrders) {
    await manager.getOrder(order.id);
  }
  
  // Test status queries
  console.log("Testing status queries...");
  await manager.getOrdersByStatus(OrderStatus.Created);
  
  // Test updates
  console.log("Testing update operations...");
  for (let i = 0; i < 5; i++) {
    await manager.updateOrderStatus(testOrders[i].id, OrderStatus.SrcEscrowDeployed);
  }
  
  // Test mixed operations
  console.log("Testing mixed operations...");
  await manager.getOrdersByStatus(OrderStatus.SrcEscrowDeployed);
  await manager.getOrdersByStatus(OrderStatus.Created);
  
  for (let i = 5; i < 8; i++) {
    await manager.updateOrderStatus(testOrders[i].id, OrderStatus.DstEscrowDeployed);
  }
}

/**
 * Main function
 */
async function main() {
  const args = new Set(Deno.args);
  const shadowMode = args.has("--shadow");
  const testMode = args.has("--test");
  const kvPath = Deno.env.get("KV_PATH");
  
  console.log("Starting parallel operation mode...");
  console.log(`Shadow mode: ${shadowMode}`);
  console.log(`Test mode: ${testMode}`);
  if (kvPath) {
    console.log(`KV path: ${kvPath}`);
  }
  
  // Initialize systems
  const fileState = new OrderStateManager();
  await fileState.loadFromFile();
  
  const kvClient = new KvClient(kvPath);
  await kvClient.connect();
  const kv = kvClient.getDb();
  
  const kvOrderStore = new KvOrderStore(kv);
  const kvSecretStore = new KvSecretStore(kv);
  const kvMetricsStore = new KvMetricsStore(kv);
  
  const config: ParallelOperationConfig = {
    shadowMode,
    logDiscrepancies: true,
    collectMetrics: true,
    metricsInterval: 60000, // 1 minute
  };
  
  const manager = new ParallelOperationManager(
    fileState,
    kvOrderStore,
    kvSecretStore,
    kvMetricsStore,
    config
  );
  
  try {
    if (testMode) {
      // Run test workload
      await runTestWorkload(manager);
    } else {
      // Interactive mode
      console.log("\nParallel operation mode active. Operations will be executed on both systems.");
      console.log("Press Ctrl+C to exit and see metrics report.\n");
      
      // Set up periodic metrics reporting
      const metricsInterval = setInterval(() => {
        manager.printMetricsReport();
      }, config.metricsInterval);
      
      // Handle shutdown
      Deno.addSignalListener("SIGINT", () => {
        clearInterval(metricsInterval);
        manager.printMetricsReport();
        kvClient.close();
        Deno.exit(0);
      });
      
      // Keep process running
      await new Promise(() => {});
    }
  } finally {
    // Final report
    manager.printMetricsReport();
    
    // Save detailed metrics
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const metricsPath = `./parallel-metrics-${timestamp}.json`;
    await Deno.writeTextFile(
      metricsPath,
      JSON.stringify(manager.getMetrics(), null, 2)
    );
    console.log(`Detailed metrics saved to: ${metricsPath}`);
    
    await kvClient.close();
  }
}

// Run main
if (import.meta.main) {
  main();
}