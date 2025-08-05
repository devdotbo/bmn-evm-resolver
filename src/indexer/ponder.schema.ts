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