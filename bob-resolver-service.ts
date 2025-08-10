#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

/**
 * Bob-Resolver Unified Service
 *
 * This service combines Bob (taker) and Resolver (coordinator) functionalities:
 *
 * RESOLVER CAPABILITIES:
 * - Monitor pending orders from the indexer
 * - Fill Alice's limit orders using SimpleLimitOrderProtocol
 * - Ensure token approvals before filling orders
 * - Process orders from pending-orders directory
 *
 * BOB CAPABILITIES:
 * - Create destination escrows
 * - Withdraw from source escrows by revealing secrets
 * - Monitor for profitable swaps as a taker
 * - Manage own keys and secrets
 *
 * HTTP ENDPOINTS (Port 8002):
 * - GET  /health      - Service health check
 * - POST /fill-order  - Fill a specific limit order
 * - POST /withdraw    - Withdraw from an escrow
 * - GET  /stats       - Service statistics
 */

import {
  type Address,
  createPublicClient,
  createWalletClient,
  type Hash,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import { PonderClient } from "./src/indexer/ponder-client.ts";
import { SecretManager } from "./src/state/SecretManager.ts";
import { EscrowWithdrawManager } from "./src/utils/escrow-withdraw.ts";
import {
  ensureLimitOrderApprovals,
  fillLimitOrder,
  type FillOrderParams,
  type LimitOrderData,
} from "./src/utils/limit-order.ts";
import { CREATE3_ADDRESSES } from "./src/config/contracts.ts";

// Service configuration
interface UnifiedServiceConfig {
  indexerUrl: string;
  privateKey: string;
  ankrApiKey?: string;
  pollingInterval: number;
  minProfitBps: number;
  healthPort: number;
}

class BobResolverService {
  private config: UnifiedServiceConfig;
  private ponderClient: PonderClient;
  private secretManager: SecretManager;
  private withdrawManager: EscrowWithdrawManager;
  private account: any;
  private baseClient: any;
  private optimismClient: any;
  private baseWallet: any;
  private optimismWallet: any;
  private isRunning = false;
  private processedOrders = new Set<string>();
  private stats = {
    ordersProcessed: 0,
    ordersFilled: 0,
    escrowsCreated: 0,
    withdrawalsCompleted: 0,
    errors: 0,
    startTime: Date.now(),
  };

  constructor(config: UnifiedServiceConfig) {
    this.config = config;

    // Initialize components
    this.ponderClient = new PonderClient({ url: config.indexerUrl });
    this.secretManager = new SecretManager();
    this.withdrawManager = new EscrowWithdrawManager();

    // Setup account
    this.account = privateKeyToAccount(config.privateKey as `0x${string}`);

    // Setup RPC clients
    const rpcUrl = (chain: string) => {
      const ankrKey = config.ankrApiKey || "";
      return `https://rpc.ankr.com/${chain}/${ankrKey}`;
    };

    this.baseClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl("base")),
    });

    this.optimismClient = createPublicClient({
      chain: optimism,
      transport: http(rpcUrl("optimism")),
    });

    this.baseWallet = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(rpcUrl("base")),
    });

    this.optimismWallet = createWalletClient({
      account: this.account,
      chain: optimism,
      transport: http(rpcUrl("optimism")),
    });
  }

  /**
   * Start the unified service
   */
  async start() {
    if (this.isRunning) {
      console.log("⚠️ Service is already running");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Bob-Resolver unified service started");
    console.log(`   Resolver address: ${this.account.address}`);

    // Start monitoring loop
    this.monitorLoop();
  }

  /**
   * Stop the service
   */
  async stop() {
    this.isRunning = false;
    console.log("🛑 Bob-Resolver service stopped");
  }

  /**
   * Main monitoring loop
   */
  private async monitorLoop() {
    while (this.isRunning) {
      try {
        // Check for pending orders to fill (Resolver role)
        await this.checkPendingOrders();

        // Check for escrows to create (Bob role)
        await this.checkEscrowOpportunities();

        // Check for withdrawals to process (Bob role)
        await this.checkWithdrawals();

        // Wait before next iteration
        await new Promise((resolve) =>
          setTimeout(resolve, this.config.pollingInterval)
        );
      } catch (error) {
        console.error("❌ Error in monitoring loop:", error);
        this.stats.errors++;
      }
    }
  }

  /**
   * Check and process pending limit orders (Resolver functionality)
   */
  private async checkPendingOrders() {
    try {
      // Read pending orders from directory
      const pendingOrdersDir = "./pending-orders";
      const completedOrdersDir = "./completed-orders";

      // Check if directories exist
      try {
        await Deno.stat(pendingOrdersDir);
      } catch {
        console.log(`📁 Creating pending-orders directory...`);
        await Deno.mkdir(pendingOrdersDir, { recursive: true });
      }

      try {
        await Deno.stat(completedOrdersDir);
      } catch {
        console.log(`📁 Creating completed-orders directory...`);
        await Deno.mkdir(completedOrdersDir, { recursive: true });
      }

      // Read directory entries
      let entries;
      try {
        entries = Deno.readDir(pendingOrdersDir);
      } catch (error) {
        console.log(`⚠️ No pending orders to process`);
        return;
      }

      for await (const entry of entries) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          const orderPath = `${pendingOrdersDir}/${entry.name}`;
          const orderData = JSON.parse(await Deno.readTextFile(orderPath));

          // Skip if already processed
          const orderId = orderData.orderHash || entry.name;
          if (this.processedOrders.has(orderId)) continue;

          console.log(`📋 Processing order: ${orderId}`);
          this.stats.ordersProcessed++;

          // Check profitability
          if (await this.isProfitable(orderData)) {
            // Fill the order
            const success = await this.fillOrder(orderData);
            if (success) {
              this.stats.ordersFilled++;
              this.processedOrders.add(orderId);

              // Move to completed
              await Deno.rename(
                orderPath,
                `${completedOrdersDir}/${entry.name}`,
              );
              console.log(`✅ Order filled successfully: ${orderId}`);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking pending orders:", error);
    }
  }

  /**
   * Check for escrow creation opportunities (Bob functionality)
   */
  private async checkEscrowOpportunities() {
    try {
      // Query indexer for new swap opportunities
      const swaps = await this.ponderClient.getActiveSwaps();

      for (const swap of swaps) {
        if (!swap.escrowDst && swap.escrowSrc) {
          console.log(
            `🔍 Found opportunity to create destination escrow for swap ${swap.id}`,
          );

          // Create destination escrow as Bob
          const success = await this.createDestinationEscrow(swap);
          if (success) {
            this.stats.escrowsCreated++;
            console.log(`✅ Created destination escrow for swap ${swap.id}`);
          }
        }
      }
    } catch (error) {
      console.error("Error checking escrow opportunities:", error);
    }
  }

  /**
   * Check for withdrawals to process (Bob functionality)
   */
  private async checkWithdrawals() {
    try {
      // Check for revealed secrets that allow withdrawals
      const withdrawableEscrows = await this.withdrawManager
        .getWithdrawableEscrows();

      for (const escrow of withdrawableEscrows) {
        console.log(`💸 Processing withdrawal for escrow ${escrow.address}`);

        const success = await this.withdrawManager.withdraw(escrow);
        if (success) {
          this.stats.withdrawalsCompleted++;
          console.log(`✅ Withdrawal completed for escrow ${escrow.address}`);
        }
      }
    } catch (error) {
      console.error("Error checking withdrawals:", error);
    }
  }

  /**
   * Check if an order is profitable
   */
  private async isProfitable(order: any): Promise<boolean> {
    // Calculate expected profit
    const inputValue = BigInt(order.makerAmount || 0);
    const outputValue = BigInt(order.takerAmount || 0);

    if (inputValue === 0n) return false;

    const profitBps = Number((outputValue - inputValue) * 10000n / inputValue);
    return profitBps >= this.config.minProfitBps;
  }

  /**
   * Fill a limit order (Resolver functionality)
   */
  private async fillOrder(orderData: LimitOrderData): Promise<boolean> {
    try {
      // Determine which chain and wallet to use
      const chainId = orderData.chainId || 8453; // Default to Base
      const wallet = chainId === 10 ? this.optimismWallet : this.baseWallet;
      const client = chainId === 10 ? this.optimismClient : this.baseClient;

      // Determine protocol and factory addresses for the chain
      const protocolAddress = chainId === 10
        ? CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_OPTIMISM
        : CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_BASE;
      const factoryAddress = CREATE3_ADDRESSES.ESCROW_FACTORY_V2;

      // Ensure approvals (protocol + factory)
      await ensureLimitOrderApprovals(
        client,
        wallet,
        orderData.takerAsset as Address,
        protocolAddress,
        factoryAddress,
        BigInt(orderData.takerAmount),
      );

      // Fill the order using protocol; include extensionData
      const params: FillOrderParams = {
        order: orderData.order,
        signature: orderData.signature,
        extensionData: orderData.extensionData,
        fillAmount: BigInt(orderData.takerAmount),
        takerTraits: orderData.takerTraits || 0n,
      };

      const result = await fillLimitOrder(
        client,
        wallet,
        protocolAddress as Address,
        params,
        factoryAddress as Address,
      );
      console.log(`✅ Order filled with tx: ${result.transactionHash}`);

      return true;
    } catch (error) {
      console.error("Error filling order:", error);
      return false;
    }
  }

  /**
   * Create a destination escrow (Bob functionality)
   */
  private async createDestinationEscrow(swap: any): Promise<boolean> {
    try {
      // For v2.2.0 PostInteraction, destination escrows are created during fill.
      // We do not manually create dst escrows here. Leave as no-op.
      console.log(
        `Skipping manual dst escrow creation for swap ${swap.id} (PostInteraction handles it)`,
      );
      return false;
    } catch (error) {
      console.error("Error creating destination escrow:", error);
      return false;
    }
  }

  /**
   * Process a direct order request
   */
  async processOrder(orderData: any): Promise<any> {
    console.log("Processing direct order request");
    return await this.fillOrder(orderData);
  }

  /**
   * Process a withdrawal request
   */
  async processWithdrawal(withdrawData: any): Promise<any> {
    console.log("Processing withdrawal request");
    return await this.withdrawManager.withdraw(withdrawData);
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime,
      processedOrdersCount: this.processedOrders.size,
    };
  }
}

// Main execution
async function main() {
  // Load configuration
  const config: UnifiedServiceConfig = {
    indexerUrl: Deno.env.get("INDEXER_URL") || "http://localhost:42069",
    privateKey: Deno.env.get("BOB_PRIVATE_KEY") ||
      Deno.env.get("RESOLVER_PRIVATE_KEY") || "",
    ankrApiKey: Deno.env.get("ANKR_API_KEY"),
    pollingInterval: parseInt(Deno.env.get("POLLING_INTERVAL") || "10000"),
    minProfitBps: parseInt(Deno.env.get("MIN_PROFIT_BPS") || "0"),
    healthPort: parseInt(Deno.env.get("BOB_HEALTH_PORT") || "8002"),
  };

  // Validate configuration
  if (!config.privateKey) {
    console.error("❌ Error: BOB_PRIVATE_KEY or RESOLVER_PRIVATE_KEY required");
    Deno.exit(1);
  }

  console.log("🤖 Bob-Resolver Unified Service");
  console.log("================================");
  console.log(`📡 Indexer URL: ${config.indexerUrl}`);
  console.log(`⏱️  Polling: ${config.pollingInterval}ms`);
  console.log(`💰 Min Profit: ${config.minProfitBps} bps`);
  console.log(`🏥 Health Port: ${config.healthPort}`);

  // Create service instance
  const service = new BobResolverService(config);

  // Setup HTTP server
  const server = Deno.serve({ port: config.healthPort }, async (req) => {
    const url = new URL(req.url);

    switch (url.pathname) {
      case "/health":
        return new Response(
          JSON.stringify({
            status: "healthy",
            service: "bob-resolver-unified",
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );

      case "/stats":
        return new Response(JSON.stringify(service.getStats()), {
          headers: { "Content-Type": "application/json" },
        });

      case "/fill-order":
        if (req.method === "POST") {
          try {
            const orderData = await req.json();
            const result = await service.processOrder(orderData);
            return new Response(JSON.stringify({ success: true, result }), {
              headers: { "Content-Type": "application/json" },
            });
          } catch (error) {
            return new Response(
              JSON.stringify({ success: false, error: error.message }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
        }
        break;

      case "/withdraw":
        if (req.method === "POST") {
          try {
            const withdrawData = await req.json();
            const result = await service.processWithdrawal(withdrawData);
            return new Response(JSON.stringify({ success: true, result }), {
              headers: { "Content-Type": "application/json" },
            });
          } catch (error) {
            return new Response(
              JSON.stringify({ success: false, error: error.message }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
        }
        break;
    }

    return new Response("Not Found", { status: 404 });
  });

  // Start the service
  await service.start();

  // Handle shutdown
  const shutdown = async () => {
    console.log("\n🛑 Shutting down gracefully...");
    await service.stop();
    await server.shutdown();
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);

  console.log("\n✅ Service running. Press Ctrl+C to stop.\n");
}

if (import.meta.main) {
  main().catch(console.error);
}
