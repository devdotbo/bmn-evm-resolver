/**
 * PonderClient V2 - SQL over HTTP client using @ponder/client
 * 
 * This client uses the official @ponder/client library to query the Ponder indexer.
 * It provides type-safe queries with the Drizzle ORM query builder.
 */

import { createClient, eq, desc, and, or, gte, lte } from "npm:@ponder/client@0.12.0";
import * as schema from "./ponder.schema.ts";
import { getIndexerConfig } from "../config/indexer.ts";

export interface IndexerConfig {
  url?: string;
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}

export class PonderClientV2 {
  private client: any;
  private baseUrl: string;
  
  constructor(config: IndexerConfig = {}) {
    // Get full configuration
    const fullConfig = getIndexerConfig();
    
    // Use provided URL or fallback to config or default
    this.baseUrl = config.url || fullConfig.sqlUrl.replace("/sql", "") || "https://index-bmn.up.railway.app";
    
    // Ensure we have the correct base URL without /sql suffix
    if (this.baseUrl.endsWith("/sql")) {
      this.baseUrl = this.baseUrl.slice(0, -4);
    }
    
    // Create @ponder/client instance
    this.client = createClient(`${this.baseUrl}/sql`, { schema });
    
    console.log("🔧 Initialized PonderClientV2 with:");
    console.log("  Base URL:", this.baseUrl);
    console.log("  SQL endpoint:", `${this.baseUrl}/sql`);
  }
  
  /**
   * Get pending source escrows for a resolver
   */
  async getPendingSrcEscrows(resolverAddress: string) {
    try {
      const result = await this.client.db
        .select()
        .from(schema.srcEscrow)
        .where(
          and(
            eq(schema.srcEscrow.taker, resolverAddress.toLowerCase()),
            eq(schema.srcEscrow.status, "created")
          )
        )
        .execute();
      
      return result || [];
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
      const result = await this.client.db
        .select()
        .from(schema.srcEscrow)
        .where(eq(schema.srcEscrow.orderHash, orderHash))
        .limit(1)
        .execute();
      
      return result?.[0] || null;
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
      const result = await this.client.db
        .select()
        .from(schema.dstEscrow)
        .where(eq(schema.dstEscrow.hashlock, hashlock))
        .limit(1)
        .execute();
      
      return result?.[0] || null;
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
      const result = await this.client.db
        .select()
        .from(schema.atomicSwap)
        .where(eq(schema.atomicSwap.orderHash, orderHash))
        .limit(1)
        .execute();
      
      return result?.[0] || null;
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
      const result = await this.client.db
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
        .execute();
      
      console.log(`✅ Found ${result.length} pending swaps for ${resolverAddress}`);
      return result || [];
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
      const result = await this.client.db
        .select()
        .from(schema.atomicSwap)
        .where(
          or(
            eq(schema.atomicSwap.status, "pending"),
            eq(schema.atomicSwap.status, "src_created")
          )
        )
        .limit(100)
        .execute();
      
      // Filter for swaps without dst escrow
      return (result || []).filter(swap => !swap.dstEscrowAddress);
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
      const result = await this.client.db
        .select()
        .from(schema.atomicSwap)
        .where(eq(schema.atomicSwap.hashlock, hashlock))
        .execute();
      
      return result || [];
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
      const result = await this.client.db
        .select()
        .from(schema.atomicSwap)
        .where(eq(schema.atomicSwap.status, "completed"))
        .limit(limit)
        .execute();
      
      return result || [];
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
      const result = await this.client.db
        .select({
          hashlock: schema.atomicSwap.hashlock,
          secret: schema.atomicSwap.secret,
        })
        .from(schema.atomicSwap)
        .where(
          and(
            schema.atomicSwap.secret !== null,
            or(
              eq(schema.atomicSwap.status, "completed"),
              eq(schema.atomicSwap.status, "dst_created")
            )
          )
        )
        .limit(100)
        .execute();
      
      return (result || []).filter(item => item.hashlock && item.secret);
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
      const result = await this.client.db
        .select({
          secret: schema.escrowWithdrawal.secret,
        })
        .from(schema.escrowWithdrawal)
        .where(eq(schema.escrowWithdrawal.escrowAddress, escrowAddress.toLowerCase()))
        .limit(1)
        .execute();
      
      return result?.[0] || null;
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
      const result = await this.client.db
        .select()
        .from(schema.chainStatistics)
        .where(eq(schema.chainStatistics.chainId, chainId))
        .limit(1)
        .execute();
      
      if (result?.[0]) {
        return {
          totalSrcEscrows: Number(result[0].totalSrcEscrows),
          totalDstEscrows: Number(result[0].totalDstEscrows),
          totalWithdrawals: Number(result[0].totalWithdrawals),
          totalCancellations: Number(result[0].totalCancellations),
        };
      }
      
      // If no statistics exist, return zeros
      return {
        totalSrcEscrows: 0,
        totalDstEscrows: 0,
        totalWithdrawals: 0,
        totalCancellations: 0,
      };
    } catch (error) {
      console.error("❌ Error in getChainStatistics:", error);
      return {
        totalSrcEscrows: 0,
        totalDstEscrows: 0,
        totalWithdrawals: 0,
        totalCancellations: 0,
      };
    }
  }
  
  /**
   * Get recent withdrawals with escrow details
   */
  async getRecentWithdrawals(limit: number = 10) {
    try {
      // First get withdrawals
      const withdrawals = await this.client.db
        .select()
        .from(schema.escrowWithdrawal)
        .limit(limit)
        .execute();
      
      // Then get matching escrows for hashlocks and order hashes
      const results = [];
      for (const withdrawal of withdrawals) {
        // Try to find the source escrow for this withdrawal
        const srcEscrow = await this.client.db
          .select({
            hashlock: schema.srcEscrow.hashlock,
            orderHash: schema.srcEscrow.orderHash,
          })
          .from(schema.srcEscrow)
          .where(eq(schema.srcEscrow.escrowAddress, withdrawal.escrowAddress))
          .limit(1)
          .execute();
        
        results.push({
          hashlock: srcEscrow?.[0]?.hashlock || "",
          secret: withdrawal.secret,
          orderHash: srcEscrow?.[0]?.orderHash || "",
          escrowAddress: withdrawal.escrowAddress,
          chainId: withdrawal.chainId,
          timestamp: withdrawal.withdrawnAt,
        });
      }
      
      return results;
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
      const result = await this.client.db
        .select()
        .from(schema.bmnTokenHolder)
        .limit(limit)
        .execute();
      
      return result || [];
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
      const result = await this.client.db
        .select()
        .from(schema.limitOrder)
        .where(eq(schema.limitOrder.status, "active"))
        .limit(limit)
        .execute();
      
      return result || [];
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
      const result = await this.client.db
        .select()
        .from(schema.resolverWhitelist)
        .where(
          and(
            eq(schema.resolverWhitelist.resolver, resolver.toLowerCase()),
            eq(schema.resolverWhitelist.chainId, chainId),
            eq(schema.resolverWhitelist.isWhitelisted, true)
          )
        )
        .limit(1)
        .execute();
      
      return result?.length > 0;
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
    try {
      // Attempt to use live query
      const { unsubscribe } = this.client.live(
        (db) => db
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
          .execute(),
        onUpdate,
        onError || ((error) => console.error("Live query error:", error))
      );
      
      return unsubscribe;
    } catch (error) {
      console.error("❌ Live queries not supported, falling back to polling");
      
      // Fallback to polling
      let intervalId: number | undefined;
      let isSubscribed = true;
      
      const poll = async () => {
        if (!isSubscribed) return;
        
        try {
          const swaps = await this.getPendingAtomicSwaps(resolverAddress);
          onUpdate(swaps);
        } catch (error) {
          if (onError) {
            onError(error as Error);
          }
        }
      };
      
      // Initial poll
      poll();
      
      // Poll every 5 seconds
      intervalId = setInterval(poll, 5000);
      
      // Return unsubscribe function
      return () => {
        isSubscribed = false;
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }
  }
}

// Export a default instance
export const ponderClient = new PonderClientV2();