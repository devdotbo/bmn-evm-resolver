#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

/**
 * Bob-Resolver Service V2 - Fully Automated
 * 
 * Enhanced version with EventMonitorService and SwapStateManager integration
 * Automatically handles the complete atomic swap flow:
 * 1. Fills orders when detected
 * 2. Waits for Alice's deposit to source escrow
 * 3. Creates and funds destination escrow
 * 4. Withdraws from source when secret is revealed
 */

import {
  type Address,
  createPublicClient,
  createWalletClient,
  type Hash,
  http,
  type Hex,
  parseEther,
} from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { base, optimism } from "viem/chains";
import { erc20Abi } from "viem";

// Import services and utilities
import { EventMonitorService } from "./src/services/event-monitor.ts";
import { SwapStateManager, SwapStatus } from "./src/state/swap-state-manager.ts";
import { PonderClient } from "./src/indexer/ponder-client.ts";
import { SecretManager } from "./src/state/SecretManager.ts";
import { EscrowWithdrawManager } from "./src/utils/escrow-withdraw.ts";
import { createDestinationEscrow, extractImmutables, parsePostInteractionData } from "./src/utils/escrow-creation.ts";
import { orderToStruct, type OrderInput, type OrderSignature } from "./src/utils/eip712-signer.ts";
import {
  ensureLimitOrderApprovals,
  fillLimitOrder,
  type FillOrderParams,
  type LimitOrderData,
} from "./src/utils/limit-order.ts";
import { getContractAddresses } from "./src/config/contracts.ts";
import { startHealthServer } from "./src/utils/health-server.ts";

const BMN_TOKEN = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address;

interface ServiceConfig {
  privateKey: string;
  ankrApiKey?: string;
  pollingInterval: number;
  healthPort: number;
  indexerUrl: string;
  autoCreateDestEscrow: boolean;
  autoWithdrawOnReveal: boolean;
  maxRetries: number;
  retryBackoffMs: number;
}

class BobResolverServiceV2 {
  private config: ServiceConfig;
  private eventMonitor: EventMonitorService;
  private swapStateManager: SwapStateManager;
  private ponderClient: PonderClient;
  private secretManager: SecretManager;
  private withdrawManager: EscrowWithdrawManager;
  private account: any;
  private baseClient: any;
  private optimismClient: any;
  private baseWallet: any;
  private optimismWallet: any;
  private isRunning = false;
  private stats = {
    ordersProcessed: 0,
    ordersFilled: 0,
    escrowsCreated: 0,
    depositsReceived: 0,
    withdrawalsCompleted: 0,
    errors: 0,
    startTime: Date.now(),
  };

  constructor(config: ServiceConfig) {
    this.config = config;
    
    // Initialize services
    this.eventMonitor = new EventMonitorService(config.ankrApiKey);
    this.swapStateManager = new SwapStateManager();
    this.ponderClient = new PonderClient({ url: config.indexerUrl });
    this.secretManager = new SecretManager();
    this.withdrawManager = new EscrowWithdrawManager();
    
    // Setup account
    this.account = privateKeyToAccount(config.privateKey as `0x${string}`, { nonceManager });
    
    // Setup RPC clients
    const baseRpc = config.ankrApiKey
      ? `https://rpc.ankr.com/base/${config.ankrApiKey}`
      : "https://erpc.up.railway.app/main/evm/8453";
    
    const optimismRpc = config.ankrApiKey
      ? `https://rpc.ankr.com/optimism/${config.ankrApiKey}`
      : "https://erpc.up.railway.app/main/evm/10";
    
    this.baseClient = createPublicClient({
      chain: base,
      transport: http(baseRpc),
    });
    
    this.optimismClient = createPublicClient({
      chain: optimism,
      transport: http(optimismRpc),
    });
    
    this.baseWallet = createWalletClient({
      chain: base,
      transport: http(baseRpc),
      account: this.account,
    });
    
    this.optimismWallet = createWalletClient({
      chain: optimism,
      transport: http(optimismRpc),
      account: this.account,
    });
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    console.log("🚀 Starting Bob-Resolver Service V2 (Automated)");
    console.log(`   Bob Address: ${this.account.address}`);
    console.log(`   Auto Create Dest Escrow: ${this.config.autoCreateDestEscrow}`);
    console.log(`   Auto Withdraw on Reveal: ${this.config.autoWithdrawOnReveal}`);
    
    this.isRunning = true;
    
    // Initialize state manager
    await this.swapStateManager.init();
    await this.secretManager.init();
    
    // Register event listeners
    this.setupEventListeners();
    
    // Start event monitoring
    await this.eventMonitor.startMonitoring();
    
    // Start health server
    const healthServer = startHealthServer(this.config.healthPort, "bob-resolver-v2");
    
    // Start background tasks
    this.startBackgroundTasks();
    
    console.log("✅ Bob-Resolver Service V2 started successfully");
    
    // Keep service running
    await new Promise((resolve) => {
      const shutdown = async () => {
        console.log("\n🛑 Shutting down Bob-Resolver Service V2...");
        this.isRunning = false;
        await this.eventMonitor.stopMonitoring();
        await this.swapStateManager.close();
        await healthServer.shutdown();
        resolve(undefined);
      };
      
      Deno.addSignalListener("SIGINT", shutdown);
      Deno.addSignalListener("SIGTERM", shutdown);
    });
  }

  /**
   * Setup event listeners for automation
   */
  private setupEventListeners(): void {
    // Listen for new orders (from pending-orders directory)
    this.eventMonitor.on("OrderFilled", async (event) => {
      console.log(`\n📦 Order filled: ${event.orderHash}`);
      this.stats.ordersFilled++;
      
      // Update swap state
      await this.swapStateManager.updateSwapStatus(
        event.orderHash,
        SwapStatus.ORDER_FILLED,
        {
          srcEscrow: event.srcEscrow,
        }
      );
    });
    
    // Listen for source escrow creation
    this.eventMonitor.on("SourceEscrowCreated", async (event) => {
      console.log(`\n🏦 Source escrow created: ${event.escrowAddress}`);
      console.log(`   Waiting for Alice's deposit...`);
      
      // Update swap state
      const swap = await this.swapStateManager.getSwapByHashlock(event.hashlock);
      if (swap) {
        await this.swapStateManager.updateSwapStatus(
          swap.orderHash,
          SwapStatus.SOURCE_ESCROW_CREATED,
          {
            srcEscrow: event.escrowAddress,
            srcEscrowCreatedAt: Date.now(),
          }
        );
        
        // Start monitoring for Alice's deposit
        await this.eventMonitor.monitorTokenDeposits(event.escrowAddress, event.chainId);
      }
    });
    
    // Listen for Alice's deposit to source escrow
    this.eventMonitor.on("TokensDeposited", async (event) => {
      console.log(`\n💰 Alice deposited to source escrow: ${event.escrowAddress}`);
      console.log(`   Amount: ${event.amount}`);
      this.stats.depositsReceived++;
      
      // Find the swap by escrow address
      const swaps = await this.swapStateManager.getPendingSwaps();
      const swap = swaps.find(s => s.srcEscrow === event.escrowAddress);
      
      if (swap && this.config.autoCreateDestEscrow) {
        await this.swapStateManager.updateSwapStatus(
          swap.orderHash,
          SwapStatus.ALICE_DEPOSITED,
          {
            srcDepositedAt: Date.now(),
          }
        );
        
        console.log(`   Creating destination escrow...`);
        await this.createAndFundDestinationEscrow(swap);
      }
    });
    
    // Listen for destination escrow creation
    this.eventMonitor.on("DestEscrowCreated", async (event) => {
      console.log(`\n🏦 Destination escrow created: ${event.escrowAddress}`);
      
      const swap = await this.swapStateManager.getSwapByHashlock(event.hashlock);
      if (swap) {
        await this.swapStateManager.updateSwapStatus(
          swap.orderHash,
          SwapStatus.DEST_ESCROW_CREATED,
          {
            dstEscrow: event.escrowAddress,
            dstEscrowCreatedAt: Date.now(),
          }
        );
        
        // Start monitoring for secret reveals
        await this.eventMonitor.monitorSecretReveals(event.escrowAddress, event.chainId);
      }
    });
    
    // Listen for secret reveals
    this.eventMonitor.on("SecretRevealed", async (event) => {
      console.log(`\n🔓 Secret revealed: ${event.secret}`);
      console.log(`   Escrow: ${event.escrowAddress}`);
      
      // Find swap by destination escrow
      const swaps = await this.swapStateManager.getPendingSwaps();
      const swap = swaps.find(s => s.dstEscrow === event.escrowAddress);
      
      if (swap && this.config.autoWithdrawOnReveal) {
        await this.swapStateManager.updateSwapStatus(
          swap.orderHash,
          SwapStatus.SECRET_REVEALED,
          {
            secret: event.secret,
            secretRevealedAt: Date.now(),
            secretRevealTxHash: event.transactionHash,
          }
        );
        
        console.log(`   Withdrawing from source escrow...`);
        await this.withdrawFromSourceEscrow(swap, event.secret);
      }
    });
  }

  /**
   * Process pending orders from directory
   */
  private async processPendingOrders(): Promise<void> {
    const pendingOrdersDir = "./pending-orders";
    
    try {
      const entries = Deno.readDir(pendingOrdersDir);
      
      for await (const entry of entries) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          const orderPath = `${pendingOrdersDir}/${entry.name}`;
          const orderData = JSON.parse(await Deno.readTextFile(orderPath));
          
          // Parse extension data to get destination details
          const extensionData = orderData.extensionData as Hex;
          const parsed = parsePostInteractionData(extensionData);
          
          // Check if order has expired (extract timelocks to validate)
          // Note: Don't skip orders based on time - let the contract handle that
          // The fillOrder will fail naturally if expired
          
          // Track in state manager with correct destination details
          await this.swapStateManager.trackSwap(orderData.hashlock, {
            orderHash: orderData.orderHash || orderData.hashlock,
            hashlock: orderData.hashlock,
            alice: orderData.order?.maker || "0x",
            bob: this.account.address,
            srcChainId: orderData.chainId || 8453,
            srcToken: orderData.order?.makerAsset || BMN_TOKEN,
            srcAmount: BigInt(orderData.order?.makingAmount || 0),
            dstChainId: Number(parsed.dstChainId),
            dstToken: parsed.dstToken,
            dstAmount: BigInt(orderData.order?.takingAmount || 0),
          });
          
          // Fill the order
          console.log(`\n📋 Processing order: ${orderData.hashlock}`);
          const success = await this.fillOrder(orderData);
          
          if (success) {
            this.stats.ordersProcessed++;
            // Move to completed
            await Deno.rename(orderPath, `./completed-orders/${entry.name}`);
          }
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("Error processing pending orders:");
        console.error('Full error details:', error);
        if (error instanceof Error) {
          console.error('Error message:', error.message);
          console.error('Stack trace:', error.stack);
        }
      }
    }
  }

  /**
   * Fill a limit order
   */
  private async fillOrder(orderData: LimitOrderData): Promise<boolean> {
    try {
      const chainId = (orderData as any).chainId || 8453;
      const wallet = chainId === 10 ? this.optimismWallet : this.baseWallet;
      const client = chainId === 10 ? this.optimismClient : this.baseClient;
      
      const chainAddrs = getContractAddresses(chainId);
      
      // Ensure approvals
      await ensureLimitOrderApprovals(
        client,
        wallet,
        (orderData as any).order?.takerAsset || BMN_TOKEN,
        chainAddrs.limitOrderProtocol,
        chainAddrs.escrowFactory,
        BigInt((orderData as any).order?.takingAmount || 0),
      );
      
      // Rebuild order struct with proper bigint types
      const rawOrder = (orderData as any).order || (orderData as any);
      const orderInput: OrderInput = {
        salt: BigInt(rawOrder.salt),
        maker: rawOrder.maker as Address,
        receiver: rawOrder.receiver as Address,
        makerAsset: rawOrder.makerAsset as Address,
        takerAsset: rawOrder.takerAsset as Address,
        makingAmount: BigInt(rawOrder.makingAmount),
        takingAmount: BigInt(rawOrder.takingAmount),
        makerTraits: BigInt(rawOrder.makerTraits),
      };

      // Convert to struct format with addresses as uint256
      const orderStruct = orderToStruct(orderInput);

      // Handle signature format (r and vs components)
      const signature: OrderSignature = {
        r: (orderData as any).signature as Hex,
        vs: (orderData as any).signatureVs as Hex,
      };

      // Build fill parameters with converted order
      const params: FillOrderParams = {
        order: {
          salt: orderStruct.salt,
          maker: orderStruct.maker as any as Address, // Cast back for the fillLimitOrder function
          receiver: orderStruct.receiver as any as Address,
          makerAsset: orderStruct.makerAsset as any as Address,
          takerAsset: orderStruct.takerAsset as any as Address,
          makingAmount: orderStruct.makingAmount,
          takingAmount: orderStruct.takingAmount,
          makerTraits: orderStruct.makerTraits,
        },
        signature: signature.r,
        extensionData: (orderData as any).extensionData as Hex,
        // Fill full making amount to align with protocol expectations
        fillAmount: orderStruct.makingAmount,
      };

      // Fill the order using the correct signature
      const result = await fillLimitOrder(
        client,
        wallet,
        chainAddrs.limitOrderProtocol as Address,
        params,
        chainAddrs.escrowFactory as Address,
      );
      
      console.log(`✅ Order filled: ${result.transactionHash}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to fill order:`);
      console.error('Full error details:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Stack trace:', error.stack);
        if ('cause' in error) console.error('Cause:', error.cause);
        if ('data' in error) console.error('Data:', error.data);
        if ('shortMessage' in error) console.error('Short message:', error.shortMessage);
        if ('metaMessages' in error) console.error('Meta messages:', error.metaMessages);
      }
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Create and fund destination escrow
   */
  private async createAndFundDestinationEscrow(swap: any): Promise<void> {
    try {
      // Read order data to get immutables
      const orderFiles = [
        `./pending-orders/${swap.hashlock}.json`,
        `./completed-orders/${swap.hashlock}.json`,
      ];
      
      let orderData: any = null;
      for (const file of orderFiles) {
        try {
          orderData = JSON.parse(await Deno.readTextFile(file));
          break;
        } catch {}
      }
      
      if (!orderData) {
        throw new Error(`Order data not found for ${swap.hashlock}`);
      }
      
      // Extract immutables
      const immutables = extractImmutables(
        orderData.order,
        orderData.extensionData as Hex,
        swap.srcEscrow,
      );
      
      // Create destination escrow
      const result = await createDestinationEscrow(
        immutables,
        this.config.privateKey,
      );
      
      console.log(`✅ Destination escrow created: ${result.escrow}`);
      
      // Update state
      await this.swapStateManager.updateSwapStatus(
        swap.orderHash,
        SwapStatus.DEST_ESCROW_CREATED,
        {
          dstEscrow: result.escrow,
          dstEscrowCreatedAt: Date.now(),
        }
      );
      
      // Fund the destination escrow
      const dstWallet = swap.dstChainId === 10 ? this.optimismWallet : this.baseWallet;
      const dstClient = swap.dstChainId === 10 ? this.optimismClient : this.baseClient;
      
      // Approve tokens
      const approveTx = await dstWallet.writeContract({
        address: swap.dstToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [result.escrow, swap.dstAmount],
      });
      
      await dstClient.waitForTransactionReceipt({ hash: approveTx });
      
      // Transfer tokens to escrow
      const transferTx = await dstWallet.writeContract({
        address: swap.dstToken,
        abi: erc20Abi,
        functionName: "transfer",
        args: [result.escrow, swap.dstAmount],
      });
      
      await dstClient.waitForTransactionReceipt({ hash: transferTx });
      
      console.log(`✅ Destination escrow funded with ${swap.dstAmount} tokens`);
      
      await this.swapStateManager.updateSwapStatus(
        swap.orderHash,
        SwapStatus.BOB_DEPOSITED,
        {
          dstDepositedAt: Date.now(),
        }
      );
      
      this.stats.escrowsCreated++;
    } catch (error) {
      console.error(`❌ Failed to create destination escrow:`);
      console.error('Full error details:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Stack trace:', error.stack);
        if ('cause' in error) console.error('Cause:', error.cause);
        if ('data' in error) console.error('Data:', error.data);
      }
      this.stats.errors++;
      
      // Retry logic
      const retryCount = await this.swapStateManager.incrementRetryCount(swap.orderHash);
      if (retryCount < this.config.maxRetries) {
        console.log(`🔄 Will retry (attempt ${retryCount + 1}/${this.config.maxRetries})`);
        setTimeout(
          () => this.createAndFundDestinationEscrow(swap),
          this.config.retryBackoffMs * Math.pow(2, retryCount)
        );
      } else {
        await this.swapStateManager.markSwapFailed(
          swap.orderHash,
          `Failed to create destination escrow after ${this.config.maxRetries} attempts`
        );
      }
    }
  }

  /**
   * Withdraw from source escrow using revealed secret
   */
  private async withdrawFromSourceEscrow(swap: any, secret: Hex): Promise<void> {
    try {
      const result = await this.withdrawManager.withdrawFromSource(
        swap.orderHash,
        secret,
        this.baseClient,
        this.baseWallet,
        this.account,
      );
      
      if (result.success) {
        console.log(`✅ Withdrawn from source escrow: ${result.txHash}`);
        
        await this.swapStateManager.updateSwapStatus(
          swap.orderHash,
          SwapStatus.SOURCE_WITHDRAWN,
          {
            srcWithdrawnAt: Date.now(),
          }
        );
        
        this.stats.withdrawalsCompleted++;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`❌ Failed to withdraw from source:`);
      console.error('Full error details:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Stack trace:', error.stack);
        if ('cause' in error) console.error('Cause:', error.cause);
        if ('data' in error) console.error('Data:', error.data);
      }
      this.stats.errors++;
      
      // Retry logic
      const retryCount = await this.swapStateManager.incrementRetryCount(swap.orderHash);
      if (retryCount < this.config.maxRetries) {
        console.log(`🔄 Will retry withdrawal (attempt ${retryCount + 1}/${this.config.maxRetries})`);
        setTimeout(
          () => this.withdrawFromSourceEscrow(swap, secret),
          this.config.retryBackoffMs * Math.pow(2, retryCount)
        );
      }
    }
  }

  /**
   * Start background tasks
   */
  private startBackgroundTasks(): void {
    // Process pending orders periodically
    setInterval(() => {
      if (this.isRunning) {
        this.processPendingOrders();
      }
    }, this.config.pollingInterval);
    
    // Check for stuck swaps
    setInterval(async () => {
      if (this.isRunning) {
        // Check for swaps awaiting destination escrow
        const awaitingDest = await this.swapStateManager.getSwapsAwaitingDestEscrow();
        for (const swap of awaitingDest) {
          console.log(`🔄 Retrying destination escrow for ${swap.orderHash}`);
          await this.createAndFundDestinationEscrow(swap);
        }
        
        // Check for swaps awaiting withdrawal
        const awaitingWithdraw = await this.swapStateManager.getSwapsAwaitingWithdrawal();
        for (const swap of awaitingWithdraw) {
          if (swap.secret && swap.srcEscrow && !swap.srcWithdrawnAt) {
            console.log(`🔄 Retrying withdrawal for ${swap.orderHash}`);
            await this.withdrawFromSourceEscrow(swap, swap.secret);
          }
        }
      }
    }, 30000); // Every 30 seconds
    
    // Check for expired swaps
    setInterval(async () => {
      if (this.isRunning) {
        await this.swapStateManager.checkExpiredSwaps(3600); // 1 hour timeout
      }
    }, 60000); // Every minute
    
    // Print statistics
    setInterval(() => {
      if (this.isRunning) {
        const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
        console.log(`\n📊 Bob-Resolver V2 Statistics:`);
        console.log(`   Uptime: ${uptime}s`);
        console.log(`   Orders Processed: ${this.stats.ordersProcessed}`);
        console.log(`   Orders Filled: ${this.stats.ordersFilled}`);
        console.log(`   Escrows Created: ${this.stats.escrowsCreated}`);
        console.log(`   Deposits Received: ${this.stats.depositsReceived}`);
        console.log(`   Withdrawals: ${this.stats.withdrawalsCompleted}`);
        console.log(`   Errors: ${this.stats.errors}`);
      }
    }, 60000); // Every minute
  }
}

// Main execution
async function main() {
  const config: ServiceConfig = {
    privateKey: Deno.env.get("BOB_PRIVATE_KEY") || Deno.env.get("RESOLVER_PRIVATE_KEY") || "",
    ankrApiKey: Deno.env.get("ANKR_API_KEY"),
    pollingInterval: parseInt(Deno.env.get("POLLING_INTERVAL") || "10000"),
    healthPort: parseInt(Deno.env.get("BOB_HEALTH_PORT") || "8002"),
    indexerUrl: Deno.env.get("INDEXER_URL") || "https://index-bmn.up.railway.app",
    autoCreateDestEscrow: Deno.env.get("AUTO_CREATE_DEST_ESCROW") !== "false",
    autoWithdrawOnReveal: Deno.env.get("AUTO_WITHDRAW_ON_REVEAL") !== "false",
    maxRetries: parseInt(Deno.env.get("MAX_RETRIES") || "3"),
    retryBackoffMs: parseInt(Deno.env.get("RETRY_BACKOFF_MS") || "5000"),
  };
  
  if (!config.privateKey) {
    console.error("❌ BOB_PRIVATE_KEY or RESOLVER_PRIVATE_KEY required");
    Deno.exit(1);
  }
  
  // Create necessary directories
  await Deno.mkdir("./pending-orders", { recursive: true });
  await Deno.mkdir("./completed-orders", { recursive: true });
  await Deno.mkdir("./data/kv", { recursive: true });
  
  const service = new BobResolverServiceV2(config);
  await service.start();
}

main().catch(console.error);