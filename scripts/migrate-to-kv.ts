#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

/**
 * Migration script to move from file-based state to Deno KV
 * 
 * This script:
 * 1. Loads existing resolver-state.json and alice-state.json
 * 2. Transforms and migrates all orders to KV store
 * 3. Migrates secrets with proper TTL
 * 4. Handles existing metrics or statistics
 * 5. Provides progress tracking and error handling
 */

import { KvClient } from "../src/kv/client.ts";
import { KvOrderStore } from "../src/kv/stores/order-store.ts";
import { KvSecretStore } from "../src/kv/stores/secret-store.ts";
import { KvMetricsStore } from "../src/kv/stores/metrics-store.ts";
import { OrderStateManager } from "../src/resolver/state.ts";
import { AliceStateManager } from "../src/alice/state.ts";
import { OrderStatus } from "../src/types/index.ts";
import type { OrderState } from "../src/types/index.ts";

// Progress tracking
interface MigrationProgress {
  totalOrders: number;
  migratedOrders: number;
  totalSecrets: number;
  migratedSecrets: number;
  errors: Array<{ type: string; orderId: string; error: string }>;
  startTime: number;
}

const progress: MigrationProgress = {
  totalOrders: 0,
  migratedOrders: 0,
  totalSecrets: 0,
  migratedSecrets: 0,
  errors: [],
  startTime: Date.now(),
};

/**
 * Log progress with formatting
 */
function logProgress(message: string, level: "info" | "success" | "error" | "warn" = "info") {
  const colors = {
    info: "\x1b[36m",    // Cyan
    success: "\x1b[32m", // Green
    error: "\x1b[31m",   // Red
    warn: "\x1b[33m",    // Yellow
  };
  const reset = "\x1b[0m";
  console.log(`${colors[level]}[Migration]${reset} ${message}`);
}

/**
 * Print migration summary
 */
function printSummary() {
  const duration = (Date.now() - progress.startTime) / 1000;
  
  console.log("\n" + "=".repeat(60));
  logProgress("Migration Summary", "info");
  console.log("=".repeat(60));
  
  logProgress(`Total Orders: ${progress.totalOrders}`, "info");
  logProgress(`Successfully Migrated Orders: ${progress.migratedOrders}`, 
    progress.migratedOrders === progress.totalOrders ? "success" : "warn");
  
  logProgress(`Total Secrets: ${progress.totalSecrets}`, "info");
  logProgress(`Successfully Migrated Secrets: ${progress.migratedSecrets}`,
    progress.migratedSecrets === progress.totalSecrets ? "success" : "warn");
  
  if (progress.errors.length > 0) {
    logProgress(`Errors: ${progress.errors.length}`, "error");
    progress.errors.forEach(err => {
      console.log(`  - ${err.type} for order ${err.orderId}: ${err.error}`);
    });
  }
  
  logProgress(`Duration: ${duration.toFixed(2)}s`, "info");
  console.log("=".repeat(60) + "\n");
}

/**
 * Migrate a single order to KV
 */
async function migrateOrder(
  order: OrderState,
  orderStore: KvOrderStore,
  isAliceOrder: boolean = false
): Promise<boolean> {
  try {
    // Check if order already exists in KV
    const existing = await orderStore.getOrder(order.id);
    if (existing) {
      logProgress(`Order ${order.id} already exists in KV, skipping`, "warn");
      return true;
    }

    // Create order in KV
    await orderStore.createOrder(order);
    progress.migratedOrders++;
    
    logProgress(
      `Migrated ${isAliceOrder ? "Alice" : "Resolver"} order ${order.id} (${order.status})`,
      "success"
    );
    return true;
  } catch (error) {
    progress.errors.push({
      type: "order",
      orderId: order.id,
      error: error.message,
    });
    logProgress(`Failed to migrate order ${order.id}: ${error.message}`, "error");
    return false;
  }
}

/**
 * Migrate a secret to KV
 */
async function migrateSecret(
  orderId: string,
  secret: `0x${string}`,
  secretStore: KvSecretStore
): Promise<boolean> {
  try {
    // Check if secret already exists
    const existing = await secretStore.getSecret(orderId);
    if (existing) {
      logProgress(`Secret for order ${orderId} already exists in KV, skipping`, "warn");
      return true;
    }

    // Store secret with 24-hour TTL
    await secretStore.storeSecret(orderId, secret, 24 * 60 * 60 * 1000);
    progress.migratedSecrets++;
    
    logProgress(`Migrated secret for order ${orderId}`, "success");
    return true;
  } catch (error) {
    progress.errors.push({
      type: "secret",
      orderId,
      error: error.message,
    });
    logProgress(`Failed to migrate secret for ${orderId}: ${error.message}`, "error");
    return false;
  }
}

/**
 * Calculate and migrate metrics from existing orders
 */
async function migrateMetrics(
  orders: OrderState[],
  metricsStore: KvMetricsStore
): Promise<void> {
  try {
    // Group orders by date
    const ordersByDate = new Map<string, OrderState[]>();
    
    for (const order of orders) {
      const date = new Date(order.createdAt).toISOString().split('T')[0];
      if (!ordersByDate.has(date)) {
        ordersByDate.set(date, []);
      }
      ordersByDate.get(date)!.push(order);
    }
    
    // Calculate and store metrics for each date
    for (const [date, dateOrders] of ordersByDate) {
      const completed = dateOrders.filter(o => o.status === OrderStatus.Completed).length;
      const failed = dateOrders.filter(o => o.status === OrderStatus.Failed).length;
      const created = dateOrders.length;
      
      // Calculate total volume (sum of srcAmount for completed orders)
      const totalVolume = dateOrders
        .filter(o => o.status === OrderStatus.Completed)
        .reduce((sum, o) => sum + (o.params?.srcAmount || 0n), 0n);
      
      // Store metrics for each date
      for (let i = 0; i < created; i++) {
        await metricsStore.recordOrderMetric("created");
      }
      for (let i = 0; i < completed; i++) {
        await metricsStore.recordOrderMetric("completed", totalVolume / BigInt(completed || 1));
      }
      for (let i = 0; i < failed; i++) {
        await metricsStore.recordOrderMetric("failed");
      }
      
      logProgress(`Migrated metrics for ${date}: ${created} created, ${completed} completed, ${failed} failed`, "info");
    }
  } catch (error) {
    logProgress(`Failed to migrate metrics: ${error.message}`, "error");
  }
}

/**
 * Main migration function
 */
async function main() {
  const args = new Set(Deno.args);
  const dryRun = args.has("--dry-run");
  const kvPath = Deno.env.get("KV_PATH");
  
  logProgress("Starting migration from file-based state to Deno KV", "info");
  if (dryRun) {
    logProgress("DRY RUN MODE - No actual changes will be made", "warn");
  }
  if (kvPath) {
    logProgress(`Using KV path: ${kvPath}`, "info");
  }
  
  // Initialize KV
  const kvClient = new KvClient(kvPath);
  await kvClient.connect();
  const kv = kvClient.getDb();
  
  const orderStore = new KvOrderStore(kv);
  const secretStore = new KvSecretStore(kv);
  const metricsStore = new KvMetricsStore(kv);
  
  try {
    // Load resolver state
    logProgress("Loading resolver state...", "info");
    const resolverState = new OrderStateManager();
    const resolverLoaded = await resolverState.loadFromFile();
    
    if (resolverLoaded) {
      const resolverOrders = resolverState.getAllOrders();
      progress.totalOrders += resolverOrders.length;
      logProgress(`Found ${resolverOrders.length} resolver orders`, "info");
      
      if (!dryRun) {
        // Migrate resolver orders
        for (const order of resolverOrders) {
          await migrateOrder(order, orderStore, false);
        }
      }
    } else {
      logProgress("No resolver state file found", "warn");
    }
    
    // Load Alice state
    logProgress("\nLoading Alice state...", "info");
    const aliceState = new AliceStateManager();
    const aliceLoaded = await aliceState.loadFromFile();
    
    if (aliceLoaded) {
      const aliceOrders = aliceState.getAllOrders();
      progress.totalOrders += aliceOrders.length;
      logProgress(`Found ${aliceOrders.length} Alice orders`, "info");
      
      if (!dryRun) {
        // Migrate Alice orders and secrets
        for (const order of aliceOrders) {
          await migrateOrder(order, orderStore, true);
          
          // Migrate secret if exists
          const secret = aliceState.getSecret(order.id);
          if (secret) {
            progress.totalSecrets++;
            await migrateSecret(order.id, secret, secretStore);
          }
        }
      }
      
      // Count secrets in dry run
      if (dryRun) {
        for (const order of aliceOrders) {
          if (aliceState.getSecret(order.id)) {
            progress.totalSecrets++;
          }
        }
      }
    } else {
      logProgress("No Alice state file found", "warn");
    }
    
    // Migrate metrics
    if (!dryRun && progress.migratedOrders > 0) {
      logProgress("\nMigrating metrics...", "info");
      const allOrders = [
        ...(resolverLoaded ? resolverState.getAllOrders() : []),
        ...(aliceLoaded ? aliceState.getAllOrders() : []),
      ];
      await migrateMetrics(allOrders, metricsStore);
    }
    
  } catch (error) {
    logProgress(`Migration failed: ${error.message}`, "error");
    console.error(error);
  } finally {
    await kvClient.close();
  }
  
  // Print summary
  printSummary();
  
  // Exit with error code if there were failures
  if (progress.errors.length > 0 || 
      progress.migratedOrders < progress.totalOrders ||
      progress.migratedSecrets < progress.totalSecrets) {
    Deno.exit(1);
  }
}

// Run migration
if (import.meta.main) {
  main().catch(console.error);
}