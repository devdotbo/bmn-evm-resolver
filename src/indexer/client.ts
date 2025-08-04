/**
 * IndexerClient implementation using SQL over HTTP
 */

import type { Address, Hex } from "viem";
import { 
  SQL_QUERIES, 
  buildSqlQuery 
} from "./queries.ts";
import { SubscriptionManager } from "./subscriptions.ts";
import type {
  AtomicSwap,
  SrcEscrow,
  DstEscrow,
  EscrowWithdrawal,
  ChainStatistics,
  QueryResponse,
  AtomicSwapFilter,
  QueryOptions,
  IndexerHealth,
  SecretRevealEvent,
  NewOrderEvent
} from "./types.ts";
import { 
  IndexerError, 
  IndexerErrorCode,
  AtomicSwapStatus,
  EscrowStatus 
} from "./types.ts";

export interface IndexerClientConfig {
  sqlUrl: string;
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
  connectionPoolSize?: number;
  tablePrefix?: string; // Ponder app name for table prefixing
}

/**
 * Main IndexerClient class for interacting with the Ponder indexer via SQL
 */
export class IndexerClient {
  private sqlUrl: string;
  private subscriptionManager: SubscriptionManager;
  private retryAttempts: number;
  private retryDelay: number;
  private timeout: number;
  private healthCheckInterval?: number;
  private lastHealthCheck?: IndexerHealth;
  private tablePrefix: string;

  constructor(private config: IndexerClientConfig) {
    // SQL endpoint
    this.sqlUrl = config.sqlUrl;

    // Configuration
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.timeout = config.timeout || 30000;
    this.tablePrefix = config.tablePrefix || '';

    // Initialize polling-based subscription manager
    this.subscriptionManager = new SubscriptionManager({
      sqlUrl: config.sqlUrl,
      pollingInterval: 5000, // Poll every 5 seconds
      executeSqlQuery: this.executeSqlQuery.bind(this),
      tablePrefix: this.tablePrefix
    });
  }

  /**
   * Connect to the indexer and verify health
   */
  async connect(): Promise<void> {
    try {
      // Check SQL endpoint
      const health = await this.checkHealth();
      if (!health.connected) {
        throw new IndexerError(
          "Indexer not responding",
          IndexerErrorCode.CONNECTION_FAILED
        );
      }

      // Start polling-based subscriptions
      await this.subscriptionManager.start();

      // Start periodic health checks
      this.startHealthChecks();

      console.log("Connected to indexer", {
        sql: this.config.sqlUrl,
        synced: health.synced
      });

    } catch (error) {
      throw new IndexerError(
        "Failed to connect to indexer",
        IndexerErrorCode.CONNECTION_FAILED,
        error
      );
    }
  }

  /**
   * Disconnect from the indexer
   */
  async disconnect(): Promise<void> {
    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Stop polling
    this.subscriptionManager.stop();

    console.log("Disconnected from indexer");
  }

  /**
   * Apply table prefix to SQL query if configured
   */
  private applyTablePrefix(sql: string): string {
    if (!this.tablePrefix) {
      return sql;
    }

    // Replace table names in quotes with prefixed versions
    // Ponder uses the format: ponderAppName.tableName
    return sql.replace(/"(\w+)"/g, (match, tableName) => {
      // Skip if already prefixed or if it's a special keyword
      if (tableName.includes('.') || tableName.toUpperCase() === tableName) {
        return match;
      }
      return `"${this.tablePrefix}.${tableName}"`;
    });
  }

  /**
   * Query pending orders for a resolver
   */
  async getPendingOrders(
    resolver: Address,
    options?: QueryOptions
  ): Promise<QueryResponse<AtomicSwap>> {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    
    const result = await this.executeSqlQuery<AtomicSwap>(
      this.applyTablePrefix(SQL_QUERIES.GET_PENDING_ORDERS),
      [resolver, limit, offset]
    );

    return {
      items: result.rows,
      totalCount: result.rowCount
    };
  }

  /**
   * Query active orders (both escrows created)
   */
  async getActiveOrders(
    resolver: Address,
    limit = 100
  ): Promise<QueryResponse<AtomicSwap>> {
    const result = await this.executeSqlQuery<AtomicSwap>(
      this.applyTablePrefix(SQL_QUERIES.GET_ACTIVE_ORDERS),
      [resolver, limit]
    );

    return {
      items: result.rows,
      totalCount: result.rowCount
    };
  }

  /**
   * Get revealed secret for an order
   */
  async getRevealedSecret(orderHash: Hex): Promise<Hex | null> {
    const result = await this.executeSqlQuery<{ secret: Hex | null }>(
      this.applyTablePrefix(SQL_QUERIES.GET_REVEALED_SECRET),
      [orderHash]
    );

    if (result.rows.length > 0 && result.rows[0].secret) {
      return result.rows[0].secret;
    }

    return null;
  }

  /**
   * Get complete order details
   */
  async getOrderDetails(orderHash: Hex): Promise<{
    atomicSwap: AtomicSwap | null;
    srcEscrow: SrcEscrow | null;
    dstEscrow: DstEscrow | null;
  }> {
    const result = await this.executeSqlQuery<any>(
      this.applyTablePrefix(SQL_QUERIES.GET_ORDER_DETAILS),
      [orderHash]
    );

    if (result.rows.length === 0) {
      return {
        atomicSwap: null,
        srcEscrow: null,
        dstEscrow: null
      };
    }

    const row = result.rows[0];
    
    // Map SQL results to typed objects
    const atomicSwap: AtomicSwap = {
      id: row.order_hash,
      orderHash: row.order_hash,
      hashlock: row.hashlock,
      srcChainId: row.src_chain_id,
      dstChainId: row.dst_chain_id,
      srcEscrowAddress: row.src_escrow_address,
      dstEscrowAddress: row.dst_escrow_address,
      srcMaker: row.src_maker,
      srcTaker: row.src_taker,
      dstMaker: row.dst_maker,
      dstTaker: row.dst_taker,
      srcToken: row.src_token,
      srcAmount: BigInt(row.src_amount),
      dstToken: row.dst_token,
      dstAmount: BigInt(row.dst_amount),
      srcSafetyDeposit: BigInt(row.src_safety_deposit),
      dstSafetyDeposit: BigInt(row.dst_safety_deposit),
      timelocks: BigInt(row.timelocks),
      status: row.status,
      srcCreatedAt: row.src_created_at ? BigInt(row.src_created_at) : undefined,
      dstCreatedAt: row.dst_created_at ? BigInt(row.dst_created_at) : undefined,
      completedAt: row.completed_at ? BigInt(row.completed_at) : undefined,
      cancelledAt: row.cancelled_at ? BigInt(row.cancelled_at) : undefined,
      secret: row.secret
    };

    return {
      atomicSwap,
      srcEscrow: row.src_escrow_address ? {
        id: `${row.src_chain_id}-${row.src_escrow_address}`,
        chainId: row.src_chain_id,
        escrowAddress: row.src_escrow_address,
        orderHash: row.order_hash,
        hashlock: row.hashlock,
        maker: row.src_maker,
        taker: row.src_taker,
        srcToken: row.src_token,
        srcAmount: BigInt(row.src_amount),
        srcSafetyDeposit: BigInt(row.src_safety_deposit),
        dstMaker: row.dst_maker,
        dstToken: row.dst_token,
        dstAmount: BigInt(row.dst_amount),
        dstSafetyDeposit: BigInt(row.dst_safety_deposit),
        dstChainId: BigInt(row.dst_chain_id),
        timelocks: BigInt(row.timelocks),
        createdAt: BigInt(row.src_created_at || 0),
        blockNumber: BigInt(row.src_block_number || 0),
        transactionHash: row.src_transaction_hash || "0x",
        status: row.src_status || "active"
      } : null,
      dstEscrow: row.dst_escrow_address ? {
        id: `${row.dst_chain_id}-${row.dst_escrow_address}`,
        chainId: row.dst_chain_id,
        escrowAddress: row.dst_escrow_address,
        hashlock: row.hashlock,
        taker: row.dst_taker,
        srcCancellationTimestamp: BigInt(row.src_cancellation_timestamp || 0),
        createdAt: BigInt(row.dst_created_at || 0),
        blockNumber: BigInt(row.dst_block_number || 0),
        transactionHash: row.dst_transaction_hash || "0x",
        status: row.dst_status || "active"
      } : null
    };
  }

  /**
   * Query profitable orders
   */
  async getProfitableOrders(
    resolver: Address,
    minProfitMargin: bigint,
    supportedTokens: Address[],
    limit = 50
  ): Promise<AtomicSwap[]> {
    // Use SQL query for complex profitability calculation
    const result = await this.executeSqlQuery<any>(
      this.applyTablePrefix(SQL_QUERIES.PROFITABLE_ORDERS),
      [resolver, supportedTokens, limit]
    );

    return result.rows.map(row => this.mapRowToAtomicSwap(row));
  }

  /**
   * Get escrows by hashlock
   */
  async getEscrowsByHashlock(hashlock: Hex): Promise<{
    srcEscrows: SrcEscrow[];
    dstEscrows: DstEscrow[];
  }> {
    const srcResult = await this.executeSqlQuery<any>(
      this.applyTablePrefix(SQL_QUERIES.GET_SRC_ESCROWS_BY_HASHLOCK),
      [hashlock]
    );

    const dstResult = await this.executeSqlQuery<any>(
      this.applyTablePrefix(SQL_QUERIES.GET_DST_ESCROWS_BY_HASHLOCK),
      [hashlock]
    );

    return {
      srcEscrows: srcResult.rows.map(row => this.mapRowToSrcEscrow(row)),
      dstEscrows: dstResult.rows.map(row => this.mapRowToDstEscrow(row))
    };
  }

  /**
   * Get chain statistics
   */
  async getChainStatistics(chainId: number): Promise<ChainStatistics | null> {
    const result = await this.executeSqlQuery<any>(
      this.applyTablePrefix(SQL_QUERIES.GET_CHAIN_STATISTICS),
      [chainId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: chainId.toString(),
      chainId: chainId,
      totalSrcEscrows: BigInt(row.total_src_escrows || 0),
      totalDstEscrows: BigInt(row.total_dst_escrows || 0),
      totalWithdrawals: BigInt(row.total_withdrawals || 0),
      totalCancellations: BigInt(row.total_cancellations || 0),
      totalVolumeLocked: BigInt(row.total_volume_locked || 0),
      totalVolumeWithdrawn: BigInt(row.total_volume_withdrawn || 0),
      lastUpdatedBlock: BigInt(row.last_updated_block || 0)
    };
  }

  /**
   * Subscribe to new orders in real-time (using polling)
   */
  async subscribeToNewOrders(
    callback: (order: AtomicSwap) => void,
    resolver?: Address
  ): Promise<() => void> {
    return this.subscriptionManager.subscribeToNewOrders(
      resolver,
      callback
    );
  }

  /**
   * Subscribe to secret reveals (using polling)
   */
  async subscribeToSecretReveals(
    callback: (event: SecretRevealEvent) => void
  ): Promise<() => void> {
    return this.subscriptionManager.subscribeToSecretReveals(callback);
  }

  /**
   * Subscribe to order updates (using polling)
   */
  async subscribeToOrderUpdates(
    orderHash: Hex,
    callback: (update: Partial<AtomicSwap>) => void
  ): Promise<() => void> {
    return this.subscriptionManager.subscribeToOrderUpdates(
      orderHash,
      callback
    );
  }


  /**
   * Execute a SQL query using Ponder's SQL API format
   */
  async executeSqlQuery<T = any>(
    sql: string,
    params?: any[]
  ): Promise<{ rows: T[]; rowCount: number; columns: string[] }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await fetch(this.sqlUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            statement: sql,  // Ponder uses 'statement' not 'sql'
            params: params || []
          }),
          signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) {
          throw new IndexerError(
            `SQL query failed: ${response.statusText}`,
            IndexerErrorCode.QUERY_FAILED,
            { status: response.status }
          );
        }

        const result = await response.json();
        
        // Ponder's response format: { rows: [...] }
        // Ensure result has the expected structure
        return {
          rows: result.rows || [],
          rowCount: result.rows?.length || 0,
          columns: result.columns || []
        };

      } catch (error) {
        lastError = error as Error;
        
        // Check if rate limited
        if (error instanceof IndexerError && error.code === IndexerErrorCode.RATE_LIMITED) {
          await this.delay(this.retryDelay * Math.pow(2, attempt));
          continue;
        }

        // Don't retry on other errors
        break;
      }
    }

    throw lastError || new IndexerError(
      "SQL query failed",
      IndexerErrorCode.QUERY_FAILED
    );
  }


  /**
   * Check indexer health
   */
  async checkHealth(): Promise<IndexerHealth> {
    try {
      const result = await this.executeSqlQuery<any>(
        this.applyTablePrefix(SQL_QUERIES.HEALTH_CHECK),
        []
      );

      // Find the chain with the highest block
      let latestBlock = 0n;
      let chainId = 0;

      for (const row of result.rows) {
        const block = BigInt(row.last_updated_block || 0);
        if (block > latestBlock) {
          latestBlock = block;
          chainId = row.chain_id;
        }
      }

      const health: IndexerHealth = {
        connected: true,
        synced: true, // Assume synced if responding
        latestBlock,
        chainId
      };

      this.lastHealthCheck = health;
      return health;

    } catch (error) {
      return {
        connected: false,
        synced: false,
        latestBlock: 0n,
        chainId: 0
      };
    }
  }

  /**
   * Get orders approaching timelock expiry
   */
  async getTimelockApproachingOrders(
    warningWindowSeconds = 300
  ): Promise<AtomicSwap[]> {
    const result = await this.executeSqlQuery<any>(
      this.applyTablePrefix(SQL_QUERIES.TIMELOCK_WARNING),
      []
    );

    return result.rows.map(row => this.mapRowToAtomicSwap(row));
  }

  /**
   * Get orders by maker address
   */
  async getOrdersByMaker(
    maker: Address,
    statuses?: AtomicSwapStatus[],
    limit = 100
  ): Promise<QueryResponse<AtomicSwap>> {
    const statusList = statuses || [
      AtomicSwapStatus.SRC_CREATED,
      AtomicSwapStatus.BOTH_CREATED,
      AtomicSwapStatus.COMPLETED
    ];

    const result = await this.executeSqlQuery<any>(
      this.applyTablePrefix(SQL_QUERIES.GET_ORDERS_BY_MAKER),
      [maker, statusList, limit]
    );

    return {
      items: result.rows.map(row => this.mapRowToAtomicSwap(row)),
      totalCount: result.rowCount
    };
  }

  /**
   * Get recent withdrawals
   */
  async getRecentWithdrawals(
    sinceTimestamp: bigint,
    limit = 100
  ): Promise<EscrowWithdrawal[]> {
    const result = await this.executeSqlQuery<any>(
      this.applyTablePrefix(SQL_QUERIES.GET_RECENT_WITHDRAWALS),
      [sinceTimestamp.toString(), limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      chainId: row.chain_id,
      escrowAddress: row.escrow_address,
      secret: row.secret,
      withdrawnAt: BigInt(row.withdrawn_at),
      blockNumber: BigInt(row.block_number),
      transactionHash: row.transaction_hash
    }));
  }

  /**
   * Batch query multiple orders
   */
  async batchQueryOrders(orderHashes: Hex[]): Promise<AtomicSwap[]> {
    const result = await this.executeSqlQuery<any>(
      this.applyTablePrefix(SQL_QUERIES.BATCH_QUERY_ORDERS),
      [orderHashes]
    );

    return result.rows.map(row => this.mapRowToAtomicSwap(row));
  }

  /**
   * Get volume analytics
   */
  async getVolumeAnalytics(
    since: Date,
    chainId?: number
  ): Promise<any[]> {
    const query = chainId
      ? this.applyTablePrefix(SQL_QUERIES.VOLUME_ANALYTICS) + " AND srcChainId = $2"
      : this.applyTablePrefix(SQL_QUERIES.VOLUME_ANALYTICS);

    const params = chainId
      ? [Math.floor(since.getTime() / 1000), chainId]
      : [Math.floor(since.getTime() / 1000)];

    const result = await this.executeSqlQuery(query, params);
    return result.rows;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        console.error("Health check failed:", error);
      }
    }, 60000); // Check every minute
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get last health check result
   */
  getLastHealthCheck(): IndexerHealth | undefined {
    return this.lastHealthCheck;
  }

  /**
   * Check if indexer is healthy
   */
  isHealthy(): boolean {
    return this.lastHealthCheck?.connected && this.lastHealthCheck?.synced || false;
  }

  /**
   * Map SQL row to AtomicSwap type
   */
  private mapRowToAtomicSwap(row: any): AtomicSwap {
    return {
      id: row.order_hash || row.id,
      orderHash: row.order_hash || row.orderHash,
      hashlock: row.hashlock,
      srcChainId: row.src_chain_id || row.srcChainId,
      dstChainId: row.dst_chain_id || row.dstChainId,
      srcEscrowAddress: row.src_escrow_address || row.srcEscrowAddress,
      dstEscrowAddress: row.dst_escrow_address || row.dstEscrowAddress,
      srcMaker: row.src_maker || row.srcMaker,
      srcTaker: row.src_taker || row.srcTaker,
      dstMaker: row.dst_maker || row.dstMaker,
      dstTaker: row.dst_taker || row.dstTaker,
      srcToken: row.src_token || row.srcToken,
      srcAmount: BigInt(row.src_amount || row.srcAmount || 0),
      dstToken: row.dst_token || row.dstToken,
      dstAmount: BigInt(row.dst_amount || row.dstAmount || 0),
      srcSafetyDeposit: BigInt(row.src_safety_deposit || row.srcSafetyDeposit || 0),
      dstSafetyDeposit: BigInt(row.dst_safety_deposit || row.dstSafetyDeposit || 0),
      timelocks: BigInt(row.timelocks || 0),
      status: row.status || AtomicSwapStatus.PENDING,
      srcCreatedAt: row.src_created_at ? BigInt(row.src_created_at) : undefined,
      dstCreatedAt: row.dst_created_at ? BigInt(row.dst_created_at) : undefined,
      completedAt: row.completed_at ? BigInt(row.completed_at) : undefined,
      cancelledAt: row.cancelled_at ? BigInt(row.cancelled_at) : undefined,
      secret: row.secret
    };
  }

  /**
   * Map SQL row to SrcEscrow type
   */
  private mapRowToSrcEscrow(row: any): SrcEscrow {
    return {
      id: row.id || `${row.chain_id}-${row.escrow_address}`,
      chainId: row.chain_id || row.chainId,
      escrowAddress: row.escrow_address || row.escrowAddress,
      orderHash: row.order_hash || row.orderHash,
      hashlock: row.hashlock,
      maker: row.maker,
      taker: row.taker,
      srcToken: row.src_token || row.srcToken,
      srcAmount: BigInt(row.src_amount || row.srcAmount || 0),
      srcSafetyDeposit: BigInt(row.src_safety_deposit || row.srcSafetyDeposit || 0),
      dstMaker: row.dst_maker || row.dstMaker,
      dstToken: row.dst_token || row.dstToken,
      dstAmount: BigInt(row.dst_amount || row.dstAmount || 0),
      dstSafetyDeposit: BigInt(row.dst_safety_deposit || row.dstSafetyDeposit || 0),
      dstChainId: BigInt(row.dst_chain_id || row.dstChainId || 0),
      timelocks: BigInt(row.timelocks || 0),
      createdAt: BigInt(row.created_at || row.createdAt || 0),
      blockNumber: BigInt(row.block_number || row.blockNumber || 0),
      transactionHash: row.transaction_hash || row.transactionHash || "0x",
      status: row.status || EscrowStatus.ACTIVE
    };
  }

  /**
   * Map SQL row to DstEscrow type
   */
  private mapRowToDstEscrow(row: any): DstEscrow {
    return {
      id: row.id || `${row.chain_id}-${row.escrow_address}`,
      chainId: row.chain_id || row.chainId,
      escrowAddress: row.escrow_address || row.escrowAddress,
      hashlock: row.hashlock,
      taker: row.taker,
      srcCancellationTimestamp: BigInt(row.src_cancellation_timestamp || row.srcCancellationTimestamp || 0),
      createdAt: BigInt(row.created_at || row.createdAt || 0),
      blockNumber: BigInt(row.block_number || row.blockNumber || 0),
      transactionHash: row.transaction_hash || row.transactionHash || "0x",
      status: row.status || EscrowStatus.ACTIVE
    };
  }
}