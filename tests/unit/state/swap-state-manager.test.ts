/**
 * Unit tests for SwapStateManager
 * 
 * Tests the complete lifecycle and state management of atomic swaps
 */

import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";
import {
  assertEquals,
  assertExists,
  assert,
  assertRejects,
  MockKVStore,
  TEST_ADDRESSES,
  TEST_VALUES,
  TestDataGenerator,
  delay,
} from "../../setup.ts";
import { SwapStateManager, SwapStatus, type SwapState } from "../../../src/state/swap-state-manager.ts";
import type { Address, Hex } from "viem";

// Enhanced MockKVStore for this test - properly handles array keys
class EnhancedMockKVStore {
  private store: Map<string, unknown> = new Map();
  
  private keyToString(key: string[]): string {
    return JSON.stringify(key);
  }
  
  private stringToKey(str: string): string[] {
    return JSON.parse(str);
  }
  
  async get<T>(key: string[]): Promise<{ value: T | null; versionstamp: string | null }> {
    const keyStr = this.keyToString(key);
    const value = this.store.get(keyStr) as T | undefined;
    return {
      value: value ?? null,
      versionstamp: value ? "mock-version-1" : null,
    };
  }
  
  async set(key: string[], value: unknown): Promise<{ versionstamp: string }> {
    const keyStr = this.keyToString(key);
    this.store.set(keyStr, value);
    return { versionstamp: "mock-version-1" };
  }
  
  async delete(key: string[]): Promise<void> {
    const keyStr = this.keyToString(key);
    this.store.delete(keyStr);
  }
  
  list<T>(selector: { prefix?: string[]; start?: string[]; end?: string[] }): AsyncIterableIterator<{ key: string[]; value: T; versionstamp: string }> {
    const results: Array<{ key: string[]; value: T; versionstamp: string }> = [];
    
    for (const [keyStr, value] of this.store.entries()) {
      const key = this.stringToKey(keyStr);
      
      // Simple prefix matching based on first element
      if (selector.prefix && selector.prefix.length > 0) {
        if (!key[0] || key[0] !== selector.prefix[0]) continue;
      }
      
      results.push({
        key,
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
  
  close(): void {
    // Mock close method
  }
}

describe("SwapStateManager", () => {
  let manager: SwapStateManager;
  let mockKv: EnhancedMockKVStore;
  let dataGen: TestDataGenerator;
  
  beforeEach(async () => {
    // Create mock KV store
    mockKv = new EnhancedMockKVStore();
    dataGen = new TestDataGenerator();
    
    // Create manager with mocked KV
    manager = new SwapStateManager(":memory:");
    
    // Stub the Deno.openKv to return our mock
    const originalOpenKv = Deno.openKv;
    Deno.openKv = async () => mockKv as any;
    
    await manager.init();
    
    // Restore original after init
    Deno.openKv = originalOpenKv;
    
    // Replace the internal kv with our mock
    (manager as any).kv = mockKv;
  });
  
  afterEach(async () => {
    await manager.close();
    mockKv.clear();
    dataGen.reset();
  });
  
  describe("Initialization", () => {
    it("should initialize KV store successfully", async () => {
      const newManager = new SwapStateManager(":memory:");
      
      // Mock Deno.openKv for this test
      const originalOpenKv = Deno.openKv;
      let kvOpened = false;
      Deno.openKv = async (path?: string) => {
        assertEquals(path, ":memory:");
        kvOpened = true;
        return mockKv as any;
      };
      
      await newManager.init();
      assert(kvOpened, "KV store should be opened");
      
      Deno.openKv = originalOpenKv;
    });
    
    it("should use default KV path when not specified", () => {
      const defaultManager = new SwapStateManager();
      assertEquals((defaultManager as any).kvPath, "./data/kv/swaps.db");
    });
  });
  
  describe("trackSwap", () => {
    it("should track a new swap with initial state", async () => {
      const orderHash = dataGen.nextOrderHash();
      const hashlock = dataGen.nextHashlock();
      
      const initialState: Partial<SwapState> = {
        hashlock,
        alice: TEST_ADDRESSES.ALICE,
        bob: TEST_ADDRESSES.BOB,
        srcChainId: TEST_VALUES.CHAIN_A,
        srcToken: TEST_ADDRESSES.BMN_TOKEN,
        srcAmount: TEST_VALUES.TEN_TOKENS,
        dstChainId: TEST_VALUES.CHAIN_B,
        dstToken: TEST_ADDRESSES.USDC_TOKEN,
        dstAmount: TEST_VALUES.ONE_TOKEN,
      };
      
      await manager.trackSwap(orderHash, initialState);
      
      const swap = await manager.getSwap(orderHash);
      assertExists(swap);
      assertEquals(swap.orderHash, orderHash);
      assertEquals(swap.hashlock, hashlock);
      assertEquals(swap.status, SwapStatus.CREATED);
      assertEquals(swap.alice, TEST_ADDRESSES.ALICE);
      assertEquals(swap.bob, TEST_ADDRESSES.BOB);
      assertEquals(swap.srcChainId, TEST_VALUES.CHAIN_A);
      assertEquals(swap.srcAmount, TEST_VALUES.TEN_TOKENS);
      assertEquals(swap.retryCount, 0);
      assertExists(swap.createdAt);
      assertExists(swap.lastUpdateAt);
    });
    
    it("should handle missing optional fields with defaults", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {});
      
      const swap = await manager.getSwap(orderHash);
      assertExists(swap);
      assertEquals(swap.orderHash, orderHash);
      assertEquals(swap.hashlock, "0x" as Hex);
      assertEquals(swap.alice, "0x" as Address);
      assertEquals(swap.bob, "0x" as Address);
      assertEquals(swap.srcChainId, 0);
      assertEquals(swap.srcAmount, 0n);
      assertEquals(swap.retryCount, 0);
    });
    
    it("should preserve metadata when provided", async () => {
      const orderHash = dataGen.nextOrderHash();
      const metadata = { customField: "value", priority: 1 };
      
      await manager.trackSwap(orderHash, { metadata });
      
      const swap = await manager.getSwap(orderHash);
      assertExists(swap);
      assertEquals(swap.metadata, metadata);
    });
  });
  
  describe("updateSwapStatus", () => {
    it("should update swap status successfully", async () => {
      const orderHash = dataGen.nextOrderHash();
      await manager.trackSwap(orderHash, {
        alice: TEST_ADDRESSES.ALICE,
        bob: TEST_ADDRESSES.BOB,
      });
      
      // Add a small delay to ensure timestamps are different
      await delay(1);
      
      await manager.updateSwapStatus(orderHash, SwapStatus.ORDER_FILLED);
      
      const swap = await manager.getSwap(orderHash);
      assertExists(swap);
      assertEquals(swap.status, SwapStatus.ORDER_FILLED);
      assert(swap.lastUpdateAt >= swap.createdAt);
    });
    
    it("should update status with additional data", async () => {
      const orderHash = dataGen.nextOrderHash();
      await manager.trackSwap(orderHash, {});
      
      const srcEscrow = dataGen.nextAddress();
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.SOURCE_ESCROW_CREATED,
        {
          srcEscrow,
          srcEscrowCreatedAt: Date.now(),
        }
      );
      
      const swap = await manager.getSwap(orderHash);
      assertExists(swap);
      assertEquals(swap.status, SwapStatus.SOURCE_ESCROW_CREATED);
      assertEquals(swap.srcEscrow, srcEscrow);
      assertExists(swap.srcEscrowCreatedAt);
    });
    
    it("should handle non-existent swap gracefully", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      // Should not throw, just log error
      await manager.updateSwapStatus(orderHash, SwapStatus.ORDER_FILLED);
      
      const swap = await manager.getSwap(orderHash);
      assertEquals(swap, null);
    });
    
    it("should automatically mark as completed when both sides withdrawn", async () => {
      const orderHash = dataGen.nextOrderHash();
      await manager.trackSwap(orderHash, {});
      
      // First mark source as withdrawn
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.SOURCE_WITHDRAWN,
        { srcWithdrawnAt: Date.now() }
      );
      
      let swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.SOURCE_WITHDRAWN);
      
      // Then mark destination as withdrawn - should auto-complete
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.DEST_WITHDRAWN,
        { dstWithdrawnAt: Date.now() }
      );
      
      swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.COMPLETED);
      assertExists(swap?.completedAt);
    });
    
    it("should auto-complete when destination withdrawn first", async () => {
      const orderHash = dataGen.nextOrderHash();
      await manager.trackSwap(orderHash, {});
      
      // Set source withdrawn timestamp first
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.SECRET_REVEALED,
        { srcWithdrawnAt: Date.now() }
      );
      
      // Mark destination as withdrawn - should auto-complete
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.DEST_WITHDRAWN,
        { dstWithdrawnAt: Date.now() }
      );
      
      const swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.COMPLETED);
      assertExists(swap?.completedAt);
    });
  });
  
  describe("getSwap", () => {
    it("should retrieve existing swap", async () => {
      const orderHash = dataGen.nextOrderHash();
      const initialState = {
        alice: TEST_ADDRESSES.ALICE,
        bob: TEST_ADDRESSES.BOB,
      };
      
      await manager.trackSwap(orderHash, initialState);
      
      const swap = await manager.getSwap(orderHash);
      assertExists(swap);
      assertEquals(swap.orderHash, orderHash);
      assertEquals(swap.alice, TEST_ADDRESSES.ALICE);
    });
    
    it("should return null for non-existent swap", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      const swap = await manager.getSwap(orderHash);
      assertEquals(swap, null);
    });
  });
  
  describe("getSwapByHashlock", () => {
    it("should find swap by hashlock", async () => {
      const orderHash = dataGen.nextOrderHash();
      const hashlock = dataGen.nextHashlock();
      
      await manager.trackSwap(orderHash, { hashlock });
      
      const swap = await manager.getSwapByHashlock(hashlock);
      assertExists(swap);
      assertEquals(swap.orderHash, orderHash);
      assertEquals(swap.hashlock, hashlock);
    });
    
    it("should return null when hashlock not found", async () => {
      const hashlock = dataGen.nextHashlock();
      
      const swap = await manager.getSwapByHashlock(hashlock);
      assertEquals(swap, null);
    });
    
    it("should find correct swap among multiple swaps", async () => {
      // Create multiple swaps
      const orderHash1 = dataGen.nextOrderHash();
      const orderHash2 = dataGen.nextOrderHash();
      const orderHash3 = dataGen.nextOrderHash();
      const hashlock1 = dataGen.nextHashlock();
      const hashlock2 = dataGen.nextHashlock();
      const hashlock3 = dataGen.nextHashlock();
      
      await manager.trackSwap(orderHash1, { hashlock: hashlock1 });
      await manager.trackSwap(orderHash2, { hashlock: hashlock2 });
      await manager.trackSwap(orderHash3, { hashlock: hashlock3 });
      
      const swap = await manager.getSwapByHashlock(hashlock2);
      assertExists(swap);
      assertEquals(swap.orderHash, orderHash2);
      assertEquals(swap.hashlock, hashlock2);
    });
  });
  
  describe("getPendingSwaps", () => {
    it("should return only pending swaps", async () => {
      // Create swaps with different statuses
      const pending1 = dataGen.nextOrderHash();
      const pending2 = dataGen.nextOrderHash();
      const completed = dataGen.nextOrderHash();
      const failed = dataGen.nextOrderHash();
      const expired = dataGen.nextOrderHash();
      
      await manager.trackSwap(pending1, {});
      await manager.trackSwap(pending2, {});
      await manager.trackSwap(completed, {});
      await manager.trackSwap(failed, {});
      await manager.trackSwap(expired, {});
      
      await manager.updateSwapStatus(pending2, SwapStatus.ALICE_DEPOSITED);
      await manager.updateSwapStatus(completed, SwapStatus.COMPLETED);
      await manager.updateSwapStatus(failed, SwapStatus.FAILED);
      await manager.updateSwapStatus(expired, SwapStatus.EXPIRED);
      
      const pendingSwaps = await manager.getPendingSwaps();
      assertEquals(pendingSwaps.length, 2);
      
      const orderHashes = pendingSwaps.map(s => s.orderHash);
      assert(orderHashes.includes(pending1));
      assert(orderHashes.includes(pending2));
    });
    
    it("should return empty array when no pending swaps", async () => {
      const orderHash = dataGen.nextOrderHash();
      await manager.trackSwap(orderHash, {});
      await manager.updateSwapStatus(orderHash, SwapStatus.COMPLETED);
      
      const pendingSwaps = await manager.getPendingSwaps();
      assertEquals(pendingSwaps.length, 0);
    });
  });
  
  describe("getSwapsByStatus", () => {
    it("should return swaps with specific status", async () => {
      const order1 = dataGen.nextOrderHash();
      const order2 = dataGen.nextOrderHash();
      const order3 = dataGen.nextOrderHash();
      
      await manager.trackSwap(order1, {});
      await manager.trackSwap(order2, {});
      await manager.trackSwap(order3, {});
      
      await manager.updateSwapStatus(order1, SwapStatus.ALICE_DEPOSITED);
      await manager.updateSwapStatus(order2, SwapStatus.ALICE_DEPOSITED);
      await manager.updateSwapStatus(order3, SwapStatus.BOB_DEPOSITED);
      
      const aliceDeposited = await manager.getSwapsByStatus(SwapStatus.ALICE_DEPOSITED);
      assertEquals(aliceDeposited.length, 2);
      
      const bobDeposited = await manager.getSwapsByStatus(SwapStatus.BOB_DEPOSITED);
      assertEquals(bobDeposited.length, 1);
      assertEquals(bobDeposited[0].orderHash, order3);
    });
    
    it("should return empty array for status with no swaps", async () => {
      const swaps = await manager.getSwapsByStatus(SwapStatus.SECRET_REVEALED);
      assertEquals(swaps.length, 0);
    });
  });
  
  describe("getSwapsAwaitingDestEscrow", () => {
    it("should return swaps needing destination escrow creation", async () => {
      const order1 = dataGen.nextOrderHash();
      const order2 = dataGen.nextOrderHash();
      const order3 = dataGen.nextOrderHash();
      
      // Swap 1: Alice deposited, has source escrow, no dest escrow
      await manager.trackSwap(order1, {});
      await manager.updateSwapStatus(
        order1,
        SwapStatus.ALICE_DEPOSITED,
        { srcEscrow: dataGen.nextAddress() }
      );
      
      // Swap 2: Alice deposited but no source escrow (shouldn't be returned)
      await manager.trackSwap(order2, {});
      await manager.updateSwapStatus(order2, SwapStatus.ALICE_DEPOSITED);
      
      // Swap 3: Has dest escrow already (shouldn't be returned)
      await manager.trackSwap(order3, {});
      await manager.updateSwapStatus(
        order3,
        SwapStatus.ALICE_DEPOSITED,
        {
          srcEscrow: dataGen.nextAddress(),
          dstEscrow: dataGen.nextAddress(),
        }
      );
      
      const awaiting = await manager.getSwapsAwaitingDestEscrow();
      assertEquals(awaiting.length, 1);
      assertEquals(awaiting[0].orderHash, order1);
    });
  });
  
  describe("getSwapsAwaitingSecretReveal", () => {
    it("should return swaps ready for secret reveal", async () => {
      const order1 = dataGen.nextOrderHash();
      const order2 = dataGen.nextOrderHash();
      const secret = TEST_VALUES.TEST_SECRET;
      
      // Swap 1: Bob deposited, has dest escrow and secret, not revealed
      await manager.trackSwap(order1, { secret });
      await manager.updateSwapStatus(
        order1,
        SwapStatus.BOB_DEPOSITED,
        { dstEscrow: dataGen.nextAddress() }
      );
      
      // Swap 2: Bob deposited but secret already revealed
      await manager.trackSwap(order2, { secret });
      await manager.updateSwapStatus(
        order2,
        SwapStatus.BOB_DEPOSITED,
        {
          dstEscrow: dataGen.nextAddress(),
          secretRevealedAt: Date.now(),
        }
      );
      
      const awaiting = await manager.getSwapsAwaitingSecretReveal();
      assertEquals(awaiting.length, 1);
      assertEquals(awaiting[0].orderHash, order1);
    });
    
    it("should not return swaps without secret", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {}); // No secret
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.BOB_DEPOSITED,
        { dstEscrow: dataGen.nextAddress() }
      );
      
      const awaiting = await manager.getSwapsAwaitingSecretReveal();
      assertEquals(awaiting.length, 0);
    });
  });
  
  describe("getSwapsAwaitingWithdrawal", () => {
    it("should return swaps where Bob can withdraw from source", async () => {
      const orderHash = dataGen.nextOrderHash();
      const secret = TEST_VALUES.TEST_SECRET;
      
      await manager.trackSwap(orderHash, { secret });
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.SECRET_REVEALED,
        { srcEscrow: dataGen.nextAddress() }
      );
      
      const awaiting = await manager.getSwapsAwaitingWithdrawal();
      assertEquals(awaiting.length, 1);
      assertEquals(awaiting[0].orderHash, orderHash);
    });
    
    it("should return swaps where Alice can withdraw from destination", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {});
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.SECRET_REVEALED,
        {
          secretRevealedAt: Date.now(),
          dstEscrow: dataGen.nextAddress(),
        }
      );
      
      const awaiting = await manager.getSwapsAwaitingWithdrawal();
      assertEquals(awaiting.length, 1);
      assertEquals(awaiting[0].orderHash, orderHash);
    });
    
    it("should not return already withdrawn swaps", async () => {
      const orderHash = dataGen.nextOrderHash();
      const secret = TEST_VALUES.TEST_SECRET;
      
      await manager.trackSwap(orderHash, { secret });
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.SOURCE_WITHDRAWN,
        {
          srcEscrow: dataGen.nextAddress(),
          srcWithdrawnAt: Date.now(),
        }
      );
      
      const awaiting = await manager.getSwapsAwaitingWithdrawal();
      assertEquals(awaiting.length, 0);
    });
    
    it("should handle multiple withdrawal scenarios", async () => {
      const order1 = dataGen.nextOrderHash();
      const order2 = dataGen.nextOrderHash();
      const secret = TEST_VALUES.TEST_SECRET;
      
      // Swap 1: Bob can withdraw from source
      await manager.trackSwap(order1, { secret });
      await manager.updateSwapStatus(
        order1,
        SwapStatus.SECRET_REVEALED,
        { srcEscrow: dataGen.nextAddress() }
      );
      
      // Swap 2: Alice can withdraw from destination
      await manager.trackSwap(order2, {});
      await manager.updateSwapStatus(
        order2,
        SwapStatus.SECRET_REVEALED,
        {
          secretRevealedAt: Date.now(),
          dstEscrow: dataGen.nextAddress(),
        }
      );
      
      const awaiting = await manager.getSwapsAwaitingWithdrawal();
      assertEquals(awaiting.length, 2);
    });
  });
  
  describe("markSwapFailed", () => {
    it("should mark swap as failed with error message", async () => {
      const orderHash = dataGen.nextOrderHash();
      const errorMessage = "Transaction reverted: insufficient funds";
      
      await manager.trackSwap(orderHash, {});
      await manager.markSwapFailed(orderHash, errorMessage);
      
      const swap = await manager.getSwap(orderHash);
      assertExists(swap);
      assertEquals(swap.status, SwapStatus.FAILED);
      assertEquals(swap.lastError, errorMessage);
    });
    
    it("should handle non-existent swap gracefully", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      // Should not throw
      await manager.markSwapFailed(orderHash, "Error");
      
      const swap = await manager.getSwap(orderHash);
      assertEquals(swap, null);
    });
  });
  
  describe("incrementRetryCount", () => {
    it("should increment retry count and return new value", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {});
      
      const count1 = await manager.incrementRetryCount(orderHash);
      assertEquals(count1, 1);
      
      const count2 = await manager.incrementRetryCount(orderHash);
      assertEquals(count2, 2);
      
      const count3 = await manager.incrementRetryCount(orderHash);
      assertEquals(count3, 3);
      
      const swap = await manager.getSwap(orderHash);
      assertEquals(swap?.retryCount, 3);
    });
    
    it("should return 0 for non-existent swap", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      const count = await manager.incrementRetryCount(orderHash);
      assertEquals(count, 0);
    });
    
    it("should preserve status when incrementing retry", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {});
      await manager.updateSwapStatus(orderHash, SwapStatus.ALICE_DEPOSITED);
      
      await manager.incrementRetryCount(orderHash);
      
      const swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.ALICE_DEPOSITED);
      assertEquals(swap?.retryCount, 1);
    });
  });
  
  describe("checkExpiredSwaps", () => {
    it("should mark old swaps as expired", async () => {
      const order1 = dataGen.nextOrderHash();
      const order2 = dataGen.nextOrderHash();
      
      // Create swap with old timestamp
      await manager.trackSwap(order1, {});
      const oldSwap = await manager.getSwap(order1);
      if (oldSwap) {
        // Manually update timestamp to be old
        await mockKv.set(["swaps", order1], {
          ...oldSwap,
          createdAt: Date.now() - 7200000, // 2 hours ago
        });
      }
      
      // Create recent swap
      await manager.trackSwap(order2, {});
      
      // Check with 1 hour timeout
      await manager.checkExpiredSwaps(3600);
      
      const swap1 = await manager.getSwap(order1);
      const swap2 = await manager.getSwap(order2);
      
      assertEquals(swap1?.status, SwapStatus.EXPIRED);
      assertExists(swap1?.lastError);
      assertEquals(swap2?.status, SwapStatus.CREATED); // Still pending
    });
    
    it("should not expire completed swaps", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {});
      await manager.updateSwapStatus(orderHash, SwapStatus.COMPLETED);
      
      // Make it old
      const swap = await manager.getSwap(orderHash);
      if (swap) {
        await mockKv.set(["swaps", orderHash], {
          ...swap,
          createdAt: Date.now() - 7200000,
        });
      }
      
      await manager.checkExpiredSwaps(3600);
      
      const updatedSwap = await manager.getSwap(orderHash);
      assertEquals(updatedSwap?.status, SwapStatus.COMPLETED); // Still completed
    });
    
    it("should not expire failed swaps", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {});
      await manager.markSwapFailed(orderHash, "Test error");
      
      // Make it old
      const swap = await manager.getSwap(orderHash);
      if (swap) {
        await mockKv.set(["swaps", orderHash], {
          ...swap,
          createdAt: Date.now() - 7200000,
        });
      }
      
      await manager.checkExpiredSwaps(3600);
      
      const updatedSwap = await manager.getSwap(orderHash);
      assertEquals(updatedSwap?.status, SwapStatus.FAILED); // Still failed
    });
    
    it("should use default timeout when not specified", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {});
      
      // Make it just over 1 hour old (default)
      const swap = await manager.getSwap(orderHash);
      if (swap) {
        await mockKv.set(["swaps", orderHash], {
          ...swap,
          createdAt: Date.now() - 3601000, // Just over 1 hour
        });
      }
      
      await manager.checkExpiredSwaps(); // No timeout specified
      
      const updatedSwap = await manager.getSwap(orderHash);
      assertEquals(updatedSwap?.status, SwapStatus.EXPIRED);
    });
  });
  
  describe("getStatistics", () => {
    it("should calculate correct statistics", async () => {
      // Create swaps with different statuses
      for (let i = 0; i < 5; i++) {
        const orderHash = dataGen.nextOrderHash();
        await manager.trackSwap(orderHash, {});
        if (i < 2) {
          await manager.updateSwapStatus(orderHash, SwapStatus.COMPLETED);
        } else if (i === 2) {
          await manager.updateSwapStatus(orderHash, SwapStatus.FAILED);
        } else if (i === 3) {
          await manager.updateSwapStatus(orderHash, SwapStatus.EXPIRED);
        }
        // Last one remains pending
      }
      
      const stats = await manager.getStatistics();
      
      assertEquals(stats.total, 5);
      assertEquals(stats.completed, 2);
      assertEquals(stats.failed, 1);
      assertEquals(stats.expired, 1);
      assertEquals(stats.pending, 1);
      assertEquals(stats.successRate, 40); // 2/5 * 100
    });
    
    it("should handle empty state", async () => {
      const stats = await manager.getStatistics();
      
      assertEquals(stats.total, 0);
      assertEquals(stats.completed, 0);
      assertEquals(stats.failed, 0);
      assertEquals(stats.expired, 0);
      assertEquals(stats.pending, 0);
      assertEquals(stats.successRate, 0);
    });
    
    it("should calculate 100% success rate correctly", async () => {
      for (let i = 0; i < 3; i++) {
        const orderHash = dataGen.nextOrderHash();
        await manager.trackSwap(orderHash, {});
        await manager.updateSwapStatus(orderHash, SwapStatus.COMPLETED);
      }
      
      const stats = await manager.getStatistics();
      assertEquals(stats.successRate, 100);
    });
  });
  
  describe("cleanupOldSwaps", () => {
    it("should remove old completed swaps", async () => {
      const order1 = dataGen.nextOrderHash();
      const order2 = dataGen.nextOrderHash();
      const order3 = dataGen.nextOrderHash();
      
      // Create completed swap with old timestamp
      await manager.trackSwap(order1, {});
      await manager.updateSwapStatus(order1, SwapStatus.COMPLETED);
      const swap1 = await manager.getSwap(order1);
      if (swap1) {
        await mockKv.set(["swaps", order1], {
          ...swap1,
          completedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
        });
      }
      
      // Create recent completed swap
      await manager.trackSwap(order2, {});
      await manager.updateSwapStatus(order2, SwapStatus.COMPLETED);
      
      // Create old but not completed swap
      await manager.trackSwap(order3, {});
      const swap3 = await manager.getSwap(order3);
      if (swap3) {
        await mockKv.set(["swaps", order3], {
          ...swap3,
          createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        });
      }
      
      const cleaned = await manager.cleanupOldSwaps(7);
      
      assertEquals(cleaned, 1);
      assertEquals(await manager.getSwap(order1), null); // Removed
      assertExists(await manager.getSwap(order2)); // Kept (recent)
      assertExists(await manager.getSwap(order3)); // Kept (not completed)
    });
    
    it("should use default retention period", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {});
      await manager.updateSwapStatus(orderHash, SwapStatus.COMPLETED);
      
      const swap = await manager.getSwap(orderHash);
      if (swap) {
        await mockKv.set(["swaps", orderHash], {
          ...swap,
          completedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
        });
      }
      
      const cleaned = await manager.cleanupOldSwaps(); // Default 7 days
      
      assertEquals(cleaned, 1);
      assertEquals(await manager.getSwap(orderHash), null);
    });
    
    it("should return 0 when no swaps to clean", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {});
      await manager.updateSwapStatus(orderHash, SwapStatus.COMPLETED);
      
      const cleaned = await manager.cleanupOldSwaps(7);
      
      assertEquals(cleaned, 0);
    });
  });
  
  describe("State Transitions", () => {
    it("should follow valid state transition path", async () => {
      const orderHash = dataGen.nextOrderHash();
      const secret = TEST_VALUES.TEST_SECRET;
      
      // Track initial swap
      await manager.trackSwap(orderHash, {
        alice: TEST_ADDRESSES.ALICE,
        bob: TEST_ADDRESSES.BOB,
        secret,
      });
      
      // Order filled
      await manager.updateSwapStatus(orderHash, SwapStatus.ORDER_FILLED);
      let swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.ORDER_FILLED);
      
      // Source escrow created
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.SOURCE_ESCROW_CREATED,
        { srcEscrow: dataGen.nextAddress() }
      );
      swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.SOURCE_ESCROW_CREATED);
      
      // Alice deposits
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.ALICE_DEPOSITED,
        { srcDepositedAt: Date.now() }
      );
      swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.ALICE_DEPOSITED);
      
      // Dest escrow created
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.DEST_ESCROW_CREATED,
        { dstEscrow: dataGen.nextAddress() }
      );
      swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.DEST_ESCROW_CREATED);
      
      // Bob deposits
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.BOB_DEPOSITED,
        { dstDepositedAt: Date.now() }
      );
      swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.BOB_DEPOSITED);
      
      // Secret revealed
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.SECRET_REVEALED,
        {
          secretRevealedAt: Date.now(),
          secretRevealTxHash: dataGen.nextOrderHash(),
        }
      );
      swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.SECRET_REVEALED);
      
      // Source withdrawn
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.SOURCE_WITHDRAWN,
        { srcWithdrawnAt: Date.now() }
      );
      swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.SOURCE_WITHDRAWN);
      
      // Destination withdrawn - should auto-complete
      await manager.updateSwapStatus(
        orderHash,
        SwapStatus.DEST_WITHDRAWN,
        { dstWithdrawnAt: Date.now() }
      );
      swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.COMPLETED);
      assertExists(swap?.completedAt);
    });
    
    it("should handle failure at any stage", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {});
      await manager.updateSwapStatus(orderHash, SwapStatus.ALICE_DEPOSITED);
      
      // Can fail at any point
      await manager.markSwapFailed(orderHash, "Bob timeout");
      
      const swap = await manager.getSwap(orderHash);
      assertEquals(swap?.status, SwapStatus.FAILED);
      assertEquals(swap?.lastError, "Bob timeout");
    });
  });
  
  describe("Edge Cases", () => {
    it("should handle concurrent updates gracefully", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      await manager.trackSwap(orderHash, {});
      
      // Simulate concurrent updates
      const updates = [
        manager.updateSwapStatus(orderHash, SwapStatus.ORDER_FILLED),
        manager.updateSwapStatus(orderHash, SwapStatus.SOURCE_ESCROW_CREATED),
        manager.incrementRetryCount(orderHash),
      ];
      
      await Promise.all(updates);
      
      const swap = await manager.getSwap(orderHash);
      assertExists(swap);
      // Last update wins in this mock implementation
      assert(swap.retryCount > 0);
    });
    
    it("should handle large number of swaps", async () => {
      const swapCount = 100;
      const orderHashes: string[] = [];
      
      // Create many swaps
      for (let i = 0; i < swapCount; i++) {
        const orderHash = dataGen.nextOrderHash();
        orderHashes.push(orderHash);
        await manager.trackSwap(orderHash, {});
        
        // Vary the statuses
        if (i % 3 === 0) {
          await manager.updateSwapStatus(orderHash, SwapStatus.COMPLETED);
        } else if (i % 3 === 1) {
          await manager.updateSwapStatus(orderHash, SwapStatus.ALICE_DEPOSITED);
        }
      }
      
      const stats = await manager.getStatistics();
      assertEquals(stats.total, swapCount);
      
      const pending = await manager.getPendingSwaps();
      assert(pending.length > 0);
    });
    
    it("should handle missing required fields gracefully", async () => {
      const orderHash = dataGen.nextOrderHash();
      
      // Track with minimal data
      await manager.trackSwap(orderHash, {});
      
      const swap = await manager.getSwap(orderHash);
      assertExists(swap);
      
      // Should have defaults for all required fields
      assertExists(swap.orderHash);
      assertExists(swap.hashlock);
      assertExists(swap.status);
      assertExists(swap.alice);
      assertExists(swap.bob);
      assertEquals(typeof swap.srcChainId, "number");
      assertEquals(typeof swap.srcAmount, "bigint");
      assertEquals(typeof swap.retryCount, "number");
    });
    
    it("should preserve all data through updates", async () => {
      const orderHash = dataGen.nextOrderHash();
      const metadata = { priority: "high", source: "API" };
      const customData = { customField: "value" };
      
      await manager.trackSwap(orderHash, {
        alice: TEST_ADDRESSES.ALICE,
        bob: TEST_ADDRESSES.BOB,
        metadata,
        ...customData,
      });
      
      await manager.updateSwapStatus(orderHash, SwapStatus.ORDER_FILLED);
      
      const swap = await manager.getSwap(orderHash);
      assertExists(swap);
      assertEquals(swap.alice, TEST_ADDRESSES.ALICE);
      assertEquals(swap.bob, TEST_ADDRESSES.BOB);
      assertEquals(swap.metadata, metadata);
      // Custom fields are preserved through spread operator
    });
    
    it("should handle special characters in orderHash", async () => {
      const specialHash = "0x" + "ff".repeat(32) as Hex;
      
      await manager.trackSwap(specialHash, {});
      
      const swap = await manager.getSwap(specialHash);
      assertExists(swap);
      assertEquals(swap.orderHash, specialHash);
    });
  });
  
  describe("close", () => {
    it("should close KV store connection", async () => {
      let closeCalled = false;
      (mockKv as any).close = () => {
        closeCalled = true;
      };
      
      await manager.close();
      
      assert(closeCalled);
    });
    
    it("should handle close when KV not initialized", async () => {
      const newManager = new SwapStateManager();
      
      // Should not throw
      await newManager.close();
    });
  });
});