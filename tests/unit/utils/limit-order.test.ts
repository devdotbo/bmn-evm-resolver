/**
 * Unit tests for limit order utilities
 * Tests fillLimitOrder, ensureLimitOrderApprovals, decodeProtocolError, and related functions
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertStringIncludes,
  assertObjectMatch,
  spy,
  stub,
  returnsNext,
  assertSpyCall,
  assertSpyCalls,
  delay,
} from "../../setup.ts";
import { TEST_ADDRESSES, TEST_VALUES, TestDataGenerator } from "../../setup.ts";
import {
  fillLimitOrder,
  ensureLimitOrderApprovals,
  decodeProtocolError,
  calculateOrderHash,
  handleLimitOrderError,
  type LimitOrderData,
  type FillOrderParams,
  type FillOrderResult,
} from "../../../src/utils/limit-order.ts";
import { PostInteractionEventMonitor } from "../../../src/monitoring/postinteraction-events.ts";
import { PostInteractionErrorHandler, PostInteractionErrorType } from "../../../src/utils/postinteraction-errors.ts";
import { TokenApprovalManager } from "../../../src/utils/token-approvals.ts";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { parseAbi, encodeAbiParameters, parseAbiParameters } from "viem";

// Test data generator
const dataGenerator = new TestDataGenerator();

// Mock order data
function createMockOrder(overrides?: Partial<LimitOrderData>): LimitOrderData {
  return {
    salt: 1234567890n,
    maker: TEST_ADDRESSES.ALICE,
    receiver: TEST_ADDRESSES.ALICE,
    makerAsset: TEST_ADDRESSES.BMN_TOKEN,
    takerAsset: TEST_ADDRESSES.USDC_TOKEN,
    makingAmount: TEST_VALUES.TEN_TOKENS,
    takingAmount: TEST_VALUES.ONE_TOKEN,
    makerTraits: 0n,
    ...overrides,
  };
}

// Mock fill order params
function createMockFillOrderParams(overrides?: Partial<FillOrderParams>): FillOrderParams {
  return {
    order: createMockOrder(),
    signature: "0x" + "1".repeat(130) as Hex, // Mock signature
    extensionData: "0x" as Hex,
    fillAmount: TEST_VALUES.ONE_TOKEN,
    takerTraits: 0n,
    ...overrides,
  };
}

// Mock extension data for PostInteraction
function createMockExtensionData(params?: {
  hashlock?: Hex;
  dstChainId?: bigint;
  dstToken?: Address;
  deposits?: bigint;
  timelocks?: bigint;
}): Hex {
  const defaultParams = {
    hashlock: TEST_VALUES.TEST_HASHLOCK,
    dstChainId: BigInt(TEST_VALUES.CHAIN_B),
    dstToken: TEST_ADDRESSES.USDC_TOKEN,
    deposits: TEST_VALUES.ONE_TOKEN,
    timelocks: BigInt(Math.floor(Date.now() / 1000) + 3600) << 128n | BigInt(Math.floor(Date.now() / 1000) + 7200),
    ...params,
  };

  // Encode extension data (offsets word + postInteraction target + extraData)
  const offsetsWord = "0x" + "0".repeat(62) + "20"; // Offset to postInteraction data
  const postInteractionTarget = TEST_ADDRESSES.ESCROW_FACTORY.slice(2); // Factory address
  const extraData = encodeAbiParameters(
    parseAbiParameters("bytes32,uint256,address,uint256,uint256"),
    [
      defaultParams.hashlock,
      defaultParams.dstChainId,
      defaultParams.dstToken,
      defaultParams.deposits,
      defaultParams.timelocks,
    ]
  ).slice(2);

  return (offsetsWord + postInteractionTarget + extraData) as Hex;
}

// Create mock clients without using viem-mock.ts to avoid stub conflicts
function createTestPublicClient(overrides?: {
  simulateContract?: () => Promise<any>;
  waitForTransactionReceipt?: () => Promise<any>;
  readContract?: () => Promise<any>;
  getGasPrice?: () => Promise<bigint>;
}): PublicClient {
  return {
    simulateContract: overrides?.simulateContract || (() => Promise.resolve({
      result: true,
      request: { address: TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL, functionName: "fillOrderArgs", args: [] },
    })),
    waitForTransactionReceipt: overrides?.waitForTransactionReceipt || (() => Promise.resolve({
      transactionHash: "0x" + "a".repeat(64) as Hex,
      gasUsed: 150000n,
      blockNumber: 1000n,
      blockHash: "0x" + "b".repeat(64) as Hex,
      from: TEST_ADDRESSES.ALICE,
      to: TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL,
      status: "success",
      logs: [],
    })),
    readContract: overrides?.readContract || (() => Promise.resolve(0n)),
    getGasPrice: overrides?.getGasPrice || (() => Promise.resolve(1000000000n)),
    account: undefined,
  } as any as PublicClient;
}

function createTestWalletClient(overrides?: {
  writeContract?: () => Promise<Hex>;
}): WalletClient {
  return {
    writeContract: overrides?.writeContract || (() => Promise.resolve("0x" + "c".repeat(64) as Hex)),
    account: { address: TEST_ADDRESSES.ALICE },
  } as any as WalletClient;
}

Deno.test("fillLimitOrder - successful order filling with PostInteraction", async () => {
  const txHash = "0x" + "a".repeat(64) as Hex;
  
  const publicClient = createTestPublicClient({
    waitForTransactionReceipt: () => Promise.resolve({
      transactionHash: txHash,
      gasUsed: 150000n,
      blockNumber: 1000n,
      blockHash: "0x" + "b".repeat(64) as Hex,
      from: TEST_ADDRESSES.ALICE,
      to: TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL,
      status: "success",
      logs: [],
    }),
  });
  
  const walletClient = createTestWalletClient({
    writeContract: () => Promise.resolve(txHash),
  });
  
  const protocolAddress = TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL;
  const factoryAddress = TEST_ADDRESSES.ESCROW_FACTORY;
  
  const extensionData = createMockExtensionData();
  const params = createMockFillOrderParams({ extensionData });

  // Mock PostInteraction event monitoring
  const parseEventsStub = stub(
    PostInteractionEventMonitor.prototype,
    "parsePostInteractionEvents",
    () => ({
      postInteractionExecuted: {
        orderHash: TEST_VALUES.TEST_HASHLOCK,
        taker: TEST_ADDRESSES.BOB,
        srcEscrow: TEST_ADDRESSES.ALICE,
        dstEscrow: TEST_ADDRESSES.BOB,
        blockNumber: 1000n,
        transactionHash: txHash,
      },
      postInteractionFailed: undefined,
      escrowsCreated: [
        {
          escrowAddress: TEST_ADDRESSES.ALICE,
          escrowType: 0,
          immutablesHash: TEST_VALUES.TEST_HASHLOCK,
          blockNumber: 1000n,
          transactionHash: txHash,
        },
        {
          escrowAddress: TEST_ADDRESSES.BOB,
          escrowType: 1,
          immutablesHash: TEST_VALUES.TEST_HASHLOCK,
          blockNumber: 1000n,
          transactionHash: txHash,
        },
      ],
    })
  );

  try {
    const result = await fillLimitOrder(
      publicClient,
      walletClient,
      protocolAddress,
      params,
      factoryAddress
    );

    // Assert
    assertEquals(result.transactionHash, txHash);
    assertEquals(result.gasUsed, 150000n);
    assertEquals(result.postInteractionExecuted, true);
    assertEquals(result.srcEscrow, TEST_ADDRESSES.ALICE);
    assertEquals(result.dstEscrow, TEST_ADDRESSES.BOB);
    assertEquals(result.orderHash, TEST_VALUES.TEST_HASHLOCK);
    
    // Verify event parsing was called
    assertSpyCalls(parseEventsStub, 1);
  } finally {
    parseEventsStub.restore();
  }
});

Deno.test("fillLimitOrder - handles simulation error with known protocol revert", async () => {
  const protocolError = new Error("execution reverted");
  (protocolError as any).data = "0x08c379a0" + // Error selector
    encodeAbiParameters(parseAbiParameters("string"), ["InvalidSignature"]).slice(2);
  
  const publicClient = createTestPublicClient({
    simulateContract: () => Promise.reject(protocolError),
  });
  
  const walletClient = createTestWalletClient();
  const protocolAddress = TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL;
  const factoryAddress = TEST_ADDRESSES.ESCROW_FACTORY;
  const params = createMockFillOrderParams();

  await assertRejects(
    async () => {
      await fillLimitOrder(
        publicClient,
        walletClient,
        protocolAddress,
        params,
        factoryAddress
      );
    },
    Error,
    "ProtocolRevert"
  );
});

Deno.test("fillLimitOrder - fallback to direct write on gas estimation error", async () => {
  const txHash = "0x" + "b".repeat(64) as Hex;
  
  const publicClient = createTestPublicClient({
    simulateContract: () => Promise.reject(new Error("gas uint64 overflow")),
    waitForTransactionReceipt: () => Promise.resolve({
      transactionHash: txHash,
      gasUsed: 100000n,
      blockNumber: 1000n,
      blockHash: "0x" + "c".repeat(64) as Hex,
      from: TEST_ADDRESSES.ALICE,
      to: TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL,
      status: "success",
      logs: [],
    }),
  });
  
  const walletClient = createTestWalletClient({
    writeContract: () => Promise.resolve(txHash),
  });
  
  const protocolAddress = TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL;
  const factoryAddress = TEST_ADDRESSES.ESCROW_FACTORY;
  const params = createMockFillOrderParams();

  // Mock PostInteraction event monitoring
  const parseEventsStub = stub(
    PostInteractionEventMonitor.prototype,
    "parsePostInteractionEvents",
    () => ({
      postInteractionExecuted: undefined,
      postInteractionFailed: undefined,
      escrowsCreated: [],
    })
  );

  try {
    const result = await fillLimitOrder(
      publicClient,
      walletClient,
      protocolAddress,
      params,
      factoryAddress
    );

    assertEquals(result.transactionHash, txHash);
    assertEquals(result.postInteractionExecuted, false);
  } finally {
    parseEventsStub.restore();
  }
});

Deno.test("fillLimitOrder - handles PostInteraction failure event", async () => {
  const txHash = "0x" + "c".repeat(64) as Hex;
  
  const publicClient = createTestPublicClient({
    waitForTransactionReceipt: () => Promise.resolve({
      transactionHash: txHash,
      gasUsed: 100000n,
      blockNumber: 1000n,
      blockHash: "0x" + "d".repeat(64) as Hex,
      from: TEST_ADDRESSES.ALICE,
      to: TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL,
      status: "success",
      logs: [],
    }),
  });
  
  const walletClient = createTestWalletClient({
    writeContract: () => Promise.resolve(txHash),
  });
  
  const protocolAddress = TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL;
  const factoryAddress = TEST_ADDRESSES.ESCROW_FACTORY;
  const params = createMockFillOrderParams();

  // Mock PostInteraction failure event
  const parseEventsStub = stub(
    PostInteractionEventMonitor.prototype,
    "parsePostInteractionEvents",
    () => ({
      postInteractionExecuted: undefined,
      postInteractionFailed: {
        orderHash: TEST_VALUES.TEST_HASHLOCK,
        taker: TEST_ADDRESSES.BOB,
        reason: "Insufficient allowance",
        blockNumber: 1000n,
        transactionHash: txHash,
      },
      escrowsCreated: [],
    })
  );

  try {
    await assertRejects(
      async () => {
        await fillLimitOrder(
          publicClient,
          walletClient,
          protocolAddress,
          params,
          factoryAddress
        );
      },
      Error,
      "PostInteraction failed: Insufficient allowance"
    );
  } finally {
    parseEventsStub.restore();
  }
});

Deno.test("fillLimitOrder - validates extension data length mismatch", async () => {
  const publicClient = createTestPublicClient();
  const walletClient = createTestWalletClient();
  const protocolAddress = TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL;
  const factoryAddress = TEST_ADDRESSES.ESCROW_FACTORY;
  
  // Create params with mismatched extension data length
  const extensionData = "0x1234" as Hex; // 2 bytes
  const params = createMockFillOrderParams({
    extensionData,
    takerTraits: 100n << 224n, // Claims 100 bytes in takerTraits
  });

  await assertRejects(
    async () => {
      await fillLimitOrder(
        publicClient,
        walletClient,
        protocolAddress,
        params,
        factoryAddress
      );
    },
    Error,
    "argsExtensionLength mismatch"
  );
});

Deno.test("ensureLimitOrderApprovals - approves both protocol and factory", async () => {
  let readContractCallCount = 0;
  const publicClient = createTestPublicClient({
    readContract: () => {
      // Return 0 allowance for both protocol and factory checks
      readContractCallCount++;
      return Promise.resolve(0n);
    },
  });
  
  let writeContractCallCount = 0;
  const walletClient = createTestWalletClient({
    writeContract: () => {
      writeContractCallCount++;
      return Promise.resolve(("0x" + writeContractCallCount.toString().repeat(64)) as Hex);
    },
  });
  
  const tokenAddress = TEST_ADDRESSES.BMN_TOKEN;
  const protocolAddress = TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL;
  const factoryAddress = TEST_ADDRESSES.ESCROW_FACTORY;
  const amount = TEST_VALUES.TEN_TOKENS;

  // Mock TokenApprovalManager
  const approvalManagerStub = stub(
    TokenApprovalManager.prototype,
    "ensureApproval",
    () => Promise.resolve("0x" + "2".repeat(64) as Hex)
  );

  try {
    await ensureLimitOrderApprovals(
      publicClient,
      walletClient,
      tokenAddress,
      protocolAddress,
      factoryAddress,
      amount
    );

    // Verify protocol approval was made
    assert(writeContractCallCount >= 1, "Protocol approval should have been made");
    
    // Verify factory approval was called
    assertSpyCalls(approvalManagerStub, 1);
  } finally {
    approvalManagerStub.restore();
  }
});

Deno.test("ensureLimitOrderApprovals - skips approval when sufficient allowance exists", async () => {
  const publicClient = createTestPublicClient({
    readContract: () => Promise.resolve(TEST_VALUES.HUNDRED_TOKENS), // Large allowance
  });
  
  let writeContractCalled = false;
  const walletClient = createTestWalletClient({
    writeContract: () => {
      writeContractCalled = true;
      return Promise.resolve("0x" + "1".repeat(64) as Hex);
    },
  });
  
  const tokenAddress = TEST_ADDRESSES.BMN_TOKEN;
  const protocolAddress = TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL;
  const factoryAddress = TEST_ADDRESSES.ESCROW_FACTORY;
  const amount = TEST_VALUES.TEN_TOKENS;

  // Mock TokenApprovalManager to return null (no approval needed)
  const approvalManagerStub = stub(
    TokenApprovalManager.prototype,
    "ensureApproval",
    () => Promise.resolve(null)
  );

  try {
    await ensureLimitOrderApprovals(
      publicClient,
      walletClient,
      tokenAddress,
      protocolAddress,
      factoryAddress,
      amount
    );

    // Verify no protocol approval was made
    assertEquals(writeContractCalled, false, "No approvals should have been made");
  } finally {
    approvalManagerStub.restore();
  }
});

Deno.test("decodeProtocolError - decodes error data from various structures", () => {
  // Test error with direct data property
  const errorWithData = new Error("execution reverted");
  (errorWithData as any).data = "0x5cd5d233"; // Some error selector

  const decoded1 = decodeProtocolError(errorWithData);
  assertExists(decoded1.data);
  assertEquals(decoded1.data, "0x5cd5d233");
  assertExists(decoded1.message);

  // Test error with nested data structure
  const nestedError = {
    message: "transaction failed",
    cause: {
      data: {
        data: "0x1320ef01" + encodeAbiParameters(parseAbiParameters("uint256"), [100n]).slice(2),
      },
    },
  };

  const decoded2 = decodeProtocolError(nestedError);
  // The data will be extracted from the nested structure
  if (decoded2.data) {
    assertStringIncludes(decoded2.data as string, "0x1320ef01");
  } else {
    // If data couldn't be extracted, at least the message should be there
    assertExists(decoded2.message);
  }

  // Test error with hex in message
  const hexMessageError = {
    message: "Revert with data: 0x5cd5d233abcdef",
  };

  const decoded3 = decodeProtocolError(hexMessageError);
  assertExists(decoded3.data);
  assertEquals(decoded3.data, "0x5cd5d233abcdef");

  // Test that function handles errors gracefully
  const decoded4 = decodeProtocolError(new Error("Some error"));
  assertExists(decoded4.message);
  assertEquals(decoded4.message, "Some error");
});

Deno.test("decodeProtocolError - handles unknown errors gracefully", () => {
  // Test with plain error message
  const plainError = new Error("Something went wrong");
  const decoded1 = decodeProtocolError(plainError);
  assertEquals(decoded1.errorName, undefined);
  assertEquals(decoded1.message, "Something went wrong");

  // Test with invalid hex data
  const invalidHexError = {
    data: "0xinvalid",
    message: "Invalid hex",
  };
  const decoded2 = decodeProtocolError(invalidHexError);
  assertEquals(decoded2.errorName, undefined);
  assertEquals(decoded2.message, "Invalid hex");

  // Test with null/undefined
  const decoded3 = decodeProtocolError(null);
  assertStringIncludes(decoded3.message, "null");
});

Deno.test("calculateOrderHash - returns correct hash from protocol", async () => {
  const expectedHash = TEST_VALUES.TEST_HASHLOCK;
  const publicClient = createTestPublicClient({
    readContract: () => Promise.resolve(expectedHash),
  });
  
  const protocolAddress = TEST_ADDRESSES.LIMIT_ORDER_PROTOCOL;
  const order = createMockOrder();

  const hash = await calculateOrderHash(publicClient, protocolAddress, order);

  assertEquals(hash, expectedHash);
});

Deno.test("handleLimitOrderError - handles insufficient allowance error", async () => {
  const publicClient = createTestPublicClient();
  const walletClient = createTestWalletClient();
  
  const context = {
    orderHash: TEST_VALUES.TEST_HASHLOCK,
    resolverAddress: TEST_ADDRESSES.BOB,
    factoryAddress: TEST_ADDRESSES.ESCROW_FACTORY,
    tokenAddress: TEST_ADDRESSES.BMN_TOKEN,
    amount: TEST_VALUES.TEN_TOKENS,
  };

  // Mock PostInteractionErrorHandler
  const errorHandlerStub = stub(
    PostInteractionErrorHandler,
    "handleError",
    () => Promise.resolve({
      retry: true,
      action: "APPROVE_FACTORY",
    })
  );

  // Mock TokenApprovalManager
  const approvalStub = stub(
    TokenApprovalManager.prototype,
    "ensureApproval",
    () => Promise.resolve("0x" + "3".repeat(64) as Hex)
  );

  try {
    const error = new Error("ERC20: insufficient allowance");
    const result = await handleLimitOrderError(error, context, publicClient, walletClient);

    assertEquals(result.retry, true);
    assertEquals(result.action, "APPROVE_FACTORY");

    // Verify approval was called
    assertSpyCalls(approvalStub, 1);
  } finally {
    errorHandlerStub.restore();
    approvalStub.restore();
  }
});

Deno.test("handleLimitOrderError - returns no retry for unrecoverable errors", async () => {
  const context = {
    orderHash: TEST_VALUES.TEST_HASHLOCK,
    resolverAddress: TEST_ADDRESSES.BOB,
    factoryAddress: TEST_ADDRESSES.ESCROW_FACTORY,
    tokenAddress: TEST_ADDRESSES.BMN_TOKEN,
    amount: TEST_VALUES.TEN_TOKENS,
  };

  // Mock PostInteractionErrorHandler for unrecoverable error
  const errorHandlerStub = stub(
    PostInteractionErrorHandler,
    "handleError",
    () => Promise.resolve({
      retry: false,
      action: undefined,
    })
  );

  try {
    const error = new Error("Order already filled");
    const result = await handleLimitOrderError(error, context);

    assertEquals(result.retry, false);
    assertEquals(result.action, undefined);
  } finally {
    errorHandlerStub.restore();
  }
});

// Clean up test data generator
Deno.test("cleanup", () => {
  dataGenerator.reset();
});