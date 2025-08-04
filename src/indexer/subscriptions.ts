/**
 * Polling-based subscription manager for SQL-based indexer
 * Simulates real-time subscriptions using periodic SQL queries
 */

import { EventEmitter } from "node:events";
import type { 
  SubscriptionEvent, 
  NewOrderEvent,
  SecretRevealEvent,
  AtomicSwap,
  EscrowWithdrawal
} from "./types.ts";
import { 
  IndexerError, 
  IndexerErrorCode,
  SubscriptionEventType 
} from "./types.ts";
import { SQL_QUERIES } from "./queries.ts";

export interface SubscriptionManagerConfig {
  sqlUrl: string;
  pollingInterval?: number;
  executeSqlQuery: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number }>;
  tablePrefix?: string;
}

interface PollingSubscription {
  id: string;
  type: 'newOrders' | 'secretReveals' | 'orderUpdates';
  callback: (data: any) => void;
  lastPoll: bigint;
  params?: any;
  lastState?: any;
}

/**
 * Subscription manager that uses polling to simulate real-time updates
 */
export class SubscriptionManager extends EventEmitter {
  private subscriptions = new Map<string, PollingSubscription>();
  private pollingInterval: number;
  private pollingTimer?: any;
  private isRunning = false;
  private executeSqlQuery: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number }>;

  constructor(private config: SubscriptionManagerConfig) {
    super();
    this.pollingInterval = config.pollingInterval || 5000; // Default 5 seconds
    this.executeSqlQuery = config.executeSqlQuery;
  }

  /**
   * Start the polling loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startPolling();
    this.emit("started");
  }

  /**
   * Stop the polling loop
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }

    this.emit("stopped");
  }

  /**
   * Subscribe to new orders
   */
  async subscribeToNewOrders(
    resolver?: string,
    callback?: (order: AtomicSwap) => void
  ): Promise<() => void> {
    const id = this.generateSubscriptionId();
    
    const subscription: PollingSubscription = {
      id,
      type: 'newOrders',
      callback: callback || (() => {}),
      lastPoll: BigInt(Math.floor(Date.now() / 1000)),
      params: { resolver }
    };

    this.subscriptions.set(id, subscription);

    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * Subscribe to secret reveals
   */
  async subscribeToSecretReveals(
    callback?: (event: SecretRevealEvent) => void
  ): Promise<() => void> {
    const id = this.generateSubscriptionId();
    
    const subscription: PollingSubscription = {
      id,
      type: 'secretReveals',
      callback: callback || (() => {}),
      lastPoll: BigInt(Math.floor(Date.now() / 1000))
    };

    this.subscriptions.set(id, subscription);

    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * Subscribe to order updates
   */
  async subscribeToOrderUpdates(
    orderHash: string,
    callback?: (update: Partial<AtomicSwap>) => void
  ): Promise<() => void> {
    const id = this.generateSubscriptionId();
    
    // Get initial state
    const initialState = await this.getOrderState(orderHash);
    
    const subscription: PollingSubscription = {
      id,
      type: 'orderUpdates',
      callback: callback || (() => {}),
      lastPoll: BigInt(Math.floor(Date.now() / 1000)),
      params: { orderHash },
      lastState: initialState
    };

    this.subscriptions.set(id, subscription);

    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * Start the polling loop
   */
  private startPolling(): void {
    this.pollingTimer = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        await this.pollSubscriptions();
      } catch (error) {
        this.emit("error", new IndexerError(
          "Polling error",
          IndexerErrorCode.QUERY_FAILED,
          error
        ));
      }
    }, this.pollingInterval);
  }

  /**
   * Poll all active subscriptions
   */
  private async pollSubscriptions(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [id, subscription] of this.subscriptions) {
      promises.push(this.pollSubscription(subscription));
    }

    await Promise.all(promises);
  }

  /**
   * Poll a single subscription
   */
  private async pollSubscription(subscription: PollingSubscription): Promise<void> {
    try {
      switch (subscription.type) {
        case 'newOrders':
          await this.pollNewOrders(subscription);
          break;
        case 'secretReveals':
          await this.pollSecretReveals(subscription);
          break;
        case 'orderUpdates':
          await this.pollOrderUpdates(subscription);
          break;
      }
    } catch (error) {
      this.emit("error", new IndexerError(
        `Polling error for subscription ${subscription.id}`,
        IndexerErrorCode.QUERY_FAILED,
        error
      ));
    }
  }

  /**
   * Poll for new orders
   */
  private async pollNewOrders(subscription: PollingSubscription): Promise<void> {
    const result = await this.executeSqlQuery(
      SQL_QUERIES.POLL_NEW_ORDERS,
      [subscription.lastPoll.toString(), subscription.params?.resolver || null]
    );

    if (result.rows.length > 0) {
      // Update last poll time to the newest order's timestamp
      const newestTimestamp = Math.max(
        ...result.rows.map(row => Number(row.src_created_at))
      );
      subscription.lastPoll = BigInt(newestTimestamp);

      // Emit events for each new order
      for (const row of result.rows) {
        const order = this.mapRowToAtomicSwap(row);
        subscription.callback(order);
        
        // Also emit as an event
        const event: NewOrderEvent = {
          type: SubscriptionEventType.ATOMIC_SWAP_CREATED,
          data: order,
          timestamp: BigInt(Date.now()),
          chainId: order.srcChainId,
          blockNumber: BigInt(row.block_number || 0),
          transactionHash: row.transaction_hash || "0x"
        };
        
        this.emit("newOrder", event);
      }
    }
  }

  /**
   * Poll for secret reveals
   */
  private async pollSecretReveals(subscription: PollingSubscription): Promise<void> {
    const result = await this.executeSqlQuery(
      SQL_QUERIES.POLL_SECRET_REVEALS,
      [subscription.lastPoll.toString()]
    );

    if (result.rows.length > 0) {
      // Update last poll time
      const newestTimestamp = Math.max(
        ...result.rows.map(row => Number(row.withdrawn_at))
      );
      subscription.lastPoll = BigInt(newestTimestamp);

      // Emit events for each secret reveal
      for (const row of result.rows) {
        const event: SecretRevealEvent = {
          type: SubscriptionEventType.SECRET_REVEALED,
          data: {
            orderHash: row.order_hash,
            escrowAddress: row.escrow_address,
            secret: row.secret
          },
          timestamp: BigInt(row.withdrawn_at),
          chainId: row.chain_id,
          blockNumber: BigInt(row.block_number),
          transactionHash: row.transaction_hash
        };
        
        subscription.callback(event);
        this.emit("secretRevealed", event);
      }
    }
  }

  /**
   * Poll for order updates
   */
  private async pollOrderUpdates(subscription: PollingSubscription): Promise<void> {
    const { orderHash } = subscription.params;
    const lastState = subscription.lastState || {};

    const result = await this.executeSqlQuery(
      SQL_QUERIES.POLL_ORDER_UPDATES,
      [
        orderHash,
        lastState.status || null,
        lastState.secret || null,
        lastState.completed_at || null,
        lastState.cancelled_at || null,
        lastState.dst_escrow_address || null
      ]
    );

    if (result.rows.length > 0) {
      const newState = result.rows[0];
      subscription.lastState = newState;

      // Create update object with only changed fields
      const update: Partial<AtomicSwap> = {};
      
      if (newState.status !== lastState.status) {
        update.status = newState.status;
      }
      if (newState.secret !== lastState.secret) {
        update.secret = newState.secret;
      }
      if (newState.completed_at !== lastState.completed_at) {
        update.completedAt = BigInt(newState.completed_at);
      }
      if (newState.cancelled_at !== lastState.cancelled_at) {
        update.cancelledAt = BigInt(newState.cancelled_at);
      }
      if (newState.dst_escrow_address !== lastState.dst_escrow_address) {
        update.dstEscrowAddress = newState.dst_escrow_address;
      }

      subscription.callback(update);
      this.emit("orderUpdated", { orderHash, update });
    }
  }

  /**
   * Get current order state
   */
  private async getOrderState(orderHash: string): Promise<any> {
    const result = await this.executeSqlQuery(
      `SELECT status, secret, completed_at, cancelled_at, dst_escrow_address 
       FROM "atomicSwap" 
       WHERE order_hash = $1`,
      [orderHash]
    );

    return result.rows[0] || {};
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Map SQL row to AtomicSwap (copied from client.ts for consistency)
   */
  private mapRowToAtomicSwap(row: any): AtomicSwap {
    return {
      id: row.order_hash || row.id,
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
      srcAmount: BigInt(row.src_amount || 0),
      dstToken: row.dst_token,
      dstAmount: BigInt(row.dst_amount || 0),
      srcSafetyDeposit: BigInt(row.src_safety_deposit || 0),
      dstSafetyDeposit: BigInt(row.dst_safety_deposit || 0),
      timelocks: BigInt(row.timelocks || 0),
      status: row.status,
      srcCreatedAt: row.src_created_at ? BigInt(row.src_created_at) : undefined,
      dstCreatedAt: row.dst_created_at ? BigInt(row.dst_created_at) : undefined,
      completedAt: row.completed_at ? BigInt(row.completed_at) : undefined,
      cancelledAt: row.cancelled_at ? BigInt(row.cancelled_at) : undefined,
      secret: row.secret
    };
  }

  /**
   * Get subscription statistics
   */
  getStats(): {
    activeSubscriptions: number;
    subscriptionTypes: Record<string, number>;
    isRunning: boolean;
  } {
    const types: Record<string, number> = {
      newOrders: 0,
      secretReveals: 0,
      orderUpdates: 0
    };

    for (const sub of this.subscriptions.values()) {
      types[sub.type]++;
    }

    return {
      activeSubscriptions: this.subscriptions.size,
      subscriptionTypes: types,
      isRunning: this.isRunning
    };
  }
}