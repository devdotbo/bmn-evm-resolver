/**
 * Secret management with TTL support
 * Handles secure storage and retrieval of order secrets with automatic expiration
 */

export interface KvSecret {
  orderId: string;
  secret: `0x${string}`;
  createdAt: number;
  expiresAt: number;           // Auto-cleanup after order completion
  revealed?: boolean;           // Track if secret has been revealed
  revealedAt?: number;         // Timestamp when revealed
}

export interface SecretRevealEvent {
  orderId: string;
  secret: `0x${string}`;
  revealedAt: number;
  revealedBy?: `0x${string}`;  // Address that revealed the secret
}

export class KvSecretStore {
  constructor(private kv: Deno.Kv) {}

  /**
   * Store a secret for an order
   * @param orderId The order ID
   * @param secret The secret to store
   * @param ttlMs Time to live in milliseconds (default 24 hours)
   * @throws Error if secret already exists
   */
  async storeSecret(
    orderId: string, 
    secret: `0x${string}`,
    ttlMs: number = 24 * 60 * 60 * 1000 // 24 hours
  ): Promise<void> {
    // Check if secret already exists
    const existing = await this.kv.get(["secrets", orderId]);
    if (existing.value) {
      throw new Error(`Secret for order ${orderId} already exists`);
    }

    const kvSecret: KvSecret = {
      orderId,
      secret,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      revealed: false,
    };

    // Store with TTL
    await this.kv.set(["secrets", orderId], kvSecret, {
      expireIn: ttlMs,
    });

    // Also store in a secondary index for monitoring
    await this.kv.set(["secrets_by_expiry", kvSecret.expiresAt.toString(), orderId], orderId, {
      expireIn: ttlMs,
    });
  }

  /**
   * Get a secret by order ID
   * @param orderId The order ID
   * @returns The secret or null if not found
   */
  async getSecret(orderId: string): Promise<`0x${string}` | null> {
    const result = await this.kv.get<KvSecret>(["secrets", orderId]);
    return result.value?.secret || null;
  }

  /**
   * Get full secret details
   * @param orderId The order ID
   * @returns The secret details or null
   */
  async getSecretDetails(orderId: string): Promise<KvSecret | null> {
    const result = await this.kv.get<KvSecret>(["secrets", orderId]);
    return result.value;
  }

  /**
   * Reveal a secret (mark as revealed and optionally delete)
   * @param orderId The order ID
   * @param deleteAfterReveal Whether to delete the secret after revealing
   * @param revealedBy Optional address that revealed the secret
   * @returns The secret or null if not found
   */
  async revealSecret(
    orderId: string,
    deleteAfterReveal: boolean = false,
    revealedBy?: `0x${string}`
  ): Promise<`0x${string}` | null> {
    const result = await this.kv.get<KvSecret>(["secrets", orderId]);
    if (!result.value) return null;

    const secret = result.value;
    const atomic = this.kv.atomic();
    
    // Check version for concurrency control
    atomic.check(result);

    if (deleteAfterReveal) {
      // Delete the secret
      atomic.delete(["secrets", orderId]);
      atomic.delete(["secrets_by_expiry", secret.expiresAt.toString(), orderId]);
    } else {
      // Update as revealed
      const updatedSecret: KvSecret = {
        ...secret,
        revealed: true,
        revealedAt: Date.now(),
      };
      atomic.set(["secrets", orderId], updatedSecret);
    }
    
    // Log reveal event
    const event: SecretRevealEvent = {
      orderId,
      secret: secret.secret,
      revealedAt: Date.now(),
      revealedBy,
    };
    
    atomic.set(
      ["secret_reveals", event.revealedAt.toString(), orderId], 
      event,
      { expireIn: 7 * 24 * 60 * 60 * 1000 } // 7 days
    );

    const commitResult = await atomic.commit();
    return commitResult.ok ? secret.secret : null;
  }

  /**
   * Check if a secret exists
   * @param orderId The order ID
   * @returns True if secret exists
   */
  async hasSecret(orderId: string): Promise<boolean> {
    const result = await this.kv.get(["secrets", orderId]);
    return result.value !== null;
  }

  /**
   * Delete a secret
   * @param orderId The order ID
   * @returns True if deleted
   */
  async deleteSecret(orderId: string): Promise<boolean> {
    const result = await this.kv.get<KvSecret>(["secrets", orderId]);
    if (!result.value) return false;

    const atomic = this.kv.atomic();
    atomic.check(result);
    atomic.delete(["secrets", orderId]);
    atomic.delete(["secrets_by_expiry", result.value.expiresAt.toString(), orderId]);

    const commitResult = await atomic.commit();
    return commitResult.ok;
  }

  /**
   * Get secrets expiring soon
   * @param withinMs Time window in milliseconds
   * @returns Array of secrets expiring within the window
   */
  async getExpiringSecrets(withinMs: number): Promise<KvSecret[]> {
    const now = Date.now();
    const expiryThreshold = now + withinMs;
    const secrets: KvSecret[] = [];

    // Scan secrets by expiry time
    const iter = this.kv.list<string>({ 
      prefix: ["secrets_by_expiry"],
      start: ["secrets_by_expiry", now.toString()],
      end: ["secrets_by_expiry", expiryThreshold.toString()],
    });

    const orderIds: string[] = [];
    for await (const entry of iter) {
      orderIds.push(entry.value);
    }

    // Batch get the full secret records
    const results = await Promise.all(
      orderIds.map(id => this.kv.get<KvSecret>(["secrets", id]))
    );

    for (const result of results) {
      if (result.value) {
        secrets.push(result.value);
      }
    }

    return secrets;
  }

  /**
   * Watch for secret reveals
   * @returns Async iterator for secret reveal events
   */
  async *watchSecretReveals(): AsyncGenerator<SecretRevealEvent> {
    const stream = this.kv.watch([
      ["secret_reveals"]
    ]);

    for await (const entries of stream) {
      for (const entry of entries) {
        if (entry.value && entry.key[0] === "secret_reveals") {
          yield entry.value as SecretRevealEvent;
        }
      }
    }
  }

  /**
   * Clean up expired secrets
   * @returns Number of secrets cleaned up
   */
  async cleanupExpiredSecrets(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    const iter = this.kv.list<KvSecret>({ prefix: ["secrets"] });
    
    for await (const entry of iter) {
      const secret = entry.value;
      if (secret.expiresAt < now) {
        const atomic = this.kv.atomic();
        
        // Check that secret hasn't been modified
        atomic.check(entry);
        
        // Delete from both indexes
        atomic.delete(["secrets", secret.orderId]);
        atomic.delete(["secrets_by_expiry", secret.expiresAt.toString(), secret.orderId]);
        
        const result = await atomic.commit();
        if (result.ok) cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get statistics about secrets
   * @returns Secret statistics
   */
  async getStatistics(): Promise<{
    total: number;
    revealed: number;
    unrevealed: number;
    expiringSoon: number;
  }> {
    let total = 0;
    let revealed = 0;
    let unrevealed = 0;

    const iter = this.kv.list<KvSecret>({ prefix: ["secrets"] });
    
    for await (const entry of iter) {
      total++;
      if (entry.value.revealed) {
        revealed++;
      } else {
        unrevealed++;
      }
    }

    // Count expiring within 1 hour
    const expiringSoon = (await this.getExpiringSecrets(60 * 60 * 1000)).length;

    return {
      total,
      revealed,
      unrevealed,
      expiringSoon,
    };
  }
}