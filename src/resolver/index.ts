import { privateKeyToAccount } from "viem/accounts";
import { 
  getContractAddresses, 
  areContractsConfigured,
  loadContractAddressesFromEnv,
  CONTRACT_ADDRESSES,
  CREATE3_ADDRESSES 
} from "../config/contracts.ts";
import { getChains, getChainName, getReverseChains } from "../config/chain-selector.ts";
import { 
  createPublicClientForChain,
  createWalletClientForChain,
  createMonitoringClient 
} from "../utils/contracts.ts";
import { generateOrderId } from "../utils/addresses.ts";
import { OrderStateManager } from "./state.ts";
import { OrderMonitor } from "./monitor.ts";
import { OrderExecutor } from "./executor.ts";
import { ProfitabilityCalculator } from "./profitability.ts";
import { FileMonitor } from "./file-monitor.ts";
import { DestinationChainMonitor } from "./destination-monitor.ts";
import type { SrcEscrowCreatedEvent } from "../types/events.ts";
import type { OrderState } from "../types/index.ts";
import { OrderStatus } from "../types/index.ts";
import { MAX_CONCURRENT_ORDERS, MAX_ORDER_AGE_SECONDS } from "../config/constants.ts";
import { 
  ResolverConfig, 
  mergeResolverConfig, 
  validateResolverConfig 
} from "./config.ts";
import { createLocalIndexerClient } from "../indexer/local-setup.ts";
import { IndexerClient } from "../indexer/client.ts";

/**
 * Main resolver application (Bob)
 */
export class Resolver {
  private stateManager: OrderStateManager;
  private monitor: OrderMonitor;
  private fileMonitor: FileMonitor;
  private destinationMonitor: DestinationChainMonitor;
  private executor: OrderExecutor;
  private profitCalculator: ProfitabilityCalculator;
  private srcChainId: number;
  private dstChainId: number;
  private isRunning = false;
  private config: ResolverConfig;
  private indexerClient?: IndexerClient;
  private resolverAddress: `0x${string}`;

  constructor(
    privateKey: `0x${string}`,
    srcChainId?: number,
    dstChainId?: number,
    config?: Partial<ResolverConfig>
  ) {
    // Get chain configuration based on network mode and direction
    const useReverse = Deno.env.get("REVERSE_CHAINS") === "true";
    const chains = useReverse ? getReverseChains() : getChains();
    this.srcChainId = srcChainId ?? chains.srcChainId;
    this.dstChainId = dstChainId ?? chains.dstChainId;
    
    // Merge configuration
    this.config = mergeResolverConfig({
      privateKey,
      srcChainId: this.srcChainId,
      dstChainId: this.dstChainId,
      ...config,
    });
    
    // Validate configuration
    validateResolverConfig(this.config);
    
    // Set resolver address
    const account = privateKeyToAccount(privateKey);
    this.resolverAddress = account.address;
    
    // Initialize state manager
    this.stateManager = new OrderStateManager();
    
    // Initialize profitability calculator with custom settings
    this.profitCalculator = new ProfitabilityCalculator(
      this.config.profitability?.minProfitBps,
      this.config.profitability?.maxSlippageBps,
      this.config.profitability?.tokenPrices
    );

    // Initialize clients and services
    const srcPublicClient = createPublicClientForChain(chains.srcChain);
    const srcWalletClient = createWalletClientForChain(chains.srcChain, privateKey);
    const dstPublicClient = createPublicClientForChain(chains.dstChain);
    const dstWalletClient = createWalletClientForChain(chains.dstChain, privateKey);
    
    // Create monitoring clients with WebSocket for real-time events
    const srcMonitoringClient = createMonitoringClient(chains.srcChain);
    const dstMonitoringClient = createMonitoringClient(chains.dstChain);

    // Get contract addresses - use CREATE3 addresses for mainnet chains
    const isMainnet = this.srcChainId === 8453 || this.srcChainId === 42793;
    const srcAddresses = isMainnet 
      ? { 
          escrowFactory: CREATE3_ADDRESSES.ESCROW_FACTORY,
          limitOrderProtocol: CONTRACT_ADDRESSES[this.srcChainId].limitOrderProtocol,
          tokens: CONTRACT_ADDRESSES[this.srcChainId].tokens 
        }
      : getContractAddresses(this.srcChainId);
    
    // Initialize indexer client if configured (connection happens in start())
    if (this.config.indexerUrl) {
      this.indexerClient = new IndexerClient({
        sqlUrl: this.config.indexerUrl,
        tablePrefix: this.config.indexerTablePrefix,
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
      });
    }
    
    // Initialize monitor with optional indexer support
    this.monitor = new OrderMonitor(
      srcPublicClient,
      srcAddresses.escrowFactory,
      this.handleNewOrder.bind(this),
      srcMonitoringClient,
      {
        indexerClient: this.indexerClient,
        useIndexer: this.config.features?.useIndexerForOrders || false,
        hybridMode: this.config.features?.hybridMode || false,
        resolverAddress: this.resolverAddress,
        indexerPollingInterval: this.config.monitoring?.indexerPollingInterval,
      }
    );

    // Initialize executor
    this.executor = new OrderExecutor(
      { publicClient: srcPublicClient, walletClient: srcWalletClient },
      { publicClient: dstPublicClient, walletClient: dstWalletClient },
      srcChainId,
      dstChainId
    );

    // Initialize file monitor for development
    this.fileMonitor = new FileMonitor(
      this.handleNewOrder.bind(this)
    );

    // Initialize destination chain monitor for secret reveals with optional indexer support
    this.destinationMonitor = new DestinationChainMonitor(
      dstPublicClient,
      this.handleSecretReveal.bind(this),
      dstMonitoringClient,
      {
        indexerClient: this.indexerClient,
        useIndexer: this.config.features?.useIndexerForSecrets || false,
        hybridMode: this.config.features?.hybridMode || false,
      }
    );
  }

  /**
   * Start the resolver
   */
  async start(): Promise<void> {
    console.log("Starting Bridge-Me-Not Resolver...");
    console.log(`Configuration:`);
    console.log(`- Source Chain: ${getChainName(this.srcChainId)} (${this.srcChainId})`);
    console.log(`- Destination Chain: ${getChainName(this.dstChainId)} (${this.dstChainId})`);
    console.log(`- Resolver Address: ${this.resolverAddress}`);
    console.log(`- Min Profit: ${this.config.profitability?.minProfitBps} bps`);
    console.log(`- Indexer: ${this.config.indexerUrl ? 'Enabled' : 'Disabled'}`);

    // Load contract addresses from environment
    loadContractAddressesFromEnv();

    // Check if contracts are configured for local chains
    const isMainnet = this.srcChainId === 8453 || this.srcChainId === 42793 || 
                     this.dstChainId === 8453 || this.dstChainId === 42793;
    
    if (!isMainnet) {
      // Only check full configuration for local chains
      if (!areContractsConfigured(this.srcChainId) || !areContractsConfigured(this.dstChainId)) {
        console.error("Contract addresses not configured. Please set environment variables:");
        console.error("- CHAIN_A_ESCROW_FACTORY");
        console.error("- CHAIN_A_LIMIT_ORDER_PROTOCOL");
        console.error("- CHAIN_B_ESCROW_FACTORY");
        console.error("- CHAIN_B_LIMIT_ORDER_PROTOCOL");
        console.error("- CHAIN_A_TOKEN_TKA");
        console.error("- CHAIN_A_TOKEN_TKB");
        console.error("- CHAIN_B_TOKEN_TKA");
        console.error("- CHAIN_B_TOKEN_TKB");
        return;
      }
    } else {
      console.log("Using CREATE3 deterministic addresses for mainnet");
      console.log(`- Escrow Factory: ${CREATE3_ADDRESSES.ESCROW_FACTORY}`);
      console.log(`- BMN Token: ${CREATE3_ADDRESSES.BMN_TOKEN}`);
    }
    
    // Connect to indexer if configured
    if (this.indexerClient) {
      try {
        await this.indexerClient.connect();
        console.log("✅ Connected to indexer for enhanced monitoring");
        
        // Check indexer health
        const health = await this.indexerClient.checkHealth();
        console.log("📊 Indexer health:", {
          connected: health.connected,
          synced: health.synced,
          latestBlock: health.latestBlock.toString(),
          chainId: health.chainId
        });
      } catch (error) {
        console.error("❌ Failed to connect to indexer:", error);
        console.log("Will use event-based monitoring only");
        
        // Disable indexer features on failure
        if (this.config.features) {
          this.config.features.useIndexerForOrders = false;
          this.config.features.useIndexerForSecrets = false;
          this.config.features.hybridMode = false;
        }
      }
    }

    // Load saved state
    try {
      await this.stateManager.loadFromFile();
      console.log("Loaded saved order state");
    } catch (error) {
      console.log("No saved state found, starting fresh");
    }

    // Start monitoring
    this.isRunning = true;
    await this.monitor.start();
    
    // Start file monitor for development
    await this.fileMonitor.start();
    
    // Start destination chain monitor for secret reveals
    await this.destinationMonitor.start();

    // Start periodic tasks
    this.startPeriodicTasks();

    console.log("\n✅ Resolver started successfully");
    console.log(`📍 Monitoring ${getChainName(this.srcChainId)} (${this.srcChainId}) for orders`);
    console.log(`🎯 Will execute on ${getChainName(this.dstChainId)} (${this.dstChainId})`);
    console.log(`💼 Resolver address: ${this.resolverAddress}`);
  }

  /**
   * Stop the resolver
   */
  async stop(): Promise<void> {
    console.log("Stopping resolver...");
    this.isRunning = false;
    this.monitor.stop();
    this.fileMonitor.stop();
    this.destinationMonitor.stop();
    
    // Disconnect from indexer if connected
    if (this.indexerClient) {
      await this.indexerClient.disconnect();
      console.log("Disconnected from indexer");
    }
    
    // Save state
    await this.stateManager.saveToFile();
    console.log("Resolver stopped");
  }

  /**
   * Handle new order event
   * @param event The SrcEscrowCreated event
   */
  private async handleNewOrder(event: SrcEscrowCreatedEvent): Promise<void> {
    try {
      console.log(`New order detected: ${event.orderHash}`);

      // Check if we're at capacity
      const activeOrders = this.stateManager.getActiveOrders();
      if (activeOrders.length >= MAX_CONCURRENT_ORDERS) {
        console.log("At maximum concurrent orders, skipping");
        return;
      }

      // Handle file-based orders differently
      if (event.orderData) {
        // This is a file-based order from FileMonitor
        await this.handleFileBasedOrder(event);
        return;
      }

      // Create order state for blockchain events
      const orderId = generateOrderId(this.srcChainId, event.orderHash);
      const orderState: OrderState = {
        id: orderId,
        params: {
          srcToken: event.immutables.token,
          dstToken: event.immutables.token, // Same token for simplicity
          srcAmount: event.immutables.amount,
          dstAmount: event.immutables.amount,
          safetyDeposit: event.immutables.safetyDeposit,
          secret: "0x0000000000000000000000000000000000000000000000000000000000000000", // Unknown
          srcChainId: this.srcChainId,
          dstChainId: this.dstChainId,
        },
        immutables: event.immutables,
        srcEscrowAddress: event.escrow,
        status: OrderStatus.SrcEscrowDeployed,
        createdAt: Date.now(),
      };

      // Check profitability (with ETH safety deposits if enabled)
      const isEthDeposit = this.config.features?.ethSafetyDeposits || false;
      const analysis = this.profitCalculator.analyzeOrder(
        "TKA", // Assuming token symbol
        orderState.params.srcAmount,
        "TKA",
        orderState.params.dstAmount,
        orderState.params.safetyDeposit,
        isEthDeposit
      );

      if (!analysis.isProfitable) {
        console.log(`Order ${orderId} not profitable: ${analysis.reason}`);
        return;
      }

      console.log(`Order ${orderId} is profitable: ${analysis.profitBps / 100}% profit`);
      
      // Add to state
      this.stateManager.addOrder(orderState);

      // Execute order
      await this.executeOrder(orderState);
    } catch (error) {
      console.error("Error handling new order:", error);
    }
  }

  /**
   * Handle file-based order from FileMonitor
   * @param event The event with order data
   */
  private async handleFileBasedOrder(event: SrcEscrowCreatedEvent): Promise<void> {
    if (!event.orderData) return;

    const { order, crossChainData } = event.orderData;
    
    // Create order state from file data
    const orderId = event.orderHash;
    const orderState: OrderState = {
      id: orderId,
      params: {
        srcToken: order.makerAsset,
        dstToken: order.takerAsset,
        srcAmount: BigInt(order.makingAmount),
        dstAmount: BigInt(order.takingAmount),
        safetyDeposit: BigInt(crossChainData.safetyDeposit || 0),
        secret: "0x0000000000000000000000000000000000000000000000000000000000000000",
        srcChainId: this.srcChainId,
        dstChainId: this.dstChainId,
      },
      immutables: event.immutables,
      srcEscrowAddress: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      status: OrderStatus.Created,
      createdAt: Date.now(),
      orderData: event.orderData,
    };

    // Check profitability (with ETH safety deposits if enabled)
    const isEthDeposit = this.config.features?.ethSafetyDeposits || false;
    const analysis = this.profitCalculator.analyzeOrder(
      crossChainData.srcTokenSymbol || "TKA",
      orderState.params.srcAmount,
      crossChainData.dstTokenSymbol || "TKB",
      orderState.params.dstAmount,
      orderState.params.safetyDeposit,
      isEthDeposit
    );

    if (!analysis.isProfitable) {
      console.log(`Order ${orderId} not profitable: ${analysis.reason}`);
      return;
    }

    console.log(`Order ${orderId} is profitable: ${analysis.profitBps / 100}% profit`);
    
    // Add to state
    this.stateManager.addOrder(orderState);
    
    // For file-based orders, we need to fill the limit order on-chain first
    await this.fillLimitOrder(orderState);
  }

  /**
   * Fill a limit order on-chain
   * @param order The order to fill
   */
  private async fillLimitOrder(order: OrderState): Promise<void> {
    if (!order.orderData) return;

    try {
      console.log(`Filling limit order ${order.id} on-chain...`);
      
      // TODO: Implement actual limit order filling via LimitOrderProtocol
      // For now, we'll just execute the order directly
      await this.executeOrder(order);
    } catch (error) {
      console.error(`Failed to fill limit order ${order.id}:`, error);
      this.stateManager.updateOrderStatus(order.id, OrderStatus.Failed);
    }
  }

  /**
   * Execute an order
   * @param order The order to execute
   */
  private async executeOrder(order: OrderState): Promise<void> {
    try {
      // Get destination contract addresses - use CREATE3 addresses for mainnet chains
      const isMainnet = this.dstChainId === 8453 || this.dstChainId === 42793;
      const dstAddresses = isMainnet 
        ? { 
            escrowFactory: CREATE3_ADDRESSES.ESCROW_FACTORY,
            limitOrderProtocol: CONTRACT_ADDRESSES[this.dstChainId].limitOrderProtocol,
            tokens: CONTRACT_ADDRESSES[this.dstChainId].tokens 
          }
        : getContractAddresses(this.dstChainId);
      
      console.log(`Executing order on ${getChainName(this.dstChainId)} with factory: ${dstAddresses.escrowFactory}`);
      
      // Execute order
      const result = await this.executor.executeOrder(order, dstAddresses.escrowFactory);
      
      if (result.success && result.dstEscrowAddress) {
        // Update order with destination escrow address (both predicted and actual)
        this.stateManager.updateOrderEscrows(
          order.id, 
          undefined, 
          result.dstEscrowAddress,
          result.dstEscrowAddress // The executor now returns the actual address from the event
        );
        this.stateManager.updateOrderStatus(order.id, OrderStatus.DstEscrowDeployed);
        
        // Save state immediately
        await this.stateManager.saveToFile();
        
        // Watch for secret reveal on destination escrow
        this.monitor.watchEscrowWithdrawals(
          result.dstEscrowAddress,
          async (secret) => {
            await this.handleSecretRevealed(order.id, secret);
          }
        );
      } else {
        this.stateManager.updateOrderStatus(order.id, OrderStatus.Failed);
        await this.stateManager.saveToFile();
      }
    } catch (error) {
      console.error(`Error executing order ${order.id}:`, error);
      this.stateManager.updateOrderStatus(order.id, OrderStatus.Failed);
    }
  }

  /**
   * Handle secret revealed event
   * @param orderId The order ID
   * @param secret The revealed secret
   */
  private async handleSecretRevealed(
    orderId: string,
    secret: `0x${string}`
  ): Promise<void> {
    try {
      console.log(`Secret revealed for order ${orderId}`);
      
      const order = this.stateManager.getOrder(orderId);
      if (!order || !order.srcEscrowAddress) {
        console.error(`Order ${orderId} not found or invalid`);
        return;
      }

      // Update state
      this.stateManager.updateOrderSecret(orderId, secret);
      this.stateManager.updateOrderStatus(orderId, OrderStatus.SecretRevealed);

      // Withdraw from source escrow
      const success = await this.executor.withdrawFromSourceEscrow(
        order.srcEscrowAddress,
        secret
      );

      if (success) {
        this.stateManager.updateOrderStatus(orderId, OrderStatus.Completed);
        console.log(`Order ${orderId} completed successfully`);
      } else {
        this.stateManager.updateOrderStatus(orderId, OrderStatus.Failed);
      }
    } catch (error) {
      console.error(`Error handling secret reveal for ${orderId}:`, error);
    }
  }

  /**
   * Handle secret reveal event from destination chain monitor
   * @param event The withdrawn event with secret
   */
  private async handleSecretReveal(event: import("./destination-monitor.ts").WithdrawnEvent): Promise<void> {
    try {
      console.log(`Secret revealed on destination chain: ${event.secret}`);
      console.log(`From escrow: ${event.escrowAddress}`);
      
      // Find the order associated with this escrow
      const orders = this.stateManager.getAllOrders();
      const order = orders.find(o => 
        o.actualDstEscrowAddress === event.escrowAddress || 
        o.dstEscrowAddress === event.escrowAddress
      );
      
      if (!order) {
        console.error(`No order found for escrow ${event.escrowAddress}`);
        return;
      }
      
      console.log(`Found order ${order.id} for escrow ${event.escrowAddress}`);
      
      // Update order status
      this.stateManager.updateOrderStatus(order.id, OrderStatus.SecretRevealed);
      
      // Execute Bob's withdrawal from source escrow
      await this.handleSecretRevealed(order.id, event.secret);
    } catch (error) {
      console.error("Error handling destination chain secret reveal:", error);
    }
  }

  /**
   * Start periodic maintenance tasks
   */
  private startPeriodicTasks(): void {
    // Save state periodically
    setInterval(async () => {
      if (this.isRunning) {
        await this.stateManager.saveToFile();
      }
    }, 60000); // Every minute

    // Clean up old orders
    setInterval(() => {
      if (this.isRunning) {
        const removed = this.stateManager.cleanupOldOrders(
          MAX_ORDER_AGE_SECONDS * 1000
        );
        if (removed > 0) {
          console.log(`Cleaned up ${removed} old orders`);
        }
      }
    }, 300000); // Every 5 minutes

    // Check for cancellable orders
    setInterval(async () => {
      if (this.isRunning) {
        await this.checkCancellableOrders();
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Check for orders that can be cancelled
   */
  private async checkCancellableOrders(): Promise<void> {
    const activeOrders = this.stateManager.getActiveOrders();
    
    for (const order of activeOrders) {
      const escrowAddress = order.actualDstEscrowAddress || order.dstEscrowAddress;
      if (escrowAddress && this.executor.canCancelOrder(order)) {
        console.log(`Cancelling expired order ${order.id}`);
        const success = await this.executor.cancelDestinationEscrow(
          escrowAddress
        );
        
        if (success) {
          this.stateManager.updateOrderStatus(order.id, OrderStatus.Cancelled);
        }
      }
    }
  }

  /**
   * Get resolver statistics
   * @returns Statistics object
   */
  getStatistics(): Record<string, any> {
    const stats: Record<string, any> = {
      isRunning: this.isRunning,
      orderStats: this.stateManager.getStatistics(),
      lastBlock: this.monitor.getLastProcessedBlock().toString(),
      config: {
        srcChainId: this.srcChainId,
        dstChainId: this.dstChainId,
        minProfitBps: this.config.profitability?.minProfitBps,
        useIndexer: this.config.features?.useIndexerForOrders,
        hybridMode: this.config.features?.hybridMode,
      },
    };
    
    // Add indexer status if available
    if (this.indexerClient) {
      const health = this.indexerClient.getLastHealthCheck();
      stats.indexer = {
        connected: health?.connected || false,
        synced: health?.synced || false,
        latestBlock: health?.latestBlock?.toString() || "0",
      };
    }
    
    return stats;
  }
}

// Main entry point
if (import.meta.main) {
  const privateKey = Deno.env.get("RESOLVER_PRIVATE_KEY");
  
  if (!privateKey || !privateKey.startsWith("0x")) {
    console.error("Please set RESOLVER_PRIVATE_KEY environment variable");
    Deno.exit(1);
  }

  // Load optional configuration from environment
  const userConfig: Partial<ResolverConfig> = {};
  
  // Check if we should use indexer
  const indexerUrl = Deno.env.get("INDEXER_URL");
  if (indexerUrl) {
    console.log(`Indexer URL configured: ${indexerUrl}`);
    userConfig.indexerUrl = indexerUrl;
    userConfig.indexerTablePrefix = Deno.env.get("INDEXER_TABLE_PREFIX");
  }

  const resolver = new Resolver(privateKey as `0x${string}`, undefined, undefined, userConfig);
  
  // Handle shutdown
  Deno.addSignalListener("SIGINT", async () => {
    console.log("\nShutting down...");
    await resolver.stop();
    Deno.exit(0);
  });

  // Start resolver
  await resolver.start();
}