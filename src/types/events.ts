import type { Address } from "viem";
import type { Immutables } from "./index.ts";

// Event signatures for monitoring
export const EVENT_SIGNATURES = {
  // EscrowFactory events
  SrcEscrowCreated: "SrcEscrowCreated(address,address,(bytes32,bytes32,address,address,address,uint256,uint256,(uint256,uint256,uint256,uint256,uint256,uint256)))",
  DstEscrowCreated: "DstEscrowCreated(address,address,(bytes32,bytes32,address,address,address,uint256,uint256,(uint256,uint256,uint256,uint256,uint256,uint256)))",
  
  // Escrow events
  EscrowWithdrawal: "EscrowWithdrawal(address,address,address)",
  EscrowCancelled: "EscrowCancelled(address,address)",
  
  // LimitOrderProtocol events
  OrderFilled: "OrderFilled(bytes32,uint256,uint256,uint256)",
  OrderCancelled: "OrderCancelled(bytes32)"
} as const;

// Event type definitions
export interface SrcEscrowCreatedEvent {
  escrow: Address;
  orderHash: `0x${string}`;
  immutables: Immutables;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
}

export interface DstEscrowCreatedEvent {
  escrow: Address;
  orderHash: `0x${string}`;
  immutables: Immutables;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
}

export interface EscrowWithdrawalEvent {
  escrow: Address;
  token: Address;
  recipient: Address;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
}

export interface EscrowCancelledEvent {
  escrow: Address;
  token: Address;
  recipient: Address;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
}

export interface OrderFilledEvent {
  orderHash: `0x${string}`;
  remainingMakingAmount: bigint;
  remainingTakingAmount: bigint;
  filledMakingAmount: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
}

export interface OrderCancelledEvent {
  orderHash: `0x${string}`;
  blockNumber: bigint;  
  transactionHash: `0x${string}`;
  logIndex: number;
}

// Event filter options
export interface EventFilterOptions {
  fromBlock?: bigint | "earliest" | "latest" | "pending";
  toBlock?: bigint | "earliest" | "latest" | "pending";
  address?: Address | Address[];
}

// Event listener callback types
export type EventCallback<T> = (event: T) => void | Promise<void>;

export interface EventListeners {
  onSrcEscrowCreated?: EventCallback<SrcEscrowCreatedEvent>;
  onDstEscrowCreated?: EventCallback<DstEscrowCreatedEvent>;
  onEscrowWithdrawal?: EventCallback<EscrowWithdrawalEvent>;
  onEscrowCancelled?: EventCallback<EscrowCancelledEvent>;
  onOrderFilled?: EventCallback<OrderFilledEvent>;
  onOrderCancelled?: EventCallback<OrderCancelledEvent>;
}