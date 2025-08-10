/**
 * PonderClient - SQL over HTTP client for querying the indexer
 * 
 * This client sends SQL queries over HTTP to interact with the Ponder indexer.
 * It implements the @ponder/client protocol without requiring the npm package.
 */

import { getIndexerConfig, type IndexerConfig as ConfigType } from "../config/indexer.ts";

export interface IndexerConfig {
  url: string;
  tablePrefix?: string;
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
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
  chainId: number;
  escrowAddress: string;
  hashlock: string;
  taker: string;
  srcCancellationTimestamp: bigint;
  createdAt: bigint;
  blockNumber: bigint;
  transactionHash: string;
  status: string;
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
  completedAt?: bigint;
  cancelledAt?: bigint;
  secret?: string;
  postInteraction?: boolean;
}

export interface EscrowWithdrawal {
  id: string;
  chainId: number;
  escrowAddress: string;
  secret: string;
  withdrawnAt: bigint;
  blockNumber: bigint;
  transactionHash: string;
}

export interface ChainStatistics {
  totalSrcEscrows: number;
  totalDstEscrows: number;
  totalWithdrawals: number;
  totalCancellations: number;
}

interface SQLQuery {
  sql: string;
  params: any[];
  typings?: any;
}

interface SQLResponse {
  rows: Record<string, any>[];
  error?: string;
}

/**
 * Simple superjson implementation for serializing SQL queries
 * This is a minimal implementation that handles basic types
 */
class SimpleSerializer {
  static stringify(obj: any): string {
    return JSON.stringify(this.serialize(obj));
  }

  static serialize(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (typeof obj === "bigint") {
      return { $type: "bigint", value: obj.toString() };
    }
    if (obj instanceof Date) {
      return { $type: "date", value: obj.toISOString() };
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.serialize(item));
    }
    if (typeof obj === "object") {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.serialize(value);
      }
      return result;
    }
    return obj;
  }
}

export class PonderClient {
  private baseUrl: string;
  private sqlUrl: string;
  private tablePrefix: string;
  private retryAttempts: number;
  private retryDelay: number;
  private timeout: number;

  constructor(config: IndexerConfig) {
    // Get full configuration including retry settings
    const fullConfig = getIndexerConfig();
    
    this.baseUrl = config.url || fullConfig.sqlUrl.replace("/sql", "") || "http://localhost:42069";
    // Ensure we have the correct base URL without /sql suffix for Ponder API
    if (this.baseUrl.endsWith("/sql")) {
      this.baseUrl = this.baseUrl.slice(0, -4);
    }
    this.sqlUrl = `${this.baseUrl}/sql`;
    this.tablePrefix = config.tablePrefix || fullConfig.tablePrefix || "";
    this.retryAttempts = config.retryAttempts || fullConfig.retryAttempts || 3;
    this.retryDelay = config.retryDelay || fullConfig.retryDelay || 1000;
    this.timeout = config.timeout || fullConfig.timeout || 30000;
    
    console.log("🔧 Initializing PonderClient with:");
    console.log("  Base URL:", this.baseUrl);
    console.log("  SQL URL:", this.sqlUrl);
    console.log("  Table prefix:", this.tablePrefix || "(none)");
    console.log("  Retry attempts:", this.retryAttempts);
    console.log("  Timeout:", this.timeout, "ms");
  }

  /**
   * Get table name with optional prefix
   */
  private getTableName(table: string): string {
    return this.tablePrefix ? `${this.tablePrefix}_${table}` : table;
  }

  /**
   * Execute SQL query using Ponder's Direct SQL over HTTP protocol
   * Reference: POST to /sql with body { sql: "SELECT * FROM table" }
   */
  private async executeSql(query: string, params: any[] = []): Promise<SQLResponse> {
    let lastError: Error | null = null;
    
    // Replace $1, $2 parameters with actual values for direct SQL
    let finalQuery = query;
    params.forEach((param, index) => {
      const placeholder = `$${index + 1}`;
      // Properly escape string parameters
      const value = typeof param === 'string' ? `'${param.replace(/'/g, "''")}''` : param;
      finalQuery = finalQuery.replace(placeholder, String(value));
    });
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        // Direct SQL over HTTP - POST to /sql with { sql: query }
        const response = await fetch(this.sqlUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sql: finalQuery }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.error) {
          throw new Error(result.error);
        }
        
        // The response should have a 'data' field with rows
        const rows = result.data || result.rows || [];
        
        return { rows };
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain errors
        if (lastError.message.includes("404") || lastError.message.includes("405")) {
          // Likely wrong endpoint or method, don't retry
          break;
        }
        
        if (attempt < this.retryAttempts) {
          console.log(`⚠️ Query attempt ${attempt} failed, retrying in ${this.retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }
    
    // If all attempts failed, return empty result instead of throwing
    console.error("❌ Query failed:", lastError?.message);
    return { rows: [] };
  }

  /**
   * Convert database row to typed object with proper BigInt handling
   */
  private parseRow<T>(row: any, fields: (keyof T)[]): T {
    const result: any = {};
    
    for (const field of fields) {
      const snakeField = this.camelToSnake(field as string);
      const value = row[snakeField] || row[field as string];
      
      // Convert string numbers to BigInt for specific fields
      if (field.toString().includes("Amount") || 
          field.toString().includes("Deposit") || 
          field.toString().includes("At") ||
          field.toString().includes("timelocks") ||
          field.toString().includes("ChainId") ||
          field.toString().includes("blockNumber") ||
          field.toString().includes("Timestamp")) {
        result[field] = value ? BigInt(value) : null;
      } else if (field === "chainId" || field === "srcChainId" || field === "dstChainId") {
        result[field] = value ? Number(value) : null;
      } else {
        result[field] = value;
      }
    }
    
    return result as T;
  }

  /**
   * Convert camelCase to snake_case for database columns
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  async getPendingSrcEscrows(resolverAddress: string): Promise<SrcEscrow[]> {
    const query = `
      SELECT * FROM ${this.getTableName("src_escrow")}
      WHERE LOWER(taker) = LOWER($1)
        AND status = 'created'
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await this.executeSql(query, [resolverAddress]);
      
      return (result.rows || []).map(row => this.parseRow<SrcEscrow>(row, [
        "id", "chainId", "escrowAddress", "orderHash", "hashlock",
        "maker", "taker", "srcToken", "srcAmount", "srcSafetyDeposit",
        "dstMaker", "dstToken", "dstAmount", "dstSafetyDeposit",
        "dstChainId", "timelocks", "createdAt", "blockNumber",
        "transactionHash", "status"
      ]));
    } catch (error) {
      console.error("❌ Error in getPendingSrcEscrows:", error);
      return [];
    }
  }

  async getSrcEscrowByOrderHash(orderHash: string): Promise<SrcEscrow | null> {
    const query = `
      SELECT * FROM ${this.getTableName("src_escrow")}
      WHERE order_hash = $1
      LIMIT 1
    `;
    
    try {
      const result = await this.executeSql(query, [orderHash]);
      
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      
      return this.parseRow<SrcEscrow>(result.rows[0], [
        "id", "chainId", "escrowAddress", "orderHash", "hashlock",
        "maker", "taker", "srcToken", "srcAmount", "srcSafetyDeposit",
        "dstMaker", "dstToken", "dstAmount", "dstSafetyDeposit",
        "dstChainId", "timelocks", "createdAt", "blockNumber",
        "transactionHash", "status"
      ]);
    } catch (error) {
      console.error("❌ Error in getSrcEscrowByOrderHash:", error);
      return null;
    }
  }

  async getDstEscrowByHashlock(hashlock: string): Promise<DstEscrow | null> {
    const query = `
      SELECT * FROM ${this.getTableName("dst_escrow")}
      WHERE hashlock = $1
      LIMIT 1
    `;
    
    try {
      const result = await this.executeSql(query, [hashlock]);
      
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      
      return this.parseRow<DstEscrow>(result.rows[0], [
        "id", "chainId", "escrowAddress", "hashlock", "taker",
        "srcCancellationTimestamp", "createdAt", "blockNumber",
        "transactionHash", "status"
      ]);
    } catch (error) {
      console.error("❌ Error in getDstEscrowByHashlock:", error);
      return null;
    }
  }

  async getAtomicSwapByOrderHash(orderHash: string): Promise<AtomicSwap | null> {
    const query = `
      SELECT * FROM ${this.getTableName("atomic_swap")}
      WHERE order_hash = $1
      LIMIT 1
    `;
    
    try {
      const result = await this.executeSql(query, [orderHash]);
      
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      
      return this.parseRow<AtomicSwap>(result.rows[0], [
        "id", "orderHash", "hashlock", "srcChainId", "dstChainId",
        "srcToken", "dstToken", "srcAmount", "dstAmount",
        "srcMaker", "srcTaker", "dstMaker", "dstTaker",
        "status", "srcEscrowAddress", "dstEscrowAddress",
        "srcCreatedAt", "dstCreatedAt", "completedAt", "cancelledAt",
        "secret", "postInteraction"
      ]);
    } catch (error) {
      console.error("❌ Error in getAtomicSwapByOrderHash:", error);
      return null;
    }
  }

  async getPendingAtomicSwaps(resolverAddress: string): Promise<AtomicSwap[]> {
    const query = `
      SELECT * FROM ${this.getTableName("atomic_swap")}
      WHERE LOWER(src_taker) = LOWER($1)
        AND status IN ('pending', 'src_created')
      ORDER BY src_created_at DESC NULLS LAST
    `;
    
    try {
      console.log("🔍 Querying pending atomic swaps for:", resolverAddress);
      const result = await this.executeSql(query, [resolverAddress]);
      
      const swaps = (result.rows || []).map(row => this.parseRow<AtomicSwap>(row, [
        "id", "orderHash", "hashlock", "srcChainId", "dstChainId",
        "srcToken", "dstToken", "srcAmount", "dstAmount",
        "srcMaker", "srcTaker", "dstMaker", "dstTaker",
        "status", "srcEscrowAddress", "dstEscrowAddress",
        "srcCreatedAt", "dstCreatedAt", "completedAt", "cancelledAt",
        "secret", "postInteraction"
      ]));
      
      console.log(`✅ Found ${swaps.length} pending swaps`);
      return swaps;
    } catch (error) {
      console.error("❌ Error in getPendingAtomicSwaps:", error);
      return [];
    }
  }

  async getSwaps(): Promise<AtomicSwap[]> {
    const query = `
      SELECT * FROM ${this.getTableName("atomic_swap")}
      WHERE status IN ('pending', 'src_created', 'dst_created')
      ORDER BY src_created_at DESC NULLS LAST
      LIMIT 100
    `;
    
    try {
      const result = await this.executeSql(query);
      
      return (result.rows || []).map(row => this.parseRow<AtomicSwap>(row, [
        "id", "orderHash", "hashlock", "srcChainId", "dstChainId",
        "srcToken", "dstToken", "srcAmount", "dstAmount",
        "srcMaker", "srcTaker", "dstMaker", "dstTaker",
        "status", "srcEscrowAddress", "dstEscrowAddress",
        "srcCreatedAt", "dstCreatedAt", "completedAt", "cancelledAt",
        "secret", "postInteraction"
      ]));
    } catch (error) {
      console.error("❌ Error in getSwaps:", error);
      return [];
    }
  }

  async getSwapsByHashlock(hashlock: string): Promise<AtomicSwap[]> {
    const query = `
      SELECT * FROM ${this.getTableName("atomic_swap")}
      WHERE hashlock = $1
      ORDER BY src_created_at DESC NULLS LAST
    `;
    
    try {
      const result = await this.executeSql(query, [hashlock]);
      
      return (result.rows || []).map(row => this.parseRow<AtomicSwap>(row, [
        "id", "orderHash", "hashlock", "srcChainId", "dstChainId",
        "srcToken", "dstToken", "srcAmount", "dstAmount",
        "srcMaker", "srcTaker", "dstMaker", "dstTaker",
        "status", "srcEscrowAddress", "dstEscrowAddress",
        "srcCreatedAt", "dstCreatedAt", "completedAt", "cancelledAt",
        "secret", "postInteraction"
      ]));
    } catch (error) {
      console.error("❌ Error in getSwapsByHashlock:", error);
      return [];
    }
  }

  async getCompletedSwaps(limit: number = 10): Promise<AtomicSwap[]> {
    const query = `
      SELECT * FROM ${this.getTableName("atomic_swap")}
      WHERE status = 'completed'
      ORDER BY completed_at DESC NULLS LAST
      LIMIT $1
    `;
    
    try {
      const result = await this.executeSql(query, [limit]);
      
      return (result.rows || []).map(row => this.parseRow<AtomicSwap>(row, [
        "id", "orderHash", "hashlock", "srcChainId", "dstChainId",
        "srcToken", "dstToken", "srcAmount", "dstAmount",
        "srcMaker", "srcTaker", "dstMaker", "dstTaker",
        "status", "srcEscrowAddress", "dstEscrowAddress",
        "srcCreatedAt", "dstCreatedAt", "completedAt", "cancelledAt",
        "secret", "postInteraction"
      ]));
    } catch (error) {
      console.error("❌ Error in getCompletedSwaps:", error);
      return [];
    }
  }

  async getRevealedSecrets(): Promise<Array<{ hashlock: string; secret: string }>> {
    // Query atomic swaps that have secrets revealed
    const query = `
      SELECT DISTINCT hashlock, secret 
      FROM ${this.getTableName("atomic_swap")}
      WHERE secret IS NOT NULL
        AND status IN ('completed', 'dst_created')
      ORDER BY completed_at DESC NULLS LAST
      LIMIT 100
    `;
    
    try {
      const result = await this.executeSql(query);
      
      return (result.rows || [])
        .filter(row => row.hashlock && row.secret)
        .map(row => ({
          hashlock: row.hashlock,
          secret: row.secret
        }));
    } catch (error) {
      console.error("❌ Error in getRevealedSecrets:", error);
      return [];
    }
  }

  async getWithdrawalByEscrow(escrowAddress: string): Promise<{ secret: string } | null> {
    const query = `
      SELECT secret FROM ${this.getTableName("escrow_withdrawal")}
      WHERE LOWER(escrow_address) = LOWER($1)
        AND secret IS NOT NULL
      LIMIT 1
    `;
    
    try {
      const result = await this.executeSql(query, [escrowAddress]);
      
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0].secret ? { secret: result.rows[0].secret } : null;
    } catch (error) {
      console.error("❌ Error in getWithdrawalByEscrow:", error);
      return null;
    }
  }

  async getChainStatistics(chainId: number): Promise<ChainStatistics> {
    // Since there's no chain_statistics table, we calculate from existing tables
    const queries = {
      srcEscrows: `SELECT COUNT(*) as count FROM ${this.getTableName("src_escrow")} WHERE chain_id = $1`,
      dstEscrows: `SELECT COUNT(*) as count FROM ${this.getTableName("dst_escrow")} WHERE chain_id = $1`,
      withdrawals: `SELECT COUNT(*) as count FROM ${this.getTableName("escrow_withdrawal")} WHERE chain_id = $1`,
      cancellations: `SELECT COUNT(*) as count FROM ${this.getTableName("escrow_cancellation")} WHERE chain_id = $1`,
    };
    
    try {
      const [srcResult, dstResult, withdrawalResult, cancellationResult] = await Promise.all([
        this.executeSql(queries.srcEscrows, [chainId]),
        this.executeSql(queries.dstEscrows, [chainId]),
        this.executeSql(queries.withdrawals, [chainId]),
        this.executeSql(queries.cancellations, [chainId]),
      ]);
      
      return {
        totalSrcEscrows: Number(srcResult.rows?.[0]?.count || 0),
        totalDstEscrows: Number(dstResult.rows?.[0]?.count || 0),
        totalWithdrawals: Number(withdrawalResult.rows?.[0]?.count || 0),
        totalCancellations: Number(cancellationResult.rows?.[0]?.count || 0),
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
    // Join withdrawals with srcEscrow to get hashlock and orderHash
    const query = `
      SELECT 
        ew.secret,
        ew.escrow_address,
        ew.chain_id,
        ew.withdrawn_at as timestamp,
        se.hashlock,
        se.order_hash
      FROM ${this.getTableName("escrow_withdrawal")} ew
      LEFT JOIN ${this.getTableName("src_escrow")} se
        ON LOWER(se.escrow_address) = LOWER(ew.escrow_address)
      WHERE ew.secret IS NOT NULL
      ORDER BY ew.withdrawn_at DESC
      LIMIT $1
    `;
    
    try {
      const result = await this.executeSql(query, [limit]);
      
      return (result.rows || [])
        .filter(row => row.secret)
        .map(row => ({
          hashlock: row.hashlock || "",
          secret: row.secret,
          orderHash: row.order_hash || "",
          escrowAddress: row.escrow_address || row.escrowAddress,
          chainId: Number(row.chain_id || row.chainId),
          timestamp: BigInt(row.timestamp || 0),
        }));
    } catch (error) {
      console.error("❌ Error fetching recent withdrawals:", error);
      return [];
    }
  }

  /**
   * Get active swaps that need processing
   * Used by BobResolverService to find swap opportunities
   */
  async getActiveSwaps(): Promise<Array<{
    id: string;
    escrowSrc?: string;
    escrowDst?: string;
    [key: string]: any;
  }>> {
    const query = `
      SELECT * FROM ${this.getTableName("atomic_swap")}
      WHERE status IN ('pending', 'src_created')
        AND (dst_escrow_address IS NULL OR dst_escrow_address = '')
      ORDER BY src_created_at DESC NULLS LAST
      LIMIT 100
    `;
    
    try {
      const result = await this.executeSql(query);
      
      return (result.rows || []).map(row => ({
        id: row.id || row.order_hash,
        escrowSrc: row.src_escrow_address,
        escrowDst: row.dst_escrow_address,
        ...row
      }));
    } catch (error) {
      console.error("❌ Error in getActiveSwaps:", error);
      return [];
    }
  }

  /**
   * Live query support for real-time updates
   * Note: This requires WebSocket/SSE support which may not be available in all Ponder deployments
   */
  subscribeToAtomicSwaps(
    resolverAddress: string,
    onUpdate: (swaps: AtomicSwap[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    // For now, we'll use polling as a fallback
    // Real WebSocket/SSE implementation would connect to /sql/live endpoint
    
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