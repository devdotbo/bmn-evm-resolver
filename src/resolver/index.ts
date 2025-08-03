import { privateKeyToAccount } from "viem/accounts";
import { 
  getContractAddresses, 
  areContractsConfigured,
  loadContractAddressesFromEnv 
} from "../config/contracts.ts";
import { getChains, getChainName } from "../config/chain-selector.ts";
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

  constructor(
    private privateKey: `0x${string}`,
    srcChainId?: number,
    dstChainId?: number
  ) {
    // Get chain configuration based on network mode
    const chains = getChains();
    this.srcChainId = srcChainId ?? chains.srcChainId;
    this.dstChainId = dstChainId ?? chains.dstChainId;
    this.stateManager = new OrderStateManager();
    this.profitCalculator = new ProfitabilityCalculator();

    // Initialize clients and services
    const srcPublicClient = createPublicClientForChain(chains.srcChain);
    const srcWalletClient = createWalletClientForChain(chains.srcChain, privateKey);
    const dstPublicClient = createPublicClientForChain(chains.dstChain);
    const dstWalletClient = createWalletClientForChain(chains.dstChain, privateKey);
    
    // Create monitoring clients with WebSocket for real-time events
    const srcMonitoringClient = createMonitoringClient(chains.srcChain);
    const dstMonitoringClient = createMonitoringClient(chains.dstChain);

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

    // Initialize file monitor for development
    this.fileMonitor = new FileMonitor(
      this.handleNewOrder.bind(this)
    );

    // Initialize destination chain monitor for secret reveals with WebSocket client
    this.destinationMonitor = new DestinationChainMonitor(
      dstPublicClient,
      this.handleSecretReveal.bind(this),
      dstMonitoringClient
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
    
    // Start file monitor for development
    await this.fileMonitor.start();
    
    // Start destination chain monitor for secret reveals
    await this.destinationMonitor.start();

    // Start periodic tasks
    this.startPeriodicTasks();

    console.log("Resolver started successfully");
    console.log(`Monitoring ${getChainName(this.srcChainId)} (${this.srcChainId}) for orders`);
    console.log(`Will execute on ${getChainName(this.dstChainId)} (${this.dstChainId})`);

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
    this.fileMonitor.stop();
    this.destinationMonitor.stop();
    
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

    // Check profitability
    const analysis = this.profitCalculator.analyzeOrder(
      crossChainData.srcTokenSymbol || "TKA",
      orderState.params.srcAmount,
      crossChainData.dstTokenSymbol || "TKB",
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
      const dstAddresses = getContractAddresses(this.dstChainId);
      
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