import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
  decodeAbiParameters,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import { PonderClient, type AtomicSwap } from "../indexer/ponder-client.ts";
import { SecretManager } from "../state/SecretManager.ts";
import { CREATE3_ADDRESSES } from "../config/contracts.ts";

// Import ABIs
import CrossChainEscrowFactoryV2Abi from "../../abis/CrossChainEscrowFactoryV2.json" with { type: "json" };
import SimpleLimitOrderProtocolAbi from "../../abis/SimpleLimitOrderProtocol.json" with { type: "json" };
import EscrowSrcV2Abi from "../../abis/EscrowSrcV2.json" with { type: "json" };
import EscrowDstV2Abi from "../../abis/EscrowDstV2.json" with { type: "json" };

// Factory v2.1.0 address (same on Base and Optimism)
const FACTORY_V2_ADDRESS = CREATE3_ADDRESSES.ESCROW_FACTORY_V2;

// SimpleLimitOrderProtocol addresses
const LIMIT_ORDER_PROTOCOL_BASE = CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_BASE;
const LIMIT_ORDER_PROTOCOL_OPTIMISM = CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_OPTIMISM;

interface ResolverConfig {
  indexerUrl?: string;
  privateKey?: string;
  ankrApiKey?: string;
  pollingInterval?: number;
  minProfitBps?: number; // Minimum profit in basis points (100 = 1%)
}

interface OrderData {
  salt: bigint;
  maker: Address;
  receiver: Address;
  makerAsset: Address;
  takerAsset: Address;
  makingAmount: bigint;
  takingAmount: bigint;
  makerTraits: bigint;
}

export class UnifiedResolver {
  private ponderClient: PonderClient;
  private secretManager: SecretManager;
  private account: any;
  private baseClient: any;
  private optimismClient: any;
  private baseWallet: any;
  private optimismWallet: any;
  private isRunning = false;
  private pollingInterval: number;
  private minProfitBps: number;
  private processedOrders = new Set<string>();

  constructor(config: ResolverConfig = {}) {
    // Initialize indexer client
    this.ponderClient = new PonderClient({
      url: config.indexerUrl || Deno.env.get("INDEXER_URL") || "http://localhost:42069",
    });

    // Initialize local state manager
    this.secretManager = new SecretManager();

    const privateKey = config.privateKey || Deno.env.get("RESOLVER_PRIVATE_KEY");
    if (!privateKey) {
      throw new Error("RESOLVER_PRIVATE_KEY not set");
    }

    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    this.pollingInterval = config.pollingInterval || 10000; // 10 seconds
    this.minProfitBps = config.minProfitBps || 50; // 0.5% minimum profit

    const ankrKey = config.ankrApiKey || Deno.env.get("ANKR_API_KEY") || "";

    // Set up clients for Base and Optimism
    this.baseClient = createPublicClient({
      chain: base,
      transport: http(`https://rpc.ankr.com/base/${ankrKey}`),
    });

    this.optimismClient = createPublicClient({
      chain: optimism,
      transport: http(`https://rpc.ankr.com/optimism/${ankrKey}`),
    });

    this.baseWallet = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(`https://rpc.ankr.com/base/${ankrKey}`),
    });

    this.optimismWallet = createWalletClient({
      account: this.account,
      chain: optimism,
      transport: http(`https://rpc.ankr.com/optimism/${ankrKey}`),
    });

    console.log(`🚀 Unified Resolver initialized`);
    console.log(`📍 Factory V2: ${FACTORY_V2_ADDRESS}`);
    console.log(`📍 Base Limit Order Protocol: ${LIMIT_ORDER_PROTOCOL_BASE}`);
    console.log(`📍 Optimism Limit Order Protocol: ${LIMIT_ORDER_PROTOCOL_OPTIMISM}`);
  }

  async start() {
    console.log(`🚀 Starting unified resolver with address: ${this.account.address}`);
    
    // Initialize local state
    await this.secretManager.init();
    const stats = await this.secretManager.getStatistics();
    console.log(`📊 SecretManager stats: ${JSON.stringify(stats)}`);
    
    this.isRunning = true;

    // Main loop
    while (this.isRunning) {
      try {
        // Monitor for limit orders via indexer
        await this.processPendingOrders();
        
        // Process locally stored secrets for withdrawals
        await this.processLocalSecrets();
        
        // Monitor for revealed secrets on-chain
        await this.monitorForRevealedSecrets();
      } catch (error) {
        console.error("❌ Error in main loop:", error);
      }
      
      await new Promise((resolve) => setTimeout(resolve, this.pollingInterval));
    }
  }

  async stop() {
    console.log("🛑 Stopping resolver...");
    this.isRunning = false;
    await this.secretManager.close();
  }

  /**
   * Process pending atomic swaps from the indexer
   */
  private async processPendingOrders() {
    const pendingSwaps = await this.ponderClient.getPendingAtomicSwaps(this.account.address);
    
    for (const swap of pendingSwaps) {
      // Skip if already processed
      if (this.processedOrders.has(swap.orderHash)) {
        continue;
      }

      // Check if we should fill this order
      if (swap.status === "src_created" && !swap.dstEscrowAddress) {
        console.log(`🎯 Found pending swap: ${swap.orderHash}`);
        
        // Check profitability
        if (this.isProfitable(swap)) {
          console.log(`✅ Order is profitable, proceeding to fill`);
          await this.fillLimitOrder(swap);
          this.processedOrders.add(swap.orderHash);
        } else {
          console.log(`💸 Order not profitable, skipping`);
        }
      }
    }
  }

  /**
   * Check if an order is profitable based on safety deposits
   */
  private isProfitable(swap: AtomicSwap): boolean {
    const srcDeposit = swap.srcAmount || BigInt(0);
    const dstDeposit = swap.dstAmount || BigInt(0);
    
    // Calculate profit in basis points
    if (srcDeposit === BigInt(0)) return false;
    
    const profitBps = ((dstDeposit - srcDeposit) * BigInt(10000)) / srcDeposit;
    
    console.log(`💰 Profit calculation: ${profitBps.toString()} bps (min: ${this.minProfitBps})`);
    
    return profitBps >= BigInt(this.minProfitBps);
  }

  /**
   * Fill a limit order through SimpleLimitOrderProtocol
   */
  private async fillLimitOrder(swap: AtomicSwap) {
    try {
      const dstChainId = Number(swap.dstChainId);
      const wallet = dstChainId === base.id ? this.baseWallet : this.optimismWallet;
      const client = dstChainId === base.id ? this.baseClient : this.optimismClient;
      const limitOrderProtocol = dstChainId === base.id ? LIMIT_ORDER_PROTOCOL_BASE : LIMIT_ORDER_PROTOCOL_OPTIMISM;
      
      console.log(`🔨 Filling order on chain ${dstChainId} via SimpleLimitOrderProtocol`);

      // Get order details from the source escrow
      const srcEscrow = await this.ponderClient.getSrcEscrowByOrderHash(swap.orderHash);
      if (!srcEscrow) {
        console.error(`❌ Source escrow not found for order: ${swap.orderHash}`);
        return;
      }

      // Prepare order data for SimpleLimitOrderProtocol.fillOrder()
      // The order structure needs to match the protocol's expected format
      const orderData: OrderData = {
        salt: BigInt(srcEscrow.orderHash), // Use orderHash as salt
        maker: srcEscrow.maker as Address,
        receiver: this.account.address, // Resolver receives the tokens
        makerAsset: srcEscrow.dstToken as Address,
        takerAsset: srcEscrow.srcToken as Address,
        makingAmount: srcEscrow.dstAmount,
        takingAmount: srcEscrow.srcAmount,
        makerTraits: BigInt(0), // Default traits
      };

      // Generate signature for the order (placeholder - actual implementation needs proper signing)
      const r = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const vs = "0x0000000000000000000000000000000000000000000000000000000000000000";

      // Fill the order through SimpleLimitOrderProtocol
      const { request } = await client.simulateContract({
        address: limitOrderProtocol,
        abi: SimpleLimitOrderProtocolAbi.abi,
        functionName: "fillOrder",
        args: [
          orderData,
          r,
          vs,
          srcEscrow.srcAmount, // Amount to fill
          BigInt(0), // TakerTraits
        ],
        account: this.account,
      });

      const hash = await wallet.writeContract(request);
      console.log(`📝 Fill order transaction sent: ${hash}`);

      // Wait for confirmation
      const receipt = await client.waitForTransactionReceipt({ hash });
      console.log(`✅ Order filled successfully in tx: ${receipt.transactionHash}`);

      // After successful fill, the destination escrow should be created
      // Store any relevant information for later withdrawal
      const dstEscrowAddress = await this.getDstEscrowAddress(srcEscrow.hashlock, dstChainId);
      if (dstEscrowAddress) {
        console.log(`📍 Destination escrow created at: ${dstEscrowAddress}`);
      }

    } catch (error) {
      console.error(`❌ Failed to fill limit order:`, error);
    }
  }

  /**
   * Get the destination escrow address for a given hashlock
   */
  private async getDstEscrowAddress(hashlock: string, chainId: number): Promise<string | null> {
    const client = chainId === base.id ? this.baseClient : this.optimismClient;
    
    try {
      // Query the indexer for the destination escrow
      const dstEscrow = await this.ponderClient.getDstEscrowByHashlock(hashlock);
      return dstEscrow?.escrowAddress || null;
    } catch (error) {
      console.error(`❌ Failed to get destination escrow address:`, error);
      return null;
    }
  }

  /**
   * Monitor for secrets revealed on-chain and store them locally
   */
  private async monitorForRevealedSecrets() {
    try {
      // Get recently revealed secrets from indexer
      const withdrawals = await this.ponderClient.getRecentWithdrawals(20);
      
      for (const withdrawal of withdrawals) {
        if (withdrawal.secret && withdrawal.escrowAddress) {
          // Calculate hashlock from secret
          const { keccak256 } = await import("viem");
          const hashlock = keccak256(withdrawal.secret as `0x${string}`);
          
          // Check if we already have this secret
          const hasSecret = await this.secretManager.hasSecret(hashlock);
          if (!hasSecret) {
            console.log(`🔍 Found new secret revealed on-chain for hashlock: ${hashlock}`);
            
            // Store it locally for our use
            await this.secretManager.storeSecret({
              secret: withdrawal.secret as `0x${string}`,
              orderHash: withdrawal.orderHash as `0x${string}` || "0x",
              escrowAddress: withdrawal.escrowAddress,
              chainId: withdrawal.chainId,
            });
          }
        }
      }
    } catch (error) {
      console.error("❌ Error monitoring for revealed secrets:", error);
    }
  }

  /**
   * Process locally stored secrets to withdraw from source escrows
   */
  private async processLocalSecrets() {
    const pendingSecrets = await this.secretManager.getPendingSecrets();
    
    for (const secretRecord of pendingSecrets) {
      // Check if we have a source escrow we can withdraw from
      const srcEscrows = await this.ponderClient.getPendingSrcEscrows(this.account.address);
      const srcEscrow = srcEscrows.find(e => 
        e.hashlock === secretRecord.hashlock && 
        e.status === 'created'
      );

      if (srcEscrow) {
        const success = await this.withdrawFromSource(srcEscrow, secretRecord.secret);
        if (success) {
          // Mark as confirmed in our local state
          await this.secretManager.confirmSecret(
            secretRecord.hashlock,
            'tx_hash_placeholder', // In real implementation, get from withdrawal
            BigInt(100000) // Estimated gas used
          );
        }
      }
    }
  }

  /**
   * Withdraw tokens from source escrow using revealed secret
   */
  private async withdrawFromSource(escrow: any, secret: string): Promise<boolean> {
    try {
      const chainId = Number(escrow.chainId);
      const wallet = chainId === base.id ? this.baseWallet : this.optimismWallet;
      const client = chainId === base.id ? this.baseClient : this.optimismClient;
      
      console.log(`💰 Withdrawing from source escrow: ${escrow.escrowAddress}`);

      const { request } = await client.simulateContract({
        address: escrow.escrowAddress as Address,
        abi: EscrowSrcV2Abi.abi,
        functionName: "withdraw",
        args: [secret],
        account: this.account,
      });

      const hash = await wallet.writeContract(request);
      console.log(`📝 Withdrawal transaction sent: ${hash}`);

      const receipt = await client.waitForTransactionReceipt({ hash });
      console.log(`✅ Successfully withdrew from source escrow in tx: ${receipt.transactionHash}`);
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to withdraw from source:`, error);
      await this.secretManager.markFailed(escrow.hashlock, (error as Error).message);
      return false;
    }
  }

  /**
   * Get resolver statistics
   */
  async getStatistics() {
    const secretStats = await this.secretManager.getStatistics();
    
    return {
      resolverAddress: this.account.address,
      processedOrders: this.processedOrders.size,
      secrets: secretStats,
      isRunning: this.isRunning,
    };
  }
}

// Export a factory function for easy instantiation
export function createResolver(config?: ResolverConfig): UnifiedResolver {
  return new UnifiedResolver(config);
}

// Main entry point if run directly
if (import.meta.main) {
  const resolver = createResolver();
  
  // Handle graceful shutdown
  Deno.addSignalListener("SIGINT", async () => {
    console.log("\n🛑 Received SIGINT, shutting down gracefully...");
    await resolver.stop();
    Deno.exit(0);
  });

  // Start the resolver
  await resolver.start();
}