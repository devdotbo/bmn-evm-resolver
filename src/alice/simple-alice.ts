import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import { PonderClient } from "../indexer/ponder-client.ts";
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

export class SimpleAlice {
  private ponderClient: PonderClient;
  private account: any;
  private baseClient: any;
  private optimismClient: any;
  private baseWallet: any;
  private optimismWallet: any;
  private orders: Map<string, { secret: string; orderHash: string }> = new Map();

  constructor() {
    this.ponderClient = new PonderClient({
      url: INDEXER_URL,
    });

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

  async createOrder(params: OrderParams): Promise<string> {
    console.log(`📝 Creating order from chain ${params.srcChainId} to chain ${params.dstChainId}`);

    // Generate secret and hashlock
    const secret = this.generateSecret();
    const hashlock = keccak256(toHex(secret));

    // Select the correct wallet based on source chain
    const wallet = params.srcChainId === base.id ? this.baseWallet : this.optimismWallet;
    const client = params.srcChainId === base.id ? this.baseClient : this.optimismClient;

    // Approve tokens first
    console.log("🔓 Approving tokens...");
    const approveHash = await wallet.writeContract({
      address: BMN_TOKEN_ADDRESS,
      abi: IERC20Abi,
      functionName: "approve",
      args: [FACTORY_ADDRESS, params.srcAmount + (params.srcSafetyDeposit || 0n)],
    });
    await client.waitForTransactionReceipt({ hash: approveHash });

    // Create the order hash (simplified - should match contract's hash calculation)
    const orderHash = keccak256(
      encodeFunctionData({
        abi: parseAbi(["function hash(bytes32,address,address,uint256) pure"]),
        functionName: "hash",
        args: [hashlock, this.account.address, params.resolverAddress, params.srcAmount],
      })
    );

    // Deploy source escrow
    console.log("🚀 Deploying source escrow...");
    const timelocks = this.encodeTimelocks(300, 600, 900, 1200); // Demo timelocks

    const { request } = await wallet.simulateContract({
      address: FACTORY_ADDRESS,
      abi: CrossChainEscrowFactoryAbi.abi,
      functionName: "deployEscrowSrc",
      args: [
        orderHash,
        hashlock,
        BMN_TOKEN_ADDRESS,
        params.srcAmount,
        params.srcSafetyDeposit || 0n,
        params.resolverAddress, // taker (Bob)
        params.resolverAddress, // dstMaker (Bob on destination)
        BMN_TOKEN_ADDRESS, // dstToken
        params.dstAmount,
        params.dstSafetyDeposit || 0n,
        BigInt(params.dstChainId),
        timelocks,
      ],
    });

    const hash = await wallet.writeContract(request);
    const receipt = await client.waitForTransactionReceipt({ hash });

    console.log(`✅ Order created with hash: ${orderHash}`);
    console.log(`   Transaction: ${receipt.transactionHash}`);

    // Store order info
    this.orders.set(orderHash, { secret, orderHash });
    await this.saveOrdersToFile();

    return orderHash;
  }

  async listOrders(): Promise<any[]> {
    const orders = [];
    
    // Get orders from indexer
    const srcEscrows = await this.ponderClient.query(
      `SELECT * FROM src_escrow WHERE LOWER(maker) = LOWER($1) ORDER BY createdAt DESC`,
      [this.account.address]
    );

    for (const escrow of srcEscrows) {
      const swap = await this.ponderClient.getAtomicSwapByOrderHash(escrow.orderHash);
      orders.push({
        orderHash: escrow.orderHash,
        status: swap?.status || escrow.status,
        srcChain: escrow.chainId,
        dstChain: Number(escrow.dstChainId),
        srcAmount: escrow.srcAmount.toString(),
        dstAmount: escrow.dstAmount.toString(),
        createdAt: new Date(Number(escrow.createdAt) * 1000).toISOString(),
      });
    }

    return orders;
  }

  async withdrawFromDestination(orderHash: string): Promise<void> {
    const orderInfo = this.orders.get(orderHash);
    if (!orderInfo) {
      // Try to load from file
      await this.loadOrdersFromFile();
      const loaded = this.orders.get(orderHash);
      if (!loaded) {
        throw new Error(`No secret found for order ${orderHash}`);
      }
    }

    const swap = await this.ponderClient.getAtomicSwapByOrderHash(orderHash);
    if (!swap || !swap.dstEscrowAddress) {
      throw new Error(`No destination escrow found for order ${orderHash}`);
    }

    const dstChainId = Number(swap.dstChainId);
    const wallet = dstChainId === base.id ? this.baseWallet : this.optimismWallet;
    const client = dstChainId === base.id ? this.baseClient : this.optimismClient;

    console.log(`💰 Withdrawing from destination escrow: ${swap.dstEscrowAddress}`);
    console.log(`   Revealing secret: ${orderInfo!.secret}`);

    const { request } = await wallet.simulateContract({
      address: swap.dstEscrowAddress,
      abi: EscrowDstAbi.abi,
      functionName: "withdraw",
      args: [orderInfo!.secret],
    });

    const hash = await wallet.writeContract(request);
    const receipt = await client.waitForTransactionReceipt({ hash });

    console.log(`✅ Successfully withdrew from destination escrow`);
    console.log(`   Transaction: ${receipt.transactionHash}`);
  }

  private generateSecret(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  }

  private encodeTimelocks(
    srcWithdrawal: number,
    dstWithdrawal: number,
    srcCancellation: number,
    dstCancellation: number
  ): bigint {
    const base = BigInt(Math.floor(Date.now() / 1000));
    return (
      ((base + BigInt(srcWithdrawal)) << 192n) |
      ((base + BigInt(dstWithdrawal)) << 128n) |
      ((base + BigInt(srcCancellation)) << 64n) |
      (base + BigInt(dstCancellation))
    );
  }

  private async saveOrdersToFile() {
    const data = Array.from(this.orders.entries()).map(([hash, info]) => ({
      orderHash: hash,
      secret: info.secret,
    }));
    await Deno.writeTextFile("alice-orders.json", JSON.stringify(data, null, 2));
  }

  private async loadOrdersFromFile() {
    try {
      const data = await Deno.readTextFile("alice-orders.json");
      const orders = JSON.parse(data);
      for (const order of orders) {
        this.orders.set(order.orderHash, {
          secret: order.secret,
          orderHash: order.orderHash,
        });
      }
    } catch {
      // File doesn't exist yet
    }
  }
}