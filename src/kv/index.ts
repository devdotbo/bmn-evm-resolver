/**
 * Deno KV module exports
 * Central export point for all KV-related functionality
 */

// Client exports
export { KvClient, kvClient } from "./client.ts";

// Store exports
export { 
  KvOrderStore,
  type KvOrderState,
  type KvEventRecord,
} from "./stores/order-store.ts";

export { 
  KvSecretStore,
  type KvSecret,
  type SecretRevealEvent,
} from "./stores/secret-store.ts";

export { 
  KvMetricsStore,
  type KvMetrics,
  type KvOperationMetric,
  type KvChainMetrics,
} from "./stores/metrics-store.ts";

// Lock exports
export { 
  KvDistributedLock,
  type KvLock,
  type LockOptions,
} from "./locks.ts";

// Import store classes for utility functions
import { KvOrderStore } from "./stores/order-store.ts";
import { KvSecretStore } from "./stores/secret-store.ts";
import { KvMetricsStore } from "./stores/metrics-store.ts";
import { KvDistributedLock } from "./locks.ts";

// Utility types
export interface KvStores {
  orders: KvOrderStore;
  secrets: KvSecretStore;
  metrics: KvMetricsStore;
}

/**
 * Initialize all KV stores with a single KV instance
 * @param kv The Deno KV instance
 * @returns Object containing all store instances
 */
export function initializeStores(kv: Deno.Kv): KvStores {
  return {
    orders: new KvOrderStore(kv),
    secrets: new KvSecretStore(kv),
    metrics: new KvMetricsStore(kv),
  };
}

/**
 * Create a distributed lock manager
 * @param kv The Deno KV instance
 * @param instanceId The instance identifier
 * @returns Distributed lock instance
 */
export function createLockManager(kv: Deno.Kv, instanceId: string): KvDistributedLock {
  return new KvDistributedLock(kv, instanceId);
}