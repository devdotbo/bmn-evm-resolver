/**
 * Deno KV client singleton with connection management
 * Provides centralized access to KV database with instance tracking
 */

export class KvClient {
  private kv?: Deno.Kv;
  private instanceId: string;
  private path?: string;
  private static instance?: KvClient;

  constructor(path?: string) {
    this.instanceId = crypto.randomUUID();
    this.path = path;
  }

  /**
   * Get singleton instance of KV client
   * @param path Optional KV path (only used on first call)
   * @returns KvClient instance
   */
  static getInstance(path?: string): KvClient {
    if (!KvClient.instance) {
      KvClient.instance = new KvClient(path);
    }
    return KvClient.instance;
  }

  /**
   * Connect to KV database
   * @throws Error if already connected
   */
  async connect(): Promise<void> {
    if (this.kv) {
      throw new Error("KV client already connected");
    }

    this.kv = await Deno.openKv(this.path);
    console.log(`KV connected: ${this.path || "default"} (instance: ${this.instanceId})`);
  }

  /**
   * Close KV connection
   */
  async close(): Promise<void> {
    if (this.kv) {
      await this.kv.close();
      this.kv = undefined;
      console.log(`KV disconnected: ${this.path || "default"} (instance: ${this.instanceId})`);
    }
  }

  /**
   * Get KV database instance
   * @throws Error if not connected
   */
  getDb(): Deno.Kv {
    if (!this.kv) {
      throw new Error("KV client not connected. Call connect() first.");
    }
    return this.kv;
  }

  /**
   * Get instance ID for distributed locking
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return !!this.kv;
  }

  /**
   * Health check for KV connection
   * @returns True if healthy
   */
  async healthCheck(): Promise<boolean> {
    if (!this.kv) return false;

    try {
      const testKey = ["health", "check", this.instanceId];
      const testValue = { timestamp: Date.now(), instanceId: this.instanceId };
      
      await this.kv.set(testKey, testValue, { expireIn: 60000 }); // 1 minute TTL
      const result = await this.kv.get<{ timestamp: number; instanceId: string }>(testKey);
      
      return result.value?.timestamp === testValue.timestamp;
    } catch (error) {
      console.error("KV health check failed:", error);
      return false;
    }
  }
}

// Export singleton instance (lazy initialization)
export const kvClient = KvClient.getInstance();