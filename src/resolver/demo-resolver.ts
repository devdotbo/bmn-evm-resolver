import { createPublicClient, createWalletClient, http, parseAbi, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import CrossChainEscrowFactoryAbi from "../../abis/CrossChainEscrowFactory.json" with { type: "json" };
import IERC20Abi from "../../abis/IERC20.json" with { type: "json" };

const FACTORY_ADDRESS = "0xB916C3edbFe574fFCBa688A6B92F72106479bD6c";
const BMN_TOKEN_ADDRESS = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1";
const RESOLVER_PRIVATE_KEY = Deno.env.get("RESOLVER_PRIVATE_KEY") || "";
const ANKR_API_KEY = Deno.env.get("ANKR_API_KEY") || "";

/**
 * Demo Resolver that processes the simplified order from Alice
 * In production, this would monitor actual limit orders from 1inch protocol
 */
export class DemoResolver {
  private account: any;
  private baseClient: any;
  private optimismClient: any;
  private baseWallet: any;
  private optimismWallet: any;

  constructor() {
    if (!RESOLVER_PRIVATE_KEY) {
      throw new Error("RESOLVER_PRIVATE_KEY not set");
    }

    this.account = privateKeyToAccount(RESOLVER_PRIVATE_KEY as `0x${string}`);

    // Set up clients
    this.baseClient = createPublicClient({
      chain: base,
      transport: http(`https://rpc.ankr.com/base/${ANKR_API_KEY}`),
    });

    this.optimismClient = createPublicClient({
      chain: optimism,
      transport: http(`https://rpc.ankr.com/optimism/${ANKR_API_KEY}`),
    });

    this.baseWallet = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(`https://rpc.ankr.com/base/${ANKR_API_KEY}`),
    });

    this.optimismWallet = createWalletClient({
      account: this.account,
      chain: optimism,
      transport: http(`https://rpc.ankr.com/optimism/${ANKR_API_KEY}`),
    });
  }

  async processSimplifiedOrder() {
    console.log(`🤖 Demo Resolver Processing Simplified Order`);
    console.log(`   Resolver: ${this.account.address}`);
    
    // Check if factory has received tokens (indicating an order)
    const factoryBalance = await this.baseClient.readContract({
      address: BMN_TOKEN_ADDRESS,
      abi: IERC20Abi.abi,
      functionName: "balanceOf",
      args: [FACTORY_ADDRESS],
    });

    if (factoryBalance === 0n) {
      console.log("❌ No tokens in factory - no order to process");
      return;
    }

    console.log(`✅ Found ${factoryBalance} tokens in factory`);
    
    // For demo purposes, we'll create a destination escrow directly
    // Using the known values from Alice's order
    const orderData = {
      hashlock: "0xda974201617bc68d29fe2ff211f725a55dcfad0dcbdab5347cb171404e8e0841",
      orderHash: "0x6bc85fea9ec88eea7ff09e304db4ef2d6139b3660203f7e48353c2ce780f9109",
      maker: "0x240E2588e35FB9D3D60B283B45108a49972FFFd8", // Alice
      amount: factoryBalance,
    };

    console.log("🚀 Creating destination escrow on Optimism...");
    
    // First approve tokens on Optimism
    console.log("🔓 Approving tokens on Optimism...");
    const approveHash = await this.optimismWallet.writeContract({
      address: BMN_TOKEN_ADDRESS,
      abi: IERC20Abi.abi,
      functionName: "approve",
      args: [FACTORY_ADDRESS, orderData.amount],
    });
    
    await this.optimismClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`✅ Tokens approved`);

    // Create destination escrow using the factory
    // Note: Addresses are stored as uint256 in the struct
    const dstImmutables = {
      orderHash: orderData.orderHash,
      hashlock: orderData.hashlock,
      maker: BigInt(orderData.maker), // Alice will withdraw to this address (as uint256)
      taker: BigInt(this.account.address), // Resolver (as uint256)
      token: BigInt(BMN_TOKEN_ADDRESS), // Token address (as uint256)
      amount: orderData.amount,
      safetyDeposit: 0n,
      timelocks: this.encodeTimelocks(300, 600, 900, 1200), // Demo timelocks
    };

    console.log("📦 Creating destination escrow with immutables:", {
      orderHash: dstImmutables.orderHash,
      maker: dstImmutables.maker,
      taker: dstImmutables.taker,
      amount: dstImmutables.amount.toString(),
    });

    try {
      // Simulate first to check if it will work
      // srcCancellationTimestamp should be in the future but reasonable
      const srcCancellationTimestamp = BigInt(Math.floor(Date.now() / 1000) + 7200); // 2 hours from now
      
      const { request } = await this.optimismClient.simulateContract({
        account: this.account,
        address: FACTORY_ADDRESS,
        abi: CrossChainEscrowFactoryAbi.abi,
        functionName: "createDstEscrow",
        args: [dstImmutables, srcCancellationTimestamp],
        value: 0n,
      });

      const hash = await this.optimismWallet.writeContract(request);
      const receipt = await this.optimismClient.waitForTransactionReceipt({ hash });
      
      console.log(`✅ Destination escrow created!`);
      console.log(`   Transaction: ${receipt.transactionHash}`);
      console.log(`   Block: ${receipt.blockNumber}`);
      
      // Get the escrow address from the factory
      const escrowAddress = await this.optimismClient.readContract({
        address: FACTORY_ADDRESS,
        abi: CrossChainEscrowFactoryAbi.abi,
        functionName: "addressOfEscrowDst",
        args: [dstImmutables],
      });
      
      console.log(`   Escrow Address: ${escrowAddress}`);
      console.log(`\n🎯 Alice can now withdraw from the destination escrow!`);
      
      return escrowAddress;
    } catch (error) {
      console.error("❌ Error creating destination escrow:", error);
      throw error;
    }
  }

  private encodeTimelocks(
    srcWithdrawal: number,
    dstWithdrawal: number,
    srcCancellation: number,
    dstCancellation: number
  ): bigint {
    const base = BigInt(Math.floor(Date.now() / 1000));
    // Pack timestamps as uint64 values
    const srcWithdrawalTime = base + BigInt(srcWithdrawal);
    const dstWithdrawalTime = base + BigInt(dstWithdrawal);
    const srcCancellationTime = base + BigInt(srcCancellation);
    const dstCancellationTime = base + BigInt(dstCancellation);
    
    return (
      (srcWithdrawalTime << 192n) |
      (dstWithdrawalTime << 128n) |
      (srcCancellationTime << 64n) |
      dstCancellationTime
    );
  }
}

// Run if called directly
if (import.meta.main) {
  const resolver = new DemoResolver();
  await resolver.processSimplifiedOrder();
}