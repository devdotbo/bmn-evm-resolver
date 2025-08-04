/**
 * TypeScript types for all indexer entities
 */

import type { Address, Hex } from "viem";

// Status enums matching the indexer schema
export enum AtomicSwapStatus {
  PENDING = "pending",
  SRC_CREATED = "src_created", 
  DST_CREATED = "dst_created",
  BOTH_CREATED = "both_created",
  COMPLETED = "completed",
  CANCELLED = "cancelled"
}

export enum EscrowStatus {
  ACTIVE = "active",
  WITHDRAWN = "withdrawn",
  CANCELLED = "cancelled",
  RESCUED = "rescued"
}

// Core entity types
export interface AtomicSwap {
  id: string; // orderHash
  orderHash: Hex;
  hashlock: Hex;
  srcChainId: number;
  dstChainId: number;
  srcEscrowAddress?: Address;
  dstEscrowAddress?: Address;
  srcMaker: Address;
  srcTaker: Address;
  dstMaker: Address;
  dstTaker: Address;
  srcToken: Address;
  srcAmount: bigint;
  dstToken: Address;
  dstAmount: bigint;
  srcSafetyDeposit: bigint;
  dstSafetyDeposit: bigint;
  timelocks: bigint;
  status: AtomicSwapStatus;
  srcCreatedAt?: bigint;
  dstCreatedAt?: bigint;
  completedAt?: bigint;
  cancelledAt?: bigint;
  secret?: Hex;
}

export interface SrcEscrow {
  id: string; // chainId-escrowAddress
  chainId: number;
  escrowAddress: Address;
  orderHash: Hex;
  hashlock: Hex;
  maker: Address;
  taker: Address;
  srcToken: Address;
  srcAmount: bigint;
  srcSafetyDeposit: bigint;
  dstMaker: Address;
  dstToken: Address;
  dstAmount: bigint;
  dstSafetyDeposit: bigint;
  dstChainId: bigint;
  timelocks: bigint;
  createdAt: bigint;
  blockNumber: bigint;
  transactionHash: Hex;
  status: EscrowStatus;
}

export interface DstEscrow {
  id: string; // chainId-escrowAddress
  chainId: number;
  escrowAddress: Address;
  hashlock: Hex;
  taker: Address;
  srcCancellationTimestamp: bigint;
  createdAt: bigint;
  blockNumber: bigint;
  transactionHash: Hex;
  status: EscrowStatus;
}

export interface EscrowWithdrawal {
  id: string; // chainId-escrowAddress-transactionHash
  chainId: number;
  escrowAddress: Address;
  secret: Hex;
  withdrawnAt: bigint;
  blockNumber: bigint;
  transactionHash: Hex;
}

export interface ChainStatistics {
  id: string; // chainId
  chainId: number;
  totalSrcEscrows: bigint;
  totalDstEscrows: bigint;
  totalWithdrawals: bigint;
  totalCancellations: bigint;
  totalVolumeLocked: bigint;
  totalVolumeWithdrawn: bigint;
  lastUpdatedBlock: bigint;
}

// Query response types
export interface QueryResponse<T> {
  items: T[];
  pageInfo?: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string;
    endCursor?: string;
  };
  totalCount?: number;
}

// Filter types
export interface AtomicSwapFilter {
  id?: string;
  orderHash?: Hex;
  hashlock?: Hex;
  srcChainId?: number;
  dstChainId?: number;
  srcMaker?: Address;
  srcTaker?: Address;
  dstMaker?: Address;
  dstTaker?: Address;
  status?: AtomicSwapStatus | AtomicSwapStatus[];
  status_in?: AtomicSwapStatus[];
  status_not?: AtomicSwapStatus;
  srcAmount_gt?: bigint;
  srcAmount_lt?: bigint;
  srcAmount_gte?: bigint;
  srcAmount_lte?: bigint;
  dstAmount_gt?: bigint;
  dstAmount_lt?: bigint;
  dstAmount_gte?: bigint;
  dstAmount_lte?: bigint;
}

export interface SrcEscrowFilter {
  orderHash?: Hex;
  chainId?: number;
  maker?: Address;
  taker?: Address;
  status?: EscrowStatus | EscrowStatus[];
  status_in?: EscrowStatus[];
}

export interface DstEscrowFilter {
  hashlock?: Hex;
  chainId?: number;
  taker?: Address;
  status?: EscrowStatus | EscrowStatus[];
  status_in?: EscrowStatus[];
}

// Subscription event types
export enum SubscriptionEventType {
  ATOMIC_SWAP_CREATED = "atomicSwapCreated",
  ATOMIC_SWAP_UPDATED = "atomicSwapUpdated",
  SRC_ESCROW_CREATED = "srcEscrowCreated",
  DST_ESCROW_CREATED = "dstEscrowCreated",
  SECRET_REVEALED = "secretRevealed",
  ESCROW_WITHDRAWN = "escrowWithdrawn",
  ESCROW_CANCELLED = "escrowCancelled"
}

export interface SubscriptionEvent<T = any> {
  type: SubscriptionEventType;
  data: T;
  timestamp: bigint;
  chainId: number;
  blockNumber: bigint;
  transactionHash: Hex;
}

export interface SecretRevealEvent extends SubscriptionEvent<{
  orderHash: Hex;
  escrowAddress: Address;
  secret: Hex;
}> {
  type: SubscriptionEventType.SECRET_REVEALED;
}

export interface NewOrderEvent extends SubscriptionEvent<AtomicSwap> {
  type: SubscriptionEventType.ATOMIC_SWAP_CREATED;
}

// Mapping types between indexer and resolver
export interface IndexerToResolverMapping {
  atomicSwap: {
    indexer: AtomicSwap;
    resolver: {
      orderId: string;
      orderHash: Hex;
      sourceChain: number;
      destinationChain: number;
      srcEscrowAddress?: Address;
      dstEscrowAddress?: Address;
      status: string;
      secret?: Hex;
    };
  };
}

// Query builder types
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  after?: string;
  before?: string;
}

// Connection status
export interface IndexerHealth {
  connected: boolean;
  synced: boolean;
  latestBlock: bigint;
  chainId: number;
  progress?: {
    current: bigint;
    target: bigint;
    percentage: number;
  };
}

// Error types
export class IndexerError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = "IndexerError";
  }
}

export enum IndexerErrorCode {
  CONNECTION_FAILED = "CONNECTION_FAILED",
  QUERY_FAILED = "QUERY_FAILED",
  SUBSCRIPTION_FAILED = "SUBSCRIPTION_FAILED",
  RATE_LIMITED = "RATE_LIMITED",
  NOT_SYNCED = "NOT_SYNCED",
  INVALID_RESPONSE = "INVALID_RESPONSE"
}