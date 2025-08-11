// Minimal declarations for non-Deno linters
declare const Deno: any;

import {
  type Address,
  concat,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  hexToBigInt,
  http,
  keccak256,
  numberToHex,
  pad,
  parseAbi,
  parseAbiParameters,
  formatUnits,
  toHex,
  hashTypedData,
} from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { base, optimism } from "viem/chains";
import { PonderClient } from "../indexer/ponder-client.ts";
import { SecretManager } from "../state/SecretManager.ts";
import {
  CREATE3_ADDRESSES,
  getContractAddresses,
} from "../config/contracts.ts";
import {
  encode1inchExtension,
  encodePostInteractionData,
  type EscrowParams,
  generateNonce,
  MAKER_TRAITS,
  packTimelocks,
} from "../utils/postinteraction-v2.ts";
import SimpleLimitOrderProtocolAbi from "../../abis/SimpleLimitOrderProtocol.json" with {
  type: "json",
};
import CrossChainEscrowFactoryV2Abi from "../../abis/CrossChainEscrowFactoryV2.json" with {
  type: "json",
};
import EscrowDstAbi from "../../abis/EscrowDst.json" with { type: "json" };
import IERC20Abi from "../../abis/IERC20.json" with { type: "json" };
import { EscrowWithdrawManager } from "../utils/escrow-withdraw.ts";

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
  private withdrawManager: EscrowWithdrawManager;
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
    this.withdrawManager = new EscrowWithdrawManager();

    const privateKey = ALICE_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("ALICE_PRIVATE_KEY not set");
    }

    this.account = privateKeyToAccount(privateKey as `0x${string}`, { nonceManager });

    const ankrKey = ANKR_API_KEY;
    const localBase = Deno.env.get("LOCAL_BASE_RPC");
    const localOp = Deno.env.get("LOCAL_OP_RPC");

    // Set up clients (prefer local VRPC if provided)
    this.baseClient = createPublicClient({
      chain: base,
      transport: http(localBase || (ankrKey ? `https://rpc.ankr.com/base/${ankrKey}` : "https://mainnet.base.org")),
    });

    this.optimismClient = createPublicClient({
      chain: optimism,
      transport: http(localOp || (ankrKey ? `https://rpc.ankr.com/optimism/${ankrKey}` : "https://mainnet.optimism.io")),
    });

    this.baseWallet = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(localBase || (ankrKey ? `https://rpc.ankr.com/base/${ankrKey}` : "https://mainnet.base.org")),
    });

    this.optimismWallet = createWalletClient({
      account: this.account,
      chain: optimism,
      transport: http(localOp || (ankrKey ? `https://rpc.ankr.com/optimism/${ankrKey}` : "https://mainnet.optimism.io")),
    });
  }

  async init(): Promise<void> {
    await this.secretManager.init();
    const stats = await this.secretManager.getStatistics();
    console.log(
      `📊 Alice SecretManager initialized. Stats: ${JSON.stringify(stats)}`,
    );
  }

  async createOrder(params: OrderParams): Promise<string> {
    console.log(
      `\n🎯 Creating MAINNET atomic swap order via Limit Order Protocol`,
    );
    console.log(
      `   From: Chain ${params.srcChainId} (${
        params.srcChainId === 10 ? "Optimism" : "Base"
      })`,
    );
    console.log(
      `   To: Chain ${params.dstChainId} (${
        params.dstChainId === 10 ? "Optimism" : "Base"
      })`,
    );
    console.log(`   Amount: ${formatUnits(params.srcAmount, 18)} BMN tokens`);

    // Generate secret and hashlock
    const secret = this.generateSecret();
    const hashlock = keccak256(secret as `0x${string}`);

    console.log(`🔐 Generated hashlock: ${hashlock}`);

    // Get contract addresses
    const srcAddresses = getContractAddresses(params.srcChainId);
    const dstAddresses = getContractAddresses(params.dstChainId);
    const BMN_TOKEN = srcAddresses.tokens.BMN;
    const DST_TOKEN = dstAddresses.tokens.BMN; // Assuming same token on both chains
    const LIMIT_ORDER_PROTOCOL = srcAddresses.limitOrderProtocol;
    const ESCROW_FACTORY = srcAddresses.escrowFactory;

    // Select the correct wallet and client based on source chain
    const wallet = params.srcChainId === base.id
      ? this.baseWallet
      : this.optimismWallet;
    const client = params.srcChainId === base.id
      ? this.baseClient
      : this.optimismClient;

    const simulateOnly = (Deno.env.get("SIMULATE_ONLY") || "").toLowerCase() ===
      "1" || (Deno.env.get("SIMULATE_ONLY") || "").toLowerCase() === "true";

    if (!simulateOnly) {
      // Check token balance
      const balance = await client.readContract({
        address: BMN_TOKEN,
        abi: IERC20Abi.abi,
        functionName: "balanceOf",
        args: [this.account.address],
      });

      console.log(`💰 Current BMN balance: ${formatUnits(balance, 18)} tokens`);

      if (balance < params.srcAmount) {
        throw new Error(
          `Insufficient BMN balance. Have ${balance}, need ${params.srcAmount}`,
        );
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
    } else {
      console.log(
        "🧪 SIMULATE_ONLY=1: Skipping on-chain balance check and approvals",
      );
    }

    // Calculate timelocks (1 hour for cancellation, 5 minutes for withdrawal)
    const timelocks = packTimelocks(3600, 300);

    // Generate unique nonce for escrow creation
    const nonce = generateNonce();

    // Build escrow parameters for v2.2.0 PostInteraction
    const escrowParams: EscrowParams = {
      srcImplementation: CREATE3_ADDRESSES.ESCROW_SRC_IMPL,
      dstImplementation: CREATE3_ADDRESSES.ESCROW_DST_IMPL,
      timelocks: timelocks,
      hashlock: hashlock as Hex,
      dstChainId: BigInt(params.dstChainId),
      srcMaker: this.account.address,
      srcTaker: params.resolverAddress as Address, // Resolver will be the taker
      srcToken: BMN_TOKEN,
      srcAmount: params.srcAmount,
      srcSafetyDeposit: params.srcSafetyDeposit || 0n,
      dstReceiver: this.account.address, // Alice receives on destination
      dstToken: DST_TOKEN,
      dstAmount: params.dstAmount,
      dstSafetyDeposit: params.dstSafetyDeposit || 0n,
      nonce: nonce,
    };

    // Build the PostInteraction data for v2.2.0
    const postInteractionData = encodePostInteractionData(
      ESCROW_FACTORY as Address,
      escrowParams,
    );

    // Build the full extension with proper 1inch format
    const extension = encode1inchExtension(postInteractionData);

    // Calculate extension hash (last 160 bits for salt)
    const extensionHash = keccak256(extension);
    const extensionHashLast160 = BigInt(extensionHash) & ((1n << 160n) - 1n);

    // Create salt with extension hash (upper bits random, lower 160 bits extension hash)
    const randomSalt =
      BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) << 160n;
    const salt = randomSalt | extensionHashLast160;

    // Build maker traits with explicit randomized nonce to avoid BitInvalidatedOrder on forks
    const uniqueNonce40 = Number((generateNonce() >> 12n) & ((1n << 40n) - 1n));
    const makerTraits = MAKER_TRAITS.build({
      postInteraction: true,
      hasExtension: true,
      allowMultipleFills: true,
      noPartialFills: false,
      nonceOrEpoch: uniqueNonce40,
      // Keep allowedSender open (0) so any taker can fill (resolver is checked in extension/flow)
    });

    const order: LimitOrder = {
      salt: salt,
      maker: this.account.address,
      receiver: this.account.address, // Alice receives the tokens on dst chain
      makerAsset: BMN_TOKEN,
      takerAsset: BMN_TOKEN, // Assuming same token on both chains
      makingAmount: params.srcAmount,
      takingAmount: params.dstAmount,
      makerTraits: makerTraits,
    };

    // Calculate order hash
    const orderHash = await this.calculateOrderHash(order, params.srcChainId);
    console.log(`📝 Order hash: ${orderHash}`);

    // Sign the order
    const signature = await this.signOrder(order, params.srcChainId);
    console.log(`✍️ Order signed`);

    // Store order data for resolver to pick up
    await this.storeOrderForResolver({
      order: order,
      signature: signature,
      extensionData: extension, // Use the properly formatted extension
      chainId: params.srcChainId,
      hashlock: hashlock,
      secret: secret,
    });

    // Store secret in SecretManager
    await this.secretManager.storeSecret({
      secret: secret as `0x${string}`,
      orderHash: orderHash as `0x${string}`,
      escrowAddress: ESCROW_FACTORY, // Will be updated when actual escrow address is known
      chainId: params.srcChainId,
    });

    console.log(`\n✨ Order successfully created and signed!`);
    console.log(`   Order Hash: ${orderHash}`);
    console.log(`   Secret: ${secret.slice(0, 20)}... (stored securely)`);
    console.log(`   Hashlock: ${hashlock}`);
    console.log(`   Extension data includes factory: ${ESCROW_FACTORY}`);
    console.log(`\n⏳ Waiting for resolver to fill the order...`);

    return orderHash;
  }

  private async calculateOrderHash(
    order: LimitOrder,
    chainId: number,
  ): Promise<string> {
    const LOP = getContractAddresses(chainId).limitOrderProtocol;
    // Compute EIP-712 order digest locally (matches on-chain OrderLib.hash)
    const digest = hashTypedData({
      domain: {
        name: "Bridge-Me-Not Orders",
        version: "1",
        chainId,
        verifyingContract: LOP,
      },
      primaryType: "Order",
      types: {
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
      },
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

    // Optionally verify with on-chain if env set (best-effort)
    try {
      const verify = (Deno.env.get("VERIFY_HASH_ONCHAIN") || "").toLowerCase();
      if (verify === "1" || verify === "true") {
        const client = chainId === base.id ? this.baseClient : this.optimismClient;
        const onchain = await client.readContract({
          address: LOP,
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
        if ((onchain as string).toLowerCase() !== digest.toLowerCase()) {
          console.warn("hash mismatch (local vs on-chain)", digest, onchain);
        }
      }
    } catch (_e) {
      // ignore verification issues
    }

    return digest as string;
  }

  private async signOrder(order: LimitOrder, chainId: number): Promise<Hex> {
    // Cross-chain compatible signing: sign the on-chain digest from hashOrder(order)
    // This matches the Solidity check: ECDSA.recover(orderHash, r, vs)
    const digest = await this.calculateOrderHash(order, chainId);
    const signature = await this.account.sign({ hash: digest as Hex });
    return signature as Hex;
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
    const orders: any[] = [];

    // Get orders from indexer
    const swaps: any[] = await this.ponderClient.getPendingAtomicSwaps(
      this.account.address,
    );

    for (const swap of swaps) {
      orders.push({
        orderHash: (swap as any).orderHash,
        status: (swap as any).status,
        srcChain: (swap as any).srcChainId,
        dstChain: Number((swap as any).dstChainId),
        srcAmount: ((swap as any).srcAmount ?? 0n).toString(),
        dstAmount: ((swap as any).dstAmount ?? 0n).toString(),
        createdAt: new Date(
          Number((swap as any).srcCreatedAt || (swap as any).dstCreatedAt || 0) * 1000,
        ).toISOString(),
      });
    }

    return orders;
  }

  async withdrawFromDestination(orderHash: string): Promise<void> {
    const swap = await this.ponderClient.getAtomicSwapByOrderHash(orderHash);
    if (!swap || !swap.dstEscrowAddress) {
      throw new Error(`No destination escrow found for order ${orderHash}`);
    }

    const dstChainId = Number(swap.dstChainId);
    const wallet = dstChainId === base.id
      ? this.baseWallet
      : this.optimismWallet;
    const client = dstChainId === base.id
      ? this.baseClient
      : this.optimismClient;

    const result = await this.withdrawManager.withdrawFromDestination(
      orderHash,
      client,
      wallet,
      this.account,
    );

    if (!result.success) {
      throw new Error(`Withdrawal failed: ${result.error}`);
    }
  }

  private generateSecret(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `0x${
      Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
    }`;
  }

  async monitorAndWithdraw(pollingInterval = 10000): Promise<void> {
    console.log("👁️  Starting auto-monitoring for destination escrows...");

    while (true) {
      try {
        const orders = await this.listOrders();

        for (const order of orders) {
          const swap = await this.ponderClient.getAtomicSwapByOrderHash(
            order.orderHash,
          );

          if (swap && swap.dstEscrowAddress && swap.status === "dst_created") {
            console.log(
              `\n🎯 Found destination escrow for order ${order.orderHash}`,
            );
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

      await new Promise((resolve) => setTimeout(resolve, pollingInterval));
    }
  }
}
