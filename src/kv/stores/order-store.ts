/**
 * Order state management with atomic operations
 * Provides consistent order state storage with indexing and querying capabilities
 */

import type { OrderState } from "../../types/index.ts";
import { OrderStatus } from "../../types/index.ts";

// KV-specific types
export interface KvOrderState extends OrderState {
  version: number;              // For optimistic concurrency control
  lastModified: number;         // Unix timestamp
  expiresAt?: number;          // TTL timestamp
}

export interface KvEventRecord {
  id: string;
  timestamp: number;
  type: "order_created" | "escrow_deployed" | "secret_revealed" | "order_completed" | "order_failed";
  orderId: string;
  data: Record<string, unknown>;
}

export class KvOrderStore {
  constructor(private kv: Deno.Kv) {}

  /**
   * Get an order by ID
   * @param orderId The order ID
   * @returns The order state or null
   */
  async getOrder(orderId: string): Promise<KvOrderState | null> {
    const result = await this.kv.get<KvOrderState>(["orders", orderId]);
    return result.value;
  }

  /**
   * Create a new order with atomic indexing
   * @param order The order state to create
   * @throws Error if order already exists or commit fails
   */
  async createOrder(order: OrderState): Promise<void> {
    // Check if order already exists
    const existing = await this.kv.get(["orders", order.id]);
    if (existing.value) {
      throw new Error(`Order ${order.id} already exists`);
    }

    const kvOrder: KvOrderState = {
      ...order,
      version: 1,
      lastModified: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    const atomic = this.kv.atomic();
    
    // Main order record
    atomic.set(["orders", order.id], kvOrder);
    
    // Status index
    atomic.set(["orders_by_status", order.status, order.id], order.id);
    
    // Chain indexes
    atomic.set(["orders_by_chain", order.params.srcChainId.toString(), order.id], order.id);
    atomic.set(["orders_by_chain", order.params.dstChainId.toString(), order.id], order.id);
    
    // Maker index (for resolver tracking) - using taker as dstMaker in cross-chain context
    atomic.set(["orders_by_maker", order.immutables.taker, order.id], order.id);
    
    // Event log
    const event: KvEventRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "order_created",
      orderId: order.id,
      data: { 
        status: order.status,
        srcChainId: order.params.srcChainId,
        dstChainId: order.params.dstChainId,
        maker: order.immutables.maker,
        taker: order.immutables.taker,
      },
    };
    atomic.set(["events", event.timestamp.toString(), event.id], event, {
      expireIn: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const result = await atomic.commit();
    if (!result.ok) {
      throw new Error("Failed to create order - atomic commit failed");
    }
  }

  /**
   * Update order status with optimistic concurrency control
   * @param orderId The order ID
   * @param newStatus The new status
   * @param additionalUpdates Optional additional updates
   * @returns True if updated successfully
   */
  async updateOrderStatus(
    orderId: string, 
    newStatus: OrderStatus,
    additionalUpdates?: Partial<OrderState>
  ): Promise<boolean> {
    let retries = 3;
    
    while (retries > 0) {
      const existing = await this.kv.get<KvOrderState>(["orders", orderId]);
      if (!existing.value) return false;

      const order = existing.value;
      const oldStatus = order.status;

      // Skip if status hasn't changed and no additional updates
      if (oldStatus === newStatus && !additionalUpdates) {
        return true;
      }

      const updatedOrder: KvOrderState = {
        ...order,
        ...additionalUpdates,
        status: newStatus,
        version: order.version + 1,
        lastModified: Date.now(),
      };

      const atomic = this.kv.atomic();
      
      // Check version for optimistic concurrency control
      atomic.check(existing);
      
      // Update main record
      atomic.set(["orders", orderId], updatedOrder);
      
      // Update indexes only if status changed
      if (oldStatus !== newStatus) {
        atomic.delete(["orders_by_status", oldStatus, orderId]);
        atomic.set(["orders_by_status", newStatus, orderId], orderId);
      }
      
      // Log state transition
      const eventType = newStatus === OrderStatus.Failed ? "order_failed" : 
                       newStatus === OrderStatus.Completed ? "order_completed" : 
                       "escrow_deployed";
      
      const event: KvEventRecord = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: eventType,
        orderId,
        data: { 
          oldStatus, 
          newStatus,
          ...additionalUpdates,
        },
      };
      atomic.set(["events", event.timestamp.toString(), event.id], event, {
        expireIn: 7 * 24 * 60 * 60 * 1000,
      });

      const result = await atomic.commit();
      if (result.ok) {
        return true;
      }

      // Retry on version conflict
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay before retry
      }
    }

    return false;
  }

  /**
   * Update order with revealed secret
   * @param orderId The order ID
   * @param secret The revealed secret
   * @returns True if updated successfully
   */
  async updateOrderSecret(orderId: string, secret: `0x${string}`): Promise<boolean> {
    return this.updateOrderStatus(orderId, OrderStatus.SecretRevealed, {
      secretRevealed: true,
      secret,
    });
  }

  /**
   * Update order with escrow addresses
   * @param orderId The order ID
   * @param escrows Escrow addresses to update
   * @returns True if updated successfully
   */
  async updateOrderEscrows(
    orderId: string,
    escrows: {
      srcEscrow?: `0x${string}`;
      dstEscrow?: `0x${string}`;
      actualDstEscrow?: `0x${string}`;
    }
  ): Promise<boolean> {
    const updates: Partial<OrderState> = {};
    if (escrows.srcEscrow) updates.srcEscrowAddress = escrows.srcEscrow;
    if (escrows.dstEscrow) updates.dstEscrowAddress = escrows.dstEscrow;
    if (escrows.actualDstEscrow) updates.actualDstEscrowAddress = escrows.actualDstEscrow;

    const existing = await this.getOrder(orderId);
    if (!existing) return false;

    return this.updateOrderStatus(orderId, existing.status, updates);
  }

  /**
   * Get orders by status
   * @param status The order status
   * @returns Array of orders with the given status
   */
  async getOrdersByStatus(status: OrderStatus): Promise<KvOrderState[]> {
    const orders: KvOrderState[] = [];
    
    // Get order IDs from index
    const iter = this.kv.list<string>({ 
      prefix: ["orders_by_status", status] 
    });
    
    const orderIds: string[] = [];
    for await (const entry of iter) {
      orderIds.push(entry.value);
    }
    
    // Batch get the full order records
    const results = await Promise.all(
      orderIds.map(id => this.kv.get<KvOrderState>(["orders", id]))
    );
    
    for (const result of results) {
      if (result.value) {
        orders.push(result.value);
      }
    }
    
    return orders;
  }

  /**
   * Get orders by destination maker (resolver)
   * @param maker The destination maker address
   * @returns Array of orders for this maker
   */
  async getOrdersByMaker(maker: `0x${string}`): Promise<KvOrderState[]> {
    const orders: KvOrderState[] = [];
    
    const iter = this.kv.list<string>({ 
      prefix: ["orders_by_maker", maker] 
    });
    
    const orderIds: string[] = [];
    for await (const entry of iter) {
      orderIds.push(entry.value);
    }
    
    const results = await Promise.all(
      orderIds.map(id => this.kv.get<KvOrderState>(["orders", id]))
    );
    
    for (const result of results) {
      if (result.value) {
        orders.push(result.value);
      }
    }
    
    return orders;
  }

  /**
   * Get active orders (not completed, cancelled, or failed)
   * @returns Array of active orders
   */
  async getActiveOrders(): Promise<KvOrderState[]> {
    const activeStatuses: OrderStatus[] = [
      OrderStatus.Created,
      OrderStatus.SrcEscrowDeployed,
      OrderStatus.DstEscrowDeployed,
      OrderStatus.SecretRevealed,
    ];

    const allOrders = await Promise.all(
      activeStatuses.map(status => this.getOrdersByStatus(status))
    );

    return allOrders.flat();
  }

  /**
   * Watch for order updates
   * @param callback Function to call on order updates
   * @returns Async iterator for watch stream
   */
  async *watchOrders(
    filter?: { status?: OrderStatus; maker?: `0x${string}` }
  ): AsyncGenerator<{ type: "created" | "updated" | "deleted"; order?: KvOrderState; orderId?: string }> {
    const watchKeys: Deno.KvKey[] = [];
    
    if (filter?.status) {
      watchKeys.push(["orders_by_status", filter.status]);
    } else if (filter?.maker) {
      watchKeys.push(["orders_by_maker", filter.maker]);
    } else {
      watchKeys.push(["orders"]);
    }

    const stream = this.kv.watch(watchKeys);
    
    for await (const entries of stream) {
      for (const entry of entries) {
        if (!entry.key || entry.key.length === 0) continue;
        
        const [prefix, ...rest] = entry.key;
        
        if (prefix === "orders" && rest.length === 1) {
          // Direct order update
          const orderId = rest[0] as string;
          if (entry.value) {
            yield { type: "updated", order: entry.value as KvOrderState };
          } else {
            yield { type: "deleted", orderId };
          }
        } else if (prefix === "orders_by_status" || prefix === "orders_by_maker") {
          // Index update - fetch the full order
          const orderId = rest[rest.length - 1] as string;
          const orderResult = await this.kv.get<KvOrderState>(["orders", orderId]);
          if (orderResult.value) {
            yield { type: entry.versionstamp ? "created" : "updated", order: orderResult.value };
          }
        }
      }
    }
  }

  /**
   * Clean up expired orders
   * @returns Number of orders cleaned up
   */
  async cleanupExpiredOrders(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    const iter = this.kv.list<KvOrderState>({ prefix: ["orders"] });
    
    for await (const entry of iter) {
      const order = entry.value;
      if (order.expiresAt && order.expiresAt < now) {
        const atomic = this.kv.atomic();
        
        // Check that order hasn't been modified
        atomic.check(entry);
        
        // Delete from all indexes
        atomic.delete(["orders", order.id]);
        atomic.delete(["orders_by_status", order.status, order.id]);
        atomic.delete(["orders_by_chain", order.params.srcChainId.toString(), order.id]);
        atomic.delete(["orders_by_chain", order.params.dstChainId.toString(), order.id]);
        atomic.delete(["orders_by_maker", order.immutables.taker, order.id]);
        
        const result = await atomic.commit();
        if (result.ok) cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get order statistics
   * @returns Statistics about orders in the system
   */
  async getStatistics(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {
      total: 0,
    };

    // Count orders by status
    const statuses: OrderStatus[] = [
      OrderStatus.Created,
      OrderStatus.SrcEscrowDeployed, 
      OrderStatus.DstEscrowDeployed,
      OrderStatus.SecretRevealed,
      OrderStatus.Completed,
      OrderStatus.Cancelled,
      OrderStatus.Failed,
    ];

    for (const status of statuses) {
      const orders = await this.getOrdersByStatus(status);
      stats[status] = orders.length;
      stats.total += orders.length;
    }

    return stats;
  }
}