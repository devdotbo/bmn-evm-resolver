import { SecretStore } from "../utils/secrets.ts";
import type { OrderState } from "../types/index.ts";
import { SECRET_STORAGE_FILE } from "../config/constants.ts";

/**
 * State management for Alice (test client)
 */
export class AliceStateManager {
  private orders: Map<string, OrderState> = new Map();
  private secretStore: SecretStore = new SecretStore();
  private storageFile = "./data/alice-orders.json";

  /**
   * Add an order with its secret
   * @param order The order state
   * @param secret The order secret
   */
  addOrder(order: OrderState, secret: `0x${string}`): void {
    this.orders.set(order.id, order);
    this.secretStore.store(order.id, secret);
  }

  /**
   * Get an order by ID
   * @param orderId The order ID
   * @returns Order state or undefined
   */
  getOrder(orderId: string): OrderState | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get secret for an order
   * @param orderId The order ID
   * @returns Secret or undefined
   */
  getSecret(orderId: string): `0x${string}` | undefined {
    return this.secretStore.get(orderId);
  }

  /**
   * Get all orders
   * @returns Array of all orders
   */
  getAllOrders(): OrderState[] {
    return Array.from(this.orders.values());
  }

  /**
   * Get active orders (not completed or cancelled)
   * @returns Array of active orders
   */
  getActiveOrders(): OrderState[] {
    return this.getAllOrders().filter(
      order => order.status !== "COMPLETED" && order.status !== "CANCELLED"
    );
  }

  /**
   * Update order state
   * @param orderId The order ID
   * @param updates Partial order state updates
   * @returns True if updated
   */
  updateOrder(orderId: string, updates: Partial<OrderState>): boolean {
    const order = this.orders.get(orderId);
    if (!order) return false;

    this.orders.set(orderId, { ...order, ...updates });
    return true;
  }

  /**
   * Remove an order
   * @param orderId The order ID
   * @returns True if removed
   */
  removeOrder(orderId: string): boolean {
    this.secretStore.remove(orderId);
    return this.orders.delete(orderId);
  }

  /**
   * Save state to file
   */
  async saveToFile(): Promise<void> {
    const data = {
      orders: Array.from(this.orders.entries()),
      secrets: Array.from(this.secretStore["secrets"].entries()),
      timestamp: Date.now(),
    };

    // Ensure directory exists
    try {
      await Deno.mkdir("./data", { recursive: true });
    } catch {
      // Directory might already exist
    }

    await Deno.writeTextFile(this.storageFile, JSON.stringify(data, null, 2));
  }

  /**
   * Load state from file
   * @returns True if loaded successfully
   */
  async loadFromFile(): Promise<boolean> {
    try {
      const content = await Deno.readTextFile(this.storageFile);
      const data = JSON.parse(content);

      // Clear existing state
      this.orders.clear();
      this.secretStore.clear();

      // Restore orders
      for (const [id, order] of data.orders) {
        this.orders.set(id, order);
      }

      // Restore secrets
      for (const [id, secret] of data.secrets) {
        this.secretStore.store(id, secret);
      }

      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Find orders by various criteria
   * @param filter Filter criteria
   * @returns Matching orders
   */
  findOrders(filter: {
    srcChainId?: number;
    dstChainId?: number;
    status?: string;
    hasSecret?: boolean;
  }): OrderState[] {
    return this.getAllOrders().filter(order => {
      if (filter.srcChainId && order.params.srcChainId !== filter.srcChainId) {
        return false;
      }
      if (filter.dstChainId && order.params.dstChainId !== filter.dstChainId) {
        return false;
      }
      if (filter.status && order.status !== filter.status) {
        return false;
      }
      if (filter.hasSecret !== undefined) {
        const hasSecret = this.secretStore.get(order.id) !== undefined;
        if (filter.hasSecret !== hasSecret) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Get order statistics
   * @returns Statistics object
   */
  getStatistics(): {
    total: number;
    active: number;
    completed: number;
    withSecrets: number;
    byStatus: Record<string, number>;
  } {
    const orders = this.getAllOrders();
    const byStatus: Record<string, number> = {};

    for (const order of orders) {
      byStatus[order.status] = (byStatus[order.status] || 0) + 1;
    }

    return {
      total: orders.length,
      active: this.getActiveOrders().length,
      completed: orders.filter(o => o.status === "COMPLETED").length,
      withSecrets: orders.filter(o => this.secretStore.get(o.id) !== undefined).length,
      byStatus,
    };
  }

  /**
   * Export orders to JSON
   * @returns JSON string
   */
  exportToJson(): string {
    const data = this.getAllOrders().map(order => ({
      ...order,
      hasSecret: this.secretStore.get(order.id) !== undefined,
    }));

    return JSON.stringify(data, null, 2);
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.orders.clear();
    this.secretStore.clear();
  }
}