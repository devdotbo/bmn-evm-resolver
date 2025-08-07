#!/usr/bin/env -S deno test --allow-net --allow-env --allow-read --allow-write

/**
 * PostInteraction v2.2.0 Comprehensive Test Suite
 * 
 * Tests the resolver's integration with SimplifiedEscrowFactory v2.2.0
 * Covers unit tests, integration tests, error scenarios, and performance benchmarks
 */

import {
  assertEquals,
  assertExists,
  assertThrows,
  assertRejects,
  assert,
  assertNotEquals,
} from "https://deno.land/std@0.210.0/assert/mod.ts";
import { 
  encodePostInteractionData, 
  packTimelocks, 
  packDeposits,
  MAKER_TRAITS,
  generateNonce,
  type EscrowParams 
} from "../src/utils/postinteraction-v2.ts";
import { CREATE3_ADDRESSES } from "../src/config/contracts.ts";
import { parseUnits, formatUnits, type Address, type Hex, keccak256, encodePacked } from "viem";

// Test Constants - Using checksummed addresses for viem compatibility
const TEST_ADDRESSES = {
  FACTORY_V2_2: "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address,
  SRC_IMPL: "0x77CC1A51dC5855bcF0d9f1c1FceaeE7fb855a535" as Address,
  DST_IMPL: "0x36938b7899A17362520AA741C0E0dA0c8EfE5e3b" as Address,
  BMN_TOKEN: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
  ALICE: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address, // Hardhat test address 1
  BOB: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address, // Hardhat test address 2
  CHARLIE: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address, // Hardhat test address 3
  ZERO: "0x0000000000000000000000000000000000000000" as Address,
};

const TEST_HASHLOCK = "0x1234567890123456789012345678901234567890123456789012345678901234" as Hex;
const ZERO_HASHLOCK = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

// Helper function to create test escrow params
function createTestEscrowParams(overrides?: Partial<EscrowParams>): EscrowParams {
  return {
    srcImplementation: TEST_ADDRESSES.SRC_IMPL,
    dstImplementation: TEST_ADDRESSES.DST_IMPL,
    timelocks: packTimelocks(3600, 300),
    hashlock: TEST_HASHLOCK,
    srcMaker: TEST_ADDRESSES.ALICE,
    srcTaker: TEST_ADDRESSES.BOB,
    srcToken: TEST_ADDRESSES.BMN_TOKEN,
    srcAmount: parseUnits("100", 18),
    srcSafetyDeposit: parseUnits("10", 18),
    dstReceiver: TEST_ADDRESSES.CHARLIE,
    dstToken: TEST_ADDRESSES.BMN_TOKEN,
    dstAmount: parseUnits("95", 18),
    dstSafetyDeposit: parseUnits("10", 18),
    nonce: generateNonce(),
    ...overrides,
  };
}

// ============================================================================
// UNIT TESTS
// ============================================================================

Deno.test("PostInteraction v2.2.0 Unit Tests", async (t) => {
  
  await t.step("should encode PostInteraction data correctly", () => {
    const factoryAddress = CREATE3_ADDRESSES.ESCROW_FACTORY_V2;
    const params: EscrowParams = {
      srcImplementation: "0x77CC1A51dC5855bcF0d9f1c1FceaeE7fb855a535" as Address,
      dstImplementation: "0x36938b7899A17362520AA741C0E0dA0c8EfE5e3b" as Address,
      timelocks: packTimelocks(3600, 300),
      hashlock: "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`,
      srcMaker: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa" as Address,
      srcTaker: "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb" as Address,
      srcToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
      srcAmount: parseUnits("100", 18),
      srcSafetyDeposit: parseUnits("10", 18),
      dstReceiver: "0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc" as Address,
      dstToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
      dstAmount: parseUnits("95", 18),
      dstSafetyDeposit: parseUnits("10", 18),
      nonce: 12345n,
    };

    const encoded = encodePostInteractionData(factoryAddress, params);
    
    // Check that encoded data starts with factory address (20 bytes = 40 hex chars + 0x)
    assertEquals(encoded.slice(0, 42).toLowerCase(), factoryAddress.toLowerCase());
    
    // Check that encoded data has content after factory address
    assertExists(encoded.slice(42));
    
    // Verify minimum length (factory + all parameters)
    // 20 bytes factory + 14 parameters * 32 bytes each = 20 + 448 = 468 bytes = 936 hex chars + 0x
    assertEquals(encoded.length >= 938, true, "Encoded data should be at least 938 characters");
  });

  await t.step("should pack timelocks correctly", () => {
    const timelocks = packTimelocks(3600, 300); // 1 hour and 5 minutes
    
    // Timelocks should be a bigint
    assertEquals(typeof timelocks, "bigint");
    
    // Should be non-zero
    assertEquals(timelocks > 0n, true);
    
    // Extract timestamps (approximate check - should be in the future)
    const now = BigInt(Math.floor(Date.now() / 1000));
    const srcCancellation = timelocks >> 128n;
    const dstWithdrawal = timelocks & ((1n << 128n) - 1n);
    
    // Source cancellation should be about 1 hour in the future
    assertEquals(srcCancellation > now, true, "Source cancellation should be in the future");
    assertEquals(srcCancellation < now + 3700n, true, "Source cancellation should be within 1 hour");
    
    // Destination withdrawal should be about 5 minutes in the future
    assertEquals(dstWithdrawal > now, true, "Destination withdrawal should be in the future");
    assertEquals(dstWithdrawal < now + 400n, true, "Destination withdrawal should be within 5 minutes");
  });

  await t.step("should pack deposits correctly", () => {
    const srcDeposit = parseUnits("10", 18);
    const dstDeposit = parseUnits("5", 18);
    const packed = packDeposits(srcDeposit, dstDeposit);
    
    // Extract deposits
    const extractedDst = packed >> 128n;
    const extractedSrc = packed & ((1n << 128n) - 1n);
    
    assertEquals(extractedSrc, srcDeposit);
    assertEquals(extractedDst, dstDeposit);
  });

  await t.step("should generate maker traits for PostInteraction", () => {
    const traits = MAKER_TRAITS.forPostInteraction();
    
    // Should have HAS_EXTENSION flag (bit 2)
    assertEquals((traits & (1n << 2n)) > 0n, true, "Should have HAS_EXTENSION flag");
    
    // Should have POST_INTERACTION flag (bit 7)
    assertEquals((traits & (1n << 7n)) > 0n, true, "Should have POST_INTERACTION flag");
    
    // Combined value should be correct
    assertEquals(traits, MAKER_TRAITS.HAS_EXTENSION | MAKER_TRAITS.POST_INTERACTION);
  });

  await t.step("should generate unique nonces", () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    
    // Nonces should be different
    assertEquals(nonce1 !== nonce2, true, "Nonces should be unique");
    
    // Nonces should be positive
    assertEquals(nonce1 > 0n, true);
    assertEquals(nonce2 > 0n, true);
  });

  await t.step("should verify factory address is v2.2.0", () => {
    const factoryAddress = CREATE3_ADDRESSES.ESCROW_FACTORY_V2;
    
    // Should be the v2.2.0 address
    assertEquals(
      factoryAddress.toLowerCase(), 
      TEST_ADDRESSES.FACTORY_V2_2.toLowerCase(),
      "Factory address should be v2.2.0"
    );
  });

  await t.step("should verify implementation addresses", () => {
    const srcImpl = CREATE3_ADDRESSES.ESCROW_SRC_IMPL;
    const dstImpl = CREATE3_ADDRESSES.ESCROW_DST_IMPL;
    
    // Should have valid implementation addresses
    assertExists(srcImpl, "Source implementation should exist");
    assertExists(dstImpl, "Destination implementation should exist");
    
    // Should be different addresses
    assertEquals(srcImpl !== dstImpl, true, "Implementations should be different");
  });

  await t.step("should handle edge case timelocks", () => {
    // Minimum timelock (1 second)
    const minTimelock = packTimelocks(1, 1);
    assert(minTimelock > 0n, "Minimum timelock should be valid");
    
    // Maximum practical timelock (30 days)
    const maxTimelock = packTimelocks(30 * 24 * 3600, 30 * 24 * 3600);
    assert(maxTimelock > 0n, "Maximum timelock should be valid");
    
    // Zero timelock should work (immediate)
    const zeroTimelock = packTimelocks(0, 0);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const srcCancel = zeroTimelock >> 128n;
    const dstWithdraw = zeroTimelock & ((1n << 128n) - 1n);
    
    // Should be approximately now
    assert(srcCancel >= now - 1n && srcCancel <= now + 1n, "Zero timelock src should be now");
    assert(dstWithdraw >= now - 1n && dstWithdraw <= now + 1n, "Zero timelock dst should be now");
  });

  await t.step("should handle edge case deposits", () => {
    // Zero deposits
    const zeroPacked = packDeposits(0n, 0n);
    assertEquals(zeroPacked, 0n, "Zero deposits should pack to 0");
    
    // Maximum uint128 deposits
    const maxUint128 = (1n << 128n) - 1n;
    const maxPacked = packDeposits(maxUint128, maxUint128);
    const extractedDst = maxPacked >> 128n;
    const extractedSrc = maxPacked & ((1n << 128n) - 1n);
    assertEquals(extractedSrc, maxUint128, "Max src deposit should unpack correctly");
    assertEquals(extractedDst, maxUint128, "Max dst deposit should unpack correctly");
    
    // Asymmetric deposits
    const asymmetric = packDeposits(parseUnits("1", 18), parseUnits("1000", 18));
    assert(asymmetric > 0n, "Asymmetric deposits should be valid");
  });

  await t.step("should validate address formats", () => {
    const params = createTestEscrowParams();
    
    // All addresses should be 42 characters (0x + 40 hex chars)
    assertEquals(params.srcImplementation.length, 42);
    assertEquals(params.dstImplementation.length, 42);
    assertEquals(params.srcMaker.length, 42);
    assertEquals(params.srcTaker.length, 42);
    assertEquals(params.srcToken.length, 42);
    assertEquals(params.dstReceiver.length, 42);
    assertEquals(params.dstToken.length, 42);
    
    // All addresses should start with 0x
    assert(params.srcImplementation.startsWith("0x"));
    assert(params.dstImplementation.startsWith("0x"));
    assert(params.srcMaker.startsWith("0x"));
    assert(params.srcTaker.startsWith("0x"));
    assert(params.srcToken.startsWith("0x"));
    assert(params.dstReceiver.startsWith("0x"));
    assert(params.dstToken.startsWith("0x"));
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

Deno.test("PostInteraction v2.2.0 Integration Tests", async (t) => {
  
  await t.step("should encode complete escrow creation data", () => {
    const params = createTestEscrowParams();
    const encoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params);
    
    // Verify structure
    assert(encoded.startsWith("0x"), "Encoded data should be hex string");
    assertEquals(encoded.slice(0, 42).toLowerCase(), TEST_ADDRESSES.FACTORY_V2_2.toLowerCase());
    
    // Verify length (factory 20 bytes + 14 params * 32 bytes each = 468 bytes = 936 hex chars)
    const expectedMinLength = 2 + 40 + (14 * 64); // 0x + factory + params
    assert(encoded.length >= expectedMinLength, `Encoded length ${encoded.length} should be at least ${expectedMinLength}`);
  });

  await t.step("should handle cross-chain escrow scenarios", () => {
    // Scenario 1: Same-chain escrow (testing)
    const sameChainParams = createTestEscrowParams({
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      dstToken: TEST_ADDRESSES.BMN_TOKEN,
      srcAmount: parseUnits("100", 18),
      dstAmount: parseUnits("100", 18), // No bridge fee in same-chain
    });
    const sameChainEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, sameChainParams);
    assertExists(sameChainEncoded);
    
    // Scenario 2: Cross-chain with bridge fee
    const crossChainParams = createTestEscrowParams({
      srcAmount: parseUnits("100", 18),
      dstAmount: parseUnits("95", 18), // 5% bridge fee
    });
    const crossChainEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, crossChainParams);
    assertExists(crossChainEncoded);
    
    // Scenario 3: High-value escrow
    const highValueParams = createTestEscrowParams({
      srcAmount: parseUnits("1000000", 18), // 1M tokens
      dstAmount: parseUnits("950000", 18),
      srcSafetyDeposit: parseUnits("100000", 18), // 10% deposit
      dstSafetyDeposit: parseUnits("100000", 18),
    });
    const highValueEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, highValueParams);
    assertExists(highValueEncoded);
  });

  await t.step("should encode different timelock configurations", () => {
    // Fast escrow (5 minutes)
    const fastParams = createTestEscrowParams({
      timelocks: packTimelocks(300, 300),
    });
    const fastEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, fastParams);
    assertExists(fastEncoded);
    
    // Standard escrow (1 hour source, 30 minutes destination)
    const standardParams = createTestEscrowParams({
      timelocks: packTimelocks(3600, 1800),
    });
    const standardEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, standardParams);
    assertExists(standardEncoded);
    
    // Long-term escrow (7 days)
    const longTermParams = createTestEscrowParams({
      timelocks: packTimelocks(7 * 24 * 3600, 7 * 24 * 3600),
    });
    const longTermEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, longTermParams);
    assertExists(longTermEncoded);
    
    // Verify all encodings are different
    assertNotEquals(fastEncoded, standardEncoded);
    assertNotEquals(standardEncoded, longTermEncoded);
    assertNotEquals(fastEncoded, longTermEncoded);
  });

  await t.step("should generate unique escrow addresses", () => {
    // Each escrow should have a unique address based on parameters
    const params1 = createTestEscrowParams({ nonce: 1n });
    const params2 = createTestEscrowParams({ nonce: 2n });
    const params3 = createTestEscrowParams({ nonce: 3n });
    
    const encoded1 = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params1);
    const encoded2 = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params2);
    const encoded3 = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params3);
    
    // All encodings should be unique due to different nonces
    assertNotEquals(encoded1, encoded2);
    assertNotEquals(encoded2, encoded3);
    assertNotEquals(encoded1, encoded3);
    
    // Calculate expected escrow addresses (simplified - actual would use CREATE3)
    const hash1 = keccak256(encoded1);
    const hash2 = keccak256(encoded2);
    const hash3 = keccak256(encoded3);
    
    assertNotEquals(hash1, hash2);
    assertNotEquals(hash2, hash3);
    assertNotEquals(hash1, hash3);
  });

  await t.step("should handle maker traits correctly for different order types", () => {
    // PostInteraction order
    const postInteractionTraits = MAKER_TRAITS.forPostInteraction();
    assert((postInteractionTraits & MAKER_TRAITS.HAS_EXTENSION) > 0n, "Should have extension flag");
    assert((postInteractionTraits & MAKER_TRAITS.POST_INTERACTION) > 0n, "Should have post interaction flag");
    
    // Regular order (no post interaction)
    const regularTraits = 0n;
    assert((regularTraits & MAKER_TRAITS.POST_INTERACTION) === 0n, "Regular order should not have post interaction");
    
    // Extension-only order (no post interaction)
    const extensionOnlyTraits = MAKER_TRAITS.HAS_EXTENSION;
    assert((extensionOnlyTraits & MAKER_TRAITS.HAS_EXTENSION) > 0n, "Should have extension flag");
    assert((extensionOnlyTraits & MAKER_TRAITS.POST_INTERACTION) === 0n, "Should not have post interaction flag");
  });
});

// ============================================================================
// ERROR SCENARIO TESTS
// ============================================================================

Deno.test("PostInteraction v2.2.0 Error Scenarios", async (t) => {
  
  await t.step("should handle invalid addresses gracefully", () => {
    // Test with invalid factory address
    assertThrows(
      () => {
        const params = createTestEscrowParams();
        encodePostInteractionData("invalid" as Address, params);
      },
      Error,
      undefined,
      "Should throw on invalid factory address format"
    );
    
    // Test with zero addresses (which might be invalid for some fields)
    const zeroAddressParams = createTestEscrowParams({
      srcMaker: TEST_ADDRESSES.ZERO,
    });
    // Should not throw - zero address might be valid in some cases
    const encoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, zeroAddressParams);
    assertExists(encoded);
  });

  await t.step("should handle invalid amounts", () => {
    // Negative amounts should not be possible with bigint
    // But we can test zero amounts
    const zeroAmountParams = createTestEscrowParams({
      srcAmount: 0n,
      dstAmount: 0n,
    });
    const encoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, zeroAmountParams);
    assertExists(encoded, "Zero amounts should encode successfully");
    
    // Test with amounts exceeding uint256 max (not possible with bigint, but good to document)
    const maxUint256 = (1n << 256n) - 1n;
    const maxAmountParams = createTestEscrowParams({
      srcAmount: maxUint256,
      dstAmount: maxUint256,
    });
    const maxEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, maxAmountParams);
    assertExists(maxEncoded, "Max uint256 amounts should encode successfully");
  });

  await t.step("should handle invalid timelocks", () => {
    // Test with past timestamps (should still encode but would fail on-chain)
    const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const pastTimelock = (BigInt(pastTime) << 128n) | BigInt(pastTime);
    
    const pastTimelockParams = createTestEscrowParams({
      timelocks: pastTimelock,
    });
    const encoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, pastTimelockParams);
    assertExists(encoded, "Past timelocks should encode (validation happens on-chain)");
  });

  await t.step("should handle invalid hashlocks", () => {
    // Zero hashlock
    const zeroHashlockParams = createTestEscrowParams({
      hashlock: ZERO_HASHLOCK,
    });
    const zeroEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, zeroHashlockParams);
    assertExists(zeroEncoded, "Zero hashlock should encode successfully");
    
    // Invalid length hashlock should throw
    assertThrows(
      () => {
        const params = createTestEscrowParams({
          hashlock: "0x1234" as Hex, // Too short
        });
        encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params);
      },
      Error,
      undefined,
      "Should throw on invalid hashlock length"
    );
  });

  await t.step("should handle mismatched token decimals", () => {
    // Test with 6-decimal token (USDC-like) amounts
    const usdcParams = createTestEscrowParams({
      srcAmount: parseUnits("1000", 6), // 1000 USDC
      dstAmount: parseUnits("995", 6),  // 995 USDC (0.5% fee)
      srcSafetyDeposit: parseUnits("100", 6),
      dstSafetyDeposit: parseUnits("100", 6),
    });
    const usdcEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, usdcParams);
    assertExists(usdcEncoded);
    
    // Test with 0-decimal token (some NFT-like tokens)
    const nftParams = createTestEscrowParams({
      srcAmount: 1n, // 1 token
      dstAmount: 1n, // 1 token
      srcSafetyDeposit: 0n, // No fractional deposits possible
      dstSafetyDeposit: 0n,
    });
    const nftEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, nftParams);
    assertExists(nftEncoded);
  });
});

// ============================================================================
// PERFORMANCE BENCHMARKS
// ============================================================================

Deno.test("PostInteraction v2.2.0 Performance Benchmarks", async (t) => {
  
  await t.step("should encode data efficiently", () => {
    const iterations = 1000;
    const params = createTestEscrowParams();
    
    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params);
    }
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    
    console.log(`\n  ⚡ Encoding performance: ${avgTime.toFixed(3)}ms per operation`);
    console.log(`  ⚡ Total time for ${iterations} iterations: ${totalTime.toFixed(2)}ms`);
    console.log(`  ⚡ Operations per second: ${(1000 / avgTime).toFixed(0)}`);
    
    // Performance threshold: should be under 1ms per operation
    assert(avgTime < 1, `Encoding should be fast (avg: ${avgTime.toFixed(3)}ms)`);
  });

  await t.step("should generate nonces efficiently", () => {
    const iterations = 10000;
    const nonces = new Set<string>();
    
    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      const nonce = generateNonce();
      nonces.add(nonce.toString());
    }
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    
    console.log(`\n  ⚡ Nonce generation: ${avgTime.toFixed(4)}ms per operation`);
    console.log(`  ⚡ Total time for ${iterations} iterations: ${totalTime.toFixed(2)}ms`);
    console.log(`  ⚡ Unique nonces generated: ${nonces.size}`);
    
    // All nonces should be unique
    assertEquals(nonces.size, iterations, "All nonces should be unique");
    
    // Should be very fast
    assert(avgTime < 0.1, `Nonce generation should be very fast (avg: ${avgTime.toFixed(4)}ms)`);
  });

  await t.step("should pack timelocks efficiently", () => {
    const iterations = 10000;
    
    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      packTimelocks(3600, 300);
    }
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    
    console.log(`\n  ⚡ Timelock packing: ${avgTime.toFixed(4)}ms per operation`);
    console.log(`  ⚡ Operations per second: ${(1000 / avgTime).toFixed(0)}`);
    
    assert(avgTime < 0.1, `Timelock packing should be very fast (avg: ${avgTime.toFixed(4)}ms)`);
  });

  await t.step("should handle batch encoding efficiently", () => {
    const batchSize = 100;
    const batches = 10;
    
    const startTime = performance.now();
    for (let batch = 0; batch < batches; batch++) {
      const encodedBatch: string[] = [];
      for (let i = 0; i < batchSize; i++) {
        const params = createTestEscrowParams({ nonce: BigInt(batch * batchSize + i) });
        const encoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params);
        encodedBatch.push(encoded);
      }
      // Verify batch
      assertEquals(encodedBatch.length, batchSize);
    }
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const totalOperations = batchSize * batches;
    const avgTime = totalTime / totalOperations;
    
    console.log(`\n  ⚡ Batch encoding: ${avgTime.toFixed(3)}ms per operation`);
    console.log(`  ⚡ Total operations: ${totalOperations}`);
    console.log(`  ⚡ Total time: ${totalTime.toFixed(2)}ms`);
    console.log(`  ⚡ Throughput: ${(totalOperations / (totalTime / 1000)).toFixed(0)} ops/sec`);
    
    // Should handle batches efficiently
    assert(avgTime < 2, `Batch encoding should be efficient (avg: ${avgTime.toFixed(3)}ms)`);
  });
});

// ============================================================================
// ADVANCED INTEGRATION TESTS
// ============================================================================

Deno.test("PostInteraction v2.2.0 Advanced Integration", async (t) => {
  
  await t.step("should handle multi-party escrows", () => {
    // Test with different maker/taker/receiver combinations
    const multiPartyParams = createTestEscrowParams({
      srcMaker: TEST_ADDRESSES.ALICE,
      srcTaker: TEST_ADDRESSES.BOB,
      dstReceiver: TEST_ADDRESSES.CHARLIE,
    });
    const encoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, multiPartyParams);
    assertExists(encoded);
    
    // All parties are different
    assertNotEquals(multiPartyParams.srcMaker, multiPartyParams.srcTaker);
    assertNotEquals(multiPartyParams.srcMaker, multiPartyParams.dstReceiver);
    assertNotEquals(multiPartyParams.srcTaker, multiPartyParams.dstReceiver);
  });

  await t.step("should support different token pairs", () => {
    // BMN to BMN (same token)
    const sameTokenParams = createTestEscrowParams({
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      dstToken: TEST_ADDRESSES.BMN_TOKEN,
    });
    const sameTokenEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, sameTokenParams);
    assertExists(sameTokenEncoded);
    
    // BMN to USDC (different tokens - would be cross-chain swap)
    const differentTokenParams = createTestEscrowParams({
      srcToken: TEST_ADDRESSES.BMN_TOKEN,
      dstToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
    });
    const differentTokenEncoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, differentTokenParams);
    assertExists(differentTokenEncoded);
    
    assertNotEquals(sameTokenEncoded, differentTokenEncoded);
  });

  await t.step("should calculate escrow address deterministically", () => {
    // Same parameters should generate same encoding
    const params1 = createTestEscrowParams({ nonce: 12345n });
    const params2 = createTestEscrowParams({ nonce: 12345n });
    
    const encoded1 = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params1);
    const encoded2 = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params2);
    
    assertEquals(encoded1, encoded2, "Same parameters should produce same encoding");
    
    // Different nonce should generate different encoding
    const params3 = createTestEscrowParams({ nonce: 12346n });
    const encoded3 = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params3);
    
    assertNotEquals(encoded1, encoded3, "Different nonce should produce different encoding");
  });

  await t.step("should support atomic swap workflows", () => {
    // Simulate atomic swap setup
    const atomicSwapParams = createTestEscrowParams({
      srcAmount: parseUnits("1000", 18), // Alice locks 1000 BMN
      dstAmount: parseUnits("950", 18),  // Bob receives 950 BMN (5% fee)
      srcSafetyDeposit: parseUnits("100", 18), // 10% safety deposit
      dstSafetyDeposit: parseUnits("95", 18),  // 10% of destination amount
      timelocks: packTimelocks(7200, 3600), // 2 hours for source, 1 hour for destination
    });
    
    const encoded = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, atomicSwapParams);
    assertExists(encoded);
    
    // Verify safety deposits are proportional
    const srcDepositRatio = Number(formatUnits(atomicSwapParams.srcSafetyDeposit, 18)) / 
                           Number(formatUnits(atomicSwapParams.srcAmount, 18));
    const dstDepositRatio = Number(formatUnits(atomicSwapParams.dstSafetyDeposit, 18)) / 
                           Number(formatUnits(atomicSwapParams.dstAmount, 18));
    
    assert(Math.abs(srcDepositRatio - 0.1) < 0.01, "Source deposit should be ~10%");
    assert(Math.abs(dstDepositRatio - 0.1) < 0.01, "Destination deposit should be ~10%");
  });
});

// ============================================================================
// MOCK CONTRACT INTERACTION TESTS
// ============================================================================

Deno.test("PostInteraction v2.2.0 Mock Contract Tests", async (t) => {
  
  await t.step("should simulate successful escrow creation", async () => {
    const params = createTestEscrowParams();
    const extensionData = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params);
    
    // Simulate contract call (in real scenario, this would call the contract)
    const mockPostInteraction = (data: string): { success: boolean; escrowAddress?: string; error?: string } => {
      // Validate data format
      if (!data.startsWith("0x")) return { success: false, error: "Invalid hex data" };
      if (data.length < 938) return { success: false, error: "Insufficient data length" };
      
      // Extract factory address
      const factory = data.slice(0, 42);
      if (factory.toLowerCase() !== TEST_ADDRESSES.FACTORY_V2_2.toLowerCase()) {
        return { success: false, error: "Invalid factory address" };
      }
      
      // Mock successful escrow creation
      const mockEscrowAddress = `0x${keccak256(data as Hex).slice(26)}`; // Simplified address generation
      return { success: true, escrowAddress: mockEscrowAddress };
    };
    
    const result = mockPostInteraction(extensionData);
    assert(result.success, "Mock escrow creation should succeed");
    assertExists(result.escrowAddress, "Should return escrow address");
    assertEquals(result.escrowAddress?.length, 42, "Escrow address should be valid format");
  });

  await t.step("should simulate escrow creation failures", async () => {
    // Test various failure scenarios
    const mockPostInteractionWithErrors = (data: string, scenario: string): { success: boolean; error: string } => {
      switch (scenario) {
        case "INSUFFICIENT_BALANCE":
          return { success: false, error: "Insufficient token balance" };
        case "INVALID_TIMELOCK":
          return { success: false, error: "Timelock already expired" };
        case "DUPLICATE_NONCE":
          return { success: false, error: "Nonce already used" };
        case "PAUSED":
          return { success: false, error: "Factory is paused" };
        case "INVALID_AMOUNTS":
          return { success: false, error: "Invalid token amounts" };
        default:
          return { success: false, error: "Unknown error" };
      }
    };
    
    const params = createTestEscrowParams();
    const extensionData = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params);
    
    // Test each error scenario
    const scenarios = [
      "INSUFFICIENT_BALANCE",
      "INVALID_TIMELOCK",
      "DUPLICATE_NONCE",
      "PAUSED",
      "INVALID_AMOUNTS",
    ];
    
    for (const scenario of scenarios) {
      const result = mockPostInteractionWithErrors(extensionData, scenario);
      assert(!result.success, `Should fail for ${scenario}`);
      assertExists(result.error, `Should have error message for ${scenario}`);
    }
  });

  await t.step("should validate extension data before submission", () => {
    // Validation function that would be used before sending to contract
    const validateExtensionData = (data: string): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];
      
      // Check hex format
      if (!data.startsWith("0x")) {
        errors.push("Data must be hex string starting with 0x");
      }
      
      // Check minimum length
      if (data.length < 938) {
        errors.push(`Data too short: ${data.length} chars, minimum 938 required`);
      }
      
      // Check factory address
      const factory = data.slice(0, 42);
      if (factory.toLowerCase() !== TEST_ADDRESSES.FACTORY_V2_2.toLowerCase()) {
        errors.push(`Invalid factory address: ${factory}`);
      }
      
      return { valid: errors.length === 0, errors };
    };
    
    // Test valid data
    const validParams = createTestEscrowParams();
    const validData = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, validParams);
    const validResult = validateExtensionData(validData);
    assert(validResult.valid, "Valid data should pass validation");
    assertEquals(validResult.errors.length, 0, "Valid data should have no errors");
    
    // Test invalid data
    const invalidResults = [
      validateExtensionData("not-hex"),
      validateExtensionData("0x1234"), // Too short
      validateExtensionData("0x" + "00".repeat(500)), // Wrong factory
    ];
    
    for (const result of invalidResults) {
      assert(!result.valid, "Invalid data should fail validation");
      assert(result.errors.length > 0, "Invalid data should have errors");
    }
  });
});

// ============================================================================
// LIMIT ORDER INTEGRATION TESTS
// ============================================================================

Deno.test("PostInteraction v2.2.0 Limit Order Integration", async (t) => {
  
  await t.step("should create limit order with PostInteraction", () => {
    // Simulate creating a limit order that triggers escrow creation
    const orderParams = {
      maker: TEST_ADDRESSES.ALICE,
      taker: TEST_ADDRESSES.BOB,
      makerAsset: TEST_ADDRESSES.BMN_TOKEN,
      takerAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
      makingAmount: parseUnits("1000", 18),
      takingAmount: parseUnits("1000", 6), // USDC has 6 decimals
      makerTraits: MAKER_TRAITS.forPostInteraction(),
    };
    
    // Create escrow params for the order
    const escrowParams = createTestEscrowParams({
      srcMaker: orderParams.maker,
      srcTaker: orderParams.taker,
      srcToken: orderParams.makerAsset,
      srcAmount: orderParams.makingAmount,
      dstToken: orderParams.takerAsset,
      dstAmount: orderParams.takingAmount,
    });
    
    const extensionData = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, escrowParams);
    
    // Verify order has correct traits
    assert((orderParams.makerTraits & MAKER_TRAITS.HAS_EXTENSION) > 0n);
    assert((orderParams.makerTraits & MAKER_TRAITS.POST_INTERACTION) > 0n);
    
    // Verify extension data is properly formatted
    assertExists(extensionData);
    assert(extensionData.startsWith("0x"));
  });

  await t.step("should handle order fill with escrow creation", () => {
    // Simulate the full flow of order fill triggering escrow
    const mockOrderFill = (orderId: string, extensionData: string): {
      orderFilled: boolean;
      escrowCreated: boolean;
      escrowAddress?: string;
      txHash?: string;
    } => {
      // Validate order exists and is fillable
      if (!orderId) return { orderFilled: false, escrowCreated: false };
      
      // Validate extension data
      if (!extensionData.startsWith("0x") || extensionData.length < 938) {
        return { orderFilled: false, escrowCreated: false };
      }
      
      // Simulate successful fill and escrow creation
      const mockEscrowAddress = `0x${keccak256(extensionData as Hex).slice(26)}`;
      const mockTxHash = `0x${keccak256(encodePacked(["bytes32"], [orderId as Hex])).slice(2)}`;
      
      return {
        orderFilled: true,
        escrowCreated: true,
        escrowAddress: mockEscrowAddress,
        txHash: mockTxHash,
      };
    };
    
    const orderId = "0x" + "1".repeat(64);
    const params = createTestEscrowParams();
    const extensionData = encodePostInteractionData(TEST_ADDRESSES.FACTORY_V2_2, params);
    
    const result = mockOrderFill(orderId, extensionData);
    assert(result.orderFilled, "Order should be filled");
    assert(result.escrowCreated, "Escrow should be created");
    assertExists(result.escrowAddress, "Should have escrow address");
    assertExists(result.txHash, "Should have transaction hash");
  });
});

// Run summary
if (import.meta.main) {
  console.log("\n🧪 PostInteraction v2.2.0 Comprehensive Test Suite\n");
  console.log("Test Categories:");
  console.log("  ✅ Unit Tests - Core functionality");
  console.log("  ✅ Integration Tests - Complete workflows");
  console.log("  ✅ Error Scenarios - Edge cases and failures");
  console.log("  ✅ Performance Benchmarks - Speed and efficiency");
  console.log("  ✅ Advanced Integration - Complex scenarios");
  console.log("  ✅ Mock Contract Tests - Simulated interactions");
  console.log("  ✅ Limit Order Integration - 1inch protocol integration\n");
}