/**
 * Unit tests for EscrowWithdrawManager
 * Tests all withdraw functionality including destination/source withdrawals,
 * retry logic, monitoring, and error handling
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertObjectMatch,
  spy,
  stub,
  returnsNext,
  assertSpyCall,
  assertSpyCalls,
  delay,
} from "../../setup.ts";
import {
  createMockPublicClient,
  createMockWalletClient,
  createMockTransactionReceipt,
  MockTransactionStore,
  TEST_ACCOUNTS,
  TEST_PRIVATE_KEYS,
} from "../../mocks/viem-mock.ts";
import { TEST_ADDRESSES, TEST_VALUES, TestDataGenerator, MockKVStore } from "../../setup.ts";
import { EscrowWithdrawManager, type EscrowImmutables, type WithdrawParams } from "../../../src/utils/escrow-withdraw.ts";
import { SecretManager, type SecretRecord } from "../../../src/state/SecretManager.ts";
import { PonderClient } from "../../../src/indexer/ponder-client.ts";
import type { Address, Hex, Hash, PublicClient, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Helper functions to create type-safe stubs for viem clients
function stubSimulateContract(client: any, handler: (args?: any) => any) {
  return stub(client, "simulateContract", handler as any);
}

function stubWriteContract(client: any, handler: (args?: any) => any) {
  return stub(client, "writeContract", handler as any);
}

function stubWaitForTransactionReceipt(client: any, handler: (args?: any) => any) {
  return stub(client, "waitForTransactionReceipt", handler as any);
}

// Mock implementations
class MockSecretManager extends SecretManager {
  private secrets: Map<string, SecretRecord> = new Map();
  private secretsByOrder: Map<string, string> = new Map();
  
  constructor() {
    super();
  }

  override async init(): Promise<void> {
    // No-op for testing
  }

  override async storeSecret(params: {
    secret: Hex;
    orderHash: Hex;
    escrowAddress: string;
    chainId: number;
  }): Promise<SecretRecord> {
    const hashlock = `0x${params.secret.slice(2).repeat(2).slice(0, 64)}` as Hex; // Mock hashlock
    const record: SecretRecord = {
      hashlock,
      secret: params.secret,
      orderHash: params.orderHash,
      escrowAddress: params.escrowAddress.toLowerCase(),
      chainId: params.chainId,
      revealedAt: Date.now(),
      status: "pending",
    };
    
    this.secrets.set(hashlock, record);
    this.secretsByOrder.set(params.orderHash, hashlock);
    return record;
  }

  override async getSecretByHashlock(hashlock: string): Promise<string | null> {
    const record = this.secrets.get(hashlock);
    return record?.secret || null;
  }

  override async getSecretByOrderHash(orderHash: string): Promise<string | null> {
    const hashlock = this.secretsByOrder.get(orderHash);
    if (!hashlock) return null;
    return this.getSecretByHashlock(hashlock);
  }

  override async confirmSecret(
    orderHash: string,
    txHash: string,
    gasUsed: bigint,
  ): Promise<void> {
    const hashlock = this.secretsByOrder.get(orderHash);
    if (!hashlock) return;
    
    const record = this.secrets.get(hashlock);
    if (record) {
      record.status = "confirmed";
      record.txHash = txHash;
      record.gasUsed = gasUsed.toString();
    }
  }

  override async markFailed(orderHash: string, error: string): Promise<void> {
    const hashlock = this.secretsByOrder.get(orderHash);
    if (!hashlock) return;
    
    const record = this.secrets.get(hashlock);
    if (record) {
      record.status = "failed";
    }
  }

  override async getPendingSecrets(): Promise<SecretRecord[]> {
    return Array.from(this.secrets.values()).filter(s => s.status === "pending");
  }

  // Helper for tests
  addTestSecret(orderHash: string, secret: string, isRevealed = true, isConfirmed = false): void {
    const hashlock = `0x${secret.slice(2).repeat(2).slice(0, 64)}` as Hex;
    const record: SecretRecord = {
      hashlock: orderHash, // Use orderHash as hashlock for simplicity in tests
      secret,
      orderHash,
      escrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      chainId: TEST_VALUES.CHAIN_A,
      revealedAt: Date.now(),
      status: isConfirmed ? "confirmed" : "pending",
    };
    
    // Add type assertion for isRevealed
    (record as any).isRevealed = isRevealed;
    (record as any).isConfirmed = isConfirmed;
    
    this.secrets.set(orderHash, record);
    this.secretsByOrder.set(orderHash, orderHash);
  }
}

class MockPonderClient extends PonderClient {
  private atomicSwaps: Map<string, any> = new Map();
  private withdrawals: any[] = [];
  private revealedSecrets: any[] = [];

  constructor() {
    super({ url: "http://mock-indexer" });
  }

  override async getAtomicSwapByOrderHash(orderHash: string) {
    return this.atomicSwaps.get(orderHash) || null;
  }

  override async getRecentWithdrawals(limit: number) {
    return this.withdrawals.slice(0, limit);
  }

  override async getRevealedSecrets() {
    return this.revealedSecrets;
  }

  override async getSwapsByHashlock(hashlock: string) {
    const swaps = [];
    for (const swap of this.atomicSwaps.values()) {
      if (swap.hashlock === hashlock) {
        swaps.push(swap);
      }
    }
    return swaps;
  }

  // Helper methods for tests
  addTestSwap(orderHash: string, swap: any): void {
    this.atomicSwaps.set(orderHash, swap);
  }

  addTestWithdrawal(withdrawal: any): void {
    this.withdrawals.push(withdrawal);
  }

  addTestRevealedSecret(secret: any): void {
    this.revealedSecrets.push(secret);
  }
}

// Test suite
Deno.test("EscrowWithdrawManager - Initialization", async (t) => {
  await t.step("should initialize with SecretManager and PonderClient", () => {
    const manager = new EscrowWithdrawManager();
    assertExists(manager);
    // Check that internal dependencies are created (we can't directly access private fields)
    assert(manager instanceof EscrowWithdrawManager);
  });
});

Deno.test("EscrowWithdrawManager - Address Packing", async (t) => {
  await t.step("should correctly pack addresses into uint256", () => {
    const manager = new EscrowWithdrawManager();
    const address = TEST_ADDRESSES.ALICE;
    
    // Access private method through type assertion
    const packed = (manager as any).packAddress(address);
    
    assertEquals(typeof packed, "bigint");
    assertEquals(packed, BigInt(address));
  });

  await t.step("should handle zero address", () => {
    const manager = new EscrowWithdrawManager();
    const zeroAddress = TEST_ADDRESSES.ZERO;
    
    const packed = (manager as any).packAddress(zeroAddress);
    
    assertEquals(packed, 0n);
  });
});

Deno.test("EscrowWithdrawManager - Withdraw from Destination", async (t) => {
  const dataGen = new TestDataGenerator();
  
  await t.step("should successfully withdraw with secret", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    // Replace dependencies
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    const txHash = dataGen.nextHashlock();
    
    // Setup test data
    mockSecretManager.addTestSecret(orderHash, secret);
    mockPonderClient.addTestSwap(orderHash, {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      dstChainId: TEST_VALUES.CHAIN_A,
      dstEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      dstReceiver: TEST_ADDRESSES.BOB,
      srcMaker: TEST_ADDRESSES.ALICE,
      dstToken: TEST_ADDRESSES.BMN_TOKEN,
      dstAmount: TEST_VALUES.ONE_TOKEN.toString(),
      dstSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const store = new MockTransactionStore();
    const publicClient = createMockPublicClient({ store });
    const walletClient = createMockWalletClient({ account: TEST_ACCOUNTS.ALICE, store });
    
    // Mock successful simulation and transaction
    const simulateStub = stubSimulateContract(publicClient, () => 
      Promise.resolve({ result: true, request: {} })
    );
    
    const writeStub = stubWriteContract(walletClient, () => 
      Promise.resolve(txHash as Hash)
    );
    
    const waitStub = stubWaitForTransactionReceipt(publicClient, () =>
      Promise.resolve(createMockTransactionReceipt({
        transactionHash: txHash as Hash,
        status: "success",
        gasUsed: 100000n,
      }))
    );
    
    const result = await manager.withdrawFromDestination(
      orderHash,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.ALICE,
    );
    
    assert(result.success);
    assertEquals(result.txHash, txHash);
    assertSpyCalls(simulateStub, 1);
    assertSpyCalls(writeStub, 1);
    assertSpyCalls(waitStub, 1);
  });

  await t.step("should handle missing secret", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    // Don't add secret to mockSecretManager
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    const result = await manager.withdrawFromDestination(
      orderHash,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.ALICE,
    );
    
    assert(!result.success);
    assertExists(result.error);
    assert(result.error!.includes("No secret found"));
  });

  await t.step("should handle missing swap details", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    
    mockSecretManager.addTestSecret(orderHash, secret);
    // Don't add swap to mockPonderClient
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    const result = await manager.withdrawFromDestination(
      orderHash,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.ALICE,
    );
    
    assert(!result.success);
    assertExists(result.error);
    assert(result.error!.includes("No destination escrow found"));
  });

  await t.step("should generate EIP-712 signature correctly", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    const chainId = TEST_VALUES.CHAIN_A;
    const escrowAddress = TEST_ADDRESSES.ESCROW_FACTORY;
    
    mockSecretManager.addTestSecret(orderHash, secret);
    mockPonderClient.addTestSwap(orderHash, {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      dstChainId: chainId,
      dstEscrowAddress: escrowAddress,
      dstReceiver: TEST_ADDRESSES.BOB,
      srcMaker: TEST_ADDRESSES.ALICE,
      dstToken: TEST_ADDRESSES.BMN_TOKEN,
      dstAmount: TEST_VALUES.ONE_TOKEN.toString(),
      dstSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient({ account: TEST_ACCOUNTS.ALICE });
    
    let capturedSignature: any;
    const signStub = stub(walletClient, "signTypedData", (args: any) => {
      capturedSignature = args;
      return Promise.resolve(`0x${"1".repeat(130)}` as Hex);
    });
    
    await manager.withdrawFromDestination(
      orderHash,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.ALICE,
    );
    
    assertSpyCalls(signStub, 1);
    assertExists(capturedSignature);
    assertEquals(capturedSignature.domain.name, "BMN-Escrow");
    assertEquals(capturedSignature.domain.version, "2.3");
    assertEquals(capturedSignature.domain.chainId, chainId);
    assertEquals(capturedSignature.domain.verifyingContract, escrowAddress);
    assertEquals(capturedSignature.message.orderHash, orderHash);
    assertEquals(capturedSignature.message.action, "DST_PUBLIC_WITHDRAW");
  });

  await t.step("should store confirmation in SecretManager", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    const txHash = dataGen.nextHashlock();
    const gasUsed = 100000n;
    
    mockSecretManager.addTestSecret(orderHash, secret);
    mockPonderClient.addTestSwap(orderHash, {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      dstChainId: TEST_VALUES.CHAIN_A,
      dstEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      dstReceiver: TEST_ADDRESSES.BOB,
      srcMaker: TEST_ADDRESSES.ALICE,
      dstToken: TEST_ADDRESSES.BMN_TOKEN,
      dstAmount: TEST_VALUES.ONE_TOKEN.toString(),
      dstSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const confirmSpy = spy(mockSecretManager, "confirmSecret");
    
    const store = new MockTransactionStore();
    const publicClient = createMockPublicClient({ store });
    const walletClient = createMockWalletClient({ account: TEST_ACCOUNTS.ALICE, store });
    
    stubSimulateContract(publicClient, () => 
      Promise.resolve({ result: true, request: {} })
    );
    
    stubWriteContract(walletClient, () => 
      Promise.resolve(txHash as Hash)
    );
    
    stubWaitForTransactionReceipt(publicClient, () =>
      Promise.resolve(createMockTransactionReceipt({
        transactionHash: txHash as Hash,
        status: "success",
        gasUsed,
      }))
    );
    
    await manager.withdrawFromDestination(
      orderHash,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.ALICE,
    );
    
    assertSpyCalls(confirmSpy, 1);
    assertSpyCall(confirmSpy, 0, {
      args: [orderHash, txHash, gasUsed],
    });
  });
});

Deno.test("EscrowWithdrawManager - Withdraw from Source", async (t) => {
  const dataGen = new TestDataGenerator();
  
  await t.step("should successfully withdraw with revealed secret", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    const txHash = dataGen.nextHashlock();
    
    mockPonderClient.addTestSwap(orderHash, {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: TEST_VALUES.ONE_TOKEN.toString(),
      srcSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const store = new MockTransactionStore();
    const publicClient = createMockPublicClient({ store });
    const walletClient = createMockWalletClient({ account: TEST_ACCOUNTS.BOB, store });
    
    const simulateStub = stubSimulateContract(publicClient, () => 
      Promise.resolve({ result: true, request: {} })
    );
    
    const writeStub = stubWriteContract(walletClient, () => 
      Promise.resolve(txHash as Hash)
    );
    
    const waitStub = stubWaitForTransactionReceipt(publicClient, () =>
      Promise.resolve(createMockTransactionReceipt({
        transactionHash: txHash as Hash,
        status: "success",
        gasUsed: 100000n,
      }))
    );
    
    const result = await manager.withdrawFromSource(
      orderHash,
      secret,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
    );
    
    assert(result.success);
    assertEquals(result.txHash, txHash);
    assertSpyCalls(simulateStub, 1);
    assertSpyCalls(writeStub, 1);
    assertSpyCalls(waitStub, 1);
  });

  await t.step("should handle missing source escrow", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    // Don't add swap to mockPonderClient
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    const result = await manager.withdrawFromSource(
      orderHash,
      secret,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
    );
    
    assert(!result.success);
    assertExists(result.error);
    assert(result.error!.includes("No source escrow found"));
  });

  await t.step("should handle transaction failure", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    const txHash = dataGen.nextHashlock();
    
    mockPonderClient.addTestSwap(orderHash, {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: TEST_VALUES.ONE_TOKEN.toString(),
      srcSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const store = new MockTransactionStore();
    const publicClient = createMockPublicClient({ store });
    const walletClient = createMockWalletClient({ account: TEST_ACCOUNTS.BOB, store });
    
    stubSimulateContract(publicClient, () => 
      Promise.resolve({ result: true, request: {} })
    );
    
    stubWriteContract(walletClient, () => 
      Promise.resolve(txHash as Hash)
    );
    
    stubWaitForTransactionReceipt(publicClient, () =>
      Promise.resolve(createMockTransactionReceipt({
        transactionHash: txHash as Hash,
        status: "reverted",
        gasUsed: 100000n,
      }))
    );
    
    const result = await manager.withdrawFromSource(
      orderHash,
      secret,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
    );
    
    assert(!result.success);
    assertExists(result.error);
    assert(result.error!.includes("Transaction failed"));
  });
});

Deno.test("EscrowWithdrawManager - Retry Logic", async (t) => {
  const dataGen = new TestDataGenerator();
  
  await t.step("should retry with exponential backoff", async () => {
    const manager = new EscrowWithdrawManager();
    
    const params: WithdrawParams = {
      escrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      secret: TEST_VALUES.TEST_SECRET,
      immutables: {
        orderHash: dataGen.nextOrderHash(),
        hashlock: TEST_VALUES.TEST_HASHLOCK,
        maker: BigInt(TEST_ADDRESSES.ALICE),
        taker: BigInt(TEST_ADDRESSES.BOB),
        token: BigInt(TEST_ADDRESSES.BMN_TOKEN),
        amount: TEST_VALUES.ONE_TOKEN,
        safetyDeposit: 0n,
        timelocks: 3600n,
      },
      isSource: true,
    };
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    let attemptCount = 0;
    const simulateStub = stubSimulateContract(publicClient, () => {
      attemptCount++;
      if (attemptCount < 3) {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({ result: true, request: {} });
    });
    
    stubWriteContract(walletClient, () => 
      Promise.resolve(dataGen.nextHashlock() as Hash)
    );
    
    stubWaitForTransactionReceipt(publicClient, () =>
      Promise.resolve(createMockTransactionReceipt({
        status: "success",
      }))
    );
    
    const startTime = Date.now();
    const result = await manager.withdrawWithRetry(
      params,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
      3,
    );
    const duration = Date.now() - startTime;
    
    assert(result.success);
    assertEquals(attemptCount, 3);
    // Should have delays: 2s + 4s = 6s minimum
    assert(duration >= 6000);
    assertSpyCalls(simulateStub, 3);
  });

  await t.step("should stop on max retry limit", async () => {
    const manager = new EscrowWithdrawManager();
    
    const params: WithdrawParams = {
      escrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      secret: TEST_VALUES.TEST_SECRET,
      immutables: {
        orderHash: dataGen.nextOrderHash(),
        hashlock: TEST_VALUES.TEST_HASHLOCK,
        maker: BigInt(TEST_ADDRESSES.ALICE),
        taker: BigInt(TEST_ADDRESSES.BOB),
        token: BigInt(TEST_ADDRESSES.BMN_TOKEN),
        amount: TEST_VALUES.ONE_TOKEN,
        safetyDeposit: 0n,
        timelocks: 3600n,
      },
      isSource: true,
    };
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    const simulateStub = stubSimulateContract(publicClient, () => {
      return Promise.reject(new Error("Network error"));
    });
    
    const result = await manager.withdrawWithRetry(
      params,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
      2,
    );
    
    assert(!result.success);
    assertExists(result.error);
    assert(result.error!.includes("Failed after 2 attempts"));
    assertSpyCalls(simulateStub, 2);
  });

  await t.step("should not retry on InvalidSecret error", async () => {
    const manager = new EscrowWithdrawManager();
    
    const params: WithdrawParams = {
      escrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      secret: TEST_VALUES.TEST_SECRET,
      immutables: {
        orderHash: dataGen.nextOrderHash(),
        hashlock: TEST_VALUES.TEST_HASHLOCK,
        maker: BigInt(TEST_ADDRESSES.ALICE),
        taker: BigInt(TEST_ADDRESSES.BOB),
        token: BigInt(TEST_ADDRESSES.BMN_TOKEN),
        amount: TEST_VALUES.ONE_TOKEN,
        safetyDeposit: 0n,
        timelocks: 3600n,
      },
      isSource: true,
    };
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    const simulateStub = stubSimulateContract(publicClient, () => {
      return Promise.reject(new Error("InvalidSecret: Wrong secret provided"));
    });
    
    const result = await manager.withdrawWithRetry(
      params,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
      3,
    );
    
    assert(!result.success);
    assertExists(result.error);
    assert(result.error!.includes("InvalidSecret"));
    assertSpyCalls(simulateStub, 1); // Should only try once
  });

  await t.step("should not retry on InvalidTime error", async () => {
    const manager = new EscrowWithdrawManager();
    
    const params: WithdrawParams = {
      escrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      secret: TEST_VALUES.TEST_SECRET,
      immutables: {
        orderHash: dataGen.nextOrderHash(),
        hashlock: TEST_VALUES.TEST_HASHLOCK,
        maker: BigInt(TEST_ADDRESSES.ALICE),
        taker: BigInt(TEST_ADDRESSES.BOB),
        token: BigInt(TEST_ADDRESSES.BMN_TOKEN),
        amount: TEST_VALUES.ONE_TOKEN,
        safetyDeposit: 0n,
        timelocks: 3600n,
      },
      isSource: true,
    };
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    const simulateStub = stubSimulateContract(publicClient, () => {
      return Promise.reject(new Error("InvalidTime: Timelock not expired"));
    });
    
    const result = await manager.withdrawWithRetry(
      params,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
      3,
    );
    
    assert(!result.success);
    assertExists(result.error);
    assert(result.error!.includes("InvalidTime"));
    assertSpyCalls(simulateStub, 1); // Should only try once
  });

  await t.step("should not retry on InvalidCaller error", async () => {
    const manager = new EscrowWithdrawManager();
    
    const params: WithdrawParams = {
      escrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      secret: TEST_VALUES.TEST_SECRET,
      immutables: {
        orderHash: dataGen.nextOrderHash(),
        hashlock: TEST_VALUES.TEST_HASHLOCK,
        maker: BigInt(TEST_ADDRESSES.ALICE),
        taker: BigInt(TEST_ADDRESSES.BOB),
        token: BigInt(TEST_ADDRESSES.BMN_TOKEN),
        amount: TEST_VALUES.ONE_TOKEN,
        safetyDeposit: 0n,
        timelocks: 3600n,
      },
      isSource: true,
    };
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    const simulateStub = stubSimulateContract(publicClient, () => {
      return Promise.reject(new Error("InvalidCaller: Not authorized"));
    });
    
    const result = await manager.withdrawWithRetry(
      params,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
      3,
    );
    
    assert(!result.success);
    assertExists(result.error);
    assert(result.error!.includes("InvalidCaller"));
    assertSpyCalls(simulateStub, 1); // Should only try once
  });
});

Deno.test("EscrowWithdrawManager - Get Withdrawable Escrows", async (t) => {
  const dataGen = new TestDataGenerator();
  
  await t.step("should find escrows with revealed secrets", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    const hashlock1 = dataGen.nextHashlock();
    const hashlock2 = dataGen.nextHashlock();
    const secret1 = TEST_VALUES.TEST_SECRET;
    const secret2 = dataGen.nextHashlock();
    
    // Add recent withdrawals with secrets
    mockPonderClient.addTestWithdrawal({
      hashlock: hashlock1,
      secret: secret1,
    });
    
    // Add revealed secrets
    mockPonderClient.addTestRevealedSecret({
      hashlock: hashlock2,
      secret: secret2,
    });
    
    // Add swaps for these hashlocks
    mockPonderClient.addTestSwap("swap1", {
      hashlock: hashlock1,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      status: "pending",
      srcWithdrawnAt: null,
    });
    
    mockPonderClient.addTestSwap("swap2", {
      hashlock: hashlock2,
      dstChainId: TEST_VALUES.CHAIN_B,
      dstEscrowAddress: TEST_ADDRESSES.BMN_TOKEN,
      status: "pending",
      dstWithdrawnAt: null,
    });
    
    const escrows = await manager.getWithdrawableEscrows();
    
    assertEquals(escrows.length, 2);
    assert(escrows.some(e => e.hashlock === hashlock1 && e.isSource));
    assert(escrows.some(e => e.hashlock === hashlock2 && !e.isSource));
  });

  await t.step("should combine multiple secret sources", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    const hashlock = dataGen.nextHashlock();
    const secret = TEST_VALUES.TEST_SECRET;
    
    // Add same secret from both sources
    mockPonderClient.addTestWithdrawal({
      hashlock,
      secret,
    });
    
    mockPonderClient.addTestRevealedSecret({
      hashlock,
      secret,
    });
    
    // Add swap for this hashlock
    mockPonderClient.addTestSwap("swap1", {
      hashlock,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      status: "pending",
      srcWithdrawnAt: null,
    });
    
    const escrows = await manager.getWithdrawableEscrows();
    
    assertEquals(escrows.length, 1);
    assertEquals(escrows[0].hashlock, hashlock);
    assertEquals(escrows[0].secret, secret);
  });

  await t.step("should filter already withdrawn escrows", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    const hashlock = dataGen.nextHashlock();
    const secret = TEST_VALUES.TEST_SECRET;
    
    mockPonderClient.addTestRevealedSecret({
      hashlock,
      secret,
    });
    
    // Add swap that's already withdrawn
    mockPonderClient.addTestSwap("swap1", {
      hashlock,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      status: "completed",
      srcWithdrawnAt: Date.now(),
    });
    
    const escrows = await manager.getWithdrawableEscrows();
    
    assertEquals(escrows.length, 0);
  });

  await t.step("should handle errors gracefully", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    // Override method to throw error
    stub(mockPonderClient, "getRecentWithdrawals", () => {
      throw new Error("Network error");
    });
    
    const escrows = await manager.getWithdrawableEscrows();
    
    assertEquals(escrows.length, 0); // Should return empty array on error
  });
});

Deno.test("EscrowWithdrawManager - Generic Withdraw Method", async (t) => {
  const dataGen = new TestDataGenerator();
  
  await t.step("should select source withdrawal when isSource is true", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    // Set environment variables for test
    Deno.env.set("ANKR_API_KEY", "test-key");
    Deno.env.set("RESOLVER_PRIVATE_KEY", TEST_PRIVATE_KEYS.RESOLVER);
    
    const hashlock = dataGen.nextHashlock();
    
    mockPonderClient.addTestSwap(hashlock, {
      orderHash: hashlock,
      hashlock,
      srcChainId: 8453, // base.id
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: TEST_VALUES.ONE_TOKEN.toString(),
      srcSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const withdrawFromSourceSpy = spy(manager, "withdrawFromSource");
    
    await manager.withdraw({
      address: TEST_ADDRESSES.ESCROW_FACTORY,
      hashlock,
      secret: TEST_VALUES.TEST_SECRET,
      chainId: 8453,
      isSource: true,
    });
    
    assertSpyCalls(withdrawFromSourceSpy, 1);
    
    // Cleanup
    Deno.env.delete("ANKR_API_KEY");
    Deno.env.delete("RESOLVER_PRIVATE_KEY");
  });

  await t.step("should select destination withdrawal when isSource is false", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    // Set environment variables for test
    Deno.env.set("ANKR_API_KEY", "test-key");
    Deno.env.set("ALICE_PRIVATE_KEY", TEST_PRIVATE_KEYS.ALICE);
    
    const hashlock = dataGen.nextHashlock();
    
    mockSecretManager.addTestSecret(hashlock, TEST_VALUES.TEST_SECRET);
    mockPonderClient.addTestSwap(hashlock, {
      orderHash: hashlock,
      hashlock,
      dstChainId: 10, // optimism.id
      dstEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      dstReceiver: TEST_ADDRESSES.BOB,
      srcMaker: TEST_ADDRESSES.ALICE,
      dstToken: TEST_ADDRESSES.BMN_TOKEN,
      dstAmount: TEST_VALUES.ONE_TOKEN.toString(),
      dstSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const withdrawFromDestinationSpy = spy(manager, "withdrawFromDestination");
    
    await manager.withdraw({
      address: TEST_ADDRESSES.ESCROW_FACTORY,
      hashlock,
      secret: TEST_VALUES.TEST_SECRET,
      chainId: 10,
      isSource: false,
    });
    
    assertSpyCalls(withdrawFromDestinationSpy, 1);
    
    // Cleanup
    Deno.env.delete("ANKR_API_KEY");
    Deno.env.delete("ALICE_PRIVATE_KEY");
  });

  await t.step("should handle missing private key", async () => {
    const manager = new EscrowWithdrawManager();
    
    // Ensure no private keys are set
    Deno.env.delete("RESOLVER_PRIVATE_KEY");
    Deno.env.delete("ALICE_PRIVATE_KEY");
    
    const result = await manager.withdraw({
      address: TEST_ADDRESSES.ESCROW_FACTORY,
      hashlock: dataGen.nextHashlock(),
      secret: TEST_VALUES.TEST_SECRET,
      chainId: 8453,
      isSource: true,
    });
    
    assert(!result);
  });

  await t.step("should handle chain-specific client creation", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    // Set environment variables for test
    Deno.env.set("ANKR_API_KEY", "test-key");
    Deno.env.set("RESOLVER_PRIVATE_KEY", TEST_PRIVATE_KEYS.RESOLVER);
    
    const hashlock = dataGen.nextHashlock();
    
    mockPonderClient.addTestSwap(hashlock, {
      orderHash: hashlock,
      hashlock,
      srcChainId: 8453, // base.id
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: TEST_VALUES.ONE_TOKEN.toString(),
      srcSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const result = await manager.withdraw({
      address: TEST_ADDRESSES.ESCROW_FACTORY,
      hashlock,
      secret: TEST_VALUES.TEST_SECRET,
      chainId: 8453, // Base chain
      isSource: true,
    });
    
    assertExists(result);
    
    // Cleanup
    Deno.env.delete("ANKR_API_KEY");
    Deno.env.delete("RESOLVER_PRIVATE_KEY");
  });
});

Deno.test("EscrowWithdrawManager - Monitor and Auto-Withdraw", async (t) => {
  await t.step("should poll for pending secrets", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = TEST_VALUES.TEST_HASHLOCK;
    const secret = TEST_VALUES.TEST_SECRET;
    
    // Add a pending secret
    mockSecretManager.addTestSecret(orderHash, secret, true, false);
    
    // Add swap data
    mockPonderClient.addTestSwap(orderHash, {
      orderHash,
      hashlock: orderHash,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: TEST_VALUES.ONE_TOKEN.toString(),
      srcSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    const getPendingSecretsSpy = spy(mockSecretManager, "getPendingSecrets");
    const withdrawFromSourceSpy = spy(manager, "withdrawFromSource");
    
    // Run monitor for a short time
    const controller = new AbortController();
    const monitorPromise = manager.monitorAndWithdraw(
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
      100, // 100ms polling interval
      controller.signal,
    );
    
    // Wait for a few polling cycles
    await delay(350);
    controller.abort();
    
    // Monitor runs indefinitely, so we can't await it
    // Just check that it's polling
    assert(getPendingSecretsSpy.calls.length >= 3);
    // Allow extra cycles due to scheduling; ensure at least 3 attempts
    assert(withdrawFromSourceSpy.calls.length >= 3);
  });

  await t.step("should trigger automatic withdrawal for revealed secrets", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = TEST_VALUES.TEST_HASHLOCK;
    const secret = TEST_VALUES.TEST_SECRET;
    const txHash = TEST_VALUES.TEST_HASHLOCK;
    
    // Add a pending secret that's revealed but not confirmed
    mockSecretManager.addTestSecret(orderHash, secret, true, false);
    
    // Add swap data
    mockPonderClient.addTestSwap(orderHash, {
      orderHash,
      hashlock: orderHash,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: TEST_VALUES.ONE_TOKEN.toString(),
      srcSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const store = new MockTransactionStore();
    const publicClient = createMockPublicClient({ store });
    const walletClient = createMockWalletClient({ account: TEST_ACCOUNTS.BOB, store });
    
    stubSimulateContract(publicClient, () => 
      Promise.resolve({ result: true, request: {} })
    );
    
    stubWriteContract(walletClient, () => 
      Promise.resolve(txHash as Hash)
    );
    
    const controller = new AbortController();
    stubWaitForTransactionReceipt(publicClient, () => {
      // Abort monitor immediately after first successful receipt
      controller.abort();
      return Promise.resolve(createMockTransactionReceipt({
        transactionHash: txHash as Hash,
        status: "success",
        gasUsed: 100000n,
      }));
    });
    
    const withdrawFromSourceSpy = spy(manager, "withdrawFromSource");
    
    // Run monitor for a short time
    const monitorPromise = manager.monitorAndWithdraw(
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
      100, // 100ms polling interval
      controller.signal,
    );
    
    // Wait for a polling cycle
    await delay(150);
    
    assertSpyCalls(withdrawFromSourceSpy, 1);
  });

  await t.step("should handle errors in monitor loop", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    // Make getPendingSecrets throw an error
    stub(mockSecretManager, "getPendingSecrets", () => {
      throw new Error("Database error");
    });
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    // Run monitor for a short time - should not crash
    const controller = new AbortController();
    const monitorPromise = manager.monitorAndWithdraw(
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
      100,
      controller.signal,
    );
    
    // Wait for a few polling cycles
    await delay(350);
    controller.abort();
    
    // Should continue running despite errors
    assert(true); // If we get here, monitor didn't crash
  });

  await t.step("should skip non-revealed secrets", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = TEST_VALUES.TEST_HASHLOCK;
    const secret = TEST_VALUES.TEST_SECRET;
    
    // Add a pending secret that's not revealed
    mockSecretManager.addTestSecret(orderHash, secret, false, false);
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    const withdrawFromSourceSpy = spy(manager, "withdrawFromSource");
    
    // Run monitor for a short time
    const controller = new AbortController();
    const monitorPromise = manager.monitorAndWithdraw(
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
      100,
      controller.signal,
    );
    
    // Wait for a polling cycle
    await delay(150);
    controller.abort();
    
    assertSpyCalls(withdrawFromSourceSpy, 0); // Should not attempt withdrawal
  });

  await t.step("should skip already confirmed secrets", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = TEST_VALUES.TEST_HASHLOCK;
    const secret = TEST_VALUES.TEST_SECRET;
    
    // Add a secret that's already confirmed
    mockSecretManager.addTestSecret(orderHash, secret, true, true);
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    const withdrawFromSourceSpy = spy(manager, "withdrawFromSource");
    
    // Run monitor for a short time
    const controller = new AbortController();
    const monitorPromise = manager.monitorAndWithdraw(
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
      100,
      controller.signal,
    );
    
    // Wait for a polling cycle
    await delay(150);
    controller.abort();
    
    assertSpyCalls(withdrawFromSourceSpy, 0); // Should not attempt withdrawal
  });
});

Deno.test("EscrowWithdrawManager - Error Scenarios", async (t) => {
  const dataGen = new TestDataGenerator();
  
  await t.step("should handle simulation failure", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    
    mockPonderClient.addTestSwap(orderHash, {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: TEST_VALUES.ONE_TOKEN.toString(),
      srcSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    stubSimulateContract(publicClient, () => {
      throw new Error("Simulation failed: Insufficient balance");
    });
    
    const result = await manager.withdrawFromSource(
      orderHash,
      secret,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
    );
    
    assert(!result.success);
    assertExists(result.error);
    assert(result.error!.includes("Simulation failed"));
  });

  await t.step("should handle write contract failure", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    
    mockPonderClient.addTestSwap(orderHash, {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: TEST_VALUES.ONE_TOKEN.toString(),
      srcSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    stubSimulateContract(publicClient, () => 
      Promise.resolve({ result: true, request: {} })
    );
    
    stubWriteContract(walletClient, () => {
      throw new Error("User rejected transaction");
    });
    
    const result = await manager.withdrawFromSource(
      orderHash,
      secret,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
    );
    
    assert(!result.success);
    assertExists(result.error);
    assert(result.error!.includes("User rejected"));
  });

  await t.step("should handle transaction timeout", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    const txHash = dataGen.nextHashlock();
    
    mockPonderClient.addTestSwap(orderHash, {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: TEST_VALUES.ONE_TOKEN.toString(),
      srcSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    stubSimulateContract(publicClient, () => 
      Promise.resolve({ result: true, request: {} })
    );
    
    stubWriteContract(walletClient, () => 
      Promise.resolve(txHash as Hash)
    );
    
    stubWaitForTransactionReceipt(publicClient, () => {
      throw new Error("Transaction timeout");
    });
    
    const result = await manager.withdrawFromSource(
      orderHash,
      secret,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
    );
    
    assert(!result.success);
    assertExists(result.error);
    assert(result.error!.includes("Transaction timeout"));
  });

  await t.step("should mark destination withdrawal as failed on error", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    
    mockSecretManager.addTestSecret(orderHash, secret);
    mockPonderClient.addTestSwap(orderHash, {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      dstChainId: TEST_VALUES.CHAIN_A,
      dstEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      dstReceiver: TEST_ADDRESSES.BOB,
      srcMaker: TEST_ADDRESSES.ALICE,
      dstToken: TEST_ADDRESSES.BMN_TOKEN,
      dstAmount: TEST_VALUES.ONE_TOKEN.toString(),
      dstSafetyDeposit: "0",
      timelocks: "3600",
    });
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    stubSimulateContract(publicClient, () => {
      throw new Error("Contract error");
    });
    
    const markFailedSpy = spy(mockSecretManager, "markFailed");
    
    await manager.withdrawFromDestination(
      orderHash,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.ALICE,
    );
    
    assertSpyCalls(markFailedSpy, 1);
    assertSpyCall(markFailedSpy, 0, {
      args: [orderHash, "Contract error"],
    });
  });
});

Deno.test("EscrowWithdrawManager - Immutables Construction", async (t) => {
  const dataGen = new TestDataGenerator();
  
  await t.step("should correctly construct immutables for destination escrow", async () => {
    const manager = new EscrowWithdrawManager();
    const mockSecretManager = new MockSecretManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).secretManager = mockSecretManager;
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    const swap = {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      dstChainId: TEST_VALUES.CHAIN_A,
      dstEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      dstReceiver: TEST_ADDRESSES.BOB,
      srcMaker: TEST_ADDRESSES.ALICE,
      dstToken: TEST_ADDRESSES.BMN_TOKEN,
      dstAmount: TEST_VALUES.ONE_TOKEN.toString(),
      dstSafetyDeposit: TEST_VALUES.TEN_TOKENS.toString(),
      timelocks: "7200",
    };
    
    mockSecretManager.addTestSecret(orderHash, secret);
    mockPonderClient.addTestSwap(orderHash, swap);
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    let capturedImmutables: any;
    stubSimulateContract(publicClient, (args: any) => {
      capturedImmutables = args.args[1]; // Second argument is immutables
      return Promise.resolve({ result: true, request: {} });
    });
    
    await manager.withdrawFromDestination(
      orderHash,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.ALICE,
    );
    
    assertExists(capturedImmutables);
    assertEquals(capturedImmutables.orderHash, orderHash);
    assertEquals(capturedImmutables.hashlock, swap.hashlock);
    assertEquals(capturedImmutables.maker, BigInt(swap.dstReceiver));
    assertEquals(capturedImmutables.taker, BigInt(swap.srcMaker));
    assertEquals(capturedImmutables.token, BigInt(swap.dstToken));
    assertEquals(capturedImmutables.amount, BigInt(swap.dstAmount));
    assertEquals(capturedImmutables.safetyDeposit, BigInt(swap.dstSafetyDeposit));
    assertEquals(capturedImmutables.timelocks, BigInt(swap.timelocks));
  });

  await t.step("should correctly construct immutables for source escrow", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    const swap = {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: TEST_VALUES.HUNDRED_TOKENS.toString(),
      srcSafetyDeposit: TEST_VALUES.ONE_TOKEN.toString(),
      timelocks: "1800",
    };
    
    mockPonderClient.addTestSwap(orderHash, swap);
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    let capturedImmutables: any;
    stubSimulateContract(publicClient, (args: any) => {
      capturedImmutables = args.args[1]; // Second argument is immutables
      return Promise.resolve({ result: true, request: {} });
    });
    
    await manager.withdrawFromSource(
      orderHash,
      secret,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
    );
    
    assertExists(capturedImmutables);
    assertEquals(capturedImmutables.orderHash, orderHash);
    assertEquals(capturedImmutables.hashlock, swap.hashlock);
    assertEquals(capturedImmutables.maker, BigInt(swap.srcMaker));
    assertEquals(capturedImmutables.taker, BigInt(swap.srcTaker));
    assertEquals(capturedImmutables.token, BigInt(swap.srcToken));
    assertEquals(capturedImmutables.amount, BigInt(swap.srcAmount));
    assertEquals(capturedImmutables.safetyDeposit, BigInt(swap.srcSafetyDeposit));
    assertEquals(capturedImmutables.timelocks, BigInt(swap.timelocks));
  });

  await t.step("should handle missing safety deposit", async () => {
    const manager = new EscrowWithdrawManager();
    const mockPonderClient = new MockPonderClient();
    
    (manager as any).ponderClient = mockPonderClient;
    
    const orderHash = dataGen.nextOrderHash();
    const secret = TEST_VALUES.TEST_SECRET;
    const swap = {
      orderHash,
      hashlock: TEST_VALUES.TEST_HASHLOCK,
      srcChainId: TEST_VALUES.CHAIN_A,
      srcEscrowAddress: TEST_ADDRESSES.ESCROW_FACTORY,
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: TEST_VALUES.ONE_TOKEN.toString(),
      srcSafetyDeposit: null, // Missing safety deposit
      timelocks: "3600",
    };
    
    mockPonderClient.addTestSwap(orderHash, swap);
    
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    
    let capturedImmutables: any;
    stubSimulateContract(publicClient, (args: any) => {
      capturedImmutables = args.args[1];
      return Promise.resolve({ result: true, request: {} });
    });
    
    await manager.withdrawFromSource(
      orderHash,
      secret,
      publicClient,
      walletClient,
      TEST_ACCOUNTS.BOB,
    );
    
    assertExists(capturedImmutables);
    assertEquals(capturedImmutables.safetyDeposit, 0n); // Should default to 0
  });
});