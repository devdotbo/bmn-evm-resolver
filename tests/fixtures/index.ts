/**
 * Test Fixtures
 * 
 * Reusable test data and configurations for the BMN EVM Resolver test suite.
 */

import type { Address, Hash, Hex } from "viem";
import { parseUnits, encodeAbiParameters, keccak256 } from "viem/utils";

/**
 * Order fixtures for limit order testing
 */
export const orderFixtures = {
  /**
   * Basic limit order
   */
  basicOrder: {
    salt: "0x" + "1".repeat(64) as Hex,
    maker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    receiver: "0x0000000000000000000000000000000000000000" as Address,
    makerAsset: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address, // BMN
    takerAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
    makingAmount: parseUnits("100", 18),
    takingAmount: parseUnits("100", 6),
    makerTraits: 0n,
  },
  
  /**
   * Order with post-interaction
   */
  postInteractionOrder: {
    salt: "0x" + "2".repeat(64) as Hex,
    maker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    receiver: "0x0000000000000000000000000000000000000000" as Address,
    makerAsset: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    takerAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
    makingAmount: parseUnits("1000", 18),
    takingAmount: parseUnits("1000", 6),
    makerTraits: (1n << 249n) | (1n << 251n), // HAS_EXTENSION | POST_INTERACTION
  },
  
  /**
   * Partially filled order
   */
  partiallyFilledOrder: {
    salt: "0x" + "3".repeat(64) as Hex,
    maker: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
    receiver: "0x0000000000000000000000000000000000000000" as Address,
    makerAsset: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    takerAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
    makingAmount: parseUnits("500", 18),
    takingAmount: parseUnits("500", 6),
    makerTraits: 0n,
    filledAmount: parseUnits("250", 18), // 50% filled
  },
  
  /**
   * Expired order
   */
  expiredOrder: {
    salt: "0x" + "4".repeat(64) as Hex,
    maker: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address,
    receiver: "0x0000000000000000000000000000000000000000" as Address,
    makerAsset: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    takerAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
    makingAmount: parseUnits("50", 18),
    takingAmount: parseUnits("50", 6),
    makerTraits: (1n << 200n), // Add expiry flag
    expiry: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
  },
};

/**
 * Escrow fixtures for atomic swap testing
 */
export const escrowFixtures = {
  /**
   * Basic escrow parameters
   */
  basicEscrow: {
    srcImplementation: "0x77CC1A51dC5855bcF0d9f1c1FceaeE7fb855a535" as Address,
    dstImplementation: "0x36938b7899A17362520AA741C0E0dA0c8EfE5e3b" as Address,
    timelocks: packTimelocks(3600, 300), // 1 hour source, 5 minutes destination
    hashlock: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hex,
    srcMaker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    srcTaker: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
    srcToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    srcAmount: parseUnits("100", 18),
    srcSafetyDeposit: parseUnits("10", 18),
    dstReceiver: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address,
    dstToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
    dstAmount: parseUnits("95", 6),
    dstSafetyDeposit: parseUnits("9.5", 6),
    nonce: 12345n,
  },
  
  /**
   * Cross-chain escrow with bridge fees
   */
  crossChainEscrow: {
    srcImplementation: "0x77CC1A51dC5855bcF0d9f1c1FceaeE7fb855a535" as Address,
    dstImplementation: "0x36938b7899A17362520AA741C0E0dA0c8EfE5e3b" as Address,
    timelocks: packTimelocks(7200, 3600), // 2 hours source, 1 hour destination
    hashlock: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex,
    srcMaker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    srcTaker: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
    srcToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    srcAmount: parseUnits("1000", 18),
    srcSafetyDeposit: parseUnits("100", 18),
    dstReceiver: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address,
    dstToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    dstAmount: parseUnits("950", 18), // 5% bridge fee
    dstSafetyDeposit: parseUnits("95", 18),
    nonce: 67890n,
  },
  
  /**
   * High-value escrow
   */
  highValueEscrow: {
    srcImplementation: "0x77CC1A51dC5855bcF0d9f1c1FceaeE7fb855a535" as Address,
    dstImplementation: "0x36938b7899A17362520AA741C0E0dA0c8EfE5e3b" as Address,
    timelocks: packTimelocks(86400, 43200), // 24 hours source, 12 hours destination
    hashlock: "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210" as Hex,
    srcMaker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    srcTaker: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
    srcToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    srcAmount: parseUnits("1000000", 18), // 1M tokens
    srcSafetyDeposit: parseUnits("100000", 18),
    dstReceiver: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address,
    dstToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
    dstAmount: parseUnits("1000000", 6),
    dstSafetyDeposit: parseUnits("100000", 6),
    nonce: 99999n,
  },
};

/**
 * Transaction fixtures
 */
export const transactionFixtures = {
  /**
   * Successful token transfer
   */
  tokenTransfer: {
    hash: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
    from: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    to: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    value: 0n,
    data: encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      ["0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address, parseUnits("100", 18)]
    ),
    gas: 100000n,
    gasPrice: parseUnits("10", 9), // 10 gwei
    nonce: 42,
    blockNumber: 1000n,
    blockHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hash,
    transactionIndex: 0,
  },
  
  /**
   * Failed transaction
   */
  failedTransaction: {
    hash: "0x9876543210987654321098765432109876543210987654321098765432109876" as Hash,
    from: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    to: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    value: 0n,
    data: "0xdeadbeef" as Hex,
    gas: 21000n,
    gasPrice: parseUnits("5", 9),
    nonce: 43,
    blockNumber: 1001n,
    blockHash: "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210" as Hash,
    transactionIndex: 1,
    revertReason: "Insufficient balance",
  },
  
  /**
   * Contract deployment
   */
  contractDeployment: {
    hash: "0x1111111111111111111111111111111111111111111111111111111111111111" as Hash,
    from: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    to: null,
    value: 0n,
    data: "0x608060405234801561001057600080fd5b50610150806100206000396000f3fe" as Hex, // Mock bytecode
    gas: 1000000n,
    gasPrice: parseUnits("20", 9),
    nonce: 44,
    blockNumber: 1002n,
    blockHash: "0x2222222222222222222222222222222222222222222222222222222222222222" as Hash,
    transactionIndex: 0,
    contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
  },
};

/**
 * Event log fixtures
 */
export const eventFixtures = {
  /**
   * ERC20 Transfer event
   */
  transferEvent: {
    address: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    topics: [
      keccak256("Transfer(address,address,uint256)" as Hex), // Event signature
      "0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8" as Hex, // from (indexed)
      "0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc" as Hex, // to (indexed)
    ],
    data: encodeAbiParameters([{ type: "uint256" }], [parseUnits("100", 18)]),
    blockNumber: 1000n,
    blockHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hash,
    transactionHash: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hash,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  },
  
  /**
   * Order filled event
   */
  orderFilledEvent: {
    address: "0x5FA31604fc5dCebfcaC2EC89AF03Ee0F24Bf8Ae8" as Address,
    topics: [
      keccak256("OrderFilled(bytes32,uint256,uint256)" as Hex),
      "0x" + "1".repeat(64) as Hex, // orderHash (indexed)
    ],
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      [parseUnits("100", 18), parseUnits("100", 6)]
    ),
    blockNumber: 1001n,
    blockHash: "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210" as Hash,
    transactionHash: "0x9876543210987654321098765432109876543210987654321098765432109876" as Hash,
    transactionIndex: 1,
    logIndex: 2,
    removed: false,
  },
  
  /**
   * Escrow created event
   */
  escrowCreatedEvent: {
    address: "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address,
    topics: [
      keccak256("EscrowCreated(address,address,bytes32)" as Hex),
      "0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8" as Hex, // srcEscrow (indexed)
      "0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc" as Hex, // dstEscrow (indexed)
    ],
    data: encodeAbiParameters(
      [{ type: "bytes32" }],
      ["0x1234567890123456789012345678901234567890123456789012345678901234" as Hex]
    ),
    blockNumber: 1002n,
    blockHash: "0x2222222222222222222222222222222222222222222222222222222222222222" as Hash,
    transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111" as Hash,
    transactionIndex: 0,
    logIndex: 1,
    removed: false,
  },
};

/**
 * Signature fixtures
 */
export const signatureFixtures = {
  /**
   * Valid EIP-712 signature
   */
  validEIP712: {
    signature: "0x" + "1".repeat(130) as Hex,
    signer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    domain: {
      name: "1inch Limit Order Protocol",
      version: "4",
      chainId: 1,
      verifyingContract: "0x5FA31604fc5dCebfcaC2EC89AF03Ee0F24Bf8Ae8" as Address,
    },
    types: {
      Order: [
        { name: "salt", type: "uint256" },
        { name: "maker", type: "address" },
        { name: "receiver", type: "address" },
        { name: "makerAsset", type: "address" },
        { name: "takerAsset", type: "address" },
        { name: "makingAmount", type: "uint256" },
        { name: "takingAmount", type: "uint256" },
        { name: "makerTraits", type: "uint256" },
      ],
    },
    value: orderFixtures.basicOrder,
  },
  
  /**
   * Invalid signature
   */
  invalidSignature: {
    signature: "0x" + "0".repeat(130) as Hex,
    signer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    expectedError: "Invalid signature",
  },
  
  /**
   * Wrong signer signature
   */
  wrongSignerSignature: {
    signature: "0x" + "2".repeat(130) as Hex,
    signer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address, // Different from order maker
    expectedSigner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
    expectedError: "Signature verification failed",
  },
};

/**
 * State fixtures for testing state management
 */
export const stateFixtures = {
  /**
   * Active swap state
   */
  activeSwap: {
    id: "swap-123",
    orderHash: "0x" + "1".repeat(64) as Hash,
    srcChainId: 1,
    dstChainId: 10,
    srcEscrow: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
    dstEscrow: "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as Address,
    hashlock: "0x1234567890123456789012345678901234567890123456789012345678901234" as Hex,
    secret: null,
    status: "active",
    createdAt: Date.now() - 3600000, // 1 hour ago
    updatedAt: Date.now() - 1800000, // 30 minutes ago
  },
  
  /**
   * Completed swap state
   */
  completedSwap: {
    id: "swap-456",
    orderHash: "0x" + "2".repeat(64) as Hash,
    srcChainId: 1,
    dstChainId: 10,
    srcEscrow: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as Address,
    dstEscrow: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as Address,
    hashlock: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex,
    secret: "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210" as Hex,
    status: "completed",
    createdAt: Date.now() - 7200000, // 2 hours ago
    updatedAt: Date.now() - 3600000, // 1 hour ago
    completedAt: Date.now() - 3600000,
  },
  
  /**
   * Failed swap state
   */
  failedSwap: {
    id: "swap-789",
    orderHash: "0x" + "3".repeat(64) as Hash,
    srcChainId: 1,
    dstChainId: 10,
    srcEscrow: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" as Address,
    dstEscrow: null,
    hashlock: "0x9876543210987654321098765432109876543210987654321098765432109876" as Hex,
    secret: null,
    status: "failed",
    error: "Escrow creation failed: insufficient balance",
    createdAt: Date.now() - 10800000, // 3 hours ago
    updatedAt: Date.now() - 10800000,
    failedAt: Date.now() - 10800000,
  },
};

/**
 * Network configuration fixtures
 */
export const networkFixtures = {
  /**
   * Local test network
   */
  localNetwork: {
    chainId: 31337,
    name: "Hardhat Network",
    rpcUrl: "http://localhost:8545",
    blockTime: 1,
    gasPrice: parseUnits("1", 9),
    contracts: {
      limitOrderProtocol: "0x5FA31604fc5dCebfcaC2EC89AF03Ee0F24Bf8Ae8" as Address,
      escrowFactory: "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address,
      bmnToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    },
  },
  
  /**
   * Mainnet fork configuration
   */
  mainnetFork: {
    chainId: 1,
    name: "Ethereum Mainnet Fork",
    rpcUrl: "http://localhost:8545",
    blockTime: 12,
    gasPrice: parseUnits("30", 9),
    forkBlock: 18000000n,
    contracts: {
      limitOrderProtocol: "0x119c71D3BbAC22029622cbaEc24854d3D32D2828" as Address,
      escrowFactory: "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address,
      bmnToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
    },
  },
};

/**
 * Helper function to pack timelocks
 */
function packTimelocks(srcSeconds: number, dstSeconds: number): bigint {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const srcCancellation = now + BigInt(srcSeconds);
  const dstWithdrawal = now + BigInt(dstSeconds);
  return (srcCancellation << 128n) | dstWithdrawal;
}

/**
 * Helper function to generate test order hash
 */
export function generateOrderHash(order: typeof orderFixtures.basicOrder): Hash {
  const encoded = encodeAbiParameters(
    [
      { type: "uint256" }, // salt
      { type: "address" }, // maker
      { type: "address" }, // receiver
      { type: "address" }, // makerAsset
      { type: "address" }, // takerAsset
      { type: "uint256" }, // makingAmount
      { type: "uint256" }, // takingAmount
      { type: "uint256" }, // makerTraits
    ],
    [
      BigInt(order.salt),
      order.maker,
      order.receiver,
      order.makerAsset,
      order.takerAsset,
      order.makingAmount,
      order.takingAmount,
      order.makerTraits,
    ]
  );
  
  return keccak256(encoded);
}

/**
 * Helper function to create test order with defaults
 */
export function createTestOrder(overrides: Partial<typeof orderFixtures.basicOrder> = {}) {
  return {
    ...orderFixtures.basicOrder,
    ...overrides,
    salt: overrides.salt || (`0x${Math.random().toString(16).slice(2).padEnd(64, "0")}` as Hex),
  };
}

/**
 * Helper function to create test escrow with defaults
 */
export function createTestEscrow(overrides: Partial<typeof escrowFixtures.basicEscrow> = {}) {
  return {
    ...escrowFixtures.basicEscrow,
    ...overrides,
    nonce: overrides.nonce || BigInt(Math.floor(Math.random() * 1000000)),
  };
}