/**
 * PonderClient - SQL over HTTP client using @ponder/client
 *
 * This implementation uses the official client per docs:
 * https://ponder.sh/docs/query/sql-over-http#sql-over-http
 */

import { getIndexerConfig } from "../config/indexer.ts";
import { createClient, sql } from "@ponder/client";

export interface IndexerConfig {
  url?: string;
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}

// Type for AtomicSwap based on schema
export interface AtomicSwap {
  id: string;
  orderHash: string;
  hashlock: string;
  srcChainId: number;
  dstChainId: number;
  srcEscrowAddress?: string;
  dstEscrowAddress?: string;
  srcMaker: string;
  srcTaker: string;
  dstMaker: string;
  dstTaker: string;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  status: string;
  secret?: string;
  createdAt: number;
  srcFillTxHash?: string;
  dstFillTxHash?: string;
  srcRevealTxHash?: string;
  dstRevealTxHash?: string;
  postInteraction?: string;
}

export class PonderClient {
  private baseUrl: string;
  private sqlUrl: string;
  private client: ReturnType<typeof createClient>;

  constructor(config: IndexerConfig = {}) {
    const fullConfig = getIndexerConfig();
    const provided = config.url || fullConfig.sqlUrl.replace("/sql", "") || "https://index-bmn.up.railway.app";

    this.baseUrl = provided.endsWith("/sql") ? provided.slice(0, -4) : provided;
    this.sqlUrl = `${this.baseUrl}/sql`;

    // Initialize official client
    this.client = createClient(this.sqlUrl);

    console.log("🔧 Initialized PonderClient with:");
    console.log("  Base URL:", this.baseUrl);
    console.log("  SQL endpoint:", this.sqlUrl);
  }
  
  /**
   * Get pending source escrows for a resolver
   */
  async getPendingSrcEscrows(resolverAddress: string) {
    try {
      const taker = resolverAddress.toLowerCase();
      const result = await this.client.db.execute(sql`SELECT * FROM src_escrow WHERE taker = ${taker} AND status = 'created'`);
      return result ?? [];
    } catch (error) {
      console.error("❌ Error in getPendingSrcEscrows:", error);
      return [];
    }
  }
  
  /**
   * Get source escrow by order hash
   */
  async getSrcEscrowByOrderHash(orderHash: string) {
    try {
      const result = await this.client.db.execute(sql`SELECT * FROM src_escrow WHERE order_hash = ${orderHash} LIMIT 1`);
      return result?.[0] ?? null;
    } catch (error) {
      console.error("❌ Error in getSrcEscrowByOrderHash:", error);
      return null;
    }
  }
  
  /**
   * Get destination escrow by hashlock
   */
  async getDstEscrowByHashlock(hashlock: string) {
    try {
      const result = await this.client.db.execute(sql`SELECT * FROM dst_escrow WHERE hashlock = ${hashlock} LIMIT 1`);
      return result?.[0] ?? null;
    } catch (error) {
      console.error("❌ Error in getDstEscrowByHashlock:", error);
      return null;
    }
  }
  
  /**
   * Get atomic swap by order hash
   */
  async getAtomicSwapByOrderHash(orderHash: string) {
    try {
      const result = await this.client.db.execute(sql`SELECT * FROM atomic_swap WHERE order_hash = ${orderHash} LIMIT 1`);
      return result?.[0] ?? null;
    } catch (error) {
      console.error("❌ Error in getAtomicSwapByOrderHash:", error);
      return null;
    }
  }
  
  /**
   * Get pending atomic swaps for a resolver
   */
  async getPendingAtomicSwaps(resolverAddress: string) {
    try {
      const taker = resolverAddress.toLowerCase();
      const result = await this.client.db.execute(sql`SELECT * FROM atomic_swap WHERE src_taker = ${taker} AND (status = 'pending' OR status = 'src_created')`);
      console.log(`✅ Found ${result.length} pending swaps for ${resolverAddress}`);
      return result ?? [];
    } catch (error) {
      console.error("❌ Error in getPendingAtomicSwaps:", error);
      return [];
    }
  }
  
  /**
   * Get active swaps (pending or src_created without dst escrow)
   */
  async getActiveSwaps() {
    try {
      const result = await this.client.db.execute(sql`SELECT * FROM atomic_swap WHERE (status = 'pending' OR status = 'src_created') AND (dst_escrow_address IS NULL OR dst_escrow_address = '') LIMIT 100`);
      return result ?? [];
    } catch (error) {
      console.error("❌ Error in getActiveSwaps:", error);
      return [];
    }
  }
  
  /**
   * Get swaps by hashlock
   */
  async getSwapsByHashlock(hashlock: string) {
    try {
      const result = await this.client.db.execute(sql`SELECT * FROM atomic_swap WHERE hashlock = ${hashlock}`);
      return result ?? [];
    } catch (error) {
      console.error("❌ Error in getSwapsByHashlock:", error);
      return [];
    }
  }
  
  /**
   * Get completed swaps
   */
  async getCompletedSwaps(limit: number = 10) {
    try {
      const result = await this.client.db.execute(sql`SELECT * FROM atomic_swap WHERE status = 'completed' LIMIT ${limit}`);
      return result ?? [];
    } catch (error) {
      console.error("❌ Error in getCompletedSwaps:", error);
      return [];
    }
  }
  
  /**
   * Get revealed secrets from atomic swaps
   */
  async getRevealedSecrets() {
    try {
      const result = await this.client.db.execute(sql`SELECT hashlock, secret FROM atomic_swap WHERE secret IS NOT NULL AND (status = 'completed' OR status = 'dst_created') LIMIT 100`);
      return (result ?? []).filter((r: any) => r.hashlock && r.secret);
    } catch (error) {
      console.error("❌ Error in getRevealedSecrets:", error);
      return [];
    }
  }
  
  /**
   * Get withdrawal by escrow address
   */
  async getWithdrawalByEscrow(escrowAddress: string) {
    try {
      const addr = escrowAddress.toLowerCase();
      const result = await this.client.db.execute(sql`SELECT secret FROM escrow_withdrawal WHERE escrow_address = ${addr} LIMIT 1`);
      return result?.[0] ?? null;
    } catch (error) {
      console.error("❌ Error in getWithdrawalByEscrow:", error);
      return null;
    }
  }
  
  /**
   * Get chain statistics for a specific chain
   */
  async getChainStatistics(chainId: number) {
    try {
      const result = await this.client.db.execute(sql`SELECT * FROM chain_statistics WHERE chain_id = ${chainId} LIMIT 1`);
      if (result?.[0]) {
        return {
          totalSrcEscrows: Number(result[0].total_src_escrows ?? 0),
          totalDstEscrows: Number(result[0].total_dst_escrows ?? 0),
          totalWithdrawals: Number(result[0].total_withdrawals ?? 0),
          totalCancellations: Number(result[0].total_cancellations ?? 0),
        };
      }
      return { totalSrcEscrows: 0, totalDstEscrows: 0, totalWithdrawals: 0, totalCancellations: 0 };
    } catch (error) {
      console.error("❌ Error in getChainStatistics:", error);
      return { totalSrcEscrows: 0, totalDstEscrows: 0, totalWithdrawals: 0, totalCancellations: 0 };
    }
  }
  
  /**
   * Get recent withdrawals with escrow details
   */
  async getRecentWithdrawals(limit: number = 10) {
    try {
      const result = await this.client.db.execute(sql`
        SELECT w.escrow_address, w.chain_id, w.withdrawn_at AS timestamp, w.secret,
               s.hashlock, s.order_hash
        FROM escrow_withdrawal w
        LEFT JOIN src_escrow s ON s.escrow_address = w.escrow_address
        ORDER BY w.withdrawn_at DESC
        LIMIT ${limit}
      `);
      return result ?? [];
    } catch (error) {
      console.error("❌ Error in getRecentWithdrawals:", error);
      return [];
    }
  }
  
  /**
   * Get BMN token holders
   */
  async getBMNHolders(limit: number = 10) {
    try {
      const result = await this.client.db.execute(sql`SELECT * FROM bmn_token_holder LIMIT ${limit}`);
      return result ?? [];
    } catch (error) {
      console.error("❌ Error in getBMNHolders:", error);
      return [];
    }
  }
  
  /**
   * Get active limit orders
   */
  async getActiveLimitOrders(limit: number = 10) {
    try {
      const result = await this.client.db.execute(sql`SELECT * FROM limit_order WHERE status = 'active' LIMIT ${limit}`);
      return result ?? [];
    } catch (error) {
      console.error("❌ Error in getActiveLimitOrders:", error);
      return [];
    }
  }
  
  /**
   * Check if resolver is whitelisted
   */
  async isResolverWhitelisted(resolver: string, chainId: number) {
    try {
      const addr = resolver.toLowerCase();
      const result = await this.client.db.execute(sql`SELECT 1 FROM resolver_whitelist WHERE resolver = ${addr} AND chain_id = ${chainId} AND is_whitelisted = true LIMIT 1`);
      return (result ?? []).length > 0;
    } catch (error) {
      console.error("❌ Error in isResolverWhitelisted:", error);
      return false;
    }
  }
  
  /**
   * Subscribe to atomic swaps with live updates
   * Note: Live queries may not work on all deployed Ponder instances
   */
  subscribeToAtomicSwaps(
    resolverAddress: string,
    onUpdate: (swaps: any[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    // Polling-based subscription
    let intervalId: number | undefined;
    let isSubscribed = true;

    const poll = async () => {
      if (!isSubscribed) return;
      try {
        const swaps = await this.getPendingAtomicSwaps(resolverAddress);
        onUpdate(swaps);
      } catch (error) {
        if (onError) onError(error as Error);
      }
    };
    poll();
    intervalId = setInterval(poll, 5000) as unknown as number;
    return () => {
      isSubscribed = false;
      if (intervalId) clearInterval(intervalId);
    };
  }
}

// Export a default instance
export const ponderClient = new PonderClient();