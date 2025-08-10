/**
 * PonderClient - SQL over HTTP client (no @ponder/client dependency)
 *
 * Performs direct HTTP POST to the Ponder `/sql` endpoint to avoid npm runtime
 * resolution issues inside Deno containers.
 */

import { getIndexerConfig } from "../config/indexer.ts";

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
  private sqlEndpoint: string;
  
  constructor(config: IndexerConfig = {}) {
    // Get full configuration
    const fullConfig = getIndexerConfig();
    
    // Use provided URL or fallback to config or default
    this.baseUrl = config.url || fullConfig.sqlUrl.replace("/sql", "") || "https://index-bmn.up.railway.app";
    
    // Ensure we have the correct base URL without /sql suffix
    if (this.baseUrl.endsWith("/sql")) {
      this.baseUrl = this.baseUrl.slice(0, -4);
    }
    
    this.sqlEndpoint = `${this.baseUrl}/sql`;
    
    console.log("🔧 Initialized PonderClient with:");
    console.log("  Base URL:", this.baseUrl);
    console.log("  SQL endpoint:", this.sqlEndpoint);
  }
  
  private async postSql<T = any>(query: string): Promise<T[]> {
    try {
      const res = await fetch(this.sqlEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: query })
      });
      if (!res.ok) {
        console.error("SQL error status:", res.status, res.statusText);
        return [] as T[];
      }
      const json = await res.json();
      const rows = (json?.data ?? json?.rows ?? []) as T[];
      return rows;
    } catch (e) {
      console.error("HTTP SQL request failed:", e);
      return [] as T[];
    }
  }
  
  /**
   * Get pending source escrows for a resolver
   */
  async getPendingSrcEscrows(resolverAddress: string) {
    try {
      const taker = resolverAddress.toLowerCase();
      const q = `SELECT * FROM src_escrow WHERE taker = '${taker}' AND status = 'created'`;
      const result = await this.postSql(q);
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
      const q = `SELECT * FROM src_escrow WHERE order_hash = '${orderHash}' LIMIT 1`;
      const result = await this.postSql(q);
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
      const q = `SELECT * FROM dst_escrow WHERE hashlock = '${hashlock}' LIMIT 1`;
      const result = await this.postSql(q);
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
      const q = `SELECT * FROM atomic_swap WHERE order_hash = '${orderHash}' LIMIT 1`;
      const result = await this.postSql(q);
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
      const q = `SELECT * FROM atomic_swap WHERE src_taker = '${taker}' AND status IN ('pending','src_created')`;
      const result = await this.postSql(q);
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
      const q = `SELECT * FROM atomic_swap WHERE status IN ('pending','src_created') AND (dst_escrow_address IS NULL OR dst_escrow_address = '') LIMIT 100`;
      const result = await this.postSql(q);
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
      const q = `SELECT * FROM atomic_swap WHERE hashlock = '${hashlock}'`;
      const result = await this.postSql(q);
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
      const q = `SELECT * FROM atomic_swap WHERE status = 'completed' LIMIT ${limit}`;
      const result = await this.postSql(q);
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
      const q = `SELECT hashlock, secret FROM atomic_swap WHERE secret IS NOT NULL AND status IN ('completed','dst_created') LIMIT 100`;
      const result = await this.postSql(q);
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
      const q = `SELECT secret FROM escrow_withdrawal WHERE escrow_address = '${addr}' LIMIT 1`;
      const result = await this.postSql(q);
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
      const q = `SELECT * FROM chain_statistics WHERE chain_id = ${chainId} LIMIT 1`;
      const result = await this.postSql(q);
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
      const q = `
        SELECT w.escrow_address, w.chain_id, w.withdrawn_at AS timestamp, w.secret,
               s.hashlock, s.order_hash
        FROM escrow_withdrawal w
        LEFT JOIN src_escrow s ON s.escrow_address = w.escrow_address
        ORDER BY w.withdrawn_at DESC
        LIMIT ${limit}
      `;
      const result = await this.postSql(q);
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
      const q = `SELECT * FROM bmn_token_holder LIMIT ${limit}`;
      const result = await this.postSql(q);
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
      const q = `SELECT * FROM limit_order WHERE status = 'active' LIMIT ${limit}`;
      const result = await this.postSql(q);
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
      const q = `SELECT 1 FROM resolver_whitelist WHERE resolver = '${addr}' AND chain_id = ${chainId} AND is_whitelisted = true LIMIT 1`;
      const result = await this.postSql(q);
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