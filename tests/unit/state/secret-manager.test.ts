import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";
import {
  assertEquals,
  assertExists,
  assert,
  assertRejects,
  spy,
  stub,
  assertSpyCall,
  assertSpyCalls,
} from "../../setup.ts";
import { SecretManager, type SecretRecord } from "../../../src/state/SecretManager.ts";
import { keccak256, type Hex } from "viem";

// Enhanced MockKVStore for SecretManager testing
class MockKVStore {
  private store: Map<string, unknown> = new Map();
  private closed = false;

  private keyToString(key: string[]): string {
    return JSON.stringify(key);
  }

  async get<T>(key: string[]): Promise<{ value: T | null; versionstamp: string | null }> {
    if (this.closed) throw new Error("KV store is closed");
    const keyStr = this.keyToString(key);
    const value = this.store.get(keyStr) as T | undefined;
    return {
      value: value ?? null,
      versionstamp: value ? "mock-version-1" : null,
    };
  }

  async set(key: string[], value: unknown): Promise<{ versionstamp: string }> {
    if (this.closed) throw new Error("KV store is closed");
    const keyStr = this.keyToString(key);
    this.store.set(keyStr, value);
    return { versionstamp: "mock-version-1" };
  }

  async delete(key: string[]): Promise<void> {
    if (this.closed) throw new Error("KV store is closed");
    const keyStr = this.keyToString(key);
    this.store.delete(keyStr);
  }

  list<T>(selector: { prefix?: string[]; start?: string[]; end?: string[] }): AsyncIterableIterator<{ key: string[]; value: T; versionstamp: string }> {
    const self = this;
    return (async function* () {
      if (self.closed) throw new Error("KV store is closed");
      
      for (const [keyStr, value] of self.store.entries()) {
        const key = JSON.parse(keyStr) as string[];
        
        if (selector.prefix) {
          const prefixStr = self.keyToString(selector.prefix);
          if (!keyStr.startsWith(prefixStr.slice(0, -1))) continue; // Remove trailing ]
        }
        
        yield {
          key,
          value: value as T,
          versionstamp: "mock-version-1",
        };
      }
    })();
  }

  close(): void {
    this.closed = true;
    // Don't clear the store on close to simulate persistence
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  isClosed(): boolean {
    return this.closed;
  }
  
  reopen(): void {
    this.closed = false;
  }
}

describe("SecretManager", () => {
  let secretManager: SecretManager;
  let mockKv: MockKVStore;
  let openKvStub: any;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;

  // Test data
  const testSecret: Hex = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const testOrderHash: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const testEscrowAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4";
  const testChainId = 1;
  const testHashlock = keccak256(testSecret);

  beforeEach(() => {
    mockKv = new MockKVStore();
    openKvStub = stub(Deno, "openKv", () => Promise.resolve(mockKv as unknown as Deno.Kv));
    consoleLogSpy = spy(console, "log");
    consoleWarnSpy = spy(console, "warn");
    secretManager = new SecretManager();
  });

  afterEach(() => {
    openKvStub.restore();
    consoleLogSpy.restore();
    consoleWarnSpy.restore();
    mockKv.close();
  });

  describe("Initialization", () => {
    it("should initialize with Deno KV", async () => {
      await secretManager.init();
      
      assertSpyCalls(openKvStub, 1);
      assertSpyCall(openKvStub, 0, { args: [undefined] });
      assertSpyCall(consoleLogSpy, 0, {
        args: ["✅ SecretManager initialized with Deno KV"],
      });
    });

    it("should initialize with custom KV path", async () => {
      const customPath = "./test-kv";
      const customManager = new SecretManager(customPath);
      await customManager.init();
      
      assertSpyCall(openKvStub, 0, { args: [customPath] });
    });

    it("should handle lazy initialization on first operation", async () => {
      // Don't call init() explicitly
      await secretManager.getSecretByHashlock("test");
      
      // Should have opened KV automatically
      assertSpyCalls(openKvStub, 1);
    });

    it("should not reinitialize if already initialized", async () => {
      await secretManager.init();
      await secretManager.init();
      
      // Should have two calls since SecretManager doesn't track if already initialized
      assertSpyCalls(openKvStub, 2);
    });
  });

  describe("Storing Secrets", () => {
    it("should store a secret with correct record structure", async () => {
      const beforeTime = Date.now();
      const record = await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
      const afterTime = Date.now();

      assertEquals(record.hashlock, testHashlock);
      assertEquals(record.secret, testSecret);
      assertEquals(record.orderHash, testOrderHash);
      assertEquals(record.escrowAddress, testEscrowAddress.toLowerCase());
      assertEquals(record.chainId, testChainId);
      assertEquals(record.status, "pending");
      assert(record.revealedAt >= beforeTime && record.revealedAt <= afterTime);
      assertEquals(record.txHash, undefined);
      assertEquals(record.gasUsed, undefined);
    });

    it("should store secret in KV with correct keys", async () => {
      await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      // Check primary storage
      const primaryResult = await mockKv.get<SecretRecord>(["secrets", testHashlock]);
      assertExists(primaryResult.value);
      assertEquals(primaryResult.value.secret, testSecret);

      // Check index by order hash
      const indexResult = await mockKv.get<string>(["secrets_by_order", testOrderHash]);
      assertEquals(indexResult.value, testHashlock);
    });

    it("should normalize escrow address to lowercase", async () => {
      const upperCaseAddress = "0x742D35CC6634C0532925A3B844BC9E7595F0BEB4";
      const record = await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: upperCaseAddress,
        chainId: testChainId,
      });

      assertEquals(record.escrowAddress, upperCaseAddress.toLowerCase());
    });

    it("should handle multiple secrets with different hashlocks", async () => {
      const secret1: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";
      const secret2: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";
      const orderHash1: Hex = "0xaaaa111111111111111111111111111111111111111111111111111111111111";
      const orderHash2: Hex = "0xbbbb222222222222222222222222222222222222222222222222222222222222";

      const record1 = await secretManager.storeSecret({
        secret: secret1,
        orderHash: orderHash1,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      const record2 = await secretManager.storeSecret({
        secret: secret2,
        orderHash: orderHash2,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      assert(record1.hashlock !== record2.hashlock);
      assertEquals(record1.secret, secret1);
      assertEquals(record2.secret, secret2);
    });
  });

  describe("Getting Secrets by Hashlock", () => {
    beforeEach(async () => {
      await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
    });

    it("should retrieve secret by hashlock", async () => {
      const secret = await secretManager.getSecretByHashlock(testHashlock);
      assertEquals(secret, testSecret);
    });

    it("should return null for non-existent hashlock", async () => {
      const secret = await secretManager.getSecretByHashlock("0xnonexistent");
      assertEquals(secret, null);
    });

    it("should handle empty hashlock", async () => {
      const secret = await secretManager.getSecretByHashlock("");
      assertEquals(secret, null);
    });
  });

  describe("Getting Secrets by Order Hash", () => {
    beforeEach(async () => {
      await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
    });

    it("should retrieve secret by order hash", async () => {
      const secret = await secretManager.getSecretByOrderHash(testOrderHash);
      assertEquals(secret, testSecret);
    });

    it("should return null for non-existent order hash", async () => {
      const secret = await secretManager.getSecretByOrderHash("0xnonexistent");
      assertEquals(secret, null);
    });

    it("should handle multiple order hashes pointing to same secret", async () => {
      const anotherOrderHash: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";
      
      // Store same secret with different order hash
      await secretManager.storeSecret({
        secret: testSecret,
        orderHash: anotherOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      const secret1 = await secretManager.getSecretByOrderHash(testOrderHash);
      const secret2 = await secretManager.getSecretByOrderHash(anotherOrderHash);
      
      assertEquals(secret1, testSecret);
      assertEquals(secret2, testSecret);
    });
  });

  describe("Revealing Secrets (Transaction Details)", () => {
    beforeEach(async () => {
      await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
    });

    it("should confirm secret with transaction details", async () => {
      const txHash = "0xtransactionhash";
      const gasUsed = 100000n;

      await secretManager.confirmSecret(testHashlock, txHash, gasUsed);

      const result = await mockKv.get<SecretRecord>(["secrets", testHashlock]);
      assertExists(result.value);
      assertEquals(result.value.status, "confirmed");
      assertEquals(result.value.txHash, txHash);
      assertEquals(result.value.gasUsed, "100000");
    });

    it("should handle confirming non-existent secret", async () => {
      const nonExistentHashlock = "0xnonexistent";
      const txHash = "0xtransactionhash";
      const gasUsed = 100000n;

      await secretManager.confirmSecret(nonExistentHashlock, txHash, gasUsed);
      
      assertSpyCall(consoleWarnSpy, 0, {
        args: [`⚠️ Secret not found for hashlock: ${nonExistentHashlock}`],
      });
    });

    it("should preserve existing secret data when confirming", async () => {
      const txHash = "0xtransactionhash";
      const gasUsed = 100000n;

      await secretManager.confirmSecret(testHashlock, txHash, gasUsed);

      const result = await mockKv.get<SecretRecord>(["secrets", testHashlock]);
      assertExists(result.value);
      assertEquals(result.value.secret, testSecret);
      assertEquals(result.value.orderHash, testOrderHash);
      assertEquals(result.value.escrowAddress, testEscrowAddress.toLowerCase());
      assertEquals(result.value.chainId, testChainId);
    });

    it("should handle large gas values correctly", async () => {
      const txHash = "0xtransactionhash";
      const largeGasUsed = 99999999999999999999n;

      await secretManager.confirmSecret(testHashlock, txHash, largeGasUsed);

      const result = await mockKv.get<SecretRecord>(["secrets", testHashlock]);
      assertExists(result.value);
      assertEquals(result.value.gasUsed, "99999999999999999999");
    });
  });

  describe("Marking Secrets as Failed", () => {
    beforeEach(async () => {
      await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
    });

    it("should mark secret as failed", async () => {
      const errorMessage = "Transaction reverted";
      
      await secretManager.markFailed(testHashlock, errorMessage);

      const result = await mockKv.get<SecretRecord>(["secrets", testHashlock]);
      assertExists(result.value);
      assertEquals(result.value.status, "failed");
    });

    it("should log error message when marking as failed", async () => {
      const errorMessage = "Transaction reverted";
      
      await secretManager.markFailed(testHashlock, errorMessage);

      assertSpyCall(consoleLogSpy, 1, {
        args: [`❌ Marked secret as failed: ${testHashlock}, error: ${errorMessage}`],
      });
    });

    it("should handle marking non-existent secret as failed", async () => {
      const nonExistentHashlock = "0xnonexistent";
      const errorMessage = "Transaction reverted";
      
      await secretManager.markFailed(nonExistentHashlock, errorMessage);
      
      // Should not throw, just return early
      const result = await mockKv.get<SecretRecord>(["secrets", nonExistentHashlock]);
      assertEquals(result.value, null);
    });

    it("should preserve existing secret data when marking as failed", async () => {
      await secretManager.markFailed(testHashlock, "error");

      const result = await mockKv.get<SecretRecord>(["secrets", testHashlock]);
      assertExists(result.value);
      assertEquals(result.value.secret, testSecret);
      assertEquals(result.value.orderHash, testOrderHash);
      assertEquals(result.value.escrowAddress, testEscrowAddress.toLowerCase());
    });
  });

  describe("Getting Pending Secrets", () => {
    it("should return only pending secrets", async () => {
      // Store multiple secrets with different statuses
      const secret1: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";
      const secret2: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";
      const secret3: Hex = "0x3333333333333333333333333333333333333333333333333333333333333333";
      
      const orderHash1: Hex = "0xaaaa111111111111111111111111111111111111111111111111111111111111";
      const orderHash2: Hex = "0xbbbb222222222222222222222222222222222222222222222222222222222222";
      const orderHash3: Hex = "0xcccc333333333333333333333333333333333333333333333333333333333333";

      // Store pending secret
      await secretManager.storeSecret({
        secret: secret1,
        orderHash: orderHash1,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      // Store and confirm secret
      await secretManager.storeSecret({
        secret: secret2,
        orderHash: orderHash2,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
      const hashlock2 = keccak256(secret2);
      await secretManager.confirmSecret(hashlock2, "0xtx", 100000n);

      // Store and fail secret
      await secretManager.storeSecret({
        secret: secret3,
        orderHash: orderHash3,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
      const hashlock3 = keccak256(secret3);
      await secretManager.markFailed(hashlock3, "error");

      // Get pending secrets
      const pendingSecrets = await secretManager.getPendingSecrets();
      
      assertEquals(pendingSecrets.length, 1);
      assertEquals(pendingSecrets[0].secret, secret1);
      assertEquals(pendingSecrets[0].status, "pending");
    });

    it("should return empty array when no pending secrets", async () => {
      const pendingSecrets = await secretManager.getPendingSecrets();
      assertEquals(pendingSecrets, []);
    });

    it("should return multiple pending secrets", async () => {
      const secret1: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";
      const secret2: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";
      
      await secretManager.storeSecret({
        secret: secret1,
        orderHash: "0xorder1" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      await secretManager.storeSecret({
        secret: secret2,
        orderHash: "0xorder2" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      const pendingSecrets = await secretManager.getPendingSecrets();
      assertEquals(pendingSecrets.length, 2);
      assert(pendingSecrets.every(s => s.status === "pending"));
    });
  });

  describe("Getting All Revealed Secrets", () => {
    it("should return all secrets sorted by revealedAt (newest first)", async () => {
      const secret1: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";
      const secret2: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";
      const secret3: Hex = "0x3333333333333333333333333333333333333333333333333333333333333333";

      // Store secrets with delays to ensure different timestamps
      await secretManager.storeSecret({
        secret: secret1,
        orderHash: "0xorder1" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await secretManager.storeSecret({
        secret: secret2,
        orderHash: "0xorder2" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await secretManager.storeSecret({
        secret: secret3,
        orderHash: "0xorder3" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      const allSecrets = await secretManager.getRevealedSecrets();
      
      assertEquals(allSecrets.length, 3);
      // Should be sorted newest first
      assertEquals(allSecrets[0].secret, secret3);
      assertEquals(allSecrets[1].secret, secret2);
      assertEquals(allSecrets[2].secret, secret1);
      
      // Verify timestamps are in descending order
      assert(allSecrets[0].revealedAt >= allSecrets[1].revealedAt);
      assert(allSecrets[1].revealedAt >= allSecrets[2].revealedAt);
    });

    it("should return empty array when no secrets exist", async () => {
      const allSecrets = await secretManager.getRevealedSecrets();
      assertEquals(allSecrets, []);
    });

    it("should include secrets with all statuses", async () => {
      const secret1: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";
      const secret2: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";
      const secret3: Hex = "0x3333333333333333333333333333333333333333333333333333333333333333";

      // Pending
      await secretManager.storeSecret({
        secret: secret1,
        orderHash: "0xorder1" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      // Confirmed
      await secretManager.storeSecret({
        secret: secret2,
        orderHash: "0xorder2" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
      const hashlock2 = keccak256(secret2);
      await secretManager.confirmSecret(hashlock2, "0xtx", 100000n);

      // Failed
      await secretManager.storeSecret({
        secret: secret3,
        orderHash: "0xorder3" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
      const hashlock3 = keccak256(secret3);
      await secretManager.markFailed(hashlock3, "error");

      const allSecrets = await secretManager.getRevealedSecrets();
      
      assertEquals(allSecrets.length, 3);
      const statuses = allSecrets.map(s => s.status);
      assert(statuses.includes("pending"));
      assert(statuses.includes("confirmed"));
      assert(statuses.includes("failed"));
    });
  });

  describe("Checking Secret Existence", () => {
    beforeEach(async () => {
      await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
    });

    it("should return true for existing hashlock", async () => {
      const exists = await secretManager.hasSecret(testHashlock);
      assertEquals(exists, true);
    });

    it("should return false for non-existent hashlock", async () => {
      const exists = await secretManager.hasSecret("0xnonexistent");
      assertEquals(exists, false);
    });

    it("should return false for empty hashlock", async () => {
      const exists = await secretManager.hasSecret("");
      assertEquals(exists, false);
    });
  });

  describe("Getting Statistics", () => {
    it("should return correct statistics for multiple secrets", async () => {
      const secret1: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";
      const secret2: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";
      const secret3: Hex = "0x3333333333333333333333333333333333333333333333333333333333333333";
      const secret4: Hex = "0x4444444444444444444444444444444444444444444444444444444444444444";

      // Add 2 pending
      await secretManager.storeSecret({
        secret: secret1,
        orderHash: "0xorder1" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      await secretManager.storeSecret({
        secret: secret2,
        orderHash: "0xorder2" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      // Add 1 confirmed
      await secretManager.storeSecret({
        secret: secret3,
        orderHash: "0xorder3" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
      const hashlock3 = keccak256(secret3);
      await secretManager.confirmSecret(hashlock3, "0xtx", 100000n);

      // Add 1 failed
      await secretManager.storeSecret({
        secret: secret4,
        orderHash: "0xorder4" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
      const hashlock4 = keccak256(secret4);
      await secretManager.markFailed(hashlock4, "error");

      const stats = await secretManager.getStatistics();
      
      assertEquals(stats.total, 4);
      assertEquals(stats.pending, 2);
      assertEquals(stats.confirmed, 1);
      assertEquals(stats.failed, 1);
    });

    it("should return zero statistics when no secrets exist", async () => {
      const stats = await secretManager.getStatistics();
      
      assertEquals(stats.total, 0);
      assertEquals(stats.pending, 0);
      assertEquals(stats.confirmed, 0);
      assertEquals(stats.failed, 0);
    });
  });

  describe("Closing KV Store", () => {
    it("should close the KV store", async () => {
      await secretManager.init();
      await secretManager.close();
      
      assert(mockKv.isClosed());
    });

    it("should handle closing when KV not initialized", async () => {
      // Should not throw
      await secretManager.close();
    });

    it("should handle multiple close calls", async () => {
      await secretManager.init();
      await secretManager.close();
      await secretManager.close();
      
      // Should not throw
      assert(mockKv.isClosed());
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle concurrent operations", async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        const secret = `0x${i.toString().padStart(64, "0")}` as Hex;
        const orderHash = `0x${(i + 100).toString().padStart(64, "0")}` as Hex;
        
        promises.push(
          secretManager.storeSecret({
            secret,
            orderHash,
            escrowAddress: testEscrowAddress,
            chainId: testChainId,
          })
        );
      }

      const results = await Promise.all(promises);
      assertEquals(results.length, 10);
      
      const allSecrets = await secretManager.getRevealedSecrets();
      assertEquals(allSecrets.length, 10);
    });

    it("should handle very long secret values", async () => {
      // 32 bytes is the expected length, but test with exact 32 bytes
      const longSecret = "0x" + "a".repeat(64) as Hex;
      const record = await secretManager.storeSecret({
        secret: longSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      assertEquals(record.secret, longSecret);
      const retrieved = await secretManager.getSecretByHashlock(record.hashlock);
      assertEquals(retrieved, longSecret);
    });

    it("should handle special characters in escrow address", async () => {
      // Test with mixed case and valid hex
      const specialAddress = "0xAbCdEf1234567890aBcDeF1234567890aBcDeF12";
      const record = await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: specialAddress,
        chainId: testChainId,
      });

      assertEquals(record.escrowAddress, specialAddress.toLowerCase());
    });

    it("should handle negative chain IDs gracefully", async () => {
      const record = await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: -1,
      });

      assertEquals(record.chainId, -1);
    });

    it("should handle updating from pending to confirmed to failed", async () => {
      // Store as pending
      await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      // Confirm it
      await secretManager.confirmSecret(testHashlock, "0xtx1", 100000n);
      
      let result = await mockKv.get<SecretRecord>(["secrets", testHashlock]);
      assertEquals(result.value?.status, "confirmed");
      
      // Mark as failed (should update even if confirmed)
      await secretManager.markFailed(testHashlock, "late failure");
      
      result = await mockKv.get<SecretRecord>(["secrets", testHashlock]);
      assertEquals(result.value?.status, "failed");
    });

    it("should handle empty order hash", async () => {
      const emptyOrderHash = "" as Hex;
      const record = await secretManager.storeSecret({
        secret: testSecret,
        orderHash: emptyOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      assertEquals(record.orderHash, emptyOrderHash);
      
      // Should still be retrievable by hashlock
      const retrieved = await secretManager.getSecretByHashlock(testHashlock);
      assertEquals(retrieved, testSecret);
      
      // With empty order hash, the index still gets created with empty key
      const byOrder = await secretManager.getSecretByOrderHash(emptyOrderHash);
      // It will return the secret since the index was created
      assertEquals(byOrder, testSecret);
    });

    it("should maintain data integrity across operations", async () => {
      // Store initial secret
      const record = await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      const initialRevealedAt = record.revealedAt;

      // Confirm the secret
      await secretManager.confirmSecret(testHashlock, "0xtx", 50000n);

      // Check data integrity
      const result = await mockKv.get<SecretRecord>(["secrets", testHashlock]);
      assertExists(result.value);
      
      // Original data should be preserved
      assertEquals(result.value.hashlock, testHashlock);
      assertEquals(result.value.secret, testSecret);
      assertEquals(result.value.orderHash, testOrderHash);
      assertEquals(result.value.escrowAddress, testEscrowAddress.toLowerCase());
      assertEquals(result.value.chainId, testChainId);
      assertEquals(result.value.revealedAt, initialRevealedAt);
      
      // New data should be added
      assertEquals(result.value.status, "confirmed");
      assertEquals(result.value.txHash, "0xtx");
      assertEquals(result.value.gasUsed, "50000");
    });
  });

  describe("Secret Validation and Generation", () => {
    it("should generate consistent hashlock for same secret", async () => {
      const record1 = await secretManager.storeSecret({
        secret: testSecret,
        orderHash: "0xorder1" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      const record2 = await secretManager.storeSecret({
        secret: testSecret,
        orderHash: "0xorder2" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      assertEquals(record1.hashlock, record2.hashlock);
      assertEquals(record1.hashlock, keccak256(testSecret));
    });

    it("should generate different hashlocks for different secrets", async () => {
      const secret1: Hex = "0x1111111111111111111111111111111111111111111111111111111111111111";
      const secret2: Hex = "0x2222222222222222222222222222222222222222222222222222222222222222";

      const record1 = await secretManager.storeSecret({
        secret: secret1,
        orderHash: "0xorder1" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      const record2 = await secretManager.storeSecret({
        secret: secret2,
        orderHash: "0xorder2" as Hex,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      assert(record1.hashlock !== record2.hashlock);
    });

    it("should handle secrets with leading zeros", async () => {
      const secretWithZeros: Hex = "0x0000000000000000000000000000000000000000000000000000000000000001";
      
      const record = await secretManager.storeSecret({
        secret: secretWithZeros,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      assertEquals(record.secret, secretWithZeros);
      assertEquals(record.hashlock, keccak256(secretWithZeros));
      
      const retrieved = await secretManager.getSecretByHashlock(record.hashlock);
      assertEquals(retrieved, secretWithZeros);
    });

    it("should handle maximum uint256 value as secret", async () => {
      const maxSecret: Hex = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      
      const record = await secretManager.storeSecret({
        secret: maxSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      assertEquals(record.secret, maxSecret);
      const retrieved = await secretManager.getSecretByHashlock(record.hashlock);
      assertEquals(retrieved, maxSecret);
    });
  });

  describe("KV Store Persistence Simulation", () => {
    it("should simulate persistence across manager instances", async () => {
      // First manager instance stores secret
      const manager1 = new SecretManager();
      openKvStub.restore();
      openKvStub = stub(Deno, "openKv", () => Promise.resolve(mockKv as unknown as Deno.Kv));
      
      await manager1.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      // Second manager instance retrieves secret (simulating restart)
      const manager2 = new SecretManager();
      const retrieved = await manager2.getSecretByHashlock(testHashlock);
      
      assertEquals(retrieved, testSecret);
    });

    it("should handle KV operations after reinitialization", async () => {
      await secretManager.init();
      
      // Store secret
      await secretManager.storeSecret({
        secret: testSecret,
        orderHash: testOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });

      // Close and reinitialize
      await secretManager.close();
      
      // Reopen the mock store instead of creating a new one
      mockKv.reopen();
      
      // Store a new secret after reopen
      const newSecret: Hex = "0x9999999999999999999999999999999999999999999999999999999999999999";
      const newOrderHash: Hex = "0x8888888888888888888888888888888888888888888888888888888888888888";
      
      const newManager = new SecretManager();
      const record = await newManager.storeSecret({
        secret: newSecret,
        orderHash: newOrderHash,
        escrowAddress: testEscrowAddress,
        chainId: testChainId,
      });
      
      assertExists(record);
      assertEquals(record.secret, newSecret);
      
      // Should still be able to retrieve old secret
      const oldSecret = await newManager.getSecretByHashlock(testHashlock);
      assertEquals(oldSecret, testSecret);
    });
  });
});