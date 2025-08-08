/**
 * PonderClient - SQL over HTTP client for querying the indexer
 * 
 * This client uses @ponder/client for type-safe SQL queries
 * over HTTP to interact with the Ponder indexer.
 */

import { createClient, eq, desc, and, or, isNotNull } from "@ponder/client";
import * as schema from "./ponder.schema.ts";

export interface IndexerConfig {
  url: string;
}

export interface SrcEscrow {
  id: string;
  chainId: number;
  escrowAddress: string;
  orderHash: string;
  hashlock: string;
  maker: string;
  taker: string;
  srcToken: string;
  srcAmount: bigint;
  srcSafetyDeposit: bigint;
  dstMaker: string;
  dstToken: string;
  dstAmount: bigint;
  dstSafetyDeposit: bigint;
  dstChainId: bigint;
  timelocks: bigint;
  createdAt: bigint;
  blockNumber: bigint;
  transactionHash: string;
  status: string;
}

export interface DstEscrow {
  id: string;
  orderHash: string;
  hashlock: string;
  dstChainId: bigint;
  dstToken: string;
  dstAmount: bigint;
  maker: string;
  taker: string;
  status: string;
  escrowAddress: string;
  createdAt: bigint;
  updatedAt: bigint;
}

export interface AtomicSwap {
  id: string;
  orderHash: string;
  hashlock: string;
  srcChainId: number;
  dstChainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: bigint;
  dstAmount: bigint;
  srcMaker: string;
  srcTaker: string;
  dstMaker?: string;
  dstTaker?: string;
  status: string;
  srcEscrowAddress?: string;
  dstEscrowAddress?: string;
  srcCreatedAt?: bigint;
  dstCreatedAt?: bigint;
  srcWithdrawnAt?: bigint;
  dstWithdrawnAt?: bigint;
}

export interface ChainStatistics {
  totalSrcEscrows: number;
  totalDstEscrows: number;
  totalWithdrawals: number;
  totalCancellations: number;
}

// Type for Ponder SQL client
type PonderSQLClient = ReturnType<typeof createClient>;

export class PonderClient {
  private client: PonderSQLClient;
  private baseUrl: string;

  constructor(config: IndexerConfig) {
    this.baseUrl = config.url || "http://localhost:42069";
    // Create the SQL over HTTP client
    console.log("🔧 Initializing PonderClient with URL:", `${this.baseUrl}/sql`);
    console.log("📋 Schema tables:", Object.keys(schema));
    this.client = createClient(`${this.baseUrl}/sql`, { schema });
    console.log("✅ PonderClient initialized");
  }

  async getPendingSrcEscrows(resolverAddress: string): Promise<SrcEscrow[]> {
    const results = await this.client.db
      .select()
      .from(schema.srcEscrow)
      .where(
        and(
          eq(schema.srcEscrow.taker, resolverAddress.toLowerCase()),
          eq(schema.srcEscrow.status, "created")
        )
      )
      .orderBy(desc(schema.srcEscrow.createdAt))
      .execute();
    
    return results as SrcEscrow[];
  }

  async getSrcEscrowByOrderHash(orderHash: string): Promise<SrcEscrow | null> {
    const results = await this.client.db
      .select()
      .from(schema.srcEscrow)
      .where(eq(schema.srcEscrow.orderHash, orderHash as `0x${string}`))
      .limit(1)
      .execute();
    
    return results[0] as SrcEscrow || null;
  }

  async getDstEscrowByHashlock(hashlock: string): Promise<DstEscrow | null> {
    const results = await this.client.db
      .select()
      .from(schema.dstEscrow)
      .where(eq(schema.dstEscrow.hashlock, hashlock as `0x${string}`))
      .limit(1)
      .execute();
    
    return results[0] as DstEscrow || null;
  }

  async getAtomicSwapByOrderHash(orderHash: string): Promise<AtomicSwap | null> {
    const results = await this.client.db
      .select()
      .from(schema.atomicSwap)
      .where(eq(schema.atomicSwap.orderHash, orderHash as `0x${string}`))
      .limit(1)
      .execute();
    
    return results[0] as AtomicSwap || null;
  }

  async getPendingAtomicSwaps(resolverAddress: string): Promise<AtomicSwap[]> {
    try {
      console.log("🔍 Querying pending atomic swaps for:", resolverAddress);
      
      const results = await this.client.db
        .select()
        .from(schema.atomicSwap)
        .where(
          and(
            eq(schema.atomicSwap.srcTaker, resolverAddress.toLowerCase()),
            or(
              eq(schema.atomicSwap.status, "pending"),
              eq(schema.atomicSwap.status, "src_created")
            )
          )
        )
        .orderBy(desc(schema.atomicSwap.srcCreatedAt))
        .execute();
      
      console.log(`✅ Found ${results.length} pending swaps`);
      return results as AtomicSwap[];
    } catch (error) {
      console.error("❌ Error in getPendingAtomicSwaps:", error);
      throw error;
    }
  }

  getRevealedSecrets(): Promise<Array<{ hashlock: string; secret: string }>> {
    // Note: escrowWithdrawal doesn't have hashlock, we need to get it from atomicSwap
    // For now, return empty array since we can't properly correlate secrets to hashlocks
    // This would need to be fixed by joining with atomicSwap or srcEscrow tables
    console.log("⚠️ getRevealedSecrets: Not implemented - escrowWithdrawal doesn't have hashlock field");
    return Promise.resolve([]);
  }

  async getWithdrawalByEscrow(escrowAddress: string): Promise<{ secret: string } | null> {
    const results = await this.client.db
      .select({
        secret: schema.escrowWithdrawal.secret
      })
      .from(schema.escrowWithdrawal)
      .where(eq(schema.escrowWithdrawal.escrowAddress, escrowAddress.toLowerCase()))
      .limit(1)
      .execute();
    
    const withdrawal = results[0];
    return withdrawal?.secret ? { secret: withdrawal.secret } : null;
  }

  async getChainStatistics(chainId: number): Promise<ChainStatistics> {
    const results = await this.client.db
      .select()
      .from(schema.chainStatistics)
      .where(eq(schema.chainStatistics.chainId, chainId))
      .limit(1)
      .execute();
    
    return results[0] || { 
      totalSrcEscrows: 0, 
      totalDstEscrows: 0, 
      totalWithdrawals: 0,
      totalCancellations: 0 
    };
  }

  /**
   * Get recent withdrawals from blockchain events (legitimate indexer use)
   * This monitors on-chain events, not resolver state
   */
  async getRecentWithdrawals(limit: number = 10): Promise<Array<{
    hashlock: string;
    secret: string;
    orderHash: string;
    escrowAddress: string;
    chainId: number;
    timestamp: bigint;
  }>> {
    try {
      // Join withdrawals with srcEscrow by escrowAddress to derive hashlock and orderHash
      const results = await this.client.db
        .select({
          secret: schema.escrowWithdrawal.secret,
          escrowAddress: schema.escrowWithdrawal.escrowAddress,
          chainId: schema.escrowWithdrawal.chainId,
          timestamp: schema.escrowWithdrawal.withdrawnAt,
          hashlock: schema.srcEscrow.hashlock,
          orderHash: schema.srcEscrow.orderHash,
        })
        .from(schema.escrowWithdrawal)
        .leftJoin(
          schema.srcEscrow,
          eq(schema.srcEscrow.escrowAddress, schema.escrowWithdrawal.escrowAddress)
        )
        .where(isNotNull(schema.escrowWithdrawal.secret))
        .orderBy(desc(schema.escrowWithdrawal.withdrawnAt))
        .limit(limit)
        .execute();

      return results
        .filter((r: any) => r.secret)
        .map((r: any) => ({
          hashlock: r.hashlock || '',
          secret: r.secret,
          orderHash: r.orderHash || '',
          escrowAddress: r.escrowAddress,
          chainId: r.chainId,
          timestamp: r.timestamp,
        }));
    } catch (error) {
      console.error("Error fetching recent withdrawals:", error);
      return [];
    }
  }

  // Live query support for real-time updates
  subscribeToAtomicSwaps(
    resolverAddress: string, 
    onUpdate: (swaps: AtomicSwap[]) => void,
    onError?: (error: Error) => void
  ) {
    return this.client.live(
      (db: any) => db
        .select()
        .from(schema.atomicSwap)
        .where(
          and(
            eq(schema.atomicSwap.srcTaker, resolverAddress.toLowerCase()),
            or(
              eq(schema.atomicSwap.status, "pending"),
              eq(schema.atomicSwap.status, "src_created")
            )
          )
        )
        .orderBy(desc(schema.atomicSwap.srcCreatedAt))
        .execute(),
      onUpdate,
      onError
    );
  }
}