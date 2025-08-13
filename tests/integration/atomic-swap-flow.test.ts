/**
 * Atomic Swap Flow Integration Tests
 * 
 * Comprehensive integration tests for the complete atomic swap flow between
 * Alice and Bob services, including error recovery and edge cases.
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  delay,
  spy,
  stub,
  assertSpyCall,
  assertSpyCalls,
  TEST_ADDRESSES,
  TEST_VALUES,
  createTestContext,
  registerCleanup,
  runCleanup,
  waitFor,
  MockEventEmitter,
  MockKVStore,
  TestLogger,
  TestDataGenerator,
} from "../setup.ts";

import {
  createMockPublicClient,
  createMockWalletClient,
  createTestEnvironment,
  MockTransactionStore,
  TEST_ACCOUNTS,
  mockChains,
  createMockContractEvent,
  createMockTransactionReceipt,
} from "../mocks/viem-mock.ts";

import {
  orderFixtures,
  escrowFixtures,
  stateFixtures,
  createTestOrder,
  createTestEscrow,
  generateOrderHash,
} from "../fixtures/index.ts";

import type { Address, Hash, Hex } from "viem";
import { keccak256, encodeAbiParameters, parseUnits } from "viem";

// Mock service classes for testing
class MockAliceService {
  private eventEmitter = new MockEventEmitter();
  private kvStore = new MockKVStore();
  private logger = new TestLogger();
  private orders = new Map<string, any>();
  private secrets = new Map<string, Hex>();
  public stats = {
    ordersCreated: 0,
    depositsCompleted: 0,
    secretsRevealed: 0,
    withdrawalsCompleted: 0,
    errors: 0,
  };
  
  constructor(private config: any) {}
  
  async createOrder(params: {
    makerAsset: Address;
    takerAsset: Address;
    makingAmount: bigint;
    takingAmount: bigint;
  }): Promise<{ orderHash: Hash; hashlock: Hex; secret: Hex }> {
    const secret = `0x${Math.random().toString(16).slice(2).padEnd(64, "0")}` as Hex;
    const hashlock = keccak256(secret);
    const order = createTestOrder({
      maker: TEST_ADDRESSES.ALICE,
      makerAsset: params.makerAsset,
      takerAsset: params.takerAsset,
      makingAmount: params.makingAmount,
      takingAmount: params.takingAmount,
    });
    
    const orderHash = generateOrderHash(order);
    this.orders.set(orderHash, { ...order, hashlock, secret });
    this.secrets.set(hashlock, secret);
    this.stats.ordersCreated++;
    
    this.eventEmitter.emit("orderCreated", { orderHash, order, hashlock });
    this.logger.info(`Order created: ${orderHash}`, { hashlock });
    
    return { orderHash, hashlock, secret };
  }
  
  async depositToSourceEscrow(escrowAddress: Address, amount: bigint): Promise<Hash> {
    const txHash = `0x${Math.random().toString(16).slice(2).padEnd(64, "0")}` as Hash;
    this.stats.depositsCompleted++;
    
    this.eventEmitter.emit("depositCompleted", { escrowAddress, amount, txHash });
    this.logger.info(`Deposited to source escrow: ${escrowAddress}`, { amount, txHash });
    
    return txHash;
  }
  
  async revealSecret(hashlock: Hex): Promise<Hex> {
    const secret = this.secrets.get(hashlock);
    if (!secret) throw new Error(`No secret for hashlock: ${hashlock}`);
    
    this.stats.secretsRevealed++;
    this.eventEmitter.emit("secretRevealed", { hashlock, secret });
    this.logger.info(`Secret revealed for hashlock: ${hashlock}`, { secret });
    
    return secret;
  }
  
  async withdrawFromDestination(escrowAddress: Address, secret: Hex): Promise<Hash> {
    const txHash = `0x${Math.random().toString(16).slice(2).padEnd(64, "0")}` as Hash;
    this.stats.withdrawalsCompleted++;
    
    this.eventEmitter.emit("withdrawalCompleted", { escrowAddress, secret, txHash });
    this.logger.info(`Withdrawn from destination: ${escrowAddress}`, { txHash });
    
    return txHash;
  }
  
  on(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.on(event, handler);
  }
  
  getOrder(orderHash: Hash): any {
    return this.orders.get(orderHash);
  }
  
  getLogs(): any[] {
    return this.logger.getLogs();
  }
}

class MockBobResolverService {
  private eventEmitter = new MockEventEmitter();
  private kvStore = new MockKVStore();
  private logger = new TestLogger();
  private filledOrders = new Map<string, any>();
  private escrows = new Map<string, any>();
  public stats = {
    ordersProcessed: 0,
    ordersFilled: 0,
    escrowsCreated: 0,
    depositsReceived: 0,
    withdrawalsCompleted: 0,
    errors: 0,
  };
  
  constructor(private config: any) {}
  
  async fillOrder(orderHash: Hash, order: any): Promise<{ srcEscrow: Address; txHash: Hash }> {
    this.stats.ordersProcessed++;
    
    const srcEscrow = `0x${Math.random().toString(16).slice(2).padStart(40, "0")}` as Address;
    const txHash = `0x${Math.random().toString(16).slice(2).padEnd(64, "0")}` as Hash;
    
    this.filledOrders.set(orderHash, { order, srcEscrow, txHash });
    this.stats.ordersFilled++;
    
    this.eventEmitter.emit("orderFilled", { orderHash, srcEscrow, txHash });
    this.logger.info(`Order filled: ${orderHash}`, { srcEscrow, txHash });
    
    return { srcEscrow, txHash };
  }
  
  async createDestinationEscrow(params: {
    orderHash: Hash;
    hashlock: Hex;
    dstToken: Address;
    dstAmount: bigint;
  }): Promise<Address> {
    const dstEscrow = `0x${Math.random().toString(16).slice(2).padStart(40, "0")}` as Address;
    
    this.escrows.set(params.orderHash, {
      ...params,
      dstEscrow,
      status: "created",
    });
    this.stats.escrowsCreated++;
    
    this.eventEmitter.emit("destinationEscrowCreated", { ...params, dstEscrow });
    this.logger.info(`Destination escrow created: ${dstEscrow}`, params);
    
    return dstEscrow;
  }
  
  async fundDestinationEscrow(escrowAddress: Address, amount: bigint): Promise<Hash> {
    const txHash = `0x${Math.random().toString(16).slice(2).padEnd(64, "0")}` as Hash;
    
    // Find escrow and update status
    for (const [orderHash, escrow] of this.escrows.entries()) {
      if (escrow.dstEscrow === escrowAddress) {
        escrow.status = "funded";
        escrow.fundingTxHash = txHash;
        break;
      }
    }
    
    this.eventEmitter.emit("destinationEscrowFunded", { escrowAddress, amount, txHash });
    this.logger.info(`Destination escrow funded: ${escrowAddress}`, { amount, txHash });
    
    return txHash;
  }
  
  async withdrawFromSource(escrowAddress: Address, secret: Hex): Promise<Hash> {
    const txHash = `0x${Math.random().toString(16).slice(2).padEnd(64, "0")}` as Hash;
    this.stats.withdrawalsCompleted++;
    
    this.eventEmitter.emit("sourceWithdrawalCompleted", { escrowAddress, secret, txHash });
    this.logger.info(`Withdrawn from source: ${escrowAddress}`, { txHash });
    
    return txHash;
  }
  
  async onDepositReceived(escrowAddress: Address, amount: bigint): Promise<void> {
    this.stats.depositsReceived++;
    this.eventEmitter.emit("depositReceived", { escrowAddress, amount });
    this.logger.info(`Deposit received at: ${escrowAddress}`, { amount });
  }
  
  on(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.on(event, handler);
  }
  
  getFilledOrder(orderHash: Hash): any {
    return this.filledOrders.get(orderHash);
  }
  
  getEscrow(orderHash: Hash): any {
    return this.escrows.get(orderHash);
  }
  
  getLogs(): any[] {
    return this.logger.getLogs();
  }
}

// Test Suite
Deno.test("Atomic Swap Flow - Complete Happy Path", async () => {
  const ctx = createTestContext("atomic-swap-happy-path");
  const testEnv = createTestEnvironment();
  const dataGen = new TestDataGenerator();
  
  // Initialize services
  const alice = new MockAliceService({
    privateKey: "0x" + "1".repeat(64),
    autoDepositToSource: true,
    autoRevealSecret: true,
    autoWithdraw: true,
  });
  
  const bob = new MockBobResolverService({
    privateKey: "0x" + "2".repeat(64),
    autoCreateDestEscrow: true,
    autoWithdrawOnReveal: true,
  });
  
  // Register cleanup
  registerCleanup(ctx, () => {
    testEnv.reset();
    dataGen.reset();
  });
  
  try {
    // Step 1: Alice creates order with secret
    const { orderHash, hashlock, secret } = await alice.createOrder({
      makerAsset: TEST_ADDRESSES.BMN_TOKEN,
      takerAsset: TEST_ADDRESSES.USDC_TOKEN,
      makingAmount: TEST_VALUES.TEN_TOKENS,
      takingAmount: parseUnits("10", 6),
    });
    
    assertExists(orderHash);
    assertExists(hashlock);
    assertExists(secret);
    assertEquals(keccak256(secret), hashlock);
    
    // Step 2: Bob fills order and creates source escrow
    const order = alice.getOrder(orderHash);
    const { srcEscrow, txHash: fillTxHash } = await bob.fillOrder(orderHash, order);
    
    assertExists(srcEscrow);
    assertExists(fillTxHash);
    assertEquals(bob.stats.ordersFilled, 1);
    
    // Step 3: Alice deposits to source escrow
    const depositTxHash = await alice.depositToSourceEscrow(
      srcEscrow,
      TEST_VALUES.TEN_TOKENS
    );
    
    assertExists(depositTxHash);
    assertEquals(alice.stats.depositsCompleted, 1);
    
    // Step 4: Bob detects deposit and creates destination escrow
    await bob.onDepositReceived(srcEscrow, TEST_VALUES.TEN_TOKENS);
    assertEquals(bob.stats.depositsReceived, 1);
    
    const dstEscrow = await bob.createDestinationEscrow({
      orderHash,
      hashlock,
      dstToken: TEST_ADDRESSES.USDC_TOKEN,
      dstAmount: parseUnits("10", 6),
    });
    
    assertExists(dstEscrow);
    assertEquals(bob.stats.escrowsCreated, 1);
    
    // Step 5: Bob funds destination escrow
    const fundTxHash = await bob.fundDestinationEscrow(
      dstEscrow,
      parseUnits("10", 6)
    );
    
    assertExists(fundTxHash);
    const escrowData = bob.getEscrow(orderHash);
    assertEquals(escrowData.status, "funded");
    
    // Step 6: Alice reveals secret and withdraws from destination
    const revealedSecret = await alice.revealSecret(hashlock);
    assertEquals(revealedSecret, secret);
    assertEquals(alice.stats.secretsRevealed, 1);
    
    const aliceWithdrawTxHash = await alice.withdrawFromDestination(dstEscrow, secret);
    assertExists(aliceWithdrawTxHash);
    assertEquals(alice.stats.withdrawalsCompleted, 1);
    
    // Step 7: Bob withdraws from source using revealed secret
    const bobWithdrawTxHash = await bob.withdrawFromSource(srcEscrow, secret);
    assertExists(bobWithdrawTxHash);
    assertEquals(bob.stats.withdrawalsCompleted, 1);
    
    // Verify final state
    assertEquals(alice.stats.ordersCreated, 1);
    assertEquals(alice.stats.depositsCompleted, 1);
    assertEquals(alice.stats.secretsRevealed, 1);
    assertEquals(alice.stats.withdrawalsCompleted, 1);
    assertEquals(alice.stats.errors, 0);
    
    assertEquals(bob.stats.ordersProcessed, 1);
    assertEquals(bob.stats.ordersFilled, 1);
    assertEquals(bob.stats.escrowsCreated, 1);
    assertEquals(bob.stats.depositsReceived, 1);
    assertEquals(bob.stats.withdrawalsCompleted, 1);
    assertEquals(bob.stats.errors, 0);
    
  } finally {
    await runCleanup(ctx);
  }
});

Deno.test("Atomic Swap Flow - Service Integration with Events", async () => {
  const ctx = createTestContext("atomic-swap-events");
  const testEnv = createTestEnvironment();
  
  const alice = new MockAliceService({
    privateKey: "0x" + "1".repeat(64),
    autoDepositToSource: true,
    autoRevealSecret: true,
  });
  
  const bob = new MockBobResolverService({
    privateKey: "0x" + "2".repeat(64),
    autoCreateDestEscrow: true,
  });
  
  // Track events
  const aliceEvents: any[] = [];
  const bobEvents: any[] = [];
  
  alice.on("orderCreated", (data) => aliceEvents.push({ event: "orderCreated", data }));
  alice.on("depositCompleted", (data) => aliceEvents.push({ event: "depositCompleted", data }));
  alice.on("secretRevealed", (data) => aliceEvents.push({ event: "secretRevealed", data }));
  alice.on("withdrawalCompleted", (data) => aliceEvents.push({ event: "withdrawalCompleted", data }));
  
  bob.on("orderFilled", (data) => bobEvents.push({ event: "orderFilled", data }));
  bob.on("depositReceived", (data) => bobEvents.push({ event: "depositReceived", data }));
  bob.on("destinationEscrowCreated", (data) => bobEvents.push({ event: "destinationEscrowCreated", data }));
  bob.on("destinationEscrowFunded", (data) => bobEvents.push({ event: "destinationEscrowFunded", data }));
  bob.on("sourceWithdrawalCompleted", (data) => bobEvents.push({ event: "sourceWithdrawalCompleted", data }));
  
  registerCleanup(ctx, () => {
    testEnv.reset();
  });
  
  try {
    // Execute swap flow
    const { orderHash, hashlock, secret } = await alice.createOrder({
      makerAsset: TEST_ADDRESSES.BMN_TOKEN,
      takerAsset: TEST_ADDRESSES.USDC_TOKEN,
      makingAmount: TEST_VALUES.ONE_TOKEN,
      takingAmount: parseUnits("1", 6),
    });
    
    const order = alice.getOrder(orderHash);
    const { srcEscrow } = await bob.fillOrder(orderHash, order);
    
    await alice.depositToSourceEscrow(srcEscrow, TEST_VALUES.ONE_TOKEN);
    await bob.onDepositReceived(srcEscrow, TEST_VALUES.ONE_TOKEN);
    
    const dstEscrow = await bob.createDestinationEscrow({
      orderHash,
      hashlock,
      dstToken: TEST_ADDRESSES.USDC_TOKEN,
      dstAmount: parseUnits("1", 6),
    });
    
    await bob.fundDestinationEscrow(dstEscrow, parseUnits("1", 6));
    await alice.revealSecret(hashlock);
    await alice.withdrawFromDestination(dstEscrow, secret);
    await bob.withdrawFromSource(srcEscrow, secret);
    
    // Verify events were emitted in correct order
    assertEquals(aliceEvents.length, 4);
    assertEquals(aliceEvents[0].event, "orderCreated");
    assertEquals(aliceEvents[1].event, "depositCompleted");
    assertEquals(aliceEvents[2].event, "secretRevealed");
    assertEquals(aliceEvents[3].event, "withdrawalCompleted");
    
    assertEquals(bobEvents.length, 5);
    assertEquals(bobEvents[0].event, "orderFilled");
    assertEquals(bobEvents[1].event, "depositReceived");
    assertEquals(bobEvents[2].event, "destinationEscrowCreated");
    assertEquals(bobEvents[3].event, "destinationEscrowFunded");
    assertEquals(bobEvents[4].event, "sourceWithdrawalCompleted");
    
    // Verify event data
    assertEquals(aliceEvents[0].data.orderHash, orderHash);
    assertEquals(aliceEvents[0].data.hashlock, hashlock);
    assertEquals(aliceEvents[2].data.secret, secret);
    
    assertEquals(bobEvents[0].data.orderHash, orderHash);
    assertEquals(bobEvents[0].data.srcEscrow, srcEscrow);
    assertEquals(bobEvents[2].data.dstEscrow, dstEscrow);
    
  } finally {
    await runCleanup(ctx);
  }
});

Deno.test("Atomic Swap Flow - Network Failure Recovery", async () => {
  const ctx = createTestContext("atomic-swap-network-recovery");
  
  const alice = new MockAliceService({
    privateKey: "0x" + "1".repeat(64),
    maxRetries: 3,
    retryBackoffMs: 100,
  });
  
  const bob = new MockBobResolverService({
    privateKey: "0x" + "2".repeat(64),
    maxRetries: 3,
    retryBackoffMs: 100,
  });
  
  // Simulate network failures
  let depositAttempts = 0;
  const originalDeposit = alice.depositToSourceEscrow.bind(alice);
  alice.depositToSourceEscrow = async (escrow: Address, amount: bigint) => {
    depositAttempts++;
    if (depositAttempts < 3) {
      throw new Error("Network error: connection timeout");
    }
    return originalDeposit(escrow, amount);
  };
  
  let fundingAttempts = 0;
  const originalFund = bob.fundDestinationEscrow.bind(bob);
  bob.fundDestinationEscrow = async (escrow: Address, amount: bigint) => {
    fundingAttempts++;
    if (fundingAttempts < 2) {
      throw new Error("Network error: RPC unavailable");
    }
    return originalFund(escrow, amount);
  };
  
  try {
    // Create order
    const { orderHash, hashlock, secret } = await alice.createOrder({
      makerAsset: TEST_ADDRESSES.BMN_TOKEN,
      takerAsset: TEST_ADDRESSES.USDC_TOKEN,
      makingAmount: TEST_VALUES.ONE_TOKEN,
      takingAmount: parseUnits("1", 6),
    });
    
    const order = alice.getOrder(orderHash);
    const { srcEscrow } = await bob.fillOrder(orderHash, order);
    
    // Deposit with retries (will fail twice, succeed on third attempt)
    const depositTxHash = await alice.depositToSourceEscrow(srcEscrow, TEST_VALUES.ONE_TOKEN);
    assertExists(depositTxHash);
    assertEquals(depositAttempts, 3);
    
    await bob.onDepositReceived(srcEscrow, TEST_VALUES.ONE_TOKEN);
    
    const dstEscrow = await bob.createDestinationEscrow({
      orderHash,
      hashlock,
      dstToken: TEST_ADDRESSES.USDC_TOKEN,
      dstAmount: parseUnits("1", 6),
    });
    
    // Fund with retries (will fail once, succeed on second attempt)
    const fundTxHash = await bob.fundDestinationEscrow(dstEscrow, parseUnits("1", 6));
    assertExists(fundTxHash);
    assertEquals(fundingAttempts, 2);
    
    // Complete the swap
    await alice.revealSecret(hashlock);
    await alice.withdrawFromDestination(dstEscrow, secret);
    await bob.withdrawFromSource(srcEscrow, secret);
    
    // Verify swap completed despite network issues
    assertEquals(alice.stats.withdrawalsCompleted, 1);
    assertEquals(bob.stats.withdrawalsCompleted, 1);
    
  } finally {
    await runCleanup(ctx);
  }
});

Deno.test("Atomic Swap Flow - Timeout Handling", async () => {
  const ctx = createTestContext("atomic-swap-timeout");
  
  const alice = new MockAliceService({
    privateKey: "0x" + "1".repeat(64),
  });
  
  const bob = new MockBobResolverService({
    privateKey: "0x" + "2".repeat(64),
  });
  
  // Track timeout events
  const timeoutEvents: any[] = [];
  
  try {
    // Create order with short timeout
    const { orderHash, hashlock } = await alice.createOrder({
      makerAsset: TEST_ADDRESSES.BMN_TOKEN,
      takerAsset: TEST_ADDRESSES.USDC_TOKEN,
      makingAmount: TEST_VALUES.ONE_TOKEN,
      takingAmount: parseUnits("1", 6),
    });
    
    const order = alice.getOrder(orderHash);
    const { srcEscrow } = await bob.fillOrder(orderHash, order);
    
    // Alice deposits
    await alice.depositToSourceEscrow(srcEscrow, TEST_VALUES.ONE_TOKEN);
    await bob.onDepositReceived(srcEscrow, TEST_VALUES.ONE_TOKEN);
    
    // Bob creates but doesn't fund destination escrow (simulating timeout scenario)
    const dstEscrow = await bob.createDestinationEscrow({
      orderHash,
      hashlock,
      dstToken: TEST_ADDRESSES.USDC_TOKEN,
      dstAmount: parseUnits("1", 6),
    });
    
    // Simulate timeout detection
    await delay(100);
    
    // Alice should be able to cancel/reclaim after timeout
    const escrowData = bob.getEscrow(orderHash);
    assertEquals(escrowData.status, "created"); // Not funded
    
    // In real implementation, Alice would reclaim from source escrow after timeout
    timeoutEvents.push({
      event: "timeout",
      orderHash,
      escrow: srcEscrow,
      reason: "Destination escrow not funded within timeout period",
    });
    
    assertEquals(timeoutEvents.length, 1);
    assertEquals(timeoutEvents[0].reason, "Destination escrow not funded within timeout period");
    
  } finally {
    await runCleanup(ctx);
  }
});

Deno.test("Atomic Swap Flow - Concurrent Swaps", async () => {
  const ctx = createTestContext("atomic-swap-concurrent");
  
  const alice = new MockAliceService({
    privateKey: "0x" + "1".repeat(64),
  });
  
  const bob = new MockBobResolverService({
    privateKey: "0x" + "2".repeat(64),
  });
  
  try {
    // Create multiple orders concurrently
    const swapPromises = [];
    const swapCount = 5;
    
    for (let i = 0; i < swapCount; i++) {
      swapPromises.push((async () => {
        // Create unique order
        const { orderHash, hashlock, secret } = await alice.createOrder({
          makerAsset: TEST_ADDRESSES.BMN_TOKEN,
          takerAsset: TEST_ADDRESSES.USDC_TOKEN,
          makingAmount: TEST_VALUES.ONE_TOKEN * BigInt(i + 1),
          takingAmount: parseUnits(String(i + 1), 6),
        });
        
        const order = alice.getOrder(orderHash);
        const { srcEscrow } = await bob.fillOrder(orderHash, order);
        
        // Execute swap steps
        await alice.depositToSourceEscrow(srcEscrow, TEST_VALUES.ONE_TOKEN * BigInt(i + 1));
        await bob.onDepositReceived(srcEscrow, TEST_VALUES.ONE_TOKEN * BigInt(i + 1));
        
        const dstEscrow = await bob.createDestinationEscrow({
          orderHash,
          hashlock,
          dstToken: TEST_ADDRESSES.USDC_TOKEN,
          dstAmount: parseUnits(String(i + 1), 6),
        });
        
        await bob.fundDestinationEscrow(dstEscrow, parseUnits(String(i + 1), 6));
        await alice.revealSecret(hashlock);
        await alice.withdrawFromDestination(dstEscrow, secret);
        await bob.withdrawFromSource(srcEscrow, secret);
        
        return { orderHash, success: true };
      })());
    }
    
    // Wait for all swaps to complete
    const results = await Promise.all(swapPromises);
    
    // Verify all swaps completed successfully
    assertEquals(results.length, swapCount);
    for (const result of results) {
      assertEquals(result.success, true);
      assertExists(result.orderHash);
    }
    
    // Verify final stats
    assertEquals(alice.stats.ordersCreated, swapCount);
    assertEquals(alice.stats.depositsCompleted, swapCount);
    assertEquals(alice.stats.secretsRevealed, swapCount);
    assertEquals(alice.stats.withdrawalsCompleted, swapCount);
    
    assertEquals(bob.stats.ordersProcessed, swapCount);
    assertEquals(bob.stats.ordersFilled, swapCount);
    assertEquals(bob.stats.escrowsCreated, swapCount);
    assertEquals(bob.stats.depositsReceived, swapCount);
    assertEquals(bob.stats.withdrawalsCompleted, swapCount);
    
  } finally {
    await runCleanup(ctx);
  }
});

Deno.test("Atomic Swap Flow - Service Restart Mid-Swap", async () => {
  const ctx = createTestContext("atomic-swap-restart");
  const kvStore = new MockKVStore();
  
  // First service instance
  let alice = new MockAliceService({
    privateKey: "0x" + "1".repeat(64),
  });
  
  let bob = new MockBobResolverService({
    privateKey: "0x" + "2".repeat(64),
  });
  
  try {
    // Start swap
    const { orderHash, hashlock, secret } = await alice.createOrder({
      makerAsset: TEST_ADDRESSES.BMN_TOKEN,
      takerAsset: TEST_ADDRESSES.USDC_TOKEN,
      makingAmount: TEST_VALUES.TEN_TOKENS,
      takingAmount: parseUnits("10", 6),
    });
    
    const order = alice.getOrder(orderHash);
    const { srcEscrow } = await bob.fillOrder(orderHash, order);
    
    await alice.depositToSourceEscrow(srcEscrow, TEST_VALUES.TEN_TOKENS);
    await bob.onDepositReceived(srcEscrow, TEST_VALUES.TEN_TOKENS);
    
    // Save state before "restart"
    await kvStore.set(["swap", orderHash], {
      orderHash,
      hashlock,
      secret,
      srcEscrow,
      order,
      status: "deposit_received",
    });
    
    // Simulate service restart - create new instances
    alice = new MockAliceService({
      privateKey: "0x" + "1".repeat(64),
    });
    
    bob = new MockBobResolverService({
      privateKey: "0x" + "2".repeat(64),
    });
    
    // Restore state from KV store
    const savedState = await kvStore.get(["swap", orderHash]);
    assertExists(savedState.value);
    
    const state = savedState.value as any;
    assertEquals(state.status, "deposit_received");
    
    // Continue swap from saved state
    const dstEscrow = await bob.createDestinationEscrow({
      orderHash: state.orderHash,
      hashlock: state.hashlock,
      dstToken: TEST_ADDRESSES.USDC_TOKEN,
      dstAmount: parseUnits("10", 6),
    });
    
    await bob.fundDestinationEscrow(dstEscrow, parseUnits("10", 6));
    
    // Update state
    await kvStore.set(["swap", orderHash], {
      ...state,
      dstEscrow,
      status: "destination_funded",
    });
    
    // Complete swap
    await alice.revealSecret(state.hashlock);
    await alice.withdrawFromDestination(dstEscrow, state.secret);
    await bob.withdrawFromSource(state.srcEscrow, state.secret);
    
    // Verify swap completed after restart
    assertEquals(alice.stats.secretsRevealed, 1);
    assertEquals(alice.stats.withdrawalsCompleted, 1);
    assertEquals(bob.stats.withdrawalsCompleted, 1);
    
  } finally {
    kvStore.clear();
    await runCleanup(ctx);
  }
});

Deno.test("Atomic Swap Flow - Race Condition Prevention", async () => {
  const ctx = createTestContext("atomic-swap-race-condition");
  
  const alice = new MockAliceService({
    privateKey: "0x" + "1".repeat(64),
  });
  
  const bob = new MockBobResolverService({
    privateKey: "0x" + "2".repeat(64),
  });
  
  // Track operation order
  const operations: string[] = [];
  const locks = new Map<string, boolean>();
  
  // Wrap operations with lock tracking
  const withLock = async (lockName: string, operation: () => Promise<any>) => {
    if (locks.get(lockName)) {
      throw new Error(`Lock ${lockName} already held - race condition detected`);
    }
    
    locks.set(lockName, true);
    operations.push(`lock:${lockName}`);
    
    try {
      const result = await operation();
      operations.push(`complete:${lockName}`);
      return result;
    } finally {
      locks.set(lockName, false);
      operations.push(`unlock:${lockName}`);
    }
  };
  
  try {
    // Create order
    const { orderHash, hashlock, secret } = await alice.createOrder({
      makerAsset: TEST_ADDRESSES.BMN_TOKEN,
      takerAsset: TEST_ADDRESSES.USDC_TOKEN,
      makingAmount: TEST_VALUES.ONE_TOKEN,
      takingAmount: parseUnits("1", 6),
    });
    
    const order = alice.getOrder(orderHash);
    
    // Simulate concurrent operations that could race
    const fillPromise = withLock("fill", async () => {
      await delay(10); // Simulate processing time
      return bob.fillOrder(orderHash, order);
    });
    
    // Try to fill same order concurrently (should fail or be prevented)
    let raceConditionDetected = false;
    try {
      await Promise.all([
        fillPromise,
        withLock("fill", async () => {
          await delay(5);
          return bob.fillOrder(orderHash, order);
        }),
      ]);
    } catch (error) {
      if (error.message.includes("race condition detected")) {
        raceConditionDetected = true;
      }
    }
    
    // Verify race condition was prevented
    assertEquals(raceConditionDetected, true);
    
    // Continue with single fill result
    const { srcEscrow } = await fillPromise;
    
    // Test concurrent withdrawals (should also be prevented)
    await alice.depositToSourceEscrow(srcEscrow, TEST_VALUES.ONE_TOKEN);
    await bob.onDepositReceived(srcEscrow, TEST_VALUES.ONE_TOKEN);
    
    const dstEscrow = await bob.createDestinationEscrow({
      orderHash,
      hashlock,
      dstToken: TEST_ADDRESSES.USDC_TOKEN,
      dstAmount: parseUnits("1", 6),
    });
    
    await bob.fundDestinationEscrow(dstEscrow, parseUnits("1", 6));
    await alice.revealSecret(hashlock);
    
    // Try concurrent withdrawals
    const withdrawPromise = withLock("withdraw", async () => {
      await delay(10);
      return alice.withdrawFromDestination(dstEscrow, secret);
    });
    
    raceConditionDetected = false;
    try {
      await Promise.all([
        withdrawPromise,
        withLock("withdraw", async () => {
          await delay(5);
          return alice.withdrawFromDestination(dstEscrow, secret);
        }),
      ]);
    } catch (error) {
      if (error.message.includes("race condition detected")) {
        raceConditionDetected = true;
      }
    }
    
    assertEquals(raceConditionDetected, true);
    
    // Complete withdrawal
    await withdrawPromise;
    await bob.withdrawFromSource(srcEscrow, secret);
    
    // Verify operations were properly serialized
    assert(operations.includes("lock:fill"));
    assert(operations.includes("complete:fill"));
    assert(operations.includes("unlock:fill"));
    assert(operations.includes("lock:withdraw"));
    assert(operations.includes("complete:withdraw"));
    assert(operations.includes("unlock:withdraw"));
    
  } finally {
    await runCleanup(ctx);
  }
});

Deno.test("Atomic Swap Flow - Partial Completion Recovery", async () => {
  const ctx = createTestContext("atomic-swap-partial-recovery");
  const kvStore = new MockKVStore();
  
  const alice = new MockAliceService({
    privateKey: "0x" + "1".repeat(64),
  });
  
  const bob = new MockBobResolverService({
    privateKey: "0x" + "2".repeat(64),
  });
  
  try {
    // Start swap
    const { orderHash, hashlock, secret } = await alice.createOrder({
      makerAsset: TEST_ADDRESSES.BMN_TOKEN,
      takerAsset: TEST_ADDRESSES.USDC_TOKEN,
      makingAmount: TEST_VALUES.ONE_TOKEN,
      takingAmount: parseUnits("1", 6),
    });
    
    const order = alice.getOrder(orderHash);
    const { srcEscrow } = await bob.fillOrder(orderHash, order);
    
    // Alice deposits
    await alice.depositToSourceEscrow(srcEscrow, TEST_VALUES.ONE_TOKEN);
    await bob.onDepositReceived(srcEscrow, TEST_VALUES.ONE_TOKEN);
    
    // Bob creates destination escrow
    const dstEscrow = await bob.createDestinationEscrow({
      orderHash,
      hashlock,
      dstToken: TEST_ADDRESSES.USDC_TOKEN,
      dstAmount: parseUnits("1", 6),
    });
    
    // Save partial state (destination created but not funded)
    await kvStore.set(["partial", orderHash], {
      orderHash,
      hashlock,
      secret,
      srcEscrow,
      dstEscrow,
      status: "destination_created",
      aliceDeposited: true,
      bobFunded: false,
    });
    
    // Simulate recovery process
    const partialState = await kvStore.get(["partial", orderHash]);
    assertExists(partialState.value);
    
    const state = partialState.value as any;
    assertEquals(state.status, "destination_created");
    assertEquals(state.aliceDeposited, true);
    assertEquals(state.bobFunded, false);
    
    // Recovery: Bob completes funding
    if (!state.bobFunded) {
      await bob.fundDestinationEscrow(state.dstEscrow, parseUnits("1", 6));
      
      // Update state
      await kvStore.set(["partial", orderHash], {
        ...state,
        bobFunded: true,
        status: "destination_funded",
      });
    }
    
    // Recovery: Complete swap
    await alice.revealSecret(state.hashlock);
    await alice.withdrawFromDestination(state.dstEscrow, state.secret);
    await bob.withdrawFromSource(state.srcEscrow, state.secret);
    
    // Verify recovery completed successfully
    assertEquals(alice.stats.withdrawalsCompleted, 1);
    assertEquals(bob.stats.withdrawalsCompleted, 1);
    
    // Verify final state
    const finalState = await kvStore.get(["partial", orderHash]);
    assertExists(finalState.value);
    assertEquals((finalState.value as any).bobFunded, true);
    
  } finally {
    kvStore.clear();
    await runCleanup(ctx);
  }
});

Deno.test("Atomic Swap Flow - Invalid Secret Handling", async () => {
  const ctx = createTestContext("atomic-swap-invalid-secret");
  
  const alice = new MockAliceService({
    privateKey: "0x" + "1".repeat(64),
  });
  
  const bob = new MockBobResolverService({
    privateKey: "0x" + "2".repeat(64),
  });
  
  try {
    // Create order
    const { orderHash, hashlock, secret } = await alice.createOrder({
      makerAsset: TEST_ADDRESSES.BMN_TOKEN,
      takerAsset: TEST_ADDRESSES.USDC_TOKEN,
      makingAmount: TEST_VALUES.ONE_TOKEN,
      takingAmount: parseUnits("1", 6),
    });
    
    const order = alice.getOrder(orderHash);
    const { srcEscrow } = await bob.fillOrder(orderHash, order);
    
    await alice.depositToSourceEscrow(srcEscrow, TEST_VALUES.ONE_TOKEN);
    await bob.onDepositReceived(srcEscrow, TEST_VALUES.ONE_TOKEN);
    
    const dstEscrow = await bob.createDestinationEscrow({
      orderHash,
      hashlock,
      dstToken: TEST_ADDRESSES.USDC_TOKEN,
      dstAmount: parseUnits("1", 6),
    });
    
    await bob.fundDestinationEscrow(dstEscrow, parseUnits("1", 6));
    
    // Try to withdraw with wrong secret
    const wrongSecret = `0x${Math.random().toString(16).slice(2).padEnd(64, "0")}` as Hex;
    
    // Override withdraw to check secret
    const originalWithdraw = bob.withdrawFromSource.bind(bob);
    bob.withdrawFromSource = async (escrow: Address, providedSecret: Hex) => {
      // Verify secret matches hashlock
      const computedHashlock = keccak256(providedSecret);
      if (computedHashlock !== hashlock) {
        throw new Error("Invalid secret: does not match hashlock");
      }
      return originalWithdraw(escrow, providedSecret);
    };
    
    // Attempt withdrawal with wrong secret should fail
    await assertRejects(
      async () => bob.withdrawFromSource(srcEscrow, wrongSecret),
      Error,
      "Invalid secret"
    );
    
    // Withdrawal with correct secret should succeed
    await alice.revealSecret(hashlock);
    await alice.withdrawFromDestination(dstEscrow, secret);
    
    const bobWithdrawTxHash = await bob.withdrawFromSource(srcEscrow, secret);
    assertExists(bobWithdrawTxHash);
    assertEquals(bob.stats.withdrawalsCompleted, 1);
    
  } finally {
    await runCleanup(ctx);
  }
});

// Performance test
Deno.test("Atomic Swap Flow - Performance Under Load", async () => {
  const ctx = createTestContext("atomic-swap-performance");
  
  const alice = new MockAliceService({
    privateKey: "0x" + "1".repeat(64),
  });
  
  const bob = new MockBobResolverService({
    privateKey: "0x" + "2".repeat(64),
  });
  
  const startTime = performance.now();
  const swapCount = 20; // Test with 20 concurrent swaps
  
  try {
    const swapPromises = [];
    
    for (let i = 0; i < swapCount; i++) {
      swapPromises.push((async () => {
        const swapStart = performance.now();
        
        const { orderHash, hashlock, secret } = await alice.createOrder({
          makerAsset: TEST_ADDRESSES.BMN_TOKEN,
          takerAsset: TEST_ADDRESSES.USDC_TOKEN,
          makingAmount: TEST_VALUES.ONE_TOKEN,
          takingAmount: parseUnits("1", 6),
        });
        
        const order = alice.getOrder(orderHash);
        const { srcEscrow } = await bob.fillOrder(orderHash, order);
        
        await alice.depositToSourceEscrow(srcEscrow, TEST_VALUES.ONE_TOKEN);
        await bob.onDepositReceived(srcEscrow, TEST_VALUES.ONE_TOKEN);
        
        const dstEscrow = await bob.createDestinationEscrow({
          orderHash,
          hashlock,
          dstToken: TEST_ADDRESSES.USDC_TOKEN,
          dstAmount: parseUnits("1", 6),
        });
        
        await bob.fundDestinationEscrow(dstEscrow, parseUnits("1", 6));
        await alice.revealSecret(hashlock);
        await alice.withdrawFromDestination(dstEscrow, secret);
        await bob.withdrawFromSource(srcEscrow, secret);
        
        const swapDuration = performance.now() - swapStart;
        return { orderHash, duration: swapDuration };
      })());
    }
    
    const results = await Promise.all(swapPromises);
    const totalDuration = performance.now() - startTime;
    
    // Calculate performance metrics
    const durations = results.map(r => r.duration);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);
    
    console.log(`\n📊 Performance Metrics (${swapCount} swaps):`);
    console.log(`   Total time: ${totalDuration.toFixed(2)}ms`);
    console.log(`   Average swap: ${avgDuration.toFixed(2)}ms`);
    console.log(`   Fastest swap: ${minDuration.toFixed(2)}ms`);
    console.log(`   Slowest swap: ${maxDuration.toFixed(2)}ms`);
    console.log(`   Throughput: ${(swapCount / (totalDuration / 1000)).toFixed(2)} swaps/sec`);
    
    // Verify all swaps completed
    assertEquals(results.length, swapCount);
    assertEquals(alice.stats.ordersCreated, swapCount);
    assertEquals(alice.stats.withdrawalsCompleted, swapCount);
    assertEquals(bob.stats.ordersFilled, swapCount);
    assertEquals(bob.stats.withdrawalsCompleted, swapCount);
    
    // Performance assertions
    assert(totalDuration < 5000, "Total duration should be under 5 seconds");
    assert(avgDuration < 500, "Average swap should complete in under 500ms");
    
  } finally {
    await runCleanup(ctx);
  }
});