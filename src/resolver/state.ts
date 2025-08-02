import type { OrderState } from "../types/index.ts";
import { OrderStatus } from "../types/index.ts";
import { ORDER_STATE_FILE } from "../config/constants.ts";

/**
 * In-memory order state manager for the resolver
 */
export class OrderStateManager {
  private orders: Map<string, OrderState> = new Map();
  private ordersByStatus: Map<OrderStatus, Set<string>> = new Map();

  constructor() {
    // Initialize status maps
    for (const status of Object.values(OrderStatus)) {
      this.ordersByStatus.set(status as OrderStatus, new Set());
    }
  }

  /**
   * Add or update an order
   * @param order The order state to add/update
   */
  addOrder(order: OrderState): void {
    const existingOrder = this.orders.get(order.id);
    
    // Remove from old status set if updating
    if (existingOrder && existingOrder.status !== order.status) {
      this.ordersByStatus.get(existingOrder.status)?.delete(order.id);
    }
    
    // Add to new status set
    this.orders.set(order.id, order);
    this.ordersByStatus.get(order.status)?.add(order.id);
  }

  /**
   * Get an order by ID
   * @param orderId The order ID
   * @returns The order state or undefined
   */
  getOrder(orderId: string): OrderState | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get all orders
   * @returns Array of all orders
   */
  getAllOrders(): OrderState[] {
    return Array.from(this.orders.values());
  }

  /**
   * Get orders by status
   * @param status The order status
   * @returns Array of orders with the given status
   */
  getOrdersByStatus(status: OrderStatus): OrderState[] {
    const orderIds = this.ordersByStatus.get(status) || new Set();
    return Array.from(orderIds)
      .map(id => this.orders.get(id))
      .filter((order): order is OrderState => order !== undefined);
  }

  /**
   * Update order status
   * @param orderId The order ID
   * @param status The new status
   * @returns True if updated
   */
  updateOrderStatus(orderId: string, status: OrderStatus): boolean {
    const order = this.orders.get(orderId);
    if (!order) return false;
    
    // Remove from old status set
    this.ordersByStatus.get(order.status)?.delete(orderId);
    
    // Update status and add to new set
    order.status = status;
    this.ordersByStatus.get(status)?.add(orderId);
    
    return true;
  }

  /**
   * Update order with secret revealed
   * @param orderId The order ID
   * @param secret The revealed secret
   * @returns True if updated
   */
  updateOrderSecret(orderId: string, secret: `0x${string}`): boolean {
    const order = this.orders.get(orderId);
    if (!order) return false;
    
    order.secretRevealed = true;
    order.secret = secret;
    
    return true;
  }

  /**
   * Update order with escrow addresses
   * @param orderId The order ID
   * @param srcEscrow Source escrow address
   * @param dstEscrow Destination escrow address
   * @returns True if updated
   */
  updateOrderEscrows(
    orderId: string,
    srcEscrow?: `0x${string}`,
    dstEscrow?: `0x${string}`
  ): boolean {
    const order = this.orders.get(orderId);
    if (!order) return false;
    
    if (srcEscrow) order.srcEscrowAddress = srcEscrow;
    if (dstEscrow) order.dstEscrowAddress = dstEscrow;
    
    return true;
  }

  /**
   * Remove an order
   * @param orderId The order ID
   * @returns True if removed
   */
  removeOrder(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order) return false;
    
    this.ordersByStatus.get(order.status)?.delete(orderId);
    return this.orders.delete(orderId);
  }

  /**
   * Get active orders (not completed, cancelled, or failed)
   * @returns Array of active orders
   */
  getActiveOrders(): OrderState[] {
    const activeStatuses = [
      OrderStatus.Created,
      OrderStatus.SrcEscrowDeployed,
      OrderStatus.DstEscrowDeployed,
      OrderStatus.SecretRevealed,
    ];
    
    return activeStatuses.flatMap(status => this.getOrdersByStatus(status));
  }

  /**
   * Get orders that need action
   * @returns Array of orders requiring resolver action
   */
  getOrdersNeedingAction(): OrderState[] {
    // Orders where src escrow is deployed but dst escrow is not
    return this.getOrdersByStatus(OrderStatus.SrcEscrowDeployed);
  }

  /**
   * Save state to file (for persistence)
   * @param filePath Optional file path
   */
  async saveToFile(filePath = ORDER_STATE_FILE): Promise<void> {
    const data = {
      orders: Array.from(this.orders.entries()),
      timestamp: Date.now(),
    };
    
    // Use custom replacer to handle BigInt serialization
    const jsonString = JSON.stringify(data, (_, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2);
    
    await Deno.writeTextFile(filePath, jsonString);
  }

  /**
   * Load state from file
   * @param filePath Optional file path
   * @returns True if loaded successfully
   */
  async loadFromFile(filePath = ORDER_STATE_FILE): Promise<boolean> {
    try {
      const content = await Deno.readTextFile(filePath);
      const data = JSON.parse(content);
      
      // Clear existing state
      this.orders.clear();
      for (const set of this.ordersByStatus.values()) {
        set.clear();
      }
      
      // Restore orders
      for (const [id, order] of data.orders) {
        this.orders.set(id, order);
        this.ordersByStatus.get(order.status)?.add(id);
      }
      
      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // File doesn't exist yet, that's okay
        return false;
      }
      throw error;
    }
  }

  /**
   * Get statistics about orders
   * @returns Order statistics
   */
  getStatistics(): Record<string, number> {
    const stats: Record<string, number> = {
      total: this.orders.size,
    };
    
    for (const [status, orderIds] of this.ordersByStatus.entries()) {
      stats[status] = orderIds.size;
    }
    
    return stats;
  }

  /**
   * Clean up old orders
   * @param maxAgeMs Maximum age in milliseconds
   * @returns Number of orders removed
   */
  cleanupOldOrders(maxAgeMs: number): number {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [id, order] of this.orders.entries()) {
      if (now - order.createdAt > maxAgeMs) {
        const isComplete = order.status === OrderStatus.Completed ||
                          order.status === OrderStatus.Cancelled ||
                          order.status === OrderStatus.Failed;
        
        if (isComplete) {
          toRemove.push(id);
        }
      }
    }
    
    for (const id of toRemove) {
      this.removeOrder(id);
    }
    
    return toRemove.length;
  }
}