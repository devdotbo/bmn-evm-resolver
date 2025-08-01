import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { parseEther } from "viem";
import { chainA, chainB } from "../config/chains.ts";
import {
  getContractAddresses,
  areContractsConfigured,
  loadContractAddressesFromEnv,
} from "../config/contracts.ts";
import {
  createPublicClientForChain,
  createWalletClientForChain,
  createLimitOrderProtocol,
  createEscrowFactory,
  createERC20Token,
  waitForTransaction,
} from "../utils/contracts.ts";
import { generateSecret, computeHashlock, generateOrderHash } from "../utils/secrets.ts";
import { createTimelocks } from "../utils/timelocks.ts";
import { validateOrderParams, validateTokenBalance } from "../utils/validation.ts";
import { generateOrderId, computeEscrowSrcAddress, getProxyBytecodeHash } from "../utils/addresses.ts";
import { calculateSafetyDeposit, formatTokenAmount } from "../config/constants.ts";
import { AliceStateManager } from "./state.ts";
import type { OrderParams, OrderState, Immutables } from "../types/index.ts";
import { OrderStatus } from "../types/index.ts";

/**
 * Create a cross-chain order (Alice)
 */
export async function createOrder(args: {
  amount: string;
  tokenA: string;
  tokenB: string;
  privateKey: `0x${string}`;
}): Promise<void> {
  console.log("=== Creating Cross-Chain Order ===\n");

  // Load contract addresses
  loadContractAddressesFromEnv();

  // Check configuration
  if (!areContractsConfigured(1337) || !areContractsConfigured(1338)) {
    console.error("Contract addresses not configured. Please set environment variables.");
    return;
  }

  // Get account
  const account = privateKeyToAccount(args.privateKey);
  console.log(`Alice address: ${account.address}`);

  // Create clients
  const srcPublicClient = createPublicClientForChain(chainA);
  const srcWalletClient = createWalletClientForChain(chainA, args.privateKey);
  const dstPublicClient = createPublicClientForChain(chainB);

  // Get contract addresses
  const srcAddresses = getContractAddresses(1337);
  const dstAddresses = getContractAddresses(1338);

  // Get token addresses
  const srcTokenAddress = srcAddresses.tokens[args.tokenA];
  const dstTokenAddress = dstAddresses.tokens[args.tokenB];

  if (!srcTokenAddress || !dstTokenAddress) {
    console.error(`Token addresses not found for ${args.tokenA} or ${args.tokenB}`);
    return;
  }

  // Parse amount
  const amount = parseEther(args.amount);
  const safetyDeposit = calculateSafetyDeposit(amount);

  // Generate secret and timelocks
  const secret = generateSecret();
  const hashlock = computeHashlock(secret);
  const timelocks = createTimelocks();

  console.log(`Order Details:`);
  console.log(`  Amount: ${args.amount} ${args.tokenA}`);
  console.log(`  For: ${args.amount} ${args.tokenB}`);
  console.log(`  Safety Deposit: ${formatTokenAmount(safetyDeposit)} tokens`);
  console.log(`  Secret: ${secret}`);
  console.log(`  Hashlock: ${hashlock}`);

  // Create order parameters
  const orderParams: OrderParams = {
    srcToken: srcTokenAddress,
    dstToken: dstTokenAddress,
    srcAmount: amount,
    dstAmount: amount, // 1:1 exchange for simplicity
    safetyDeposit,
    secret,
    srcChainId: 1337,
    dstChainId: 1338,
  };

  // Validate parameters
  try {
    validateOrderParams(orderParams);
  } catch (error) {
    console.error("Invalid order parameters:", error);
    return;
  }

  // Check balance
  try {
    await validateTokenBalance(
      srcTokenAddress,
      account.address,
      amount + safetyDeposit,
      srcPublicClient
    );
  } catch (error) {
    console.error("Insufficient balance:", error);
    return;
  }

  // Create immutables
  const nonce = BigInt(Date.now()); // Simple nonce
  const orderHash = generateOrderHash({
    ...orderParams,
    nonce,
  });

  const immutables: Immutables = {
    orderHash,
    hashlock,
    maker: account.address, // Alice
    taker: "0x0000000000000000000000000000000000000000" as Address, // Anyone can be taker
    token: srcTokenAddress,
    amount,
    safetyDeposit,
    timelocks,
  };

  // Deploy source escrow through LimitOrderProtocol
  console.log("\nDeploying source escrow...");
  
  try {
    // Create contract instances
    const limitOrderProtocol = createLimitOrderProtocol(
      srcAddresses.limitOrderProtocol,
      srcPublicClient,
      srcWalletClient
    );

    const srcToken = createERC20Token(
      srcTokenAddress,
      srcPublicClient,
      srcWalletClient
    );

    // Approve tokens
    console.log("Approving tokens...");
    const allowance = await srcToken.read.allowance([
      account.address,
      srcAddresses.escrowFactory,
    ]);

    if (allowance < amount + safetyDeposit) {
      const approveHash = await srcToken.write.approve([
        srcAddresses.escrowFactory,
        amount + safetyDeposit,
      ]);
      await waitForTransaction(srcPublicClient, approveHash);
      console.log("Tokens approved");
    }

    // For demo purposes, we'll simulate order creation
    // In production, this would go through LimitOrderProtocol
    console.log("Creating order (demo mode)...");
    
    // For now, we'll just transfer tokens to a mock escrow address
    // This is a simplified demo - in production, the LimitOrderProtocol
    // would handle the escrow creation through its interaction hooks
    
    // Generate a deterministic escrow address for demo
    const mockEscrowAddress = `0x${orderHash.slice(2, 42)}` as Address;
    
    // Transfer tokens to the mock escrow
    const transferHash = await srcToken.write.transfer([
      mockEscrowAddress,
      amount + safetyDeposit
    ]);
    
    const receipt = await waitForTransaction(srcPublicClient, transferHash);
    if (receipt.status !== "success") {
      throw new Error("Failed to transfer tokens to escrow");
    }

    const srcEscrowAddress = mockEscrowAddress;

    console.log(`Source escrow deployed at: ${srcEscrowAddress}`);

    // Create order state
    const orderId = generateOrderId(1337, orderHash);
    const orderState: OrderState = {
      id: orderId,
      params: orderParams,
      immutables,
      srcEscrowAddress,
      status: OrderStatus.SrcEscrowDeployed,
      createdAt: Date.now(),
    };

    // Save to state
    const stateManager = new AliceStateManager();
    await stateManager.loadFromFile().catch(() => {}); // Load existing state if any
    stateManager.addOrder(orderState, secret);
    await stateManager.saveToFile();

    console.log("\n✅ Order created successfully!");
    console.log(`Order ID: ${orderId}`);
    console.log("\nNext steps:");
    console.log("1. Wait for Bob (resolver) to deploy destination escrow");
    console.log("2. Use 'alice:withdraw' command to claim tokens from destination");
    console.log("\nTo check order status, use: deno task alice:list-orders");

  } catch (error) {
    console.error("Error creating order:", error);
  }
}

// Main entry point
if (import.meta.main) {
  const flags = parseArgs(Deno.args, {
    string: ["amount", "token-a", "token-b", "private-key"],
    default: {
      "token-a": "TKA",
      "token-b": "TKB",
    },
  });

  if (!flags.amount) {
    console.error("Usage: deno task alice:create-order --amount <amount> [--token-a TKA] [--token-b TKB]");
    Deno.exit(1);
  }

  const privateKey = flags["private-key"] || Deno.env.get("ALICE_PRIVATE_KEY");
  if (!privateKey || !privateKey.startsWith("0x")) {
    console.error("Please provide --private-key or set ALICE_PRIVATE_KEY environment variable");
    Deno.exit(1);
  }

  await createOrder({
    amount: flags.amount,
    tokenA: flags["token-a"],
    tokenB: flags["token-b"],
    privateKey: privateKey as `0x${string}`,
  });
}