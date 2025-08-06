import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import { PonderClient } from "../indexer/ponder-client.ts";
import { SecretManager } from "../state/SecretManager.ts";
import CrossChainEscrowFactoryAbi from "../../abis/CrossChainEscrowFactory.json" with { type: "json" };
import EscrowDstAbi from "../../abis/EscrowDst.json" with { type: "json" };
import IERC20Abi from "../../abis/IERC20.json" with { type: "json" };

const FACTORY_ADDRESS = "0xB916C3edbFe574fFCBa688A6B92F72106479bD6c";
const BMN_TOKEN_ADDRESS = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1";
const INDEXER_URL = Deno.env.get("INDEXER_URL") || "http://localhost:42069";
const ALICE_PRIVATE_KEY = Deno.env.get("ALICE_PRIVATE_KEY") || "";
const ANKR_API_KEY = Deno.env.get("ANKR_API_KEY") || "";

interface OrderParams {
  srcChainId: number;
  dstChainId: number;
  srcAmount: bigint;
  dstAmount: bigint;
  resolverAddress: string;
  srcSafetyDeposit?: bigint;
  dstSafetyDeposit?: bigint;
}

export class MainnetAlice {
  private ponderClient: PonderClient;
  private secretManager: SecretManager;
  private account: any;
  private baseClient: any;
  private optimismClient: any;
  private baseWallet: any;
  private optimismWallet: any;

  constructor() {
    this.ponderClient = new PonderClient({
      url: INDEXER_URL,
    });

    this.secretManager = new SecretManager();

    const privateKey = ALICE_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("ALICE_PRIVATE_KEY not set");
    }

    this.account = privateKeyToAccount(privateKey as `0x${string}`);

    const ankrKey = ANKR_API_KEY;

    // Set up clients
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

  async init(): Promise<void> {
    await this.secretManager.init();
    const stats = await this.secretManager.getStatistics();
    console.log(`📊 Alice SecretManager initialized. Stats: ${JSON.stringify(stats)}`);
  }

  async createOrder(params: OrderParams): Promise<string> {
    console.log(`\n🎯 Creating MAINNET atomic swap order`);
    console.log(`   From: Chain ${params.srcChainId} (${params.srcChainId === 10 ? 'Optimism' : 'Base'})`);
    console.log(`   To: Chain ${params.dstChainId} (${params.dstChainId === 10 ? 'Optimism' : 'Base'})`);
    console.log(`   Amount: ${params.srcAmount / 10n**18n} BMN tokens`);

    // Generate secret and hashlock
    const secret = this.generateSecret();
    const hashlock = keccak256(secret as `0x${string}`);

    console.log(`🔐 Generated hashlock: ${hashlock}`);

    // Select the correct wallet based on source chain
    const wallet = params.srcChainId === base.id ? this.baseWallet : this.optimismWallet;
    const client = params.srcChainId === base.id ? this.baseClient : this.optimismClient;

    // Check token balance
    const balance = await client.readContract({
      address: BMN_TOKEN_ADDRESS,
      abi: IERC20Abi.abi,
      functionName: "balanceOf",
      args: [this.account.address],
    });
    
    console.log(`💰 Current BMN balance: ${balance / 10n**18n} tokens`);
    
    if (balance < params.srcAmount) {
      throw new Error(`Insufficient BMN balance. Have ${balance}, need ${params.srcAmount}`);
    }

    // Approve tokens first
    console.log("🔓 Approving tokens for factory...");
    const totalAmount = params.srcAmount + (params.srcSafetyDeposit || 0n);
    const approveHash = await wallet.writeContract({
      address: BMN_TOKEN_ADDRESS,
      abi: IERC20Abi.abi,
      functionName: "approve",
      args: [FACTORY_ADDRESS, totalAmount],
    });
    await client.waitForTransactionReceipt({ hash: approveHash });
    console.log(`✅ Approval tx: ${approveHash}`);

    // Properly create source escrow using factory
    console.log("🏭 Creating source escrow via factory...");
    
    // Calculate timelocks (current time + 1 hour for demo)
    const srcCancellationTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const dstWithdrawalTimestamp = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 minutes
    const timelocks = (srcCancellationTimestamp << 128n) | dstWithdrawalTimestamp;

    // Create the order hash (should match contract's calculation)
    const orderHash = keccak256(
      encodeFunctionData({
        abi: parseAbi(["function hash(bytes32,address,address,uint256) pure"]),
        functionName: "hash",
        args: [hashlock, this.account.address, params.resolverAddress as `0x${string}`, params.srcAmount],
      })
    );

    try {
      const { request } = await client.simulateContract({
        account: this.account,
        address: FACTORY_ADDRESS,
        abi: CrossChainEscrowFactoryAbi.abi,
        functionName: "postSourceEscrow",
        args: [
          hashlock,
          BMN_TOKEN_ADDRESS,
          params.srcAmount,
          params.srcSafetyDeposit || 0n,
          params.resolverAddress,
          BMN_TOKEN_ADDRESS, // dstToken (same token for simplicity)
          params.dstAmount,
          params.dstSafetyDeposit || 0n,
          params.dstChainId,
          timelocks,
        ],
      });

      const txHash = await wallet.writeContract(request);
      console.log(`⏳ Creating source escrow... tx: ${txHash}`);
      
      const receipt = await client.waitForTransactionReceipt({ hash: txHash });
      console.log(`✅ Source escrow created!`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed}`);

      // Store secret in SecretManager
      await this.secretManager.storeSecret({
        secret: secret as `0x${string}`,
        orderHash: orderHash as `0x${string}`,
        escrowAddress: FACTORY_ADDRESS, // Will be updated when actual escrow is deployed
        chainId: params.srcChainId,
      });

      console.log(`\n✨ Order successfully created!`);
      console.log(`   Order Hash: ${orderHash}`);
      console.log(`   Secret: ${secret.slice(0, 20)}... (stored securely)`);
      console.log(`   Hashlock: ${hashlock}`);
      
      return orderHash;
    } catch (error) {
      console.error("❌ Failed to create source escrow:", error);
      throw error;
    }
  }

  async listOrders(): Promise<any[]> {
    const orders = [];
    
    // Get orders from indexer
    const swaps = await this.ponderClient.getPendingAtomicSwaps(this.account.address);

    for (const swap of swaps) {
      orders.push({
        orderHash: swap.orderHash,
        status: swap.status,
        srcChain: swap.srcChainId,
        dstChain: Number(swap.dstChainId),
        srcAmount: swap.srcAmount.toString(),
        dstAmount: swap.dstAmount.toString(),
        createdAt: new Date(Number(swap.srcCreatedAt || swap.dstCreatedAt || 0) * 1000).toISOString(),
      });
    }

    return orders;
  }

  async withdrawFromDestination(orderHash: string): Promise<void> {
    // Get secret from SecretManager
    const secret = await this.secretManager.getSecretByOrderHash(orderHash);
    if (!secret) {
      throw new Error(`No secret found for order ${orderHash}`);
    }

    const swap = await this.ponderClient.getAtomicSwapByOrderHash(orderHash);
    if (!swap || !swap.dstEscrowAddress) {
      throw new Error(`No destination escrow found for order ${orderHash}`);
    }

    const dstChainId = Number(swap.dstChainId);
    const wallet = dstChainId === base.id ? this.baseWallet : this.optimismWallet;
    const client = dstChainId === base.id ? this.baseClient : this.optimismClient;

    console.log(`\n💰 Withdrawing from destination escrow`);
    console.log(`   Chain: ${dstChainId} (${dstChainId === 10 ? 'Optimism' : 'Base'})`);
    console.log(`   Escrow: ${swap.dstEscrowAddress}`);
    console.log(`   Revealing secret: ${secret}`);

    const { request } = await client.simulateContract({
      account: this.account,
      address: swap.dstEscrowAddress,
      abi: EscrowDstAbi.abi,
      functionName: "withdraw",
      args: [secret],
    });

    const hash = await wallet.writeContract(request);
    console.log(`⏳ Withdrawing... tx: ${hash}`);
    
    const receipt = await client.waitForTransactionReceipt({ hash });
    console.log(`✅ Successfully withdrew from destination escrow!`);
    console.log(`   Gas used: ${receipt.gasUsed}`);

    // Mark secret as confirmed
    const hashlock = keccak256(secret as `0x${string}`);
    await this.secretManager.confirmSecret(
      hashlock,
      receipt.transactionHash,
      BigInt(receipt.gasUsed || 0)
    );
  }

  private generateSecret(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  }

  async monitorAndWithdraw(pollingInterval = 10000): Promise<void> {
    console.log("👁️  Starting auto-monitoring for destination escrows...");
    
    while (true) {
      try {
        const orders = await this.listOrders();
        
        for (const order of orders) {
          const swap = await this.ponderClient.getAtomicSwapByOrderHash(order.orderHash);
          
          if (swap && swap.dstEscrowAddress && swap.status === 'dst_created') {
            console.log(`\n🎯 Found destination escrow for order ${order.orderHash}`);
            console.log(`   Auto-withdrawing...`);
            
            try {
              await this.withdrawFromDestination(order.orderHash);
              console.log(`✅ Successfully auto-withdrew!`);
            } catch (error) {
              console.error(`❌ Auto-withdrawal failed:`, error);
            }
          }
        }
      } catch (error) {
        console.error("❌ Error in monitoring loop:", error);
      }
      
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
  }
}