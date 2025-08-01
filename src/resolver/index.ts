import { privateKeyToAccount } from "viem/accounts";
import { chainA, chainB } from "../config/chains.ts";
import { 
  getContractAddresses, 
  areContractsConfigured,
  loadContractAddressesFromEnv 
} from "../config/contracts.ts";
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
import type { SrcEscrowCreatedEvent } from "../types/events.ts";
import type { OrderState } from "../types/index.ts";
import { OrderStatus } from "../types/index.ts";
import { MAX_CONCURRENT_ORDERS, MAX_ORDER_AGE_SECONDS } from "../config/constants.ts";

/**
 * Main resolver application (Bob)
 */
export class Resolver {
  private stateManager: OrderStateManager;
  private monitor: OrderMonitor;
  private executor: OrderExecutor;
  private profitCalculator: ProfitabilityCalculator;
  private srcChainId: number;
  private dstChainId: number;
  private isRunning = false;

  constructor(
    private privateKey: `0x${string}`,
    srcChainId = 1337,
    dstChainId = 1338
  ) {
    this.srcChainId = srcChainId;
    this.dstChainId = dstChainId;
    this.stateManager = new OrderStateManager();
    this.profitCalculator = new ProfitabilityCalculator();

    // Initialize clients and services
    const srcPublicClient = createPublicClientForChain(chainA);
    const srcWalletClient = createWalletClientForChain(chainA, privateKey);
    const dstPublicClient = createPublicClientForChain(chainB);
    const dstWalletClient = createWalletClientForChain(chainB, privateKey);
    
    // Create monitoring clients with WebSocket for real-time events
    const srcMonitoringClient = createMonitoringClient(chainA);
    const dstMonitoringClient = createMonitoringClient(chainB);

    // Get contract addresses
    const srcAddresses = getContractAddresses(srcChainId);
    
    // Initialize monitor with WebSocket client for real-time monitoring
    this.monitor = new OrderMonitor(
      srcPublicClient,
      srcAddresses.escrowFactory,
      this.handleNewOrder.bind(this),
      srcMonitoringClient
    );

    // Initialize executor
    this.executor = new OrderExecutor(
      { publicClient: srcPublicClient, walletClient: srcWalletClient },
      { publicClient: dstPublicClient, walletClient: dstWalletClient },
      srcChainId,
      dstChainId
    );
  }

  /**
   * Start the resolver
   */
  async start(): Promise<void> {
    console.log("Starting Bridge-Me-Not Resolver...");

    // Load contract addresses from environment
    loadContractAddressesFromEnv();

    // Check if contracts are configured
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

    // Start periodic tasks
    this.startPeriodicTasks();

    console.log("Resolver started successfully");
    console.log(`Monitoring chain ${this.srcChainId} for orders`);
    console.log(`Will execute on chain ${this.dstChainId}`);

    // Get resolver address
    const account = privateKeyToAccount(this.privateKey);
    console.log(`Resolver address: ${account.address}`);
  }

  /**
   * Stop the resolver
   */
  async stop(): Promise<void> {
    console.log("Stopping resolver...");
    this.isRunning = false;
    this.monitor.stop();
    
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

      // Create order state
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

      // Check profitability
      const analysis = this.profitCalculator.analyzeOrder(
        "TKA", // Assuming token symbol
        orderState.params.srcAmount,
        "TKA",
        orderState.params.dstAmount,
        orderState.params.safetyDeposit
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
   * Execute an order
   * @param order The order to execute
   */
  private async executeOrder(order: OrderState): Promise<void> {
    try {
      const dstAddresses = getContractAddresses(this.dstChainId);
      
      // Execute order
      const success = await this.executor.executeOrder(order, dstAddresses.escrowFactory);
      
      if (success) {
        this.stateManager.updateOrderStatus(order.id, OrderStatus.DstEscrowDeployed);
        
        // Watch for secret reveal on destination escrow
        if (order.dstEscrowAddress) {
          this.monitor.watchEscrowWithdrawals(
            order.dstEscrowAddress,
            async (secret) => {
              await this.handleSecretRevealed(order.id, secret);
            }
          );
        }
      } else {
        this.stateManager.updateOrderStatus(order.id, OrderStatus.Failed);
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
      if (order.dstEscrowAddress && this.executor.canCancelOrder(order)) {
        console.log(`Cancelling expired order ${order.id}`);
        const success = await this.executor.cancelDestinationEscrow(
          order.dstEscrowAddress
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
    return {
      isRunning: this.isRunning,
      orderStats: this.stateManager.getStatistics(),
      lastBlock: this.monitor.getLastProcessedBlock().toString(),
    };
  }
}

// Main entry point
if (import.meta.main) {
  const privateKey = Deno.env.get("RESOLVER_PRIVATE_KEY");
  
  if (!privateKey || !privateKey.startsWith("0x")) {
    console.error("Please set RESOLVER_PRIVATE_KEY environment variable");
    Deno.exit(1);
  }

  const resolver = new Resolver(privateKey as `0x${string}`);
  
  // Handle shutdown
  Deno.addSignalListener("SIGINT", async () => {
    console.log("\nShutting down...");
    await resolver.stop();
    Deno.exit(0);
  });

  // Start resolver
  await resolver.start();
}