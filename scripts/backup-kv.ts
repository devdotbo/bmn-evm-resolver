#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

/**
 * Backup and restore script for Deno KV data
 * 
 * This script:
 * 1. Exports all KV data to JSON files
 * 2. Includes timestamp in backup filenames
 * 3. Organizes by data type (orders, secrets, metrics)
 * 4. Implements restore functionality
 */

import { KvClient } from "../src/kv/client.ts";
import { OrderStatus } from "../src/types/index.ts";
import type { OrderState } from "../src/types/index.ts";

interface BackupMetadata {
  version: string;
  timestamp: string;
  kvPath?: string;
  counts: {
    orders: number;
    secrets: number;
    metrics: number;
    locks: number;
    events: number;
  };
}

interface BackupData {
  metadata: BackupMetadata;
  orders: Array<{ key: string[]; value: any }>;
  secrets: Array<{ key: string[]; value: any; expireAt?: number }>;
  metrics: Array<{ key: string[]; value: any }>;
  locks: Array<{ key: string[]; value: any }>;
  events: Array<{ key: string[]; value: any; expireAt?: number }>;
}

/**
 * Create backup directory if it doesn't exist
 */
async function ensureBackupDir(): Promise<string> {
  const backupDir = "./backups";
  try {
    await Deno.mkdir(backupDir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
  return backupDir;
}

/**
 * Export KV data to backup
 */
async function exportData(kv: Deno.Kv): Promise<BackupData> {
  const backup: BackupData = {
    metadata: {
      version: "1.0",
      timestamp: new Date().toISOString(),
      kvPath: Deno.env.get("KV_PATH"),
      counts: {
        orders: 0,
        secrets: 0,
        metrics: 0,
        locks: 0,
        events: 0,
      },
    },
    orders: [],
    secrets: [],
    metrics: [],
    locks: [],
    events: [],
  };
  
  console.log("Exporting KV data...");
  
  // Export all entries
  const entries = kv.list({ prefix: [] });
  
  for await (const entry of entries) {
    const [prefix] = entry.key;
    
    switch (prefix) {
      case "orders":
      case "orders_by_status":
      case "orders_by_chain":
        backup.orders.push({
          key: entry.key as string[],
          value: entry.value,
        });
        if (prefix === "orders") {
          backup.metadata.counts.orders++;
        }
        break;
        
      case "secrets":
        // Get expiration time if available
        const secretEntry = {
          key: entry.key as string[],
          value: entry.value,
          expireAt: (entry.value as any)?.expiresAt,
        };
        backup.secrets.push(secretEntry);
        backup.metadata.counts.secrets++;
        break;
        
      case "metrics":
        backup.metrics.push({
          key: entry.key as string[],
          value: entry.value,
        });
        backup.metadata.counts.metrics++;
        break;
        
      case "locks":
        backup.locks.push({
          key: entry.key as string[],
          value: entry.value,
        });
        backup.metadata.counts.locks++;
        break;
        
      case "events":
        const eventEntry = {
          key: entry.key as string[],
          value: entry.value,
          expireAt: (entry.value as any)?.timestamp ? 
            (entry.value as any).timestamp + 7 * 24 * 60 * 60 * 1000 : undefined,
        };
        backup.events.push(eventEntry);
        backup.metadata.counts.events++;
        break;
        
      default:
        console.warn(`Unknown key prefix: ${prefix}`);
    }
  }
  
  return backup;
}

/**
 * Save backup to files
 */
async function saveBackup(backup: BackupData): Promise<string> {
  const backupDir = await ensureBackupDir();
  const timestamp = backup.metadata.timestamp.replace(/[:.]/g, "-");
  const backupPath = `${backupDir}/kv-backup-${timestamp}`;
  
  // Create backup directory
  await Deno.mkdir(backupPath, { recursive: true });
  
  // Save metadata
  await Deno.writeTextFile(
    `${backupPath}/metadata.json`,
    JSON.stringify(backup.metadata, null, 2)
  );
  
  // Save orders
  if (backup.orders.length > 0) {
    await Deno.writeTextFile(
      `${backupPath}/orders.json`,
      JSON.stringify(backup.orders, null, 2)
    );
  }
  
  // Save secrets
  if (backup.secrets.length > 0) {
    await Deno.writeTextFile(
      `${backupPath}/secrets.json`,
      JSON.stringify(backup.secrets, null, 2)
    );
  }
  
  // Save metrics
  if (backup.metrics.length > 0) {
    await Deno.writeTextFile(
      `${backupPath}/metrics.json`,
      JSON.stringify(backup.metrics, null, 2)
    );
  }
  
  // Save locks
  if (backup.locks.length > 0) {
    await Deno.writeTextFile(
      `${backupPath}/locks.json`,
      JSON.stringify(backup.locks, null, 2)
    );
  }
  
  // Save events
  if (backup.events.length > 0) {
    await Deno.writeTextFile(
      `${backupPath}/events.json`,
      JSON.stringify(backup.events, null, 2)
    );
  }
  
  // Save complete backup as single file for convenience
  await Deno.writeTextFile(
    `${backupPath}/complete-backup.json`,
    JSON.stringify(backup, null, 2)
  );
  
  return backupPath;
}

/**
 * Load backup from files
 */
async function loadBackup(backupPath: string): Promise<BackupData> {
  // Try to load complete backup first
  try {
    const completeBackup = await Deno.readTextFile(`${backupPath}/complete-backup.json`);
    return JSON.parse(completeBackup);
  } catch {
    // Fall back to loading individual files
    const backup: BackupData = {
      metadata: JSON.parse(await Deno.readTextFile(`${backupPath}/metadata.json`)),
      orders: [],
      secrets: [],
      metrics: [],
      locks: [],
      events: [],
    };
    
    // Load each data type
    const files = [
      { name: "orders", target: backup.orders },
      { name: "secrets", target: backup.secrets },
      { name: "metrics", target: backup.metrics },
      { name: "locks", target: backup.locks },
      { name: "events", target: backup.events },
    ];
    
    for (const { name, target } of files) {
      try {
        const data = JSON.parse(await Deno.readTextFile(`${backupPath}/${name}.json`));
        target.push(...data);
      } catch {
        // File might not exist if no data of this type
      }
    }
    
    return backup;
  }
}

/**
 * Restore data to KV
 */
async function restoreData(kv: Deno.Kv, backup: BackupData, clearFirst: boolean = false): Promise<void> {
  console.log("Restoring KV data...");
  
  if (clearFirst) {
    console.log("Clearing existing KV data...");
    // Clear all existing data
    const entries = kv.list({ prefix: [] });
    const keysToDelete: Deno.KvKey[] = [];
    
    for await (const entry of entries) {
      keysToDelete.push(entry.key);
    }
    
    // Delete in batches
    const batchSize = 10;
    for (let i = 0; i < keysToDelete.length; i += batchSize) {
      const batch = keysToDelete.slice(i, i + batchSize);
      const atomic = kv.atomic();
      for (const key of batch) {
        atomic.delete(key);
      }
      await atomic.commit();
    }
  }
  
  // Restore orders
  console.log(`Restoring ${backup.orders.length} order entries...`);
  for (const { key, value } of backup.orders) {
    await kv.set(key, value);
  }
  
  // Restore secrets with TTL
  console.log(`Restoring ${backup.secrets.length} secrets...`);
  for (const { key, value, expireAt } of backup.secrets) {
    if (expireAt && expireAt > Date.now()) {
      await kv.set(key, value, { expireIn: expireAt - Date.now() });
    } else if (!expireAt) {
      await kv.set(key, value);
    }
    // Skip expired secrets
  }
  
  // Restore metrics
  console.log(`Restoring ${backup.metrics.length} metrics...`);
  for (const { key, value } of backup.metrics) {
    await kv.set(key, value);
  }
  
  // Restore locks (skip expired ones)
  console.log(`Restoring ${backup.locks.length} locks...`);
  const now = Date.now();
  for (const { key, value } of backup.locks) {
    if (value.expiresAt > now) {
      await kv.set(key, value);
    }
  }
  
  // Restore events with TTL
  console.log(`Restoring ${backup.events.length} events...`);
  for (const { key, value, expireAt } of backup.events) {
    if (expireAt && expireAt > Date.now()) {
      await kv.set(key, value, { expireIn: expireAt - Date.now() });
    } else if (!expireAt) {
      await kv.set(key, value);
    }
  }
}

/**
 * List available backups
 */
async function listBackups(): Promise<string[]> {
  const backupDir = await ensureBackupDir();
  const backups: string[] = [];
  
  for await (const entry of Deno.readDir(backupDir)) {
    if (entry.isDirectory && entry.name.startsWith("kv-backup-")) {
      backups.push(entry.name);
    }
  }
  
  return backups.sort().reverse(); // Most recent first
}

/**
 * Main function
 */
async function main() {
  const command = Deno.args[0];
  const kvPath = Deno.env.get("KV_PATH");
  
  if (!command || !["backup", "restore", "list"].includes(command)) {
    console.log("Usage:");
    console.log("  backup-kv.ts backup                     # Create a new backup");
    console.log("  backup-kv.ts restore <backup-name>      # Restore from backup");
    console.log("  backup-kv.ts restore <backup-name> --clear  # Clear KV before restore");
    console.log("  backup-kv.ts list                       # List available backups");
    Deno.exit(1);
  }
  
  if (command === "list") {
    const backups = await listBackups();
    console.log("Available backups:");
    if (backups.length === 0) {
      console.log("  No backups found");
    } else {
      backups.forEach(b => console.log(`  - ${b}`));
    }
    return;
  }
  
  // Initialize KV
  const kvClient = new KvClient(kvPath);
  await kvClient.connect();
  const kv = kvClient.getDb();
  
  try {
    if (command === "backup") {
      // Create backup
      const backup = await exportData(kv);
      const backupPath = await saveBackup(backup);
      
      console.log("\n" + "=".repeat(60));
      console.log("BACKUP COMPLETED");
      console.log("=".repeat(60));
      console.log(`Backup saved to: ${backupPath}`);
      console.log(`Timestamp: ${backup.metadata.timestamp}`);
      console.log("\nData backed up:");
      console.log(`  Orders: ${backup.metadata.counts.orders}`);
      console.log(`  Secrets: ${backup.metadata.counts.secrets}`);
      console.log(`  Metrics: ${backup.metadata.counts.metrics}`);
      console.log(`  Locks: ${backup.metadata.counts.locks}`);
      console.log(`  Events: ${backup.metadata.counts.events}`);
      console.log("=".repeat(60) + "\n");
      
    } else if (command === "restore") {
      const backupName = Deno.args[1];
      if (!backupName) {
        console.error("Please specify backup name to restore");
        Deno.exit(1);
      }
      
      const clearFirst = Deno.args.includes("--clear");
      const backupPath = `./backups/${backupName}`;
      
      // Load backup
      const backup = await loadBackup(backupPath);
      
      console.log("\n" + "=".repeat(60));
      console.log("RESTORE BACKUP");
      console.log("=".repeat(60));
      console.log(`Backup: ${backupName}`);
      console.log(`Created: ${backup.metadata.timestamp}`);
      console.log(`Clear first: ${clearFirst}`);
      console.log("\nData to restore:");
      console.log(`  Orders: ${backup.metadata.counts.orders}`);
      console.log(`  Secrets: ${backup.metadata.counts.secrets}`);
      console.log(`  Metrics: ${backup.metadata.counts.metrics}`);
      console.log(`  Locks: ${backup.metadata.counts.locks}`);
      console.log(`  Events: ${backup.metadata.counts.events}`);
      console.log("=".repeat(60));
      
      // Confirm restore
      console.log("\nProceed with restore? (y/n)");
      const confirmation = prompt("> ");
      
      if (confirmation?.toLowerCase() === "y") {
        await restoreData(kv, backup, clearFirst);
        console.log("\nRestore completed successfully!");
      } else {
        console.log("Restore cancelled.");
      }
    }
    
  } catch (error) {
    console.error("Operation failed:", error);
    Deno.exit(1);
  } finally {
    await kvClient.close();
  }
}

// Run main
if (import.meta.main) {
  main();
}