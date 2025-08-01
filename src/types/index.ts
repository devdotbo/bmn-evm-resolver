import type { Address } from "viem";

// Timelock configuration for both source and destination escrows
export interface Timelocks {
  // Source chain timelocks (in seconds)
  srcWithdrawal: bigint;        // Time after which maker can withdraw
  srcPublicWithdrawal: bigint;  // Time after which anyone can withdraw
  srcCancellation: bigint;      // Time after which taker can cancel
  srcPublicCancellation: bigint; // Time after which anyone can cancel
  
  // Destination chain timelocks (in seconds)
  dstWithdrawal: bigint;        // Time after which taker can withdraw
  dstCancellation: bigint;      // Time after which maker can cancel
}

// Order immutables structure
export interface Immutables {
  orderHash: `0x${string}`;
  hashlock: `0x${string}`;
  maker: Address;
  taker: Address;
  token: Address;
  amount: bigint;
  safetyDeposit: bigint;
  timelocks: Timelocks;
}

// Order parameters for creation
export interface OrderParams {
  srcToken: Address;
  dstToken: Address;
  srcAmount: bigint;
  dstAmount: bigint;
  safetyDeposit: bigint;
  secret: `0x${string}`;
  srcChainId: number;
  dstChainId: number;
}

// Order state tracking
export interface OrderState {
  id: string;
  params: OrderParams;
  immutables: Immutables;
  srcEscrowAddress?: Address;
  dstEscrowAddress?: Address;
  status: OrderStatus;
  createdAt: number;
  secretRevealed?: boolean;
  secret?: `0x${string}`;
}

export enum OrderStatus {
  Created = "CREATED",
  SrcEscrowDeployed = "SRC_ESCROW_DEPLOYED",
  DstEscrowDeployed = "DST_ESCROW_DEPLOYED",
  SecretRevealed = "SECRET_REVEALED",
  Completed = "COMPLETED",
  Cancelled = "CANCELLED",
  Failed = "FAILED"
}

// Chain configuration
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  escrowFactory: Address;
  limitOrderProtocol: Address;
}

// Token configuration
export interface TokenConfig {
  address: Address;
  symbol: string;
  decimals: number;
}

// Resolver configuration
export interface ResolverConfig {
  privateKey: `0x${string}`;
  chains: Record<number, ChainConfig>;
  tokens: Record<string, TokenConfig>;
  minProfitBps: number; // Minimum profit in basis points
  maxConcurrentOrders: number;
}