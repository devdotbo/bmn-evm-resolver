/**
 * Global Test Setup and Utilities
 * 
 * This file provides common testing utilities, setup functions, and teardown handlers
 * for the BMN EVM Resolver test suite.
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
  assertThrows,
  assertInstanceOf,
  assertStringIncludes,
  assertArrayIncludes,
  assertObjectMatch,
} from "@std/assert";
import { spy, stub, returnsNext, assertSpyCall, assertSpyCalls } from "@std/testing/mock";
import { delay, deadline } from "@std/async";
import type { Address, Hex } from "viem";

// Re-export common assertions for convenience
export {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
  assertThrows,
  assertInstanceOf,
  assertStringIncludes,
  assertArrayIncludes,
  assertObjectMatch,
  spy,
  stub,
  returnsNext,
  assertSpyCall,
  assertSpyCalls,
  delay,
  deadline,
};

// Test environment configuration
export const TEST_ENV = {
  isCI: Deno.env.get("CI") === "true",
  isDevelopment: Deno.env.get("DENO_ENV") === "development",
  isDocker: Deno.env.get("DOCKER_ENV") === "true",
  logLevel: Deno.env.get("LOG_LEVEL") || "error",
  testTimeout: parseInt(Deno.env.get("TEST_TIMEOUT") || "30000"),
  mockNetwork: Deno.env.get("MOCK_NETWORK") !== "false",
};

// Common test addresses (Hardhat/Anvil defaults)
export const TEST_ADDRESSES = {
  // Hardhat test accounts
  ALICE: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
  BOB: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
  CHARLIE: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address,
  DAVE: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as Address,
  EVE: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as Address,
  
  // Contract addresses
  BMN_TOKEN: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
  USDC_TOKEN: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
  ESCROW_FACTORY: "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address,
  LIMIT_ORDER_PROTOCOL: "0x5FA31604fc5dCebfcaC2EC89AF03Ee0F24Bf8Ae8" as Address,
  
  // Special addresses
  ZERO: "0x0000000000000000000000000000000000000000" as Address,
  DEAD: "0x000000000000000000000000000000000000dEaD" as Address,
};

// Common test values
export const TEST_VALUES = {
  // Token amounts
  ONE_TOKEN: 1000000000000000000n, // 1e18
  TEN_TOKENS: 10000000000000000000n, // 10e18
  HUNDRED_TOKENS: 100000000000000000000n, // 100e18
  
  // Timeouts (in seconds)
  SHORT_TIMEOUT: 60, // 1 minute
  MEDIUM_TIMEOUT: 300, // 5 minutes
  LONG_TIMEOUT: 3600, // 1 hour
  
  // Hashlocks
  TEST_HASHLOCK: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hex,
  TEST_SECRET: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex,
  ZERO_HASHLOCK: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
  
  // Chain IDs
  CHAIN_A: 31337,
  CHAIN_B: 31338,
  MAINNET: 1,
  OPTIMISM: 10,
  ARBITRUM: 42161,
};

/**
 * Test context interface for managing test state
 */
export interface TestContext {
  name: string;
  startTime: number;
  endTime?: number;
  cleanup: (() => void | Promise<void>)[];
  data: Map<string, unknown>;
}

/**
 * Create a new test context
 */
export function createTestContext(name: string): TestContext {
  return {
    name,
    startTime: Date.now(),
    cleanup: [],
    data: new Map(),
  };
}

/**
 * Register a cleanup function to run after the test
 */
export function registerCleanup(ctx: TestContext, fn: () => void | Promise<void>): void {
  ctx.cleanup.push(fn);
}

/**
 * Execute all cleanup functions for a test context
 */
export async function runCleanup(ctx: TestContext): Promise<void> {
  ctx.endTime = Date.now();
  
  for (const cleanupFn of ctx.cleanup.reverse()) {
    try {
      await cleanupFn();
    } catch (error) {
      console.error(`Cleanup error in ${ctx.name}:`, error);
    }
  }
  
  ctx.cleanup = [];
}

/**
 * Test timing utilities
 */
export class TestTimer {
  private marks: Map<string, number> = new Map();
  
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }
  
  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark);
    if (!start) throw new Error(`Mark ${startMark} not found`);
    
    const end = endMark ? this.marks.get(endMark) : performance.now();
    if (!end && endMark) throw new Error(`Mark ${endMark} not found`);
    
    const duration = (end || performance.now()) - start;
    console.log(`⏱️  ${name}: ${duration.toFixed(2)}ms`);
    return duration;
  }
  
  async withTiming<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      console.log(`⏱️  ${name}: ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      console.log(`⏱️  ${name}: ${duration.toFixed(2)}ms (failed)`);
      throw error;
    }
  }
}

/**
 * Mock data generators
 */
export class TestDataGenerator {
  private counter = 0;
  
  nextId(): string {
    return `test-id-${++this.counter}`;
  }
  
  nextAddress(): Address {
    const hex = this.counter.toString(16).padStart(40, "0");
    this.counter++;
    return `0x${hex}` as Address;
  }
  
  nextHashlock(): Hex {
    const hex = this.counter.toString(16).padStart(64, "0");
    this.counter++;
    return `0x${hex}` as Hex;
  }
  
  nextOrderHash(): Hex {
    const hex = (this.counter + 1000000).toString(16).padStart(64, "0");
    this.counter++;
    return `0x${hex}` as Hex;
  }
  
  nextNonce(): bigint {
    return BigInt(++this.counter);
  }
  
  reset(): void {
    this.counter = 0;
  }
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100, message = "Condition not met" } = options;
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await delay(interval);
  }
  
  throw new Error(`Timeout waiting for condition: ${message}`);
}

/**
 * Create a mock event emitter for testing
 */
export class MockEventEmitter {
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
  private emittedEvents: Array<{ event: string; args: unknown[] }> = [];
  
  on(event: string, listener: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }
  
  off(event: string, listener: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }
  
  emit(event: string, ...args: unknown[]): void {
    this.emittedEvents.push({ event, args });
    this.listeners.get(event)?.forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }
  
  getEmittedEvents(event?: string): Array<{ event: string; args: unknown[] }> {
    if (event) {
      return this.emittedEvents.filter(e => e.event === event);
    }
    return [...this.emittedEvents];
  }
  
  clear(): void {
    this.listeners.clear();
    this.emittedEvents = [];
  }
}

/**
 * Mock KV store for testing
 */
export class MockKVStore {
  private store: Map<string, unknown> = new Map();
  
  private keyToString(key: string[]): string {
    return JSON.stringify(key);
  }
  
  async get<T>(key: string[]): Promise<{ value: T | null; versionstamp: string | null }> {
    const value = this.store.get(this.keyToString(key)) as T | undefined;
    return {
      value: value ?? null,
      versionstamp: value ? "mock-version-1" : null,
    };
  }
  
  async set(key: string[], value: unknown): Promise<{ versionstamp: string }> {
    this.store.set(this.keyToString(key), value);
    return { versionstamp: "mock-version-1" };
  }
  
  async delete(key: string[]): Promise<void> {
    this.store.delete(this.keyToString(key));
  }
  
  list<T>(selector: { prefix?: string[]; start?: string[]; end?: string[] }): AsyncIterableIterator<{ key: string[]; value: T; versionstamp: string }> {
    const results: Array<{ key: string[]; value: T; versionstamp: string }> = [];
    
    const prefixStr = selector.prefix ? this.keyToString(selector.prefix) : undefined;
    
    for (const [keyStr, value] of this.store.entries()) {
      if (prefixStr && !keyStr.startsWith(prefixStr)) continue;
      
      results.push({
        key: JSON.parse(keyStr),
        value: value as T,
        versionstamp: "mock-version-1",
      });
    }
    
    return (async function* () {
      for (const result of results) {
        yield result;
      }
    })();
  }
  
  clear(): void {
    this.store.clear();
  }
  
  size(): number {
    return this.store.size;
  }
}

/**
 * Test logger for capturing and asserting log output
 */
export class TestLogger {
  private logs: Array<{ level: string; message: string; data?: unknown }> = [];
  
  log(level: string, message: string, data?: unknown): void {
    this.logs.push({ level, message, data });
    if (TEST_ENV.logLevel !== "none") {
      console.log(`[${level}] ${message}`, data || "");
    }
  }
  
  debug(message: string, data?: unknown): void {
    this.log("DEBUG", message, data);
  }
  
  info(message: string, data?: unknown): void {
    this.log("INFO", message, data);
  }
  
  warn(message: string, data?: unknown): void {
    this.log("WARN", message, data);
  }
  
  error(message: string, data?: unknown): void {
    this.log("ERROR", message, data);
  }
  
  getLogs(level?: string): Array<{ level: string; message: string; data?: unknown }> {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }
  
  hasLog(message: string, level?: string): boolean {
    return this.logs.some(log => 
      log.message.includes(message) && 
      (!level || log.level === level)
    );
  }
  
  clear(): void {
    this.logs = [];
  }
}

/**
 * Performance benchmarking utilities
 */
export class Benchmark {
  private results: Map<string, number[]> = new Map();
  
  async run(name: string, fn: () => void | Promise<void>, iterations = 100): Promise<void> {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const duration = performance.now() - start;
      times.push(duration);
    }
    
    this.results.set(name, times);
    this.printStats(name);
  }
  
  private printStats(name: string): void {
    const times = this.results.get(name);
    if (!times || times.length === 0) return;
    
    const sorted = [...times].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];
    const average = times.reduce((sum, t) => sum + t, 0) / times.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    
    console.log(`\n📊 Benchmark: ${name}`);
    console.log(`   Iterations: ${times.length}`);
    console.log(`   Min: ${min.toFixed(3)}ms`);
    console.log(`   Max: ${max.toFixed(3)}ms`);
    console.log(`   Median: ${median.toFixed(3)}ms`);
    console.log(`   Average: ${average.toFixed(3)}ms`);
    console.log(`   P95: ${p95.toFixed(3)}ms`);
    console.log(`   P99: ${p99.toFixed(3)}ms`);
    console.log(`   Ops/sec: ${(1000 / average).toFixed(0)}`);
  }
  
  compare(name1: string, name2: string): void {
    const times1 = this.results.get(name1);
    const times2 = this.results.get(name2);
    
    if (!times1 || !times2) {
      console.error("Cannot compare: missing benchmark results");
      return;
    }
    
    const avg1 = times1.reduce((sum, t) => sum + t, 0) / times1.length;
    const avg2 = times2.reduce((sum, t) => sum + t, 0) / times2.length;
    
    const faster = avg1 < avg2 ? name1 : name2;
    const slower = avg1 < avg2 ? name2 : name1;
    const ratio = Math.max(avg1, avg2) / Math.min(avg1, avg2);
    
    console.log(`\n🔄 Comparison: ${name1} vs ${name2}`);
    console.log(`   ${faster} is ${ratio.toFixed(2)}x faster than ${slower}`);
    console.log(`   ${name1}: ${avg1.toFixed(3)}ms avg`);
    console.log(`   ${name2}: ${avg2.toFixed(3)}ms avg`);
  }
}

/**
 * Global test setup - runs once before all tests
 */
export async function globalSetup(): Promise<void> {
  console.log("🚀 Starting BMN EVM Resolver test suite");
  console.log(`   Environment: ${TEST_ENV.isCI ? "CI" : "Local"}`);
  console.log(`   Mock Network: ${TEST_ENV.mockNetwork ? "Yes" : "No"}`);
  console.log(`   Log Level: ${TEST_ENV.logLevel}`);
  
  // Set up any global test state
  if (TEST_ENV.mockNetwork) {
    console.log("   Using mock blockchain clients");
  }
}

/**
 * Global test teardown - runs once after all tests
 */
export async function globalTeardown(): Promise<void> {
  console.log("\n✅ BMN EVM Resolver test suite completed");
  
  // Clean up any global test resources
  // Close any open connections, clean temp files, etc.
}

// Run global setup if this is the main module
if (import.meta.main) {
  await globalSetup();
  
  // Register cleanup on exit
  globalThis.addEventListener("unload", () => {
    globalTeardown();
  });
}