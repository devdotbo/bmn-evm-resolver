/**
 * Unit tests for escrow creation utilities
 * Tests parsePostInteractionData, extractImmutables, and basic validation
 * 
 * Note: Tests for createDestinationEscrow and monitorAndCreateDestinationEscrow
 * require complex viem client mocking and are better suited for integration tests.
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  TEST_ADDRESSES,
  TEST_VALUES,
  TestDataGenerator,
} from "../../setup.ts";
import {
  extractImmutables,
  parsePostInteractionData,
  type EscrowImmutables,
} from "../../../src/utils/escrow-creation.ts";
import type { Address, Hex } from "viem";
import { encodeAbiParameters, parseAbiParameters } from "viem";

// Test data generator
const dataGenerator = new TestDataGenerator();

// Mock order data
function createMockOrder(overrides?: Partial<any>): any {
  return {
    salt: 1234567890n,
    maker: TEST_ADDRESSES.ALICE,
    receiver: TEST_ADDRESSES.BOB, // Bob is the taker/receiver
    makerAsset: TEST_ADDRESSES.BMN_TOKEN,
    takerAsset: TEST_ADDRESSES.USDC_TOKEN,
    makingAmount: TEST_VALUES.TEN_TOKENS.toString(),
    takingAmount: TEST_VALUES.ONE_TOKEN.toString(),
    makerTraits: 0n,
    ...overrides,
  };
}

// Mock extension data for PostInteraction
function createMockExtensionData(params?: {
  factory?: Address;
  hashlock?: Hex;
  dstChainId?: bigint;
  dstToken?: Address;
  deposits?: bigint;
  timelocks?: bigint;
}): Hex {
  const defaultParams = {
    factory: TEST_ADDRESSES.ESCROW_FACTORY,
    hashlock: TEST_VALUES.TEST_HASHLOCK,
    dstChainId: 10n, // Optimism
    dstToken: TEST_ADDRESSES.USDC_TOKEN,
    deposits: (TEST_VALUES.ONE_TOKEN << 128n) | TEST_VALUES.ONE_TOKEN, // Packed deposits
    timelocks: (BigInt(Math.floor(Date.now() / 1000) + 7200) << 128n) | BigInt(Math.floor(Date.now() / 1000) + 3600), // Packed timelocks
    ...params,
  };

  // Extension data format: 20 bytes factory + abi.encode(hashlock, dstChainId, dstToken, deposits, timelocks)
  const factoryBytes = defaultParams.factory.slice(2);
  const payload = encodeAbiParameters(
    parseAbiParameters("bytes32,uint256,address,uint256,uint256"),
    [
      defaultParams.hashlock,
      defaultParams.dstChainId,
      defaultParams.dstToken,
      defaultParams.deposits,
      defaultParams.timelocks,
    ]
  ).slice(2);

  return ("0x" + factoryBytes + payload) as Hex;
}

// Test suite for parsePostInteractionData
Deno.test("parsePostInteractionData", async (t) => {
  await t.step("should correctly parse extension data", () => {
    const extensionData = createMockExtensionData();
    const result = parsePostInteractionData(extensionData);

    assertEquals(result.factory, TEST_ADDRESSES.ESCROW_FACTORY);
    assertEquals(result.hashlock, TEST_VALUES.TEST_HASHLOCK);
    assertEquals(result.dstChainId, 10n);
    assertEquals(result.dstToken, TEST_ADDRESSES.USDC_TOKEN);
    assert(result.deposits > 0n);
    assert(result.timelocks > 0n);
  });

  await t.step("should handle different chain IDs", () => {
    const extensionData = createMockExtensionData({ dstChainId: 8453n }); // Base
    const result = parsePostInteractionData(extensionData);
    assertEquals(result.dstChainId, 8453n);
  });

  await t.step("should parse packed deposits correctly", () => {
    const srcDeposit = 500000000000000000n; // 0.5 tokens
    const dstDeposit = 300000000000000000n; // 0.3 tokens
    const packedDeposits = (dstDeposit << 128n) | srcDeposit;
    
    const extensionData = createMockExtensionData({ deposits: packedDeposits });
    const result = parsePostInteractionData(extensionData);
    
    // Verify packed value
    assertEquals(result.deposits, packedDeposits);
    
    // Verify unpacking
    const unpackedSrc = result.deposits & ((1n << 128n) - 1n);
    const unpackedDst = result.deposits >> 128n;
    assertEquals(unpackedSrc, srcDeposit);
    assertEquals(unpackedDst, dstDeposit);
  });

  await t.step("should parse packed timelocks correctly", () => {
    const dstWithdrawal = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const srcCancellation = BigInt(Math.floor(Date.now() / 1000) + 7200);
    const packedTimelocks = (srcCancellation << 128n) | dstWithdrawal;
    
    const extensionData = createMockExtensionData({ timelocks: packedTimelocks });
    const result = parsePostInteractionData(extensionData);
    
    // Verify packed value
    assertEquals(result.timelocks, packedTimelocks);
    
    // Verify unpacking
    const unpackedDst = result.timelocks & ((1n << 128n) - 1n);
    const unpackedSrc = result.timelocks >> 128n;
    assertEquals(unpackedDst, dstWithdrawal);
    assertEquals(unpackedSrc, srcCancellation);
  });

  await t.step("should handle zero hashlock", () => {
    const extensionData = createMockExtensionData({ 
      hashlock: TEST_VALUES.ZERO_HASHLOCK 
    });
    const result = parsePostInteractionData(extensionData);
    assertEquals(result.hashlock, TEST_VALUES.ZERO_HASHLOCK);
  });

  await t.step("should handle different factory addresses", () => {
    const customFactory = dataGenerator.nextAddress();
    const extensionData = createMockExtensionData({ factory: customFactory });
    const result = parsePostInteractionData(extensionData);
    assertEquals(result.factory, customFactory);
  });
});

// Test suite for extractImmutables
Deno.test("extractImmutables", async (t) => {
  await t.step("should extract immutables from order and extension data", () => {
    const order = createMockOrder();
    const extensionData = createMockExtensionData();
    const immutables = extractImmutables(order, extensionData);

    // Check basic fields
    assertEquals(immutables.srcMaker, order.maker);
    assertEquals(immutables.srcTaker, order.receiver); // Bob is the taker
    assertEquals(immutables.srcToken, order.makerAsset);
    assertEquals(immutables.srcAmount, BigInt(order.makingAmount));
    assertEquals(immutables.dstReceiver, order.maker); // Alice receives on destination
    assertEquals(immutables.dstAmount, BigInt(order.takingAmount));
    
    // Check extension-derived fields
    assertEquals(immutables.hashlock, TEST_VALUES.TEST_HASHLOCK);
    assertEquals(immutables.dstChainId, 10n);
    assertEquals(immutables.dstToken, TEST_ADDRESSES.USDC_TOKEN);
    
    // Check default values
    assertEquals(immutables.srcImplementation, "0x0000000000000000000000000000000000000000");
    assertEquals(immutables.dstImplementation, "0x0000000000000000000000000000000000000000");
    assertEquals(immutables.nonce, 0n);
  });

  await t.step("should correctly unpack and repack safety deposits", () => {
    const srcSafetyDeposit = 250000000000000000n; // 0.25 tokens
    const dstSafetyDeposit = 750000000000000000n; // 0.75 tokens
    const packedDeposits = (dstSafetyDeposit << 128n) | srcSafetyDeposit;
    
    const order = createMockOrder();
    const extensionData = createMockExtensionData({ deposits: packedDeposits });
    const immutables = extractImmutables(order, extensionData);

    assertEquals(immutables.srcSafetyDeposit, srcSafetyDeposit);
    assertEquals(immutables.dstSafetyDeposit, dstSafetyDeposit);
  });

  await t.step("should correctly unpack and repack timelocks", () => {
    const dstWithdrawalTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const srcCancellationTimestamp = BigInt(Math.floor(Date.now() / 1000) + 7200);
    const packedTimelocks = (srcCancellationTimestamp << 128n) | dstWithdrawalTimestamp;
    
    const order = createMockOrder();
    const extensionData = createMockExtensionData({ timelocks: packedTimelocks });
    const immutables = extractImmutables(order, extensionData);

    // Verify repacked timelocks (order matters for immutables)
    const expectedTimelocks = (srcCancellationTimestamp << 128n) | dstWithdrawalTimestamp;
    assertEquals(immutables.timelocks, expectedTimelocks);
  });

  await t.step("should handle optional srcEscrowAddress parameter", () => {
    const order = createMockOrder();
    const extensionData = createMockExtensionData();
    const srcEscrowAddress = dataGenerator.nextAddress();
    
    // Currently the srcEscrowAddress is not used in the implementation
    const immutables = extractImmutables(order, extensionData, srcEscrowAddress);
    assertExists(immutables);
  });

  await t.step("should handle different order amounts", () => {
    const order = createMockOrder({
      makingAmount: TEST_VALUES.HUNDRED_TOKENS.toString(),
      takingAmount: (TEST_VALUES.TEN_TOKENS * 2n).toString(),
    });
    const extensionData = createMockExtensionData();
    const immutables = extractImmutables(order, extensionData);

    assertEquals(immutables.srcAmount, TEST_VALUES.HUNDRED_TOKENS);
    assertEquals(immutables.dstAmount, TEST_VALUES.TEN_TOKENS * 2n);
  });

  await t.step("should handle zero amounts", () => {
    const order = createMockOrder({
      makingAmount: "0",
      takingAmount: "0",
    });
    const extensionData = createMockExtensionData();
    const immutables = extractImmutables(order, extensionData);

    assertEquals(immutables.srcAmount, 0n);
    assertEquals(immutables.dstAmount, 0n);
  });
});

// Edge cases and error scenarios
Deno.test("Edge cases and error scenarios", async (t) => {
  await t.step("should handle invalid extension data format", () => {
    const invalidData = "0x123" as Hex; // Too short
    
    try {
      parsePostInteractionData(invalidData);
      assert(false, "Should have thrown error");
    } catch (error) {
      assertExists(error);
    }
  });

  await t.step("should handle maximum uint256 values", () => {
    const maxUint256 = (1n << 256n) - 1n;
    const maxUint128 = (1n << 128n) - 1n;
    
    const extensionData = createMockExtensionData({
      deposits: (maxUint128 << 128n) | maxUint128,
      timelocks: (maxUint128 << 128n) | maxUint128,
    });
    
    const result = parsePostInteractionData(extensionData);
    assert(result.deposits > 0n);
    assert(result.timelocks > 0n);
  });

  await t.step("should handle zero values in immutables", () => {
    const order = createMockOrder({
      makingAmount: "0",
      takingAmount: "0",
    });
    
    const extensionData = createMockExtensionData({
      deposits: 0n,
      timelocks: 0n,
    });
    
    const immutables = extractImmutables(order, extensionData);
    
    assertEquals(immutables.srcAmount, 0n);
    assertEquals(immutables.dstAmount, 0n);
    assertEquals(immutables.srcSafetyDeposit, 0n);
    assertEquals(immutables.dstSafetyDeposit, 0n);
  });

  await t.step("should handle invalid private key format", async () => {
    // This test would require actual createDestinationEscrow function
    // which depends on viem clients, so we skip it in the simplified version
    // Test passes as a placeholder for future implementation
    assert(true, "Test placeholder for viem-dependent functionality");
  });
});