#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

/**
 * Alice Service V3 - Fully Automated
 * 
 * Enhanced version with EventMonitorService integration for full automation:
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
import { AliceApiServer } from "./src/utils/alice-api-server.ts";

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

class AliceServiceV3 {
  private config: ServiceConfig;
  private eventMonitor: EventMonitorService;
  private swapStateManager: SwapStateManager;
  private alice: LimitOrderAlice;
  private secretManager: SecretManager;
  private secretRevealer: SecretRevealer;
  private withdrawManager: EscrowWithdrawManager;
  private apiServer: AliceApiServer;
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
    this.alice = new LimitOrderAlice(config.privateKey);
    this.secretManager = new SecretManager();
    this.secretRevealer = new SecretRevealer();
    this.withdrawManager = new EscrowWithdrawManager();
    
    // Initialize API server
    this.apiServer = new AliceApiServer({
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
    console.log("🎭 Starting Alice Service V3 (Automated)");
    console.log(`   Alice Address: ${this.account.address}`);
    console.log(`   Auto Deposit: ${this.config.autoDepositToSource}`);
    console.log(`   Auto Reveal: ${this.config.autoRevealSecret}`);
    console.log(`   Auto Withdraw: ${this.config.autoWithdraw}`);
    
    this.isRunning = true;
    
    // Initialize services
    await this.alice.init();
    await this.swapStateManager.init();
    await this.secretManager.init();
    
    // Register event listeners
    this.setupEventListeners();
    
    // Start event monitoring
    await this.eventMonitor.startMonitoring();
    
    // Start API server (includes health endpoint)
    await this.apiServer.start();
    
    // Start background tasks
    this.startBackgroundTasks();
    
    console.log("✅ Alice Service V3 started successfully");
    
    // Keep service running
    await new Promise((resolve) => {
      const shutdown = async () => {
        console.log("\n🛑 Shutting down Alice Service V3...");
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
    // Listen for source escrow creation (Bob filled order)
    this.eventMonitor.on("SourceEscrowCreated", async (event) => {
      console.log(`\n🏦 Source escrow created: ${event.escrowAddress}`);
      
      // Check if this is one of our orders
      const orderData = this.myOrders.get(event.hashlock);
      if (orderData && this.config.autoDepositToSource) {
        console.log(`   This is our order! Depositing tokens...`);
        
        // Update swap state
        await this.swapStateManager.updateSwapStatus(
          event.orderHash,
          SwapStatus.SOURCE_ESCROW_CREATED,
          {
            srcEscrow: event.escrowAddress,
            srcEscrowCreatedAt: Date.now(),
          }
        );
        
        // Deposit tokens to source escrow
        await this.depositToSourceEscrow(
          event.escrowAddress,
          orderData.makingAmount,
          event.chainId
        );
      }
    });
    
    // Listen for destination escrow creation
    this.eventMonitor.on("DestEscrowCreated", async (event) => {
      console.log(`\n🏦 Destination escrow created: ${event.escrowAddress}`);
      
      // Check if we're the receiver
      if (event.maker === this.account.address) {
        console.log(`   This is for us! Monitoring for Bob's deposit...`);
        
        // Update swap state
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
        }
        
        // Monitor for Bob's deposit
        await this.eventMonitor.monitorTokenDeposits(event.escrowAddress, event.chainId);
      }
    });
    
    // Listen for Bob's deposit to destination escrow
    this.eventMonitor.on("TokensDeposited", async (event) => {
      console.log(`\n💰 Tokens deposited to escrow: ${event.escrowAddress}`);
      
      // Check if this is a destination escrow we're monitoring
      const swaps = await this.swapStateManager.getPendingSwaps();
      const swap = swaps.find(
        s => s.dstEscrow === event.escrowAddress && s.alice === this.account.address
      );
      
      if (swap && this.config.autoRevealSecret) {
        console.log(`   Bob has deposited! Revealing secret...`);
        
        await this.swapStateManager.updateSwapStatus(
          swap.orderHash,
          SwapStatus.BOB_DEPOSITED,
          {
            dstDepositedAt: Date.now(),
          }
        );
        
        // Reveal secret and withdraw
        await this.revealSecretAndWithdraw(swap);
      }
    });
    
    // Listen for our own secret reveals (for tracking)
    this.eventMonitor.on("SecretRevealed", async (event) => {
      if (event.revealer === this.account.address) {
        console.log(`\n✅ We revealed the secret successfully`);
        this.stats.secretsRevealed++;
        
        // Update state
        const swaps = await this.swapStateManager.getPendingSwaps();
        const swap = swaps.find(s => s.dstEscrow === event.escrowAddress);
        
        if (swap) {
          await this.swapStateManager.updateSwapStatus(
            swap.orderHash,
            SwapStatus.SECRET_REVEALED,
            {
              secret: event.secret,
              secretRevealedAt: Date.now(),
              secretRevealTxHash: event.transactionHash,
            }
          );
        }
      }
    });
  }

  /**
   * Create a new order with secret
   */
  async createOrder(params: {
    srcAmount: bigint;
    dstAmount: bigint;
    srcChainId?: number;
    dstChainId?: number;
  }): Promise<string> {
    try {
      // Generate secret
      const { secret, hashlock } = this.secretRevealer.generateSecret();
      
      console.log(`\n📝 Creating new order with secret`);
      console.log(`   Hashlock: ${hashlock}`);
      console.log(`   Source Amount: ${params.srcAmount}`);
      console.log(`   Dest Amount: ${params.dstAmount}`);
      
      // Create and sign order
      const orderResult = await this.alice.createAndSignOrder({
        chainId: params.srcChainId || 8453, // Base
        makerAsset: BMN_TOKEN,
        takerAsset: BMN_TOKEN,
        makingAmount: params.srcAmount,
        takingAmount: params.dstAmount,
        receiver: this.account.address,
        hashlock,
        dstChainId: BigInt(params.dstChainId || 10), // Optimism
        dstToken: BMN_TOKEN,
        srcSafetyDeposit: params.srcAmount / 100n,
        dstSafetyDeposit: params.dstAmount / 100n,
      });
      
      // Store order data
      this.myOrders.set(hashlock, {
        ...orderResult,
        makingAmount: params.srcAmount,
        takingAmount: params.dstAmount,
        secret,
      });
      
      // Track in state manager
      await this.swapStateManager.trackSwap(orderResult.orderHash || hashlock, {
        orderHash: orderResult.orderHash || hashlock,
        hashlock,
        alice: this.account.address,
        bob: "0x", // Will be filled when Bob fills
        srcChainId: params.srcChainId || 8453,
        srcToken: BMN_TOKEN,
        srcAmount: params.srcAmount,
        dstChainId: params.dstChainId || 10,
        dstToken: BMN_TOKEN,
        dstAmount: params.dstAmount,
        secret,
      });
      
      // Store secret
      await this.secretManager.storeSecret(hashlock, secret);
      
      // Save order for Bob to process
      const orderData = {
        order: orderResult.order,
        signature: orderResult.signature,
        extensionData: orderResult.extensionData,
        chainId: params.srcChainId || 8453,
        hashlock,
        timestamp: Date.now(),
      };
      
      await Deno.mkdir("./pending-orders", { recursive: true });
      await Deno.writeTextFile(
        `./pending-orders/${hashlock}.json`,
        JSON.stringify(orderData, null, 2)
      );
      
      console.log(`✅ Order created and saved: ${hashlock}`);
      this.stats.ordersCreated++;
      
      return hashlock;
    } catch (error) {
      console.error(`❌ Failed to create order:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Deposit tokens to source escrow
   */
  private async depositToSourceEscrow(
    escrowAddress: Address,
    amount: bigint,
    chainId: number
  ): Promise<void> {
    try {
      const wallet = chainId === 10 ? this.optimismWallet : this.baseWallet;
      const client = chainId === 10 ? this.optimismClient : this.baseClient;
      
      console.log(`\n💸 Depositing ${amount} tokens to source escrow ${escrowAddress}`);
      
      // Approve tokens
      const approveTx = await wallet.writeContract({
        address: BMN_TOKEN,
        abi: erc20Abi,
        functionName: "approve",
        args: [escrowAddress, amount],
      });
      
      await client.waitForTransactionReceipt({ hash: approveTx });
      console.log(`   Approved tokens`);
      
      // Transfer tokens
      const transferTx = await wallet.writeContract({
        address: BMN_TOKEN,
        abi: erc20Abi,
        functionName: "transfer",
        args: [escrowAddress, amount],
      });
      
      const receipt = await client.waitForTransactionReceipt({ hash: transferTx });
      console.log(`✅ Deposited tokens: ${receipt.transactionHash}`);
      
      this.stats.depositsCompleted++;
      
      // Update state
      const swaps = await this.swapStateManager.getPendingSwaps();
      const swap = swaps.find(s => s.srcEscrow === escrowAddress);
      if (swap) {
        await this.swapStateManager.updateSwapStatus(
          swap.orderHash,
          SwapStatus.ALICE_DEPOSITED,
          {
            srcDepositedAt: Date.now(),
          }
        );
      }
    } catch (error) {
      console.error(`❌ Failed to deposit to source escrow:`, error);
      this.stats.errors++;
      
      // Retry logic
      setTimeout(() => this.depositToSourceEscrow(escrowAddress, amount, chainId), 
        this.config.retryBackoffMs);
    }
  }

  /**
   * Reveal secret and withdraw from destination
   */
  private async revealSecretAndWithdraw(swap: any): Promise<void> {
    try {
      if (!swap.secret || !swap.dstEscrow) {
        throw new Error("Missing secret or destination escrow");
      }
      
      console.log(`\n🔓 Revealing secret and withdrawing from destination`);
      
      // Reveal secret (which also withdraws)
      const txHash = await this.secretRevealer.revealSecret(
        swap.dstEscrow,
        swap.secret,
        swap.dstChainId,
        this.config.privateKey
      );
      
      console.log(`✅ Secret revealed and funds withdrawn: ${txHash}`);
      
      await this.swapStateManager.updateSwapStatus(
        swap.orderHash,
        SwapStatus.DEST_WITHDRAWN,
        {
          dstWithdrawnAt: Date.now(),
        }
      );
      
      this.stats.withdrawalsCompleted++;
    } catch (error) {
      console.error(`❌ Failed to reveal secret:`, error);
      this.stats.errors++;
      
      // Retry logic
      const retryCount = await this.swapStateManager.incrementRetryCount(swap.orderHash);
      if (retryCount < this.config.maxRetries) {
        console.log(`🔄 Will retry (attempt ${retryCount + 1}/${this.config.maxRetries})`);
        setTimeout(
          () => this.revealSecretAndWithdraw(swap),
          this.config.retryBackoffMs * Math.pow(2, retryCount)
        );
      }
    }
  }

  /**
   * Start background tasks
   */
  private startBackgroundTasks(): void {
    // Check for pending actions
    setInterval(async () => {
      if (this.isRunning) {
        // Check for swaps awaiting secret reveal
        const awaitingReveal = await this.swapStateManager.getSwapsAwaitingSecretReveal();
        for (const swap of awaitingReveal) {
          if (swap.alice === this.account.address) {
            console.log(`🔄 Retrying secret reveal for ${swap.orderHash}`);
            await this.revealSecretAndWithdraw(swap);
          }
        }
        
        // Check for deposits we need to make
        const awaitingDeposit = await this.swapStateManager.getSwapsByStatus(
          SwapStatus.SOURCE_ESCROW_CREATED
        );
        for (const swap of awaitingDeposit) {
          if (swap.alice === this.account.address && swap.srcEscrow && !swap.srcDepositedAt) {
            console.log(`🔄 Retrying deposit for ${swap.orderHash}`);
            await this.depositToSourceEscrow(
              swap.srcEscrow,
              swap.srcAmount,
              swap.srcChainId
            );
          }
        }
      }
    }, 30000); // Every 30 seconds
    
    // Print statistics
    setInterval(() => {
      if (this.isRunning) {
        const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
        console.log(`\n📊 Alice V3 Statistics:`);
        console.log(`   Uptime: ${uptime}s`);
        console.log(`   Orders Created: ${this.stats.ordersCreated}`);
        console.log(`   Deposits Completed: ${this.stats.depositsCompleted}`);
        console.log(`   Secrets Revealed: ${this.stats.secretsRevealed}`);
        console.log(`   Withdrawals: ${this.stats.withdrawalsCompleted}`);
        console.log(`   Errors: ${this.stats.errors}`);
      }
    }, 60000); // Every minute
  }
}

// Main execution
async function main() {
  const config: ServiceConfig = {
    privateKey: Deno.env.get("ALICE_PRIVATE_KEY") || "",
    ankrApiKey: Deno.env.get("ANKR_API_KEY"),
    pollingInterval: parseInt(Deno.env.get("ALICE_POLLING_INTERVAL") || "10000"),
    healthPort: parseInt(Deno.env.get("ALICE_HEALTH_PORT") || "8001"),
    indexerUrl: Deno.env.get("INDEXER_URL") || "https://index-bmn.up.railway.app",
    autoDepositToSource: Deno.env.get("AUTO_DEPOSIT_TO_SOURCE") !== "false",
    autoRevealSecret: Deno.env.get("AUTO_REVEAL_SECRET") !== "false",
    autoWithdraw: Deno.env.get("AUTO_WITHDRAW") !== "false",
    maxRetries: parseInt(Deno.env.get("MAX_RETRIES") || "3"),
    retryBackoffMs: parseInt(Deno.env.get("RETRY_BACKOFF_MS") || "5000"),
  };
  
  if (!config.privateKey) {
    console.error("❌ ALICE_PRIVATE_KEY required");
    Deno.exit(1);
  }
  
  // Create necessary directories
  await Deno.mkdir("./pending-orders", { recursive: true });
  await Deno.mkdir("./data/kv", { recursive: true });
  
  const service = new AliceServiceV3(config);
  await service.start();
}

// Support programmatic usage
export { AliceServiceV3 };

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}