/**
 * Export all indexer functionality
 */

// Core client
export { IndexerClient } from "./client.ts";
export type { IndexerClientConfig } from "./client.ts";

// Types
export * from "./types.ts";

// Queries
export { QUERIES, SQL_QUERIES, SUBSCRIPTIONS, buildDynamicQuery } from "./queries.ts";

// Subscriptions
export { SubscriptionManager } from "./subscriptions.ts";
export type { SubscriptionOptions, Subscription } from "./subscriptions.ts";

// Factory functions
import { IndexerClient, type IndexerClientConfig } from "./client.ts";
import { SubscriptionManager, type SubscriptionOptions } from "./subscriptions.ts";

/**
 * Create a new indexer client with default configuration
 */
export function createIndexerClient(
  graphqlUrl: string,
  options?: Partial<IndexerClientConfig>
): IndexerClient {
  const config: IndexerClientConfig = {
    graphqlUrl,
    sqlUrl: options?.sqlUrl || graphqlUrl.replace("/graphql", "/sql"),
    websocketUrl: options?.websocketUrl || graphqlUrl.replace("http://", "ws://").replace("https://", "wss://"),
    retryAttempts: options?.retryAttempts || 3,
    retryDelay: options?.retryDelay || 1000,
    timeout: options?.timeout || 30000,
    connectionPoolSize: options?.connectionPoolSize || 10
  };

  return new IndexerClient(config);
}

/**
 * Create a standalone subscription manager
 */
export function createSubscriptionManager(
  url: string,
  options?: Partial<SubscriptionOptions>
): SubscriptionManager {
  const config: SubscriptionOptions = {
    url,
    reconnect: options?.reconnect ?? true,
    reconnectInterval: options?.reconnectInterval || 5000,
    maxReconnectAttempts: options?.maxReconnectAttempts || 10,
    heartbeatInterval: options?.heartbeatInterval || 30000
  };

  return new SubscriptionManager(config);
}

// Environment-based factory
export function createIndexerFromEnv(): IndexerClient {
  const graphqlUrl = process.env.INDEXER_GRAPHQL_URL || "http://localhost:42069/graphql";
  const sqlUrl = process.env.INDEXER_SQL_URL;
  const websocketUrl = process.env.INDEXER_WS_URL;

  return createIndexerClient(graphqlUrl, {
    sqlUrl,
    websocketUrl,
    retryAttempts: parseInt(process.env.INDEXER_RETRY_ATTEMPTS || "3"),
    retryDelay: parseInt(process.env.INDEXER_RETRY_DELAY || "1000"),
    timeout: parseInt(process.env.INDEXER_TIMEOUT || "30000")
  });
}

// Export default configurations
export const DEFAULT_INDEXER_CONFIG = {
  LOCAL: {
    graphqlUrl: "http://localhost:42069/graphql",
    sqlUrl: "http://localhost:42069/sql",
    websocketUrl: "ws://localhost:42069/graphql-ws"
  },
  PRODUCTION: {
    graphqlUrl: process.env.INDEXER_GRAPHQL_URL || "https://indexer.bridge-me-not.io/graphql",
    sqlUrl: process.env.INDEXER_SQL_URL || "https://indexer.bridge-me-not.io/sql",
    websocketUrl: process.env.INDEXER_WS_URL || "wss://indexer.bridge-me-not.io/graphql-ws"
  }
};

// Helper utilities
export { IndexerError, IndexerErrorCode } from "./types.ts";

/**
 * Validate indexer connection
 */
export async function validateIndexerConnection(client: IndexerClient): Promise<boolean> {
  try {
    await client.connect();
    const health = await client.checkHealth();
    return health.connected && health.synced;
  } catch (error) {
    console.error("Indexer validation failed:", error);
    return false;
  }
}

/**
 * Create a client with automatic failover
 */
export function createFailoverIndexerClient(
  primaryUrl: string,
  fallbackUrl: string,
  options?: Partial<IndexerClientConfig>
): IndexerClient {
  // Try primary first
  const primaryClient = createIndexerClient(primaryUrl, options);
  
  // Wrap with failover logic
  const originalConnect = primaryClient.connect.bind(primaryClient);
  primaryClient.connect = async function() {
    try {
      await originalConnect();
    } catch (error) {
      console.warn("Primary indexer failed, trying fallback:", error);
      // Switch to fallback URL
      this.config.graphqlUrl = fallbackUrl;
      this.config.sqlUrl = fallbackUrl.replace("/graphql", "/sql");
      this.config.websocketUrl = fallbackUrl.replace("http://", "ws://").replace("https://", "wss://");
      await originalConnect();
    }
  };

  return primaryClient;
}