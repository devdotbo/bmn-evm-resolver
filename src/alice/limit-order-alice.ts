import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseAbi, 
  encodeFunctionData, 
  keccak256, 
  toHex,
  encodeAbiParameters,
  parseAbiParameters,
  concat,
  pad,
  numberToHex,
  hexToBigInt,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import { PonderClient } from "../indexer/ponder-client.ts";
import { SecretManager } from "../state/SecretManager.ts";
import { getContractAddresses } from "../config/contracts.ts";
import SimpleLimitOrderProtocolAbi from "../../abis/SimpleLimitOrderProtocol.json" with { type: "json" };
import CrossChainEscrowFactoryAbi from "../../abis/CrossChainEscrowFactory.json" with { type: "json" };
import EscrowDstAbi from "../../abis/EscrowDst.json" with { type: "json" };
import IERC20Abi from "../../abis/IERC20.json" with { type: "json" };

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

interface LimitOrder {
  salt: bigint;
  maker: Address;
  receiver: Address;
  makerAsset: Address;
  takerAsset: Address;
  makingAmount: bigint;
  takingAmount: bigint;
  makerTraits: bigint;
}

export class LimitOrderAlice {
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
    console.log(`\n🎯 Creating MAINNET atomic swap order via Limit Order Protocol`);
    console.log(`   From: Chain ${params.srcChainId} (${params.srcChainId === 10 ? 'Optimism' : 'Base'})`);
    console.log(`   To: Chain ${params.dstChainId} (${params.dstChainId === 10 ? 'Optimism' : 'Base'})`);
    console.log(`   Amount: ${params.srcAmount / 10n**18n} BMN tokens`);

    // Generate secret and hashlock
    const secret = this.generateSecret();
    const hashlock = keccak256(secret as `0x${string}`);

    console.log(`🔐 Generated hashlock: ${hashlock}`);

    // Get contract addresses
    const srcAddresses = getContractAddresses(params.srcChainId);
    const BMN_TOKEN = srcAddresses.tokens.BMN;
    const LIMIT_ORDER_PROTOCOL = srcAddresses.limitOrderProtocol;
    const ESCROW_FACTORY = srcAddresses.escrowFactory;

    // Select the correct wallet and client based on source chain
    const wallet = params.srcChainId === base.id ? this.baseWallet : this.optimismWallet;
    const client = params.srcChainId === base.id ? this.baseClient : this.optimismClient;

    // Check token balance
    const balance = await client.readContract({
      address: BMN_TOKEN,
      abi: IERC20Abi.abi,
      functionName: "balanceOf",
      args: [this.account.address],
    });
    
    console.log(`💰 Current BMN balance: ${balance / 10n**18n} tokens`);
    
    if (balance < params.srcAmount) {
      throw new Error(`Insufficient BMN balance. Have ${balance}, need ${params.srcAmount}`);
    }

    // Approve tokens for the limit order protocol
    console.log("🔓 Approving tokens for Limit Order Protocol...");
    const approveHash = await wallet.writeContract({
      address: BMN_TOKEN,
      abi: IERC20Abi.abi,
      functionName: "approve",
      args: [LIMIT_ORDER_PROTOCOL, params.srcAmount],
    });
    await client.waitForTransactionReceipt({ hash: approveHash });
    console.log(`✅ Approval tx: ${approveHash}`);

    // Create the limit order structure
    const salt = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
    
    // Calculate timelocks (current time + 1 hour for cancellation, 5 minutes for withdrawal)
    const srcCancellationTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const dstWithdrawalTimestamp = BigInt(Math.floor(Date.now() / 1000) + 300);
    const timelocks = (srcCancellationTimestamp << 128n) | dstWithdrawalTimestamp;

    // Build postInteraction data to trigger factory.deployEscrowSrc()
    // The postInteraction will call the factory to create the source escrow
    const postInteractionData = encodeFunctionData({
      abi: CrossChainEscrowFactoryAbi.abi,
      functionName: "postSourceEscrow",
      args: [
        hashlock,
        BMN_TOKEN,
        params.srcAmount,
        params.srcSafetyDeposit || 0n,
        params.resolverAddress,
        BMN_TOKEN, // dstToken (same token for simplicity)
        params.dstAmount,
        params.dstSafetyDeposit || 0n,
        params.dstChainId,
        timelocks,
      ],
    });

    // Encode the extension data with postInteraction
    // Extension format: [postInteraction address][postInteraction data]
    const extensionData = concat([
      pad(ESCROW_FACTORY, { size: 20 }), // Factory address for postInteraction
      postInteractionData
    ]);

    // Create makerTraits with extension flag
    // Bit layout for makerTraits:
    // - Bits 0-79: expiration (0 = no expiration)
    // - Bit 80: allowPartialFill (0 = false)
    // - Bit 81: allowMultipleFills (0 = false)
    // - Bit 255: hasExtension (1 = true)
    const hasExtensionFlag = 1n << 255n;
    const makerTraits = hasExtensionFlag; // Just the extension flag

    // Create the limit order
    const order: LimitOrder = {
      salt: salt,
      maker: this.account.address,
      receiver: this.account.address, // Maker receives the tokens
      makerAsset: BMN_TOKEN,
      takerAsset: BMN_TOKEN, // For atomic swap, we use same token
      makingAmount: params.srcAmount,
      takingAmount: params.dstAmount,
      makerTraits: makerTraits,
    };

    // Calculate order hash using EIP-712
    const orderHash = await this.calculateOrderHash(order, params.srcChainId);
    
    console.log(`📝 Order hash: ${orderHash}`);

    // Sign the order using EIP-712
    const signature = await this.signOrder(order, params.srcChainId);
    
    console.log(`✍️ Order signed with EIP-712`);

    // Now submit the order to the limit order protocol
    // In production, this would be posted to 1inch API or resolver
    // For now, we'll directly call fillOrder (simplified for demo)
    
    console.log("🚀 Creating limit order with factory postInteraction...");
    
    try {
      // For demo purposes, we'll simulate the order creation
      // In production, the resolver would call fillOrder with the signed order
      
      // Store the order details for the resolver to pick up
      await this.storeOrderForResolver({
        order,
        signature,
        extensionData,
        chainId: params.srcChainId,
        hashlock,
        secret,
      });

      // Store secret in SecretManager
      await this.secretManager.storeSecret({
        secret: secret as `0x${string}`,
        orderHash: orderHash as `0x${string}`,
        escrowAddress: ESCROW_FACTORY, // Will be updated when actual escrow is deployed
        chainId: params.srcChainId,
      });

      console.log(`\n✨ Limit order successfully created!`);
      console.log(`   Order Hash: ${orderHash}`);
      console.log(`   Salt: ${salt}`);
      console.log(`   Secret: ${secret.slice(0, 20)}... (stored securely)`);
      console.log(`   Hashlock: ${hashlock}`);
      console.log(`   Post-interaction: Factory will deploy source escrow`);
      
      return orderHash;
    } catch (error) {
      console.error("❌ Failed to create limit order:", error);
      throw error;
    }
  }

  private async calculateOrderHash(order: LimitOrder, chainId: number): Promise<string> {
    const client = chainId === base.id ? this.baseClient : this.optimismClient;
    const LIMIT_ORDER_PROTOCOL = getContractAddresses(chainId).limitOrderProtocol;

    // Call hashOrder on the contract to get the proper EIP-712 hash
    const orderHash = await client.readContract({
      address: LIMIT_ORDER_PROTOCOL,
      abi: SimpleLimitOrderProtocolAbi.abi,
      functionName: "hashOrder",
      args: [[
        order.salt,
        order.maker,
        order.receiver,
        order.makerAsset,
        order.takerAsset,
        order.makingAmount,
        order.takingAmount,
        order.makerTraits,
      ]],
    });

    return orderHash as string;
  }

  private async signOrder(order: LimitOrder, chainId: number): Promise<Hex> {
    const LIMIT_ORDER_PROTOCOL = getContractAddresses(chainId).limitOrderProtocol;
    
    // EIP-712 domain
    const domain = {
      name: "Bridge-Me-Not Orders",
      version: "1",
      chainId: chainId,
      verifyingContract: LIMIT_ORDER_PROTOCOL as Address,
    };

    // EIP-712 types
    const types = {
      Order: [
        { name: "salt", type: "uint256" },
        { name: "maker", type: "address" },
        { name: "receiver", type: "address" },
        { name: "makerAsset", type: "address" },
        { name: "takerAsset", type: "address" },
        { name: "makingAmount", type: "uint256" },
        { name: "takingAmount", type: "uint256" },
        { name: "makerTraits", type: "uint256" },
      ],
    };

    // Sign the order
    const signature = await this.account.signTypedData({
      domain,
      types,
      primaryType: "Order",
      message: {
        salt: order.salt,
        maker: order.maker,
        receiver: order.receiver,
        makerAsset: order.makerAsset,
        takerAsset: order.takerAsset,
        makingAmount: order.makingAmount,
        takingAmount: order.takingAmount,
        makerTraits: order.makerTraits,
      },
    });

    return signature;
  }

  private async storeOrderForResolver(data: {
    order: LimitOrder;
    signature: Hex;
    extensionData: Hex;
    chainId: number;
    hashlock: string;
    secret: string;
  }): Promise<void> {
    // Store order details in a format that the resolver can pick up
    // This could be stored in the indexer, IPFS, or a database
    // For now, we'll store it locally for the resolver to read
    
    const orderData = {
      order: {
        salt: data.order.salt.toString(),
        maker: data.order.maker,
        receiver: data.order.receiver,
        makerAsset: data.order.makerAsset,
        takerAsset: data.order.takerAsset,
        makingAmount: data.order.makingAmount.toString(),
        takingAmount: data.order.takingAmount.toString(),
        makerTraits: data.order.makerTraits.toString(),
      },
      signature: data.signature,
      extensionData: data.extensionData,
      chainId: data.chainId,
      hashlock: data.hashlock,
      timestamp: Date.now(),
    };

    // Write to a file that the resolver can monitor
    const ordersDir = "./pending-orders";
    try {
      await Deno.mkdir(ordersDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    const orderFile = `${ordersDir}/${data.hashlock}.json`;
    await Deno.writeTextFile(orderFile, JSON.stringify(orderData, null, 2));
    
    console.log(`📁 Order stored for resolver at: ${orderFile}`);
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