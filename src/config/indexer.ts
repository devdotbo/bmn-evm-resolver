/**
 * Indexer configuration for local and production environments
 */

export interface IndexerConfig {
  sqlUrl: string;
  tablePrefix?: string;
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * Get indexer configuration from environment
 */
export function getIndexerConfig(): IndexerConfig {
  const sqlUrl = Deno.env.get("INDEXER_URL") || "http://localhost:42069/sql";
  const tablePrefix = Deno.env.get("INDEXER_TABLE_PREFIX") || "";
  const retryAttempts = parseInt(Deno.env.get("INDEXER_RETRY_ATTEMPTS") || "3");
  const retryDelay = parseInt(Deno.env.get("INDEXER_RETRY_DELAY") || "1000");
  const timeout = parseInt(Deno.env.get("INDEXER_TIMEOUT") || "30000");

  return {
    sqlUrl,
    tablePrefix,
    retryAttempts,
    retryDelay,
    timeout
  };
}

/**
 * Local development indexer configuration
 * - No table prefix by default
 * - Points to local Ponder instance
 * - Shorter timeouts for faster development
 */
export const LOCAL_INDEXER_CONFIG: IndexerConfig = {
  sqlUrl: "http://localhost:42069/sql",
  tablePrefix: "", // No prefix for local development
  retryAttempts: 3,
  retryDelay: 500,
  timeout: 10000
};

/**
 * Production indexer configuration template
 * - Expects INDEXER_URL to be set
 * - May require table prefix for multi-tenant deployment
 * - Longer timeouts for reliability
 */
export const PRODUCTION_INDEXER_CONFIG_TEMPLATE: IndexerConfig = {
  sqlUrl: Deno.env.get("INDEXER_URL") || "https://indexer.example.com/sql",
  tablePrefix: Deno.env.get("INDEXER_TABLE_PREFIX") || "bmn",
  retryAttempts: 5,
  retryDelay: 2000,
  timeout: 60000
};

/**
 * Check if using local indexer
 */
export function isLocalIndexer(): boolean {
  const sqlUrl = Deno.env.get("INDEXER_URL") || "";
  return sqlUrl.includes("localhost") || sqlUrl.includes("127.0.0.1") || sqlUrl === "";
}

/**
 * Validate indexer configuration
 */
export function validateIndexerConfig(config: IndexerConfig): void {
  if (!config.sqlUrl) {
    throw new Error("Indexer SQL URL is required");
  }

  if (!config.sqlUrl.startsWith("http://") && !config.sqlUrl.startsWith("https://")) {
    throw new Error("Indexer SQL URL must start with http:// or https://");
  }

  if (config.retryAttempts && config.retryAttempts < 0) {
    throw new Error("Retry attempts must be non-negative");
  }

  if (config.retryDelay && config.retryDelay < 0) {
    throw new Error("Retry delay must be non-negative");
  }

  if (config.timeout && config.timeout < 0) {
    throw new Error("Timeout must be non-negative");
  }
}