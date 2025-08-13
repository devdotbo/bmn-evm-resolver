/**
 * SwapStateManager - Persistent state management for atomic swaps
 * 
 * Tracks the complete lifecycle of each swap across chains
 */

import type { Address, Hex } from "viem";

export enum SwapStatus {
  CREATED = "CREATED",
  ORDER_FILLED = "ORDER_FILLED",
  SOURCE_ESCROW_CREATED = "SOURCE_ESCROW_CREATED",
  ALICE_DEPOSITED = "ALICE_DEPOSITED",
  DEST_ESCROW_CREATED = "DEST_ESCROW_CREATED",
  BOB_DEPOSITED = "BOB_DEPOSITED",
  SECRET_REVEALED = "SECRET_REVEALED",
  SOURCE_WITHDRAWN = "SOURCE_WITHDRAWN",
  DEST_WITHDRAWN = "DEST_WITHDRAWN",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
}

export interface SwapState {
  orderHash: Hex;
  hashlock: Hex;
  status: SwapStatus;
  
  // Participants
  alice: Address;
  bob: Address;
  
  // Source chain details
  srcChainId: number;
  srcToken: Address;
  srcAmount: bigint;
  srcEscrow?: Address;
  srcEscrowCreatedAt?: number;
  srcDepositedAt?: number;
  srcWithdrawnAt?: number;
  
  // Destination chain details
  dstChainId: number;
  dstToken: Address;
  dstAmount: bigint;
  dstEscrow?: Address;
  dstEscrowCreatedAt?: number;
  dstDepositedAt?: number;
  dstWithdrawnAt?: number;
  
  // Secret management
  secret?: Hex;
  secretRevealedAt?: number;
  secretRevealTxHash?: Hex;
  
  // Timestamps
  createdAt: number;
  lastUpdateAt: number;
  completedAt?: number;
  
  // Error tracking
  lastError?: string;
  retryCount: number;
  
  // Metadata
  metadata?: Record<string, any>;
}

export class SwapStateManager {
  private kv!: Deno.Kv; // Initialized in init()
  private kvPath: string;

  constructor(kvPath?: string) {
    this.kvPath = kvPath || "./data/kv/swaps.db";
  }

  /**
   * Initialize the KV store
   */
  async init(): Promise<void> {
    this.kv = await Deno.openKv(this.kvPath);
    console.log(`✅ SwapStateManager initialized with KV at ${this.kvPath}`);
  }

  /**
   * Track a new swap
   */
  async trackSwap(orderHash: string, initialState: Partial<SwapState>): Promise<void> {
    const state: SwapState = {
      orderHash: orderHash as Hex,
      hashlock: initialState.hashlock || ("0x" as Hex),
      status: SwapStatus.CREATED,
      alice: initialState.alice || ("0x" as Address),
      bob: initialState.bob || ("0x" as Address),
      srcChainId: initialState.srcChainId || 0,
      srcToken: initialState.srcToken || ("0x" as Address),
      srcAmount: initialState.srcAmount || 0n,
      dstChainId: initialState.dstChainId || 0,
      dstToken: initialState.dstToken || ("0x" as Address),
      dstAmount: initialState.dstAmount || 0n,
      createdAt: Date.now(),
      lastUpdateAt: Date.now(),
      retryCount: 0,
      ...initialState,
    };

    await this.kv.set(["swaps", orderHash], state);
    console.log(`📝 Tracking new swap: ${orderHash}`);
  }

  /**
   * Update swap status
   */
  async updateSwapStatus(
    orderHash: string,
    status: SwapStatus,
    data?: Partial<SwapState>
  ): Promise<void> {
    const entry = await this.kv.get<SwapState>(["swaps", orderHash]);
    if (!entry.value) {
      console.error(`❌ Swap not found: ${orderHash}`);
      return;
    }

    const updatedState: SwapState = {
      ...entry.value,
      status,
      lastUpdateAt: Date.now(),
      ...data,
    };

    // Mark as completed if both sides are withdrawn
    if (status === SwapStatus.DEST_WITHDRAWN && updatedState.srcWithdrawnAt) {
      updatedState.status = SwapStatus.COMPLETED;
      updatedState.completedAt = Date.now();
    } else if (status === SwapStatus.SOURCE_WITHDRAWN && updatedState.dstWithdrawnAt) {
      updatedState.status = SwapStatus.COMPLETED;
      updatedState.completedAt = Date.now();
    }

    await this.kv.set(["swaps", orderHash], updatedState);
    console.log(`📊 Updated swap ${orderHash}: ${status}`);
  }

  /**
   * Get swap state
   */
  async getSwap(orderHash: string): Promise<SwapState | null> {
    const entry = await this.kv.get<SwapState>(["swaps", orderHash]);
    return entry.value;
  }

  /**
   * Get swap by hashlock
   */
  async getSwapByHashlock(hashlock: string): Promise<SwapState | null> {
    const entries = this.kv.list<SwapState>({ prefix: ["swaps"] });
    for await (const entry of entries) {
      if (entry.value.hashlock === hashlock) {
        return entry.value;
      }
    }
    return null;
  }

  /**
   * Get pending swaps that need attention
   */
  async getPendingSwaps(): Promise<SwapState[]> {
    const entries = this.kv.list<SwapState>({ prefix: ["swaps"] });
    const pending: SwapState[] = [];
    
    for await (const entry of entries) {
      const swap = entry.value;
      if (
        swap.status !== SwapStatus.COMPLETED &&
        swap.status !== SwapStatus.FAILED &&
        swap.status !== SwapStatus.EXPIRED
      ) {
        pending.push(swap);
      }
    }
    
    return pending;
  }

  /**
   * Get swaps by status
   */
  async getSwapsByStatus(status: SwapStatus): Promise<SwapState[]> {
    const entries = this.kv.list<SwapState>({ prefix: ["swaps"] });
    const matching: SwapState[] = [];
    
    for await (const entry of entries) {
      if (entry.value.status === status) {
        matching.push(entry.value);
      }
    }
    
    return matching;
  }

  /**
   * Get swaps that need Bob to create destination escrow
   */
  async getSwapsAwaitingDestEscrow(): Promise<SwapState[]> {
    const entries = this.kv.list<SwapState>({ prefix: ["swaps"] });
    const awaiting: SwapState[] = [];
    
    for await (const entry of entries) {
      const swap = entry.value;
      // Bob should create dest escrow after Alice deposits to source
      if (
        swap.status === SwapStatus.ALICE_DEPOSITED &&
        !swap.dstEscrow &&
        swap.srcEscrow
      ) {
        awaiting.push(swap);
      }
    }
    
    return awaiting;
  }

  /**
   * Get swaps that need Alice to reveal secret
   */
  async getSwapsAwaitingSecretReveal(): Promise<SwapState[]> {
    const entries = this.kv.list<SwapState>({ prefix: ["swaps"] });
    const awaiting: SwapState[] = [];
    
    for await (const entry of entries) {
      const swap = entry.value;
      // Alice should reveal secret after Bob deposits to destination
      if (
        swap.status === SwapStatus.BOB_DEPOSITED &&
        !swap.secretRevealedAt &&
        swap.dstEscrow &&
        swap.secret
      ) {
        awaiting.push(swap);
      }
    }
    
    return awaiting;
  }

  /**
   * Get swaps that need withdrawal
   */
  async getSwapsAwaitingWithdrawal(): Promise<SwapState[]> {
    const entries = this.kv.list<SwapState>({ prefix: ["swaps"] });
    const awaiting: SwapState[] = [];
    
    for await (const entry of entries) {
      const swap = entry.value;
      
      // Bob can withdraw from source after secret is revealed
      if (
        swap.status === SwapStatus.SECRET_REVEALED &&
        !swap.srcWithdrawnAt &&
        swap.srcEscrow &&
        swap.secret
      ) {
        awaiting.push(swap);
      }
      
      // Alice can withdraw from destination after revealing secret
      if (
        swap.secretRevealedAt &&
        !swap.dstWithdrawnAt &&
        swap.dstEscrow
      ) {
        awaiting.push(swap);
      }
    }
    
    return awaiting;
  }

  /**
   * Mark swap as failed
   */
  async markSwapFailed(orderHash: string, error: string): Promise<void> {
    await this.updateSwapStatus(orderHash, SwapStatus.FAILED, {
      lastError: error,
    });
  }

  /**
   * Increment retry count
   */
  async incrementRetryCount(orderHash: string): Promise<number> {
    const swap = await this.getSwap(orderHash);
    if (!swap) return 0;
    
    const newCount = swap.retryCount + 1;
    await this.updateSwapStatus(orderHash, swap.status, {
      retryCount: newCount,
    });
    
    return newCount;
  }

  /**
   * Check for expired swaps
   */
  async checkExpiredSwaps(timeoutSeconds: number = 3600): Promise<void> {
    const entries = this.kv.list<SwapState>({ prefix: ["swaps"] });
    const now = Date.now();
    
    for await (const entry of entries) {
      const swap = entry.value;
      const age = (now - swap.createdAt) / 1000;
      
      if (
        age > timeoutSeconds &&
        swap.status !== SwapStatus.COMPLETED &&
        swap.status !== SwapStatus.FAILED &&
        swap.status !== SwapStatus.EXPIRED
      ) {
        await this.updateSwapStatus(
          swap.orderHash,
          SwapStatus.EXPIRED,
          {
            lastError: `Swap expired after ${timeoutSeconds} seconds`,
          }
        );
        console.log(`⏰ Marked swap ${swap.orderHash} as expired`);
      }
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    total: number;
    completed: number;
    pending: number;
    failed: number;
    expired: number;
    successRate: number;
  }> {
    const entries = this.kv.list<SwapState>({ prefix: ["swaps"] });
    let total = 0;
    let completed = 0;
    let pending = 0;
    let failed = 0;
    let expired = 0;
    
    for await (const entry of entries) {
      total++;
      switch (entry.value.status) {
        case SwapStatus.COMPLETED:
          completed++;
          break;
        case SwapStatus.FAILED:
          failed++;
          break;
        case SwapStatus.EXPIRED:
          expired++;
          break;
        default:
          pending++;
      }
    }
    
    const successRate = total > 0 ? (completed / total) * 100 : 0;
    
    return {
      total,
      completed,
      pending,
      failed,
      expired,
      successRate,
    };
  }

  /**
   * Clean up old completed swaps
   */
  async cleanupOldSwaps(daysToKeep: number = 7): Promise<number> {
    const entries = this.kv.list<SwapState>({ prefix: ["swaps"] });
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    for await (const entry of entries) {
      const swap = entry.value;
      if (
        swap.completedAt &&
        swap.completedAt < cutoffTime &&
        swap.status === SwapStatus.COMPLETED
      ) {
        await this.kv.delete(["swaps", swap.orderHash]);
        cleaned++;
      }
    }
    
    console.log(`🧹 Cleaned up ${cleaned} old completed swaps`);
    return cleaned;
  }

  /**
   * Clear all swaps (for testing)
   */
  async clearAll(): Promise<void> {
    const entries = this.kv.list<SwapState>({ prefix: ["swaps"] });
    for await (const entry of entries) {
      await this.kv.delete(entry.key);
    }
    const hashlockEntries = this.kv.list({ prefix: ["swaps_by_hashlock"] });
    for await (const entry of hashlockEntries) {
      await this.kv.delete(entry.key);
    }
  }
  
  /**
   * Close the KV store
   */
  async close(): Promise<void> {
    if (this.kv) {
      this.kv.close();
    }
  }
}