import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import { PonderClient } from "../indexer/ponder-client.ts";
import { SecretManager } from "../state/SecretManager.ts";
import CrossChainEscrowFactoryAbi from "../../abis/CrossChainEscrowFactory.json" with { type: "json" };
import EscrowDstAbi from "../../abis/EscrowDst.json" with { type: "json" };
import EscrowSrcAbi from "../../abis/EscrowSrc.json" with { type: "json" };

const FACTORY_ADDRESS = "0xB916C3edbFe574fFCBa688A6B92F72106479bD6c";
const INDEXER_URL = Deno.env.get("INDEXER_URL") || "http://localhost:42069";
const RESOLVER_PRIVATE_KEY = Deno.env.get("RESOLVER_PRIVATE_KEY") || "";
const ANKR_API_KEY = Deno.env.get("ANKR_API_KEY") || "";

interface ResolverConfig {
  indexerUrl?: string;
  privateKey?: string;
  ankrApiKey?: string;
  pollingInterval?: number;
}

export class SimpleResolver {
  private ponderClient: PonderClient;
  private secretManager: SecretManager;
  private account: any;
  private baseClient: any;
  private optimismClient: any;
  private baseWallet: any;
  private optimismWallet: any;
  private isRunning = false;
  private pollingInterval: number;

  constructor(config: ResolverConfig = {}) {
    this.ponderClient = new PonderClient({
      url: config.indexerUrl || INDEXER_URL,
    });

    // Initialize local state manager
    this.secretManager = new SecretManager();

    const privateKey = config.privateKey || RESOLVER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("RESOLVER_PRIVATE_KEY not set");
    }

    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    this.pollingInterval = config.pollingInterval || 10000; // 10 seconds

    const ankrKey = config.ankrApiKey || ANKR_API_KEY;

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
  }

  async start() {
    console.log(`🚀 Starting simplified resolver with address: ${this.account.address}`);
    
    // Initialize local state
    await this.secretManager.init();
    const stats = await this.secretManager.getStatistics();
    console.log(`📊 SecretManager stats: ${JSON.stringify(stats)}`);
    
    this.isRunning = true;

    // Poll for pending orders
    while (this.isRunning) {
      try {
        await this.processPendingOrders();
        await this.monitorForRevealedSecrets();
        await this.processLocalSecrets();
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

  private async processPendingOrders() {
    const pendingSwaps = await this.ponderClient.getPendingAtomicSwaps(this.account.address);
    
    for (const swap of pendingSwaps) {
      if (swap.status === "src_created" && !swap.dstEscrowAddress) {
        console.log(`🎯 Processing pending swap: ${swap.orderHash}`);
        await this.deployDestinationEscrow(swap);
      }
    }
  }

  private async handleNewSrcEscrow(srcEscrow: any) {
    // Check if we should take this order
    if (!this.isProfitable(srcEscrow)) {
      console.log(`💸 Order not profitable, skipping: ${srcEscrow.orderHash}`);
      return;
    }

    // Check if destination escrow already exists
    const existingDst = await this.ponderClient.getDstEscrowByHashlock(srcEscrow.hashlock);
    if (existingDst) {
      console.log(`✅ Destination escrow already exists for hashlock: ${srcEscrow.hashlock}`);
      return;
    }

    // Deploy destination escrow
    await this.deployDestinationEscrow(srcEscrow);
  }

  private isProfitable(order: any): boolean {
    // Simple profitability check - can be enhanced
    const minProfit = BigInt(1e16); // 0.01 token minimum profit
    const profit = order.dstSafetyDeposit - order.srcSafetyDeposit;
    return profit >= minProfit;
  }

  private async deployDestinationEscrow(swap: any) {
    try {
      const dstChainId = Number(swap.dstChainId);
      const wallet = dstChainId === base.id ? this.baseWallet : this.optimismWallet;
      
      console.log(`🔨 Deploying destination escrow on chain ${dstChainId}`);

      // Calculate timelock (current time + 10 minutes for demo)
      const srcCancellationTimestamp = BigInt(Math.floor(Date.now() / 1000) + 600);

      const { request } = await wallet.simulateContract({
        address: FACTORY_ADDRESS,
        abi: CrossChainEscrowFactoryAbi.abi,
        functionName: "deployEscrowDst",
        args: [
          swap.hashlock,
          swap.dstTaker,
          srcCancellationTimestamp,
        ],
      });

      const hash = await wallet.writeContract(request);
      console.log(`📝 Transaction sent: ${hash}`);

      // Wait for confirmation
      const receipt = await wallet.waitForTransactionReceipt({ hash });
      console.log(`✅ Destination escrow deployed in tx: ${receipt.transactionHash}`);
    } catch (error) {
      console.error(`❌ Failed to deploy destination escrow:`, error);
    }
  }

  /**
   * Monitor for secrets revealed on-chain by makers and store them locally
   */
  private async monitorForRevealedSecrets() {
    // Temporarily disabled: The escrowWithdrawal schema doesn't have hashlock and orderHash fields
    // These would need to be added to the indexer schema or computed from other data
    return;
    
    // try {
    //   // Get recently revealed secrets from indexer (this is OK - we're monitoring blockchain events)
    //   const withdrawals = await this.ponderClient.getRecentWithdrawals();
    //   
    //   for (const withdrawal of withdrawals) {
    //     // Check if we already have this secret
    //     const hasSecret = await this.secretManager.hasSecret(withdrawal.hashlock);
    //     if (!hasSecret && withdrawal.secret) {
    //       console.log(`🔍 Found new secret revealed on-chain for hashlock: ${withdrawal.hashlock}`);
    //       
    //       // Store it locally for our use
    //       await this.secretManager.storeSecret({
    //         secret: withdrawal.secret as `0x${string}`,
    //         orderHash: withdrawal.orderHash as `0x${string}`,
    //         escrowAddress: withdrawal.escrowAddress,
    //         chainId: withdrawal.chainId
    //       });
    //     }
    //   }
    // } catch (error) {
    //   console.error("❌ Error monitoring for revealed secrets:", error);
    // }
  }

  /**
   * Process secrets stored locally to withdraw from source escrows
   */
  private async processLocalSecrets() {
    // Get OUR locally stored secrets
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

  private async withdrawFromSource(escrow: any, secret: string): Promise<boolean> {
    try {
      const chainId = Number(escrow.chainId);
      const wallet = chainId === base.id ? this.baseWallet : this.optimismWallet;
      
      console.log(`💰 Withdrawing from source escrow: ${escrow.escrowAddress}`);

      const { request } = await wallet.simulateContract({
        address: escrow.escrowAddress,
        abi: EscrowSrcAbi.abi,
        functionName: "withdraw",
        args: [secret],
      });

      const hash = await wallet.writeContract(request);
      console.log(`📝 Withdrawal transaction sent: ${hash}`);

      const receipt = await wallet.waitForTransactionReceipt({ hash });
      console.log(`✅ Successfully withdrew from source escrow in tx: ${receipt.transactionHash}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to withdraw from source:`, error);
      await this.secretManager.markFailed(escrow.hashlock, error.message);
      return false;
    }
  }
}