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
import { TokenApprovalManager } from "../utils/token-approvals.ts";
import { PostInteractionEventMonitor } from "../monitoring/postinteraction-events.ts";
import { PostInteractionErrorHandler } from "../utils/postinteraction-errors.ts";

// Import ABIs
import CrossChainEscrowFactoryV2Abi from "../../abis/CrossChainEscrowFactoryV2.json" with { type: "json" };
import SimpleLimitOrderProtocolAbi from "../../abis/SimpleLimitOrderProtocol.json" with { type: "json" };
import EscrowSrcV2Abi from "../../abis/EscrowSrcV2.json" with { type: "json" };
import EscrowDstV2Abi from "../../abis/EscrowDstV2.json" with { type: "json" };

// Factory v2.2.0 address with PostInteraction support (same on Base and Optimism)
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
    // First, check for locally stored orders from Alice
    await this.processLocalOrders();
    
    // Then check indexer for any additional swaps
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
   * Process locally stored order files from Alice
   */
  private async processLocalOrders() {
    const ordersDir = "./pending-orders";
    
    try {
      // Check if orders directory exists
      const dirInfo = await Deno.stat(ordersDir);
      if (!dirInfo.isDirectory) return;
      
      // Read all order files
      for await (const entry of Deno.readDir(ordersDir)) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          const orderPath = `${ordersDir}/${entry.name}`;
          
          try {
            const orderData = JSON.parse(await Deno.readTextFile(orderPath));
            
            // For limit orders, the resolver fills any order it finds
            // The order maker/receiver is Alice, we're just the filler
            console.log(`📄 Found order from maker: ${orderData.order.maker}`);
            
            const orderHash = orderData.hashlock; // Using hashlock as identifier
            
            // Skip if already processed
            if (this.processedOrders.has(orderHash)) {
              continue;
            }
            
            console.log(`📄 Found local order file: ${entry.name}`);
            console.log(`   Hashlock: ${orderData.hashlock}`);
            console.log(`   Chain: ${orderData.chainId}`);
            
            // Fill the order
            const success = await this.fillLocalOrder(orderData);
            
            if (success) {
              this.processedOrders.add(orderHash);
              
              // Move processed file to completed directory
              const completedDir = "./completed-orders";
              await Deno.mkdir(completedDir, { recursive: true });
              await Deno.rename(orderPath, `${completedDir}/${entry.name}`);
            } else {
              console.log(`⚠️ Order not filled, will retry in next cycle`);
            }
            
          } catch (error) {
            console.error(`❌ Failed to process order file ${entry.name}:`, error);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist yet, which is fine
      if (error instanceof Deno.errors.NotFound) {
        return;
      }
      console.error("❌ Error reading orders directory:", error);
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
    // Attempt to resolve the signed order payload by hashlock from local storage
    try {
      const localPath = `./pending-orders/${swap.hashlock}.json`;
      const fileInfo = await Deno.stat(localPath).catch(() => null);
      if (!fileInfo || !fileInfo.isFile) {
        console.log(`⚠️ No local payload found for ${swap.orderHash} (${swap.hashlock}). Skipping.`);
        return;
      }

      const raw = await Deno.readTextFile(localPath);
      const orderData = JSON.parse(raw);
      console.log(`📦 Loaded local order payload for ${swap.orderHash}. Proceeding to fill…`);
      const success = await this.fillLocalOrder(orderData);
      if (!success) {
        console.log(`⚠️ Failed to fill order ${swap.orderHash} from local payload`);
      }
    } catch (error) {
      console.error(`❌ fillLimitOrder error for ${swap.orderHash}:`, error);
    }
  }

  /**
   * Fill a local order from Alice through SimpleLimitOrderProtocol
   * Returns true if successful, false otherwise
   */
  private async fillLocalOrder(orderData: any): Promise<boolean> {
    try {
      const chainId = orderData.chainId;
      const wallet = chainId === base.id ? this.baseWallet : this.optimismWallet;
      const client = chainId === base.id ? this.baseClient : this.optimismClient;
      const limitOrderProtocol = chainId === base.id ? LIMIT_ORDER_PROTOCOL_BASE : LIMIT_ORDER_PROTOCOL_OPTIMISM;
      
      console.log(`🔨 Filling order on chain ${chainId} via SimpleLimitOrderProtocol`);

      // Check and approve tokens if needed
      const BMN_TOKEN = CREATE3_ADDRESSES.BMN_TOKEN as Address;
      const takingAmount = BigInt(orderData.order.takingAmount);
      
      // Check current allowance for Limit Order Protocol
      const currentAllowance = await client.readContract({
        address: BMN_TOKEN,
        abi: parseAbi(["function allowance(address owner, address spender) view returns (uint256)"]),
        functionName: "allowance",
        args: [this.account.address, limitOrderProtocol],
      });
      
      if (currentAllowance < takingAmount) {
        console.log(`🔓 Approving BMN tokens for Limit Order Protocol...`);
        console.log(`   Current allowance: ${currentAllowance}`);
        console.log(`   Required: ${takingAmount}`);
        
        const approveHash = await wallet.writeContract({
          address: BMN_TOKEN,
          abi: parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]),
          functionName: "approve",
          args: [limitOrderProtocol, takingAmount * 10n], // Approve 10x for future orders
        });
        
        const approveReceipt = await client.waitForTransactionReceipt({ hash: approveHash });
        console.log(`✅ Protocol approval tx: ${approveHash}`);
        console.log(`   Gas used: ${approveReceipt.gasUsed}`);
      } else {
        console.log(`✅ Sufficient allowance already set for protocol: ${currentAllowance}`);
      }
      
      // CRITICAL for v2.2.0: Also approve Factory for PostInteraction token transfers
      console.log(`
🏭 Checking Factory approval (v2.2.0 requirement)...`);
      const approvalManager = new TokenApprovalManager(FACTORY_V2_ADDRESS);
      const factoryApprovalHash = await approvalManager.ensureApproval(
        client,
        wallet,
        BMN_TOKEN,
        this.account.address,
        takingAmount
      );
      
      if (factoryApprovalHash) {
        console.log(`✅ Factory approved for PostInteraction transfers`);
      }

      // Reconstruct the order structure
      const order: OrderData = {
        salt: BigInt(orderData.order.salt),
        maker: orderData.order.maker as Address,
        receiver: orderData.order.receiver as Address,
        makerAsset: orderData.order.makerAsset as Address,
        takerAsset: orderData.order.takerAsset as Address,
        makingAmount: BigInt(orderData.order.makingAmount),
        takingAmount: BigInt(orderData.order.takingAmount),
        makerTraits: BigInt(orderData.order.makerTraits),
      };

      // Extract signature components (r, vs) from the signature
      // Signature is 65 bytes: r (32) + s (32) + v (1)
      // For fillOrder, vs is packed as s with v in the highest bit
      const signature = orderData.signature as `0x${string}`;
      const r = signature.slice(0, 66) as `0x${string}`; // 0x + 64 hex chars = 32 bytes
      
      // Extract s and v
      const s = signature.slice(66, 130); // 64 hex chars = 32 bytes
      const v = signature.slice(130, 132); // 2 hex chars = 1 byte
      
      // Pack v into the highest bit of s to create vs
      // If v is 28, set the highest bit of s
      const vNum = parseInt(v, 16);
      let sWithV = s;
      if (vNum === 28 || vNum === 1) {
        // Set the highest bit by ORing with 0x80...
        const sBigInt = BigInt(`0x${s}`);
        const vMask = BigInt("0x8000000000000000000000000000000000000000000000000000000000000000");
        const packedBigInt = sBigInt | vMask;
        sWithV = packedBigInt.toString(16).padStart(64, '0');
      }
      const vs = `0x${sWithV}` as `0x${string}`;

      // Build taker traits with extension
      // The extension contains factory address + ExtraDataArgs
      const extensionData = orderData.extensionData as `0x${string}`;
      
      // TakerTraits for fillOrderArgs:
      // When using fillOrderArgs with extension data, we pass the extension separately
      // The takerTraits should be 0 for a simple fill with no special flags
      const takerTraits = 0n; // Simple fill, no special flags needed

      console.log(`📋 Order details:`);
      console.log(`   Maker: ${order.maker}`);
      console.log(`   Making: ${order.makingAmount} tokens`);
      console.log(`   Taking: ${order.takingAmount} tokens`);
      console.log(`   Extension: ${extensionData.slice(0, 42)}...`);

      // Fill the order through SimpleLimitOrderProtocol with error handling
      let hash: Hash;
      let receipt: any;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          // Simulate transaction first to catch errors early
          const { request } = await client.simulateContract({
            address: limitOrderProtocol,
            abi: SimpleLimitOrderProtocolAbi.abi,
            functionName: "fillOrderArgs",
            args: [
              order,
              r,
              vs,
              order.makingAmount, // Fill full amount
              takerTraits,
              extensionData, // Args containing extension data
            ],
            account: this.account,
          });

          hash = await wallet.writeContract(request);
          console.log(`📝 Fill order transaction sent: ${hash}`);

          // Wait for confirmation
          receipt = await client.waitForTransactionReceipt({ hash });
          break; // Success, exit retry loop
          
        } catch (error) {
          console.error(`❌ Error filling order (attempt ${retryCount + 1}/${maxRetries})`);
          
          // Handle the error
          const errorContext = {
            orderHash: orderData.hashlock,
            resolverAddress: this.account.address,
            factoryAddress: FACTORY_V2_ADDRESS,
            tokenAddress: order.takerAsset,
            amount: order.takingAmount,
          };
          
          try {
            const recovery = await PostInteractionErrorHandler.handleError(error, errorContext);
            
            if (recovery.retry && retryCount < maxRetries - 1) {
              retryCount++;
              
              // Take action based on recovery suggestion
              if (recovery.action === "APPROVE_FACTORY") {
                console.log("🔄 Re-approving factory...");
                const approvalManager = new TokenApprovalManager(FACTORY_V2_ADDRESS);
                await approvalManager.ensureApproval(
                  client,
                  wallet,
                  order.takerAsset,
                  this.account.address,
                  order.takingAmount
                );
              } else if (recovery.action === "WAIT_AND_RETRY") {
                console.log("⏳ Waiting before retry...");
                await new Promise(resolve => setTimeout(resolve, 5000));
              }
              
              continue; // Retry the transaction
            } else {
              throw error; // Max retries reached or unrecoverable
            }
          } catch (handlerError) {
            // Error handler threw, meaning unrecoverable error
            PostInteractionErrorHandler.logError(error, true);
            throw handlerError;
          }
        }
      }
      
      if (!receipt) {
        throw new Error(`Failed to fill order after ${maxRetries} attempts`);
      }
      console.log(`✅ Order filled successfully in tx: ${receipt.transactionHash}`);
      console.log(`   Gas used: ${receipt.gasUsed}`);
      console.log(`   Block: ${receipt.blockNumber}`);

      // Parse PostInteraction events from the receipt
      console.log(`🔍 Parsing PostInteraction events...`);
      const eventMonitor = new PostInteractionEventMonitor(client, FACTORY_V2_ADDRESS);
      const events = eventMonitor.parsePostInteractionEvents(receipt);
      
      if (events.postInteractionExecuted) {
        console.log(`✨ PostInteraction executed successfully!`);
        console.log(`   Order Hash: ${events.postInteractionExecuted.orderHash}`);
        console.log(`   Source Escrow: ${events.postInteractionExecuted.srcEscrow}`);
        console.log(`   Destination Escrow: ${events.postInteractionExecuted.dstEscrow}`);
        
        // Store the secret with the actual escrow address
        if (orderData.secret) {
          await this.secretManager.storeSecret({
            secret: orderData.secret as `0x${string}`,
            orderHash: orderData.hashlock as `0x${string}`,
            escrowAddress: events.postInteractionExecuted.srcEscrow, // Use actual escrow address
            chainId: chainId,
          });
          console.log(`🔐 Secret stored for escrow ${events.postInteractionExecuted.srcEscrow}`);
        }
      } else if (events.postInteractionFailed) {
        console.error(`❌ PostInteraction failed: ${events.postInteractionFailed.reason}`);
        throw new Error(`PostInteraction failed: ${events.postInteractionFailed.reason}`);
      } else {
        console.warn(`⚠️ No PostInteraction events found in transaction`);
      }
      
      // Log escrow creation events
      if (events.escrowsCreated.length > 0) {
        console.log(`📦 Created ${events.escrowsCreated.length} escrows:`);
        for (const escrow of events.escrowsCreated) {
          console.log(`   - ${escrow.escrowAddress} (type: ${escrow.escrowType === 0 ? 'Source' : 'Destination'})`);
        }
      }
      
      return true; // Success

    } catch (error) {
      console.error(`❌ Failed to fill local order:`, error);
      return false; // Failed
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