import { onchainTable } from "ponder";

// Factory events tracking
export const srcEscrow = onchainTable("src_escrow", (t) => ({
  id: t.text().primaryKey(), // chainId-escrowAddress
  chainId: t.integer().notNull(),
  escrowAddress: t.text().notNull(),
  orderHash: t.hex().notNull(),
  hashlock: t.hex().notNull(),
  maker: t.text().notNull(),
  taker: t.text().notNull(),
  srcToken: t.text().notNull(),
  srcAmount: t.bigint().notNull(),
  srcSafetyDeposit: t.bigint().notNull(),
  dstMaker: t.text().notNull(),
  dstToken: t.text().notNull(),
  dstAmount: t.bigint().notNull(),
  dstSafetyDeposit: t.bigint().notNull(),
  dstChainId: t.bigint().notNull(),
  timelocks: t.bigint().notNull(),
  createdAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
  status: t.text().notNull(), // "created", "withdrawn", "cancelled"
}));

export const dstEscrow = onchainTable("dst_escrow", (t) => ({
  id: t.text().primaryKey(), // chainId-escrowAddress
  chainId: t.integer().notNull(),
  escrowAddress: t.text().notNull(),
  hashlock: t.hex().notNull(),
  taker: t.text().notNull(),
  srcCancellationTimestamp: t.bigint().notNull(),
  createdAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
  status: t.text().notNull(), // "created", "withdrawn", "cancelled"
}));

// Escrow events tracking
export const escrowWithdrawal = onchainTable("escrow_withdrawal", (t) => ({
  id: t.text().primaryKey(), // chainId-escrowAddress-transactionHash
  chainId: t.integer().notNull(),
  escrowAddress: t.text().notNull(),
  secret: t.hex().notNull(),
  withdrawnAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

export const escrowCancellation = onchainTable("escrow_cancellation", (t) => ({
  id: t.text().primaryKey(), // chainId-escrowAddress-transactionHash
  chainId: t.integer().notNull(),
  escrowAddress: t.text().notNull(),
  cancelledAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

export const fundsRescued = onchainTable("funds_rescued", (t) => ({
  id: t.text().primaryKey(), // chainId-escrowAddress-transactionHash-logIndex
  chainId: t.integer().notNull(),
  escrowAddress: t.text().notNull(),
  token: t.text().notNull(),
  amount: t.bigint().notNull(),
  rescuedAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
  logIndex: t.integer().notNull(),
}));

// Cross-chain atomic swap tracking
export const atomicSwap = onchainTable("atomic_swap", (t) => ({
  id: t.text().primaryKey(), // orderHash
  orderHash: t.hex().notNull(),
  hashlock: t.hex().notNull(),
  srcChainId: t.integer().notNull(),
  dstChainId: t.integer().notNull(),
  srcEscrowAddress: t.text(),
  dstEscrowAddress: t.text(),
  srcMaker: t.text().notNull(),
  srcTaker: t.text().notNull(),
  dstMaker: t.text().notNull(),
  dstTaker: t.text().notNull(),
  srcToken: t.text().notNull(),
  srcAmount: t.bigint().notNull(),
  dstToken: t.text().notNull(),
  dstAmount: t.bigint().notNull(),
  srcSafetyDeposit: t.bigint().notNull(),
  dstSafetyDeposit: t.bigint().notNull(),
  timelocks: t.bigint().notNull(),
  status: t.text().notNull(), // "pending", "src_created", "dst_created", "completed", "cancelled"
  srcCreatedAt: t.bigint(),
  dstCreatedAt: t.bigint(),
  completedAt: t.bigint(),
  cancelledAt: t.bigint(),
  secret: t.hex(),
  postInteraction: t.boolean().notNull().default(false), // Track if created via PostInteraction
}));

// Statistics and aggregations
export const chainStatistics = onchainTable("chain_statistics", (t) => ({
  id: t.text().primaryKey(), // chainId
  chainId: t.integer().notNull(),
  totalSrcEscrows: t.bigint().notNull(),
  totalDstEscrows: t.bigint().notNull(),
  totalWithdrawals: t.bigint().notNull(),
  totalCancellations: t.bigint().notNull(),
  totalVolumeLocked: t.bigint().notNull(),
  totalVolumeWithdrawn: t.bigint().notNull(),
  lastUpdatedBlock: t.bigint().notNull(),
}));

// BMN Token Tables
export const bmnTransfer = onchainTable("bmn_transfer", (t) => ({
  id: t.text().primaryKey(), // chainId-transactionHash-logIndex
  chainId: t.integer().notNull(),
  from: t.text().notNull(),
  to: t.text().notNull(),
  value: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
  logIndex: t.integer().notNull(),
}));

export const bmnApproval = onchainTable("bmn_approval", (t) => ({
  id: t.text().primaryKey(), // chainId-owner-spender
  chainId: t.integer().notNull(),
  owner: t.text().notNull(),
  spender: t.text().notNull(),
  value: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

export const bmnTokenHolder = onchainTable("bmn_token_holder", (t) => ({
  id: t.text().primaryKey(), // chainId-address
  chainId: t.integer().notNull(),
  address: t.text().notNull(),
  balance: t.bigint().notNull(),
  firstTransferBlock: t.bigint().notNull(),
  lastTransferBlock: t.bigint().notNull(),
  transferCount: t.bigint().notNull(),
}));

// Limit Order Protocol Tables
export const limitOrder = onchainTable("limit_order", (t) => ({
  id: t.text().primaryKey(), // chainId-orderHash
  chainId: t.integer().notNull(),
  orderHash: t.hex().notNull(),
  maker: t.text().notNull(),
  makerAsset: t.text().notNull(),
  takerAsset: t.text().notNull(),
  makingAmount: t.bigint().notNull(),
  takingAmount: t.bigint().notNull(),
  remainingAmount: t.bigint().notNull(),
  status: t.text().notNull(), // "active", "filled", "partially_filled", "cancelled"
  createdAt: t.bigint().notNull(),
  updatedAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

export const orderFilled = onchainTable("order_filled", (t) => ({
  id: t.text().primaryKey(), // chainId-transactionHash-logIndex
  chainId: t.integer().notNull(),
  orderHash: t.hex().notNull(),
  remainingAmount: t.bigint().notNull(),
  taker: t.text(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
  logIndex: t.integer().notNull(),
}));

export const orderCancelled = onchainTable("order_cancelled", (t) => ({
  id: t.text().primaryKey(), // chainId-orderHash
  chainId: t.integer().notNull(),
  orderHash: t.hex().notNull(),
  maker: t.text(),
  cancelledAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

export const bitInvalidatorUpdated = onchainTable("bit_invalidator_updated", (t) => ({
  id: t.text().primaryKey(), // chainId-maker-slotIndex
  chainId: t.integer().notNull(),
  maker: t.text().notNull(),
  slotIndex: t.bigint().notNull(),
  slotValue: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

export const epochIncreased = onchainTable("epoch_increased", (t) => ({
  id: t.text().primaryKey(), // chainId-maker-series
  chainId: t.integer().notNull(),
  maker: t.text().notNull(),
  series: t.bigint().notNull(),
  newEpoch: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

// Protocol statistics
export const limitOrderStatistics = onchainTable("limit_order_statistics", (t) => ({
  id: t.text().primaryKey(), // chainId
  chainId: t.integer().notNull(),
  totalOrders: t.bigint().notNull(),
  activeOrders: t.bigint().notNull(),
  filledOrders: t.bigint().notNull(),
  partiallyFilledOrders: t.bigint().notNull(),
  cancelledOrders: t.bigint().notNull(),
  totalVolume: t.bigint().notNull(),
  lastUpdatedBlock: t.bigint().notNull(),
}));

// V2.1.0 Factory Events - Resolver Management
export const resolverWhitelist = onchainTable("resolver_whitelist", (t) => ({
  id: t.text().primaryKey(), // chainId-resolver
  chainId: t.integer().notNull(),
  resolver: t.text().notNull(),
  isWhitelisted: t.boolean().notNull(),
  isActive: t.boolean().notNull(),
  addedAt: t.bigint(),
  addedBy: t.text(),
  suspendedUntil: t.bigint(),
  totalTransactions: t.bigint().notNull(),
  failedTransactions: t.bigint().notNull(),
  lastActivityBlock: t.bigint(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

export const resolverSuspension = onchainTable("resolver_suspension", (t) => ({
  id: t.text().primaryKey(), // chainId-resolver-blockNumber
  chainId: t.integer().notNull(),
  resolver: t.text().notNull(),
  suspendedUntil: t.bigint().notNull(),
  reason: t.text(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

// V2.1.0 Factory Events - Admin Management
export const factoryAdmin = onchainTable("factory_admin", (t) => ({
  id: t.text().primaryKey(), // chainId-admin
  chainId: t.integer().notNull(),
  admin: t.text().notNull(),
  isActive: t.boolean().notNull(),
  addedAt: t.bigint(),
  removedAt: t.bigint(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

// V2.1.0 Factory Events - Emergency Pause
export const emergencyPause = onchainTable("emergency_pause", (t) => ({
  id: t.text().primaryKey(), // chainId-blockNumber
  chainId: t.integer().notNull(),
  isPaused: t.boolean().notNull(),
  pausedAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

// V2.1.0 Factory Events - Swap Metrics
export const swapMetrics = onchainTable("swap_metrics", (t) => ({
  id: t.text().primaryKey(), // chainId-orderHash
  chainId: t.integer().notNull(),
  orderHash: t.hex(),
  escrowSrc: t.text(),
  maker: t.text(),
  resolver: t.text(),
  volume: t.bigint(),
  srcChainId: t.bigint(),
  dstChainId: t.bigint(),
  completionTime: t.bigint(),
  gasUsed: t.bigint(),
  status: t.text().notNull(), // "initiated", "completed", "failed"
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

// V2.1.0 Factory Events - Interaction Tracking
export const interactionTracking = onchainTable("interaction_tracking", (t) => ({
  id: t.text().primaryKey(), // chainId-interactionHash
  chainId: t.integer().notNull(),
  orderMaker: t.text().notNull(),
  interactionTarget: t.text().notNull(),
  interactionHash: t.hex().notNull(),
  status: t.text().notNull(), // "executed", "failed"
  failureReason: t.text(),
  executedAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

// V2.1.0 Factory Events - Global Metrics
export const factoryMetrics = onchainTable("factory_metrics", (t) => ({
  id: t.text().primaryKey(), // chainId-blockNumber
  chainId: t.integer().notNull(),
  totalVolume: t.bigint().notNull(),
  successRate: t.bigint().notNull(),
  avgCompletionTime: t.bigint().notNull(),
  activeResolvers: t.bigint().notNull(),
  successfulSwaps: t.bigint().notNull(),
  failedSwaps: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

// V2.2.0 PostInteraction Support - 1inch Order Tracking
export const postInteractionOrder = onchainTable("post_interaction_order", (t) => ({
  id: t.text().primaryKey(), // orderHash
  orderHash: t.hex().notNull(), // Note: Using orderHash as id makes it effectively unique
  maker: t.hex().notNull(),
  taker: t.hex().notNull(),
  makerAsset: t.hex().notNull(),
  takerAsset: t.hex().notNull(),
  makingAmount: t.bigint().notNull(),
  takingAmount: t.bigint().notNull(),
  srcEscrow: t.hex(), // Set when PostInteraction executes
  dstEscrow: t.hex(), // Set when PostInteraction executes
  status: t.text().notNull(), // "pending", "filled", "cancelled"
  filledAt: t.bigint(),
  chainId: t.integer().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

// V2.2.0 PostInteraction Support - Resolver Whitelist for PostInteraction
export const postInteractionResolverWhitelist = onchainTable("post_interaction_resolver_whitelist", (t) => ({
  id: t.text().primaryKey(), // resolver-chainId
  resolver: t.hex().notNull(),
  chainId: t.integer().notNull(),
  isWhitelisted: t.boolean().notNull(),
  whitelistedAt: t.bigint().notNull(),
  removedAt: t.bigint(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

// V2.2.0 PostInteraction Support - Maker Whitelist
export const makerWhitelist = onchainTable("maker_whitelist", (t) => ({
  id: t.text().primaryKey(), // maker-chainId
  maker: t.hex().notNull(),
  chainId: t.integer().notNull(),
  isWhitelisted: t.boolean().notNull(),
  whitelistedAt: t.bigint().notNull(),
  removedAt: t.bigint(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

// V2.2.0 PostInteraction Support - Link PostInteraction to Escrows
export const postInteractionEscrow = onchainTable("post_interaction_escrow", (t) => ({
  id: t.text().primaryKey(), // orderHash-escrowType
  orderHash: t.hex().notNull(),
  escrowAddress: t.hex().notNull(),
  escrowType: t.text().notNull(), // "src", "dst"
  chainId: t.integer().notNull(),
  createdAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));