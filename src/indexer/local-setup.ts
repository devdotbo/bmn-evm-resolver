/**
 * Local indexer setup utilities for development
 */

import { IndexerClient, type IndexerClientConfig } from "./client.ts";
import { getIndexerConfig, LOCAL_INDEXER_CONFIG, validateIndexerConfig } from "../config/indexer.ts";
import type { Address } from "viem";
import { BOB_ADDRESS } from "../config/chains.ts";

/**
 * Create a pre-configured IndexerClient for local development
 */
export function createLocalIndexerClient(config?: Partial<IndexerClientConfig>): IndexerClient {
  // Get config from environment or use local defaults
  const envConfig = getIndexerConfig();
  const isLocal = envConfig.sqlUrl.includes("localhost") || envConfig.sqlUrl.includes("127.0.0.1");
  
  // Use local config if URL points to localhost, otherwise use env config
  const baseConfig = isLocal ? LOCAL_INDEXER_CONFIG : envConfig;
  
  // Merge with any provided overrides
  const finalConfig: IndexerClientConfig = {
    ...baseConfig,
    ...config
  };

  // Validate the configuration
  validateIndexerConfig(finalConfig);

  return new IndexerClient(finalConfig);
}

/**
 * Quick setup for local development with sensible defaults
 */
export async function setupLocalIndexer(): Promise<IndexerClient> {
  const client = createLocalIndexerClient();
  
  try {
    await client.connect();
    console.log("✅ Connected to local indexer");
    
    // Check health
    const health = await client.checkHealth();
    console.log("📊 Indexer health:", {
      connected: health.connected,
      synced: health.synced,
      latestBlock: health.latestBlock.toString(),
      chainId: health.chainId
    });
    
    return client;
  } catch (error) {
    console.error("❌ Failed to connect to local indexer:", error);
    throw error;
  }
}

/**
 * Example queries for testing the local indexer
 */
export class LocalIndexerExamples {
  constructor(private client: IndexerClient) {}

  /**
   * Get all pending orders for the default resolver (Bob)
   */
  async getPendingOrdersForBob() {
    console.log("\n🔍 Fetching pending orders for Bob...");
    const orders = await this.client.getPendingOrders(BOB_ADDRESS);
    console.log(`Found ${orders.totalCount} pending orders`);
    return orders;
  }

  /**
   * Get active orders (both escrows created)
   */
  async getActiveOrders() {
    console.log("\n🔍 Fetching active orders...");
    const orders = await this.client.getActiveOrders(BOB_ADDRESS);
    console.log(`Found ${orders.totalCount} active orders`);
    return orders;
  }

  /**
   * Get chain statistics
   */
  async getChainStats(chainId: number) {
    console.log(`\n📊 Fetching statistics for chain ${chainId}...`);
    const stats = await this.client.getChainStatistics(chainId);
    if (stats) {
      console.log("Chain statistics:", {
        totalSrcEscrows: stats.totalSrcEscrows.toString(),
        totalDstEscrows: stats.totalDstEscrows.toString(),
        totalWithdrawals: stats.totalWithdrawals.toString(),
        totalVolumeLocked: stats.totalVolumeLocked.toString()
      });
    } else {
      console.log("No statistics found for chain", chainId);
    }
    return stats;
  }

  /**
   * Subscribe to new orders in real-time
   */
  async subscribeToNewOrders() {
    console.log("\n👀 Subscribing to new orders...");
    const unsubscribe = await this.client.subscribeToNewOrders(
      (order) => {
        console.log("📦 New order detected:", {
          orderHash: order.orderHash,
          srcChainId: order.srcChainId,
          dstChainId: order.dstChainId,
          srcAmount: order.srcAmount.toString(),
          dstAmount: order.dstAmount.toString()
        });
      },
      BOB_ADDRESS
    );
    
    console.log("✅ Subscribed to new orders (press Ctrl+C to stop)");
    return unsubscribe;
  }

  /**
   * Subscribe to secret reveals
   */
  async subscribeToSecretReveals() {
    console.log("\n🔓 Subscribing to secret reveals...");
    const unsubscribe = await this.client.subscribeToSecretReveals(
      (event) => {
        console.log("🔑 Secret revealed:", {
          orderHash: event.orderHash,
          secret: event.secret,
          chainId: event.chainId,
          escrowAddress: event.escrowAddress
        });
      }
    );
    
    console.log("✅ Subscribed to secret reveals (press Ctrl+C to stop)");
    return unsubscribe;
  }

  /**
   * Test all basic queries
   */
  async runAllTests() {
    console.log("🧪 Running all indexer tests...\n");
    
    try {
      // Test pending orders
      await this.getPendingOrdersForBob();
      
      // Test active orders
      await this.getActiveOrders();
      
      // Test chain statistics
      await this.getChainStats(1337); // Chain A
      await this.getChainStats(1338); // Chain B
      
      console.log("\n✅ All tests completed successfully!");
    } catch (error) {
      console.error("\n❌ Test failed:", error);
      throw error;
    }
  }
}

/**
 * Quick test function for development
 */
export async function testLocalIndexer() {
  const client = await setupLocalIndexer();
  const examples = new LocalIndexerExamples(client);
  
  try {
    await examples.runAllTests();
  } finally {
    await client.disconnect();
  }
}

// Export for easy testing
if (import.meta.main) {
  testLocalIndexer().catch(console.error);
}