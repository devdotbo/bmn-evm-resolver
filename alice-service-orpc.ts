#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

/**
 * Alice Service with oRPC - Type-Safe RPC Implementation
 * 
 * This service replaces the manual HTTP API with a type-safe oRPC server:
 * - Full type safety for all API endpoints
 * - Automatic input validation with Zod
 * - Structured error handling
 * - OpenAPI-compatible endpoints
 * 
 * Features:
 * 1. Creates orders with secrets
 * 2. Monitors for source escrow creation by Bob
 * 3. Automatically deposits tokens to source escrow
 * 4. Monitors for destination escrow funding
 * 5. Automatically reveals secret and withdraws
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
import { LimitOrderAlice } from "./src/alice/limit-order-alice.ts";
import { SecretManager } from "./src/state/SecretManager.ts";
import { SecretRevealer } from "./src/utils/secret-reveal.ts";
import { EscrowWithdrawManager } from "./src/utils/escrow-withdraw.ts";
import { AliceOrpcServer } from "./src/utils/alice-orpc-server.ts";

const BMN_TOKEN = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address;

interface ServiceConfig {
  privateKey: string;
  ankrApiKey?: string;
  pollingInterval: number;
  healthPort: number;
  indexerUrl: string;
  autoDepositToSource: boolean;
  autoRevealSecret: boolean;
  autoWithdraw: boolean;
  maxRetries: number;
  retryBackoffMs: number;
}

class AliceServiceWithOrpc {
  private config: ServiceConfig;
  private eventMonitor: EventMonitorService;
  private swapStateManager: SwapStateManager;
  private alice: LimitOrderAlice;
  private secretManager: SecretManager;
  private secretRevealer: SecretRevealer;
  private withdrawManager: EscrowWithdrawManager;
  private orpcServer: AliceOrpcServer;
  private account: any;
  private baseClient: any;
  private optimismClient: any;
  private baseWallet: any;
  private optimismWallet: any;
  private isRunning = false;
  private myOrders = new Map<string, any>(); // hashlock -> order data
  private stats = {
    ordersCreated: 0,
    depositsCompleted: 0,
    secretsRevealed: 0,
    withdrawalsCompleted: 0,
    errors: 0,
    startTime: Date.now(),
  };

  constructor(config: ServiceConfig) {
    this.config = config;
    
    // Initialize services
    this.eventMonitor = new EventMonitorService(config.ankrApiKey);
    this.swapStateManager = new SwapStateManager();
    this.alice = new LimitOrderAlice();
    this.secretManager = new SecretManager();
    this.secretRevealer = new SecretRevealer();
    this.withdrawManager = new EscrowWithdrawManager();
    
    // Initialize oRPC server instead of manual API server
    this.orpcServer = new AliceOrpcServer({
      port: config.healthPort,
      limitOrderAlice: this.alice,
      swapStateManager: this.swapStateManager,
      secretManager: this.secretManager,
    });
    
    // Setup account
    this.account = privateKeyToAccount(config.privateKey as `0x${string}`, { nonceManager });
    
    // Setup RPC clients
    const baseRpc = config.ankrApiKey
      ? `https://rpc.ankr.com/base/${config.ankrApiKey}`
      : "https://base.publicnode.com";
    const optimismRpc = config.ankrApiKey
      ? `https://rpc.ankr.com/optimism/${config.ankrApiKey}`
      : "https://optimism.publicnode.com";
      
    this.baseClient = createPublicClient({
      chain: base,
      transport: http(baseRpc),
    });
    
    this.optimismClient = createPublicClient({
      chain: optimism,
      transport: http(optimismRpc),
    });
    
    this.baseWallet = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(baseRpc),
    });
    
    this.optimismWallet = createWalletClient({
      account: this.account,
      chain: optimism,
      transport: http(optimismRpc),
    });
  }

  async start() {
    console.log("🚀 Starting Alice Service with oRPC");
    console.log(`📡 Account: ${this.account.address}`);
    
    this.isRunning = true;
    
    // Initialize services
    await this.alice.init();
    await this.swapStateManager.init();
    await this.secretManager.init();
    
    // Start oRPC API server
    await this.orpcServer.start();
    console.log(`🌐 oRPC API available with type-safe endpoints`);
    
    // Start background monitoring
    this.startOrderMonitoring();
    this.startEscrowMonitoring();
    
    // Report stats periodically
    setInterval(() => this.reportStats(), 60000); // Every minute
    
    console.log("✅ Alice Service with oRPC is running");
    console.log(`   - Auto deposit to source: ${this.config.autoDepositToSource}`);
    console.log(`   - Auto reveal secret: ${this.config.autoRevealSecret}`);
    console.log(`   - Auto withdraw: ${this.config.autoWithdraw}`);
  }

  /**
   * Monitor pending orders for status changes
   */
  private async startOrderMonitoring() {
    while (this.isRunning) {
      try {
        const pendingSwaps = await this.swapStateManager.getPendingSwaps();
        
        for (const swap of pendingSwaps) {
          // Check if this is our order
          if (this.myOrders.has(swap.hashlock)) {
            await this.processSwap(swap);
          }
        }
      } catch (error) {
        console.error("Error in order monitoring:", error);
        this.stats.errors++;
      }
      
      await new Promise(resolve => setTimeout(resolve, this.config.pollingInterval));
    }
  }

  /**
   * Monitor escrow events
   */
  private async startEscrowMonitoring() {
    // Start the event monitor service
    await this.eventMonitor.startMonitoring();
    
    // Listen for source escrow creation events
    this.eventMonitor.on("SourceEscrowCreated", async (event) => {
      await this.handleEscrowCreation(event, event.chainId);
    });
    
    // Listen for destination escrow creation events  
    this.eventMonitor.on("DestEscrowCreated", async (event) => {
      await this.handleEscrowCreation(event, event.chainId);
    });
    
    // Listen for token deposits to destination escrows
    this.eventMonitor.on("TokensDeposited", async (event) => {
      await this.handleTokensDeposited(event);
    });
    
    console.log("📡 Monitoring escrow creation events on Base and Optimism");
  }

  /**
   * Handle escrow creation events
   */
  private async handleEscrowCreation(event: any, chainId: number) {
    const { hashlock, escrowAddress, isSource } = event;
    
    // Check if this is for one of our orders
    const orderData = this.myOrders.get(hashlock);
    if (!orderData) {
      return; // Not our order
    }
    
    console.log(`📦 ${isSource ? 'Source' : 'Destination'} escrow created for our order:`);
    console.log(`   Hashlock: ${hashlock}`);
    console.log(`   Escrow: ${escrowAddress}`);
    console.log(`   Chain: ${chainId}`);
    
    // Update swap state
    const swap = await this.swapStateManager.getSwapByHashlock(hashlock);
    if (swap) {
      if (isSource) {
        // Source escrow created
        await this.swapStateManager.updateSwapStatus(
          swap.orderHash,
          SwapStatus.SOURCE_ESCROW_CREATED,
          { srcEscrow: escrowAddress }
        );
        
        // Auto-deposit if enabled
        if (this.config.autoDepositToSource) {
          await this.depositToEscrow(escrowAddress, orderData, chainId);
        }
      } else {
        // Destination escrow created
        await this.swapStateManager.updateSwapStatus(
          swap.orderHash,
          SwapStatus.DEST_ESCROW_CREATED,
          { dstEscrow: escrowAddress }
        );
        
        // Monitor for token deposits if this is for us
        if (event.maker === this.account.address) {
          await this.eventMonitor.monitorTokenDeposits(escrowAddress, chainId);
        }
        
        // Auto-reveal secret and withdraw if enabled
        if (this.config.autoRevealSecret) {
          await this.revealAndWithdraw(swap, orderData);
        }
      }
    }
  }

  /**
   * Handle token deposit events
   */
  private async handleTokensDeposited(event: any) {
    console.log(`💰 Tokens deposited to escrow: ${event.escrowAddress}`);
    
    // Check if this is a destination escrow we're monitoring
    const swaps = await this.swapStateManager.getPendingSwaps();
    const swap = swaps.find(
      s => s.dstEscrow === event.escrowAddress && s.alice === this.account.address
    );
    
    if (swap && this.config.autoRevealSecret) {
      console.log(`   Bob has deposited! Revealing secret...`);
      
      const orderData = this.myOrders.get(swap.hashlock);
      if (!orderData) return;
      
      await this.swapStateManager.updateSwapStatus(
        swap.orderHash,
        SwapStatus.BOB_DEPOSITED,
        {
          dstDepositedAt: Date.now(),
        }
      );
      
      // Reveal secret and withdraw
      await this.revealAndWithdraw(swap, orderData);
    }
  }

  /**
   * Process a swap based on its current status
   */
  private async processSwap(swap: any) {
    const orderData = this.myOrders.get(swap.hashlock);
    if (!orderData) return;
    
    switch (swap.status) {
      case SwapStatus.ALICE_DEPOSITED:
        // Wait for Bob to fund destination
        console.log(`⏳ Waiting for Bob to fund destination for ${swap.hashlock.slice(0, 10)}...`);
        break;
        
      case SwapStatus.BOB_DEPOSITED:
        // Reveal secret and withdraw
        if (this.config.autoRevealSecret && !swap.secretRevealedAt) {
          await this.revealAndWithdraw(swap, orderData);
        }
        break;
        
      case SwapStatus.DEST_WITHDRAWN:
        // Alice has withdrawn from destination, Bob can now withdraw from source
        console.log(`✅ Alice withdrawn from destination for ${swap.hashlock.slice(0, 10)}`);
        break;
        
      case SwapStatus.COMPLETED:
        // Swap completed
        console.log(`🎉 Swap completed for ${swap.hashlock.slice(0, 10)}`);
        this.myOrders.delete(swap.hashlock);
        break;
    }
  }

  /**
   * Deposit tokens to escrow
   */
  private async depositToEscrow(escrowAddress: Address, orderData: any, chainId: number) {
    console.log(`💰 Depositing tokens to escrow ${escrowAddress} on chain ${chainId}`);
    
    const wallet = chainId === base.id ? this.baseWallet : this.optimismWallet;
    const client = chainId === base.id ? this.baseClient : this.optimismClient;
    
    try {
      // Approve tokens
      const approveTx = await wallet.writeContract({
        address: BMN_TOKEN,
        abi: erc20Abi,
        functionName: "approve",
        args: [escrowAddress, orderData.amount],
      });
      
      await client.waitForTransactionReceipt({ hash: approveTx });
      console.log(`✅ Tokens approved for escrow`);
      
      // Note: Actual deposit happens through the order fill process
      this.stats.depositsCompleted++;
      
    } catch (error) {
      console.error(`❌ Failed to deposit to escrow:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Reveal secret and withdraw from destination
   */
  private async revealAndWithdraw(swap: any, orderData: any) {
    console.log(`🔓 Revealing secret and withdrawing for ${swap.hashlock.slice(0, 10)}...`);
    
    try {
      // Get secret
      const secret = await this.secretManager.getSecretByHashlock(swap.hashlock);
      if (!secret) {
        console.error(`❌ Secret not found for ${swap.hashlock}`);
        return;
      }
      
      // Withdraw from destination escrow
      if (swap.dstEscrow && this.config.autoWithdraw) {
        const wallet = orderData.dstChainId === base.id ? this.baseWallet : this.optimismWallet;
        const client = orderData.dstChainId === base.id ? this.baseClient : this.optimismClient;
        
        const result = await this.withdrawManager.withdrawFromDestination(
          swap.orderHash,
          client,
          wallet,
          this.account
        );
        
        const success = result.success;
        
        if (success) {
          console.log(`✅ Successfully withdrawn from destination escrow`);
          this.stats.withdrawalsCompleted++;
          
          await this.swapStateManager.updateSwapStatus(
            swap.orderHash,
            SwapStatus.DEST_WITHDRAWN,
            { 
              secretRevealedAt: Date.now(),
              secret: secret as `0x${string}`,
              dstWithdrawnAt: Date.now(),
            }
          );
        }
      }
      
      this.stats.secretsRevealed++;
      
    } catch (error) {
      console.error(`❌ Failed to reveal/withdraw:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Report service statistics
   */
  private reportStats() {
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    console.log("\n📊 Alice Service Statistics:");
    console.log(`   Uptime: ${uptime}s`);
    console.log(`   Orders Created: ${this.stats.ordersCreated}`);
    console.log(`   Deposits Completed: ${this.stats.depositsCompleted}`);
    console.log(`   Secrets Revealed: ${this.stats.secretsRevealed}`);
    console.log(`   Withdrawals Completed: ${this.stats.withdrawalsCompleted}`);
    console.log(`   Errors: ${this.stats.errors}`);
    console.log(`   Active Orders: ${this.myOrders.size}`);
  }

  async stop() {
    console.log("🛑 Stopping Alice Service with oRPC...");
    this.isRunning = false;
    this.orpcServer.stop();
    await this.eventMonitor.stopMonitoring();
    await this.swapStateManager.close();
    console.log("✅ Alice Service stopped");
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  // Load configuration from environment
  const config: ServiceConfig = {
    privateKey: Deno.env.get("ALICE_PRIVATE_KEY") || "",
    ankrApiKey: Deno.env.get("ANKR_API_KEY"),
    pollingInterval: parseInt(Deno.env.get("POLLING_INTERVAL") || "5000"),
    healthPort: parseInt(Deno.env.get("HEALTH_PORT") || "8001"),
    indexerUrl: Deno.env.get("INDEXER_URL") || "http://localhost:42069",
    autoDepositToSource: Deno.env.get("AUTO_DEPOSIT") !== "false",
    autoRevealSecret: Deno.env.get("AUTO_REVEAL") !== "false",
    autoWithdraw: Deno.env.get("AUTO_WITHDRAW") !== "false",
    maxRetries: parseInt(Deno.env.get("MAX_RETRIES") || "3"),
    retryBackoffMs: parseInt(Deno.env.get("RETRY_BACKOFF_MS") || "5000"),
  };
  
  // Validate configuration
  if (!config.privateKey) {
    console.error("❌ ALICE_PRIVATE_KEY environment variable is required");
    Deno.exit(1);
  }
  
  // Create and start service
  const service = new AliceServiceWithOrpc(config);
  
  // Handle graceful shutdown
  const shutdownHandler = async () => {
    console.log("\n📛 Received shutdown signal");
    await service.stop();
    Deno.exit(0);
  };
  
  Deno.addSignalListener("SIGINT", shutdownHandler);
  Deno.addSignalListener("SIGTERM", shutdownHandler);
  
  // Start the service
  await service.start();
  
  // Keep the service running
  await new Promise(() => {});
}

// Run the service
if (import.meta.main) {
  main().catch(console.error);
}