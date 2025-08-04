/**
 * Resolver configuration with optional indexer support
 */

import type { Address } from "viem";

export interface ResolverConfig {
  /**
   * Private key for the resolver account
   */
  privateKey: `0x${string}`;
  
  /**
   * Source chain ID
   */
  srcChainId: number;
  
  /**
   * Destination chain ID
   */
  dstChainId: number;
  
  /**
   * Optional indexer URL for enhanced monitoring
   * If not provided, falls back to event-based monitoring
   */
  indexerUrl?: string;
  
  /**
   * Optional indexer table prefix
   */
  indexerTablePrefix?: string;
  
  /**
   * Feature flags for gradual migration
   */
  features?: {
    /**
     * Use indexer for order discovery
     * Default: false (use event monitoring)
     */
    useIndexerForOrders?: boolean;
    
    /**
     * Use indexer for secret reveals
     * Default: false (use event monitoring)
     */
    useIndexerForSecrets?: boolean;
    
    /**
     * Enable hybrid mode (use both indexer and events)
     * Default: false
     */
    hybridMode?: boolean;
    
    /**
     * Enable ETH safety deposits
     * Default: true
     */
    ethSafetyDeposits?: boolean;
  };
  
  /**
   * Monitoring configuration
   */
  monitoring?: {
    /**
     * Block polling interval in ms (for event monitoring)
     * Default: 3000
     */
    blockPollingInterval?: number;
    
    /**
     * Event batch size
     * Default: 100
     */
    eventBatchSize?: number;
    
    /**
     * Indexer polling interval in ms
     * Default: 5000
     */
    indexerPollingInterval?: number;
  };
  
  /**
   * Profitability configuration
   */
  profitability?: {
    /**
     * Minimum profit in basis points
     * Default: 50 (0.5%)
     */
    minProfitBps?: number;
    
    /**
     * Maximum slippage in basis points
     * Default: 100 (1%)
     */
    maxSlippageBps?: number;
    
    /**
     * Custom token prices (symbol -> USD price)
     */
    tokenPrices?: Record<string, number>;
  };
  
  /**
   * Concurrency limits
   */
  limits?: {
    /**
     * Maximum concurrent orders
     * Default: 10
     */
    maxConcurrentOrders?: number;
    
    /**
     * Maximum order age in seconds
     * Default: 86400 (24 hours)
     */
    maxOrderAgeSeconds?: number;
  };
}

/**
 * Default resolver configuration
 */
export const DEFAULT_RESOLVER_CONFIG: Partial<ResolverConfig> = {
  features: {
    useIndexerForOrders: false,
    useIndexerForSecrets: false,
    hybridMode: false,
    ethSafetyDeposits: true,
  },
  monitoring: {
    blockPollingInterval: 3000,
    eventBatchSize: 100,
    indexerPollingInterval: 5000,
  },
  profitability: {
    minProfitBps: 50,
    maxSlippageBps: 100,
  },
  limits: {
    maxConcurrentOrders: 10,
    maxOrderAgeSeconds: 86400,
  },
};

/**
 * Load resolver configuration from environment
 */
export function loadResolverConfigFromEnv(): Partial<ResolverConfig> {
  const config: Partial<ResolverConfig> = {};
  
  // Basic configuration
  const privateKey = Deno.env.get("RESOLVER_PRIVATE_KEY");
  if (privateKey) {
    config.privateKey = privateKey as `0x${string}`;
  }
  
  // Chain IDs
  const srcChainId = Deno.env.get("SRC_CHAIN_ID");
  if (srcChainId) {
    config.srcChainId = parseInt(srcChainId);
  }
  
  const dstChainId = Deno.env.get("DST_CHAIN_ID");
  if (dstChainId) {
    config.dstChainId = parseInt(dstChainId);
  }
  
  // Indexer configuration
  config.indexerUrl = Deno.env.get("INDEXER_URL");
  config.indexerTablePrefix = Deno.env.get("INDEXER_TABLE_PREFIX");
  
  // Feature flags
  config.features = {
    useIndexerForOrders: Deno.env.get("USE_INDEXER_FOR_ORDERS") === "true",
    useIndexerForSecrets: Deno.env.get("USE_INDEXER_FOR_SECRETS") === "true",
    hybridMode: Deno.env.get("HYBRID_MODE") === "true",
    ethSafetyDeposits: Deno.env.get("ETH_SAFETY_DEPOSITS") !== "false",
  };
  
  // Monitoring configuration
  const blockPollingInterval = Deno.env.get("BLOCK_POLLING_INTERVAL");
  const eventBatchSize = Deno.env.get("EVENT_BATCH_SIZE");
  const indexerPollingInterval = Deno.env.get("INDEXER_POLLING_INTERVAL");
  
  if (blockPollingInterval || eventBatchSize || indexerPollingInterval) {
    config.monitoring = {
      blockPollingInterval: blockPollingInterval ? parseInt(blockPollingInterval) : undefined,
      eventBatchSize: eventBatchSize ? parseInt(eventBatchSize) : undefined,
      indexerPollingInterval: indexerPollingInterval ? parseInt(indexerPollingInterval) : undefined,
    };
  }
  
  // Profitability configuration
  const minProfitBps = Deno.env.get("MIN_PROFIT_BPS");
  const maxSlippageBps = Deno.env.get("MAX_SLIPPAGE_BPS");
  
  if (minProfitBps || maxSlippageBps) {
    config.profitability = {
      minProfitBps: minProfitBps ? parseInt(minProfitBps) : undefined,
      maxSlippageBps: maxSlippageBps ? parseInt(maxSlippageBps) : undefined,
    };
  }
  
  // Limits
  const maxConcurrentOrders = Deno.env.get("MAX_CONCURRENT_ORDERS");
  const maxOrderAgeSeconds = Deno.env.get("MAX_ORDER_AGE_SECONDS");
  
  if (maxConcurrentOrders || maxOrderAgeSeconds) {
    config.limits = {
      maxConcurrentOrders: maxConcurrentOrders ? parseInt(maxConcurrentOrders) : undefined,
      maxOrderAgeSeconds: maxOrderAgeSeconds ? parseInt(maxOrderAgeSeconds) : undefined,
    };
  }
  
  return config;
}

/**
 * Merge configurations with defaults
 */
export function mergeResolverConfig(
  userConfig: Partial<ResolverConfig>,
  envConfig: Partial<ResolverConfig> = loadResolverConfigFromEnv()
): ResolverConfig {
  // Start with defaults
  const config: ResolverConfig = {
    privateKey: "0x" as `0x${string}`, // Will be overridden
    srcChainId: 0, // Will be overridden
    dstChainId: 0, // Will be overridden
    features: { ...DEFAULT_RESOLVER_CONFIG.features },
    monitoring: { ...DEFAULT_RESOLVER_CONFIG.monitoring },
    profitability: { ...DEFAULT_RESOLVER_CONFIG.profitability },
    limits: { ...DEFAULT_RESOLVER_CONFIG.limits },
  };
  
  // Apply environment config
  Object.assign(config, envConfig);
  if (envConfig.features) {
    Object.assign(config.features!, envConfig.features);
  }
  if (envConfig.monitoring) {
    Object.assign(config.monitoring!, envConfig.monitoring);
  }
  if (envConfig.profitability) {
    Object.assign(config.profitability!, envConfig.profitability);
  }
  if (envConfig.limits) {
    Object.assign(config.limits!, envConfig.limits);
  }
  
  // Apply user config (highest priority)
  Object.assign(config, userConfig);
  if (userConfig.features) {
    Object.assign(config.features!, userConfig.features);
  }
  if (userConfig.monitoring) {
    Object.assign(config.monitoring!, userConfig.monitoring);
  }
  if (userConfig.profitability) {
    Object.assign(config.profitability!, userConfig.profitability);
  }
  if (userConfig.limits) {
    Object.assign(config.limits!, userConfig.limits);
  }
  
  return config;
}

/**
 * Validate resolver configuration
 */
export function validateResolverConfig(config: ResolverConfig): void {
  if (!config.privateKey || !config.privateKey.startsWith("0x")) {
    throw new Error("Valid private key is required");
  }
  
  if (!config.srcChainId || config.srcChainId <= 0) {
    throw new Error("Valid source chain ID is required");
  }
  
  if (!config.dstChainId || config.dstChainId <= 0) {
    throw new Error("Valid destination chain ID is required");
  }
  
  if (config.srcChainId === config.dstChainId) {
    throw new Error("Source and destination chain IDs must be different");
  }
  
  // Validate indexer config if features are enabled
  const needsIndexer = config.features?.useIndexerForOrders || 
                      config.features?.useIndexerForSecrets || 
                      config.features?.hybridMode;
  
  if (needsIndexer && !config.indexerUrl) {
    throw new Error("Indexer URL is required when indexer features are enabled");
  }
  
  // Validate profitability settings
  if (config.profitability?.minProfitBps !== undefined && config.profitability.minProfitBps < 0) {
    throw new Error("Minimum profit must be non-negative");
  }
  
  if (config.profitability?.maxSlippageBps !== undefined && config.profitability.maxSlippageBps < 0) {
    throw new Error("Maximum slippage must be non-negative");
  }
  
  // Validate limits
  if (config.limits?.maxConcurrentOrders !== undefined && config.limits.maxConcurrentOrders <= 0) {
    throw new Error("Maximum concurrent orders must be positive");
  }
  
  if (config.limits?.maxOrderAgeSeconds !== undefined && config.limits.maxOrderAgeSeconds <= 0) {
    throw new Error("Maximum order age must be positive");
  }
}