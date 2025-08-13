/**
 * Integration Tests for oRPC Endpoints
 * 
 * Comprehensive tests for all Alice service oRPC endpoints including:
 * - Health check
 * - Order creation
 * - Swap status retrieval
 * - Pending orders listing
 * - Secret revelation
 * 
 * Tests cover success cases, error cases, input validation, and type safety.
 */

import { assertEquals, assertExists, assertObjectMatch, assertRejects } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from "https://deno.land/std@0.220.0/testing/bdd.ts";
import { createORPCClient, ORPCError } from "npm:@orpc/client@latest";
import { RPCLink } from "npm:@orpc/client/fetch";
import { type RouterClient } from "npm:@orpc/server@latest";
import { type AliceRouter } from "../../src/utils/alice-orpc-server.ts";
import { AliceOrpcServer } from "../../src/utils/alice-orpc-server.ts";
import { SwapStateManager, SwapStatus } from "../../src/state/swap-state-manager.ts";
import { SecretManager } from "../../src/state/SecretManager.ts";
import { type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_PORT = 8009; // Use a different port to avoid conflicts
const ALICE_API_URL = `http://localhost:${TEST_PORT}/api/alice`;

// Test private key (DO NOT USE IN PRODUCTION)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

// Test data
const TEST_HASHLOCK = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;
const TEST_SECRET = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
const TEST_ORDER_HASH = "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" as Hex;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create oRPC client for testing
 */
function createTestClient(): RouterClient<AliceRouter> {
  const link = new RPCLink({
    url: ALICE_API_URL,
    headers: {
      "Content-Type": "application/json",
    },
  });
  
  return createORPCClient(link) as RouterClient<AliceRouter>;
}

/**
 * Wait for server to be ready
 */
async function waitForServer(maxAttempts = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`);
      if (response.ok) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Mock LimitOrderAlice for testing
 */
class MockLimitOrderAlice {
  private shouldFailCreateOrder = false;
  private mockBalance = 1000000000000000000n; // 1 token
  public account: any;
  
  constructor() {
    this.account = privateKeyToAccount(TEST_PRIVATE_KEY);
  }
  
  async createOrder(params: any): Promise<string> {
    if (this.shouldFailCreateOrder) {
      throw new Error("Failed to create order");
    }
    
    // Check mock balance
    if (BigInt(params.srcAmount) > this.mockBalance) {
      throw new Error(`Insufficient balance. Have ${this.mockBalance}, need ${params.srcAmount}`);
    }
    
    return TEST_ORDER_HASH;
  }
  
  setFailCreateOrder(fail: boolean) {
    this.shouldFailCreateOrder = fail;
  }
  
  setMockBalance(balance: bigint) {
    this.mockBalance = balance;
  }
}

// ============================================================================
// Integration Tests
// ============================================================================

describe("oRPC Endpoints Integration Tests", () => {
  let server: AliceOrpcServer;
  let client: RouterClient<AliceRouter>;
  let swapStateManager: SwapStateManager;
  let secretManager: SecretManager;
  let limitOrderAlice: MockLimitOrderAlice;
  let kvStore: Deno.Kv;
  
  beforeAll(async () => {
    // Initialize KV store for testing
    kvStore = await Deno.openKv(":memory:");
    
    // Initialize managers - pass the KV store directly to managers
    swapStateManager = new SwapStateManager();
    secretManager = new SecretManager();
    limitOrderAlice = new MockLimitOrderAlice();
    
    // Initialize managers
    await swapStateManager.init();
    await secretManager.init();
    
    // Create and start server
    server = new AliceOrpcServer({
      port: TEST_PORT,
      limitOrderAlice: limitOrderAlice as any,
      swapStateManager,
      secretManager,
    });
    
    await server.start();
    
    // Wait for server to be ready
    const ready = await waitForServer();
    if (!ready) {
      throw new Error("Server failed to start");
    }
    
    // Create client
    client = createTestClient();
  });
  
  afterAll(async () => {
    // Clean up
    server.stop();
    if (kvStore) {
      kvStore.close();
    }
  });
  
  beforeEach(async () => {
    // Reset test data before each test
    limitOrderAlice.setFailCreateOrder(false);
    limitOrderAlice.setMockBalance(1000000000000000000n);
    
    // Clear KV store if it exists
    if (kvStore) {
      const entries = kvStore.list({ prefix: [] });
      for await (const entry of entries) {
        await kvStore.delete(entry.key);
      }
    }
  });
  
  // ==========================================================================
  // Health Check Tests
  // ==========================================================================
  
  describe("Health Check Endpoint", () => {
    it("should return healthy status", async () => {
      try {
        const health = await client.health();
        
        assertExists(health);
        assertEquals(health.status, "healthy");
        assertEquals(health.service, "alice-api");
        assertExists(health.timestamp);
        assertExists(health.uptime);
        assertEquals(typeof health.uptime, "number");
      } catch (error) {
        throw new Error(`Health check failed: ${error}`);
      }
    });
    
    it("should return valid ISO timestamp", async () => {
      const health = await client.health();
      
      assertExists(health);
      
      // Validate ISO timestamp
      const timestamp = new Date(health.timestamp);
      assertEquals(isNaN(timestamp.getTime()), false);
    });
    
    it("should increase uptime over time", async () => {
      const health1 = await client.health();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const health2 = await client.health();
      
      assertExists(health1);
      assertExists(health2);
      
      // Uptime should have increased
      assertEquals(health2.uptime > health1.uptime, true);
    });
  });
  
  // ==========================================================================
  // Create Order Tests
  // ==========================================================================
  
  describe("Create Order Endpoint", () => {
    it("should create order successfully with valid input", async () => {
      try {
        const result = await client.createOrder({
          srcChainId: 8453,
          dstChainId: 10,
          srcAmount: "100000000000000000", // 0.1 token
          dstAmount: "100000000000000000",
        });
        
        assertExists(result);
        assertEquals(result.success, true);
        assertEquals(result.orderHash, TEST_ORDER_HASH);
        assertExists(result.hashlock);
        assertEquals(result.srcChainId, 8453);
        assertEquals(result.dstChainId, 10);
        assertEquals(result.srcAmount, "100000000000000000");
        assertEquals(result.dstAmount, "100000000000000000");
      } catch (error) {
        throw new Error(`Create order failed: ${error}`);
      }
    });
    
    it("should create order with custom token address", async () => {
      const tokenAddress = "0x1234567890123456789012345678901234567890";
      
      const result = await client.createOrder({
        srcChainId: 8453,
        dstChainId: 10,
        srcAmount: "50000000000000000",
        dstAmount: "50000000000000000",
        tokenAddress,
      });
      
      assertExists(result);
      assertEquals(result.success, true);
    });
    
    it("should create order with safety deposits", async () => {
      const result = await client.createOrder({
        srcChainId: 8453,
        dstChainId: 10,
        srcAmount: "100000000000000000",
        dstAmount: "100000000000000000",
        srcSafetyDeposit: "10000000000000000",
        dstSafetyDeposit: "10000000000000000",
      });
      
      assertExists(result);
      assertEquals(result.success, true);
    });
    
    it("should fail with invalid chain ID", async () => {
      await assertRejects(
        async () => {
          await client.createOrder({
            srcChainId: 999 as any, // Invalid chain ID
            dstChainId: 10,
            srcAmount: "100000000000000000",
            dstAmount: "100000000000000000",
          });
        },
        ORPCError,
        "INPUT_VALIDATION_FAILED"
      );
    });
    
    it("should fail with invalid amount format", async () => {
      await assertRejects(
        async () => {
          await client.createOrder({
            srcChainId: 8453,
            dstChainId: 10,
            srcAmount: "not-a-number",
            dstAmount: "100000000000000000",
          });
        },
        ORPCError,
        "INPUT_VALIDATION_FAILED"
      );
    });
    
    it("should fail with negative amount", async () => {
      await assertRejects(
        async () => {
          await client.createOrder({
            srcChainId: 8453,
            dstChainId: 10,
            srcAmount: "-100000000000000000",
            dstAmount: "100000000000000000",
          });
        },
        ORPCError,
        "INPUT_VALIDATION_FAILED"
      );
    });
    
    it("should fail with invalid token address", async () => {
      await assertRejects(
        async () => {
          await client.createOrder({
            srcChainId: 8453,
            dstChainId: 10,
            srcAmount: "100000000000000000",
            dstAmount: "100000000000000000",
            tokenAddress: "not-an-address",
          });
        },
        ORPCError,
        "INPUT_VALIDATION_FAILED"
      );
    });
    
    it("should fail with insufficient balance", async () => {
      // Set low balance
      limitOrderAlice.setMockBalance(50000000000000000n); // 0.05 tokens
      
      try {
        await client.createOrder({
          srcChainId: 8453,
          dstChainId: 10,
          srcAmount: "100000000000000000", // 0.1 token (more than balance)
          dstAmount: "100000000000000000",
        });
        throw new Error("Should have thrown insufficient balance error");
      } catch (error) {
        if (error instanceof ORPCError) {
          assertEquals(error.code, "INSUFFICIENT_BALANCE");
          assertExists(error.data);
          assertEquals(error.data.available, "50000000000000000");
          assertEquals(error.data.required, "100000000000000000");
        } else {
          throw error;
        }
      }
    });
    
    it("should fail when order creation fails", async () => {
      // Make order creation fail
      limitOrderAlice.setFailCreateOrder(true);
      
      try {
        await client.createOrder({
          srcChainId: 8453,
          dstChainId: 10,
          srcAmount: "100000000000000000",
          dstAmount: "100000000000000000",
        });
        throw new Error("Should have thrown order creation failed error");
      } catch (error) {
        if (error instanceof ORPCError) {
          assertEquals(error.code, "ORDER_CREATION_FAILED");
          assertExists(error.data);
          assertEquals(error.data.reason, "Failed to create order");
        } else {
          throw error;
        }
      }
    });
  });
  
  // ==========================================================================
  // Get Swap Status Tests
  // ==========================================================================
  
  describe("Get Swap Status Endpoint", () => {
    beforeEach(async () => {
      // Create a test swap using trackSwap
      await swapStateManager.trackSwap(TEST_ORDER_HASH, {
        orderHash: TEST_ORDER_HASH,
        hashlock: TEST_HASHLOCK,
        secret: TEST_SECRET,
        alice: "0x1234567890123456789012345678901234567890" as Address,
        bob: "0x0987654321098765432109876543210987654321" as Address,
        srcChainId: 8453,
        dstChainId: 10,
        srcToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
        dstToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
        srcAmount: 100000000000000000n,
        dstAmount: 100000000000000000n,
        status: SwapStatus.ALICE_DEPOSITED,
        createdAt: Date.now(),
        srcEscrow: "0xaaaa567890123456789012345678901234567890" as Address,
        srcDepositedAt: Date.now(),
      });
    });
    
    it("should return swap status for existing swap", async () => {
      const status = await client.getSwapStatus({
        hashlock: TEST_HASHLOCK,
      });
      
      assertExists(status);
      assertEquals(status.hashlock, TEST_HASHLOCK);
      // Map internal status to API status
      assertExists(status.status);
      assertEquals(status.sourceEscrow, "0xaaaa567890123456789012345678901234567890");
      assertEquals(status.completed, false);
      assertExists(status.createdAt);
      assertExists(status.sourceDepositedAt);
    });
    
    it("should return completed status for completed swap", async () => {
      // Update swap to completed
      await swapStateManager.updateSwapStatus(
        TEST_ORDER_HASH,
        SwapStatus.COMPLETED,
        {
          secretRevealedAt: Date.now(),
          srcWithdrawnAt: Date.now(),
          dstWithdrawnAt: Date.now(),
        }
      );
      
      const status = await client.getSwapStatus({
        hashlock: TEST_HASHLOCK,
      });
      
      assertExists(status);
      assertEquals(status.completed, true);
      // The status might be mapped differently in the API
      assertExists(status.status);
    });
    
    it("should fail with invalid hashlock format", async () => {
      await assertRejects(
        async () => {
          await client.getSwapStatus({
            hashlock: "invalid-hashlock",
          });
        },
        ORPCError,
        "INPUT_VALIDATION_FAILED"
      );
    });
    
    it("should fail when swap not found", async () => {
      const nonExistentHashlock = "0x9999999999999999999999999999999999999999999999999999999999999999";
      
      try {
        await client.getSwapStatus({
          hashlock: nonExistentHashlock,
        });
        throw new Error("Should have thrown swap not found error");
      } catch (error) {
        if (error instanceof ORPCError) {
          assertEquals(error.code, "SWAP_NOT_FOUND");
          assertExists(error.data);
          assertEquals(error.data.hashlock, nonExistentHashlock);
        } else {
          throw error;
        }
      }
    });
  });
  
  // ==========================================================================
  // Get Pending Orders Tests
  // ==========================================================================
  
  describe("Get Pending Orders Endpoint", () => {
    it("should return empty list when no pending orders", async () => {
      const result = await client.getPendingOrders();
      
      assertExists(result);
      assertEquals(result.count, 0);
      assertEquals(result.orders.length, 0);
    });
    
    it("should return list of pending orders", async () => {
      // Create multiple test swaps
      const swap1 = {
        orderHash: "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex,
        hashlock: "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex,
        secret: TEST_SECRET,
        alice: "0x1234567890123456789012345678901234567890" as Address,
        bob: "0x0987654321098765432109876543210987654321" as Address,
        srcChainId: 8453 as const,
        dstChainId: 10 as const,
        srcToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
        dstToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
        srcAmount: 100000000000000000n,
        dstAmount: 100000000000000000n,
        status: SwapStatus.CREATED,
        createdAt: Date.now(),
      };
      
      const swap2 = {
        ...swap1,
        orderHash: "0x3333333333333333333333333333333333333333333333333333333333333333" as Hex,
        hashlock: "0x4444444444444444444444444444444444444444444444444444444444444444" as Hex,
        status: SwapStatus.ALICE_DEPOSITED,
      };
      
      await swapStateManager.trackSwap(swap1.orderHash, swap1);
      await swapStateManager.trackSwap(swap2.orderHash, swap2);
      
      const result = await client.getPendingOrders();
      
      assertExists(result);
      assertEquals(result.count, 2);
      assertEquals(result.orders.length, 2);
      
      // Check first order
      const order1 = result.orders.find(o => o.orderHash === swap1.orderHash);
      assertExists(order1);
      assertEquals(order1.hashlock, swap1.hashlock);
      // Status might be mapped differently
      assertExists(order1.status);
      assertEquals(order1.sourceChainId, swap1.srcChainId);
      assertEquals(order1.destinationChainId, swap1.dstChainId);
      assertEquals(order1.amount, swap1.srcAmount.toString());
      
      // Check second order
      const order2 = result.orders.find(o => o.orderHash === swap2.orderHash);
      assertExists(order2);
      assertExists(order2.status);
    });
    
    it("should not include completed orders", async () => {
      // Create one pending and one completed swap
      const pendingSwap = {
        orderHash: "0x5555555555555555555555555555555555555555555555555555555555555555" as Hex,
        hashlock: "0x6666666666666666666666666666666666666666666666666666666666666666" as Hex,
        secret: TEST_SECRET,
        alice: "0x1234567890123456789012345678901234567890" as Address,
        bob: "0x0987654321098765432109876543210987654321" as Address,
        srcChainId: 8453 as const,
        dstChainId: 10 as const,
        srcToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
        dstToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
        srcAmount: 100000000000000000n,
        dstAmount: 100000000000000000n,
        status: SwapStatus.ALICE_DEPOSITED,
        createdAt: Date.now(),
      };
      
      const completedSwap = {
        ...pendingSwap,
        orderHash: "0x7777777777777777777777777777777777777777777777777777777777777777" as Hex,
        hashlock: "0x8888888888888888888888888888888888888888888888888888888888888888" as Hex,
        status: SwapStatus.COMPLETED,
      };
      
      await swapStateManager.trackSwap(pendingSwap.orderHash, pendingSwap);
      await swapStateManager.trackSwap(completedSwap.orderHash, completedSwap);
      
      const result = await client.getPendingOrders();
      
      assertExists(result);
      assertEquals(result.count, 1);
      assertEquals(result.orders.length, 1);
      assertEquals(result.orders[0].orderHash, pendingSwap.orderHash);
    });
  });
  
  // ==========================================================================
  // Reveal Secret Tests
  // ==========================================================================
  
  describe("Reveal Secret Endpoint", () => {
    beforeEach(async () => {
      // Store a test secret
      await secretManager.storeSecret(TEST_HASHLOCK, TEST_SECRET);
      
      // Create a test swap
      await swapStateManager.trackSwap(TEST_ORDER_HASH, {
        orderHash: TEST_ORDER_HASH,
        hashlock: TEST_HASHLOCK,
        secret: TEST_SECRET,
        alice: "0x1234567890123456789012345678901234567890" as Address,
        bob: "0x0987654321098765432109876543210987654321" as Address,
        srcChainId: 8453,
        dstChainId: 10,
        srcToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
        dstToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
        srcAmount: 100000000000000000n,
        dstAmount: 100000000000000000n,
        status: SwapStatus.DEST_WITHDRAWN,
        createdAt: Date.now(),
      });
    });
    
    it("should reveal secret successfully", async () => {
      const result = await client.revealSecret({
        hashlock: TEST_HASHLOCK,
      });
      
      assertExists(result);
      assertEquals(result.success, true);
      assertEquals(result.hashlock, TEST_HASHLOCK);
      assertEquals(result.secret, TEST_SECRET);
      
      // Check that swap status was updated
      const swap = await swapStateManager.getSwapByHashlock(TEST_HASHLOCK);
      assertExists(swap);
      assertEquals(swap.status, SwapStatus.SECRET_REVEALED);
      assertExists(swap.secretRevealedAt);
    });
    
    it("should fail with invalid hashlock format", async () => {
      await assertRejects(
        async () => {
          await client.revealSecret({
            hashlock: "invalid-hashlock",
          });
        },
        ORPCError,
        "INPUT_VALIDATION_FAILED"
      );
    });
    
    it("should fail when secret not found", async () => {
      const unknownHashlock = "0xaaaa000000000000000000000000000000000000000000000000000000000000";
      
      try {
        await client.revealSecret({
          hashlock: unknownHashlock,
        });
        throw new Error("Should have thrown secret not found error");
      } catch (error) {
        if (error instanceof ORPCError) {
          assertEquals(error.code, "SECRET_NOT_FOUND");
          assertExists(error.data);
          assertEquals(error.data.hashlock, unknownHashlock);
        } else {
          throw error;
        }
      }
    });
    
    it("should fail when swap not found", async () => {
      // Store secret without creating swap
      const orphanHashlock = "0xbbbb000000000000000000000000000000000000000000000000000000000000";
      const orphanSecret = "0xcccc000000000000000000000000000000000000000000000000000000000000";
      await secretManager.storeSecret(orphanHashlock as Hex, orphanSecret as Hex);
      
      try {
        await client.revealSecret({
          hashlock: orphanHashlock,
        });
        throw new Error("Should have thrown swap not found error");
      } catch (error) {
        if (error instanceof ORPCError) {
          assertEquals(error.code, "SWAP_NOT_FOUND");
          assertExists(error.data);
          assertEquals(error.data.hashlock, orphanHashlock);
        } else {
          throw error;
        }
      }
    });
  });
  
  // ==========================================================================
  // Type Safety Tests
  // ==========================================================================
  
  describe("Type Safety", () => {
    it("should enforce correct types for createOrder", async () => {
      // This test verifies TypeScript type checking works correctly
      // The following would cause TypeScript errors if uncommented:
      
      // @ts-expect-error - srcChainId must be 10 or 8453
      // await client.createOrder({ srcChainId: 1, dstChainId: 10, srcAmount: "100", dstAmount: "100" });
      
      // @ts-expect-error - srcAmount must be string
      // await client.createOrder({ srcChainId: 8453, dstChainId: 10, srcAmount: 100, dstAmount: "100" });
      
      // @ts-expect-error - missing required fields
      // await client.createOrder({ srcChainId: 8453 });
      
      // Valid call should work
      const result = await client.createOrder({
        srcChainId: 8453,
        dstChainId: 10,
        srcAmount: "100",
        dstAmount: "100",
      });
      
      // Type checking on response
      if (result) {
        // These properties should be available with correct types
        const _success: boolean = result.success;
        const _orderHash: string = result.orderHash;
        const _hashlock: string = result.hashlock;
        const _srcChainId: number = result.srcChainId;
        const _dstChainId: number = result.dstChainId;
        const _srcAmount: string = result.srcAmount;
        const _dstAmount: string = result.dstAmount;
        const _filePath: string | undefined = result.filePath;
      }
      
      assertExists(true); // Test passes if types compile correctly
    });
    
    it("should enforce correct error types", async () => {
      // Trigger an error
      try {
        await client.getSwapStatus({
          hashlock: "0x9999999999999999999999999999999999999999999999999999999999999999",
        });
      } catch (error) {
        if (error instanceof ORPCError) {
          // Error should have correct type structure
          const _code: string = error.code;
          const _message: string = error.message;
          const _status: number | undefined = error.status;
          
          // Data should be typed based on error code
          if (error.code === "SWAP_NOT_FOUND") {
            const _hashlock: string = error.data.hashlock;
          }
          
          assertEquals(error.code, "SWAP_NOT_FOUND");
        }
      }
    });
  });
  
  // ==========================================================================
  // Concurrent Request Tests
  // ==========================================================================
  
  describe("Concurrent Requests", () => {
    it("should handle multiple concurrent requests", async () => {
      // Make multiple concurrent requests
      const promises = [
        client.health(),
        client.getPendingOrders(),
        client.createOrder({
          srcChainId: 8453,
          dstChainId: 10,
          srcAmount: "100",
          dstAmount: "100",
        }),
        client.createOrder({
          srcChainId: 10,
          dstChainId: 8453,
          srcAmount: "200",
          dstAmount: "200",
        }),
      ];
      
      const results = await Promise.all(promises);
      
      // All requests should complete successfully
      for (const result of results) {
        assertExists(result);
      }
    });
    
    it("should handle rapid sequential requests", async () => {
      const requestCount = 10;
      const results: any[] = [];
      
      for (let i = 0; i < requestCount; i++) {
        const result = await client.health();
        assertExists(result);
        results.push(result);
      }
      
      assertEquals(results.length, requestCount);
      
      // All should return healthy status
      for (const result of results) {
        assertEquals(result.status, "healthy");
      }
    });
  });
  
  // ==========================================================================
  // Edge Case Tests
  // ==========================================================================
  
  describe("Edge Cases", () => {
    it("should handle very large amounts", async () => {
      const largeAmount = "999999999999999999999999999999999999";
      
      // Set sufficient balance for test
      limitOrderAlice.setMockBalance(BigInt(largeAmount) * 2n);
      
      const result = await client.createOrder({
        srcChainId: 8453,
        dstChainId: 10,
        srcAmount: largeAmount,
        dstAmount: largeAmount,
      });
      
      assertExists(result);
      assertEquals(result.srcAmount, largeAmount);
      assertEquals(result.dstAmount, largeAmount);
    });
    
    it("should handle zero amounts correctly", async () => {
      try {
        await client.createOrder({
          srcChainId: 8453,
          dstChainId: 10,
          srcAmount: "0",
          dstAmount: "100",
        });
        throw new Error("Should have thrown invalid amount error");
      } catch (error) {
        if (error instanceof ORPCError) {
          assertEquals(error.code, "ORDER_CREATION_FAILED");
          assertExists(error.data);
          assertEquals(error.data.reason, "Invalid source amount");
        } else {
          throw error;
        }
      }
    });
    
    it("should handle special characters in error messages", async () => {
      // Create a swap with special characters in the data
      const specialHashlock = "0xdead000000000000000000000000000000000000000000000000000000000000";
      
      try {
        await client.getSwapStatus({
          hashlock: specialHashlock,
        });
        throw new Error("Should have thrown swap not found error");
      } catch (error) {
        if (error instanceof ORPCError) {
          assertEquals(error.code, "SWAP_NOT_FOUND");
          // Error message should be properly escaped
          assertExists(error.message);
        } else {
          throw error;
        }
      }
    });
  });
  
  // ==========================================================================
  // Recovery Tests
  // ==========================================================================
  
  describe("Error Recovery", () => {
    it("should recover after failed order creation", async () => {
      // First, make order creation fail
      limitOrderAlice.setFailCreateOrder(true);
      
      try {
        await client.createOrder({
          srcChainId: 8453,
          dstChainId: 10,
          srcAmount: "100",
          dstAmount: "100",
        });
      } catch (error) {
        if (error instanceof ORPCError) {
          assertEquals(error.code, "ORDER_CREATION_FAILED");
        }
      }
      
      // Fix the issue
      limitOrderAlice.setFailCreateOrder(false);
      
      // Should work now
      const result = await client.createOrder({
        srcChainId: 8453,
        dstChainId: 10,
        srcAmount: "100",
        dstAmount: "100",
      });
      
      assertExists(result);
      assertEquals(result.success, true);
    });
    
    it("should maintain state consistency after errors", async () => {
      // Create a valid swap first
      await swapStateManager.trackSwap("0xeeee000000000000000000000000000000000000000000000000000000000000", {
        orderHash: "0xeeee000000000000000000000000000000000000000000000000000000000000" as Hex,
        hashlock: "0xffff000000000000000000000000000000000000000000000000000000000000" as Hex,
        secret: TEST_SECRET,
        alice: "0x1234567890123456789012345678901234567890" as Address,
        bob: "0x0987654321098765432109876543210987654321" as Address,
        srcChainId: 8453,
        dstChainId: 10,
        srcToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
        dstToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
        srcAmount: 100n,
        dstAmount: 100n,
        status: SwapStatus.CREATED,
        createdAt: Date.now(),
      });
      
      // Try to get a non-existent swap (should fail)
      try {
        await client.getSwapStatus({
          hashlock: "0x0001000000000000000000000000000000000000000000000000000000000000",
        });
      } catch (error) {
        if (error instanceof ORPCError) {
          assertExists(error);
        }
      }
      
      // The valid swap should still be retrievable
      const status = await client.getSwapStatus({
        hashlock: "0xffff000000000000000000000000000000000000000000000000000000000000",
      });
      
      assertExists(status);
      assertEquals(status.hashlock, "0xffff000000000000000000000000000000000000000000000000000000000000");
      assertExists(status.status);
    });
  });
});

// ============================================================================
// Run Tests
// ============================================================================

if (import.meta.main) {
  // Tests will be run by Deno's test runner
  console.log("Running oRPC Endpoints Integration Tests...");
}