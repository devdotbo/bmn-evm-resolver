#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

/**
 * Verification script to compare file-based state with KV state
 * 
 * This script:
 * 1. Compares file-based state with KV state
 * 2. Verifies order counts match
 * 3. Verifies all secrets migrated correctly
 * 4. Checks data integrity
 * 5. Generates migration report
 */

import { KvClient } from "../src/kv/client.ts";
import { KvOrderStore } from "../src/kv/stores/order-store.ts";
import { KvSecretStore } from "../src/kv/stores/secret-store.ts";
import { KvMetricsStore } from "../src/kv/stores/metrics-store.ts";
import { OrderStateManager } from "../src/resolver/state.ts";
import { AliceStateManager } from "../src/alice/state.ts";
import { OrderStatus } from "../src/types/index.ts";
import type { OrderState } from "../src/types/index.ts";

interface VerificationResult {
  success: boolean;
  fileOrders: number;
  kvOrders: number;
  fileSecrets: number;
  kvSecrets: number;
  missingInKv: string[];
  extraInKv: string[];
  dataIntegrityIssues: Array<{
    orderId: string;
    field: string;
    fileValue: any;
    kvValue: any;
  }>;
  secretMismatches: string[];
}

/**
 * Compare two order objects for data integrity
 */
function compareOrders(
  fileOrder: OrderState,
  kvOrder: OrderState
): Array<{ field: string; fileValue: any; kvValue: any }> {
  const issues: Array<{ field: string; fileValue: any; kvValue: any }> = [];
  
  // Compare basic fields
  const fieldsToCompare = [
    "id",
    "status",
    "createdAt",
    "secretRevealed",
    "srcEscrowAddress",
    "dstEscrowAddress",
    "actualDstEscrowAddress",
  ];
  
  for (const field of fieldsToCompare) {
    if ((fileOrder as any)[field] !== (kvOrder as any)[field]) {
      issues.push({
        field,
        fileValue: (fileOrder as any)[field],
        kvValue: (kvOrder as any)[field],
      });
    }
  }
  
  // Compare params
  if (fileOrder.params && kvOrder.params) {
    const paramFields = [
      "srcChainId",
      "dstChainId",
      "srcToken",
      "dstToken",
      "srcAmount",
      "dstAmount",
      "srcReceiver",
      "dstReceiver",
      "hashlock",
      "safetyDeposit",
    ];
    
    for (const field of paramFields) {
      const fileValue = (fileOrder.params as any)[field];
      const kvValue = (kvOrder.params as any)[field];
      
      // Special handling for BigInt comparison
      if (typeof fileValue === "bigint" || typeof kvValue === "bigint") {
        if (fileValue?.toString() !== kvValue?.toString()) {
          issues.push({
            field: `params.${field}`,
            fileValue: fileValue?.toString(),
            kvValue: kvValue?.toString(),
          });
        }
      } else if (fileValue !== kvValue) {
        issues.push({
          field: `params.${field}`,
          fileValue,
          kvValue,
        });
      }
    }
  }
  
  // Compare immutables if they exist
  if (fileOrder.immutables && kvOrder.immutables) {
    if (fileOrder.immutables.maker !== kvOrder.immutables.maker) {
      issues.push({
        field: "immutables.maker",
        fileValue: fileOrder.immutables.maker,
        kvValue: kvOrder.immutables.maker,
      });
    }
    
    if (fileOrder.immutables.amount?.toString() !== kvOrder.immutables.amount?.toString()) {
      issues.push({
        field: "immutables.amount",
        fileValue: fileOrder.immutables.amount?.toString(),
        kvValue: kvOrder.immutables.amount?.toString(),
      });
    }
  }
  
  return issues;
}

/**
 * Verify migration completeness and integrity
 */
async function verifyMigration(): Promise<VerificationResult> {
  const result: VerificationResult = {
    success: true,
    fileOrders: 0,
    kvOrders: 0,
    fileSecrets: 0,
    kvSecrets: 0,
    missingInKv: [],
    extraInKv: [],
    dataIntegrityIssues: [],
    secretMismatches: [],
  };
  
  const kvPath = Deno.env.get("KV_PATH");
  
  // Initialize KV
  const kvClient = new KvClient(kvPath);
  await kvClient.connect();
  const kv = kvClient.getDb();
  
  const orderStore = new KvOrderStore(kv);
  const secretStore = new KvSecretStore(kv);
  
  try {
    // Load file-based state
    const resolverState = new OrderStateManager();
    const aliceState = new AliceStateManager();
    
    await resolverState.loadFromFile();
    await aliceState.loadFromFile();
    
    // Get all orders from files
    const fileOrdersMap = new Map<string, OrderState>();
    const fileSecretsMap = new Map<string, `0x${string}`>();
    
    // Add resolver orders
    for (const order of resolverState.getAllOrders()) {
      fileOrdersMap.set(order.id, order);
      result.fileOrders++;
    }
    
    // Add Alice orders and secrets
    for (const order of aliceState.getAllOrders()) {
      fileOrdersMap.set(order.id, order);
      result.fileOrders++;
      
      const secret = aliceState.getSecret(order.id);
      if (secret) {
        fileSecretsMap.set(order.id, secret);
        result.fileSecrets++;
      }
    }
    
    // Get all orders from KV
    const kvOrdersMap = new Map<string, OrderState>();
    
    // Get orders by all statuses
    for (const status of Object.values(OrderStatus)) {
      const orders = await orderStore.getOrdersByStatus(status as OrderStatus);
      for (const order of orders) {
        kvOrdersMap.set(order.id, order);
        result.kvOrders++;
      }
    }
    
    // Check for missing orders in KV
    for (const [orderId, fileOrder] of fileOrdersMap) {
      const kvOrder = kvOrdersMap.get(orderId);
      if (!kvOrder) {
        result.missingInKv.push(orderId);
        result.success = false;
      } else {
        // Check data integrity
        const issues = compareOrders(fileOrder, kvOrder);
        for (const issue of issues) {
          result.dataIntegrityIssues.push({
            orderId,
            ...issue,
          });
          result.success = false;
        }
      }
    }
    
    // Check for extra orders in KV (not in files)
    for (const orderId of kvOrdersMap.keys()) {
      if (!fileOrdersMap.has(orderId)) {
        result.extraInKv.push(orderId);
      }
    }
    
    // Verify secrets
    for (const [orderId, fileSecret] of fileSecretsMap) {
      const kvSecret = await secretStore.getSecret(orderId);
      if (!kvSecret) {
        result.secretMismatches.push(orderId);
        result.success = false;
      } else if (kvSecret !== fileSecret) {
        result.secretMismatches.push(orderId);
        result.success = false;
      } else {
        result.kvSecrets++;
      }
    }
    
  } finally {
    await kvClient.close();
  }
  
  return result;
}

/**
 * Generate and save verification report
 */
async function generateReport(result: VerificationResult): Promise<void> {
  const timestamp = new Date().toISOString();
  const reportPath = `./migration-report-${timestamp.replace(/[:.]/g, "-")}.json`;
  
  const report = {
    timestamp,
    summary: {
      success: result.success,
      fileOrders: result.fileOrders,
      kvOrders: result.kvOrders,
      fileSecrets: result.fileSecrets,
      kvSecrets: result.kvSecrets,
      orderCountMatch: result.fileOrders === result.kvOrders,
      secretCountMatch: result.fileSecrets === result.kvSecrets,
      dataIntegrityOk: result.dataIntegrityIssues.length === 0,
    },
    issues: {
      missingInKv: result.missingInKv,
      extraInKv: result.extraInKv,
      dataIntegrityIssues: result.dataIntegrityIssues,
      secretMismatches: result.secretMismatches,
    },
  };
  
  await Deno.writeTextFile(reportPath, JSON.stringify(report, null, 2));
  
  console.log("\n" + "=".repeat(60));
  console.log("MIGRATION VERIFICATION REPORT");
  console.log("=".repeat(60));
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Report saved to: ${reportPath}`);
  console.log("\nSUMMARY:");
  console.log(`  Success: ${result.success ? "✅ YES" : "❌ NO"}`);
  console.log(`  File Orders: ${result.fileOrders}`);
  console.log(`  KV Orders: ${result.kvOrders} ${result.fileOrders === result.kvOrders ? "✅" : "❌"}`);
  console.log(`  File Secrets: ${result.fileSecrets}`);
  console.log(`  KV Secrets: ${result.kvSecrets} ${result.fileSecrets === result.kvSecrets ? "✅" : "❌"}`);
  
  if (!result.success) {
    console.log("\nISSUES FOUND:");
    
    if (result.missingInKv.length > 0) {
      console.log(`\n  Missing in KV (${result.missingInKv.length}):`);
      result.missingInKv.forEach(id => console.log(`    - ${id}`));
    }
    
    if (result.extraInKv.length > 0) {
      console.log(`\n  Extra in KV (${result.extraInKv.length}):`);
      result.extraInKv.forEach(id => console.log(`    - ${id}`));
    }
    
    if (result.dataIntegrityIssues.length > 0) {
      console.log(`\n  Data Integrity Issues (${result.dataIntegrityIssues.length}):`);
      result.dataIntegrityIssues.forEach(issue => {
        console.log(`    - Order ${issue.orderId}, field ${issue.field}:`);
        console.log(`      File: ${issue.fileValue}`);
        console.log(`      KV:   ${issue.kvValue}`);
      });
    }
    
    if (result.secretMismatches.length > 0) {
      console.log(`\n  Secret Mismatches (${result.secretMismatches.length}):`);
      result.secretMismatches.forEach(id => console.log(`    - ${id}`));
    }
  }
  
  console.log("\n" + "=".repeat(60) + "\n");
}

/**
 * Main function
 */
async function main() {
  console.log("Starting migration verification...\n");
  
  try {
    const result = await verifyMigration();
    await generateReport(result);
    
    // Exit with error code if verification failed
    if (!result.success) {
      Deno.exit(1);
    }
  } catch (error) {
    console.error("Verification failed:", error);
    Deno.exit(1);
  }
}

// Run verification
if (import.meta.main) {
  main();
}