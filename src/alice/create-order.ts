import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { parseEther, keccak256, encodePacked } from "viem";
import { getChains, getChainName } from "../config/chain-selector.ts";
import {
  buildOrder,
  LIMIT_ORDER_PROTOCOL_DOMAIN,
  ORDER_TYPES,
  type Order,
  type OrderMetadata,
} from "../types/order.ts";
import { loadContractAddresses } from "../config/load-contracts.ts";
import { getContractAddresses } from "../config/contracts.ts";
import {
  createPublicClientForChain,
  createWalletClientForChain,
  createERC20Token,
  waitForTransaction,
} from "../utils/contracts.ts";
import { generateSecret, computeHashlock } from "../utils/secrets.ts";
import { createTimelocks } from "../utils/timelocks.ts";
import { validateTokenBalance } from "../utils/validation.ts";
import { formatTokenAmount } from "../config/constants.ts";
import { AliceStateManager } from "./state.ts";
import type { OrderParams, OrderState } from "../types/index.ts";
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
  console.log("=== Creating Cross-Chain Order (EIP-712) ===\n");

  // Get chain configuration
  const chains = getChains();
  console.log(`Network mode: ${chains.srcChainId === 1337 ? "TESTNET" : "MAINNET"}`);
  console.log(`Source chain: ${getChainName(chains.srcChainId)} (${chains.srcChainId})`);
  console.log(`Destination chain: ${getChainName(chains.dstChainId)} (${chains.dstChainId})\n`);

  // Get account
  const account = privateKeyToAccount(args.privateKey);
  console.log(`Alice address: ${account.address}`);

  // Create clients
  const srcPublicClient = createPublicClientForChain(chains.srcChain);
  const srcWalletClient = createWalletClientForChain(chains.srcChain, args.privateKey);

  // Load contract addresses
  console.log("Loading contract addresses...");
  const srcAddresses = getContractAddresses(chains.srcChainId);
  const dstAddresses = getContractAddresses(chains.dstChainId);

  // Get token addresses
  const srcTokenAddress = srcAddresses.tokens[args.tokenA];
  const dstTokenAddress = dstAddresses.tokens[args.tokenB];

  if (!srcTokenAddress || !dstTokenAddress) {
    console.error(`Token addresses not found for ${args.tokenA} or ${args.tokenB}`);
    return;
  }

  // Parse amounts
  const makingAmount = parseEther(args.amount);
  const takingAmount = parseEther(args.amount); // 1:1 for simplicity, could be different

  // Generate secret for cross-chain atomicity
  const secret = generateSecret();
  const hashlock = computeHashlock(secret);

  console.log(`Order Details:`);
  console.log(`  Offering: ${args.amount} ${args.tokenA}`);
  console.log(`  Requesting: ${args.amount} ${args.tokenB}`);
  console.log(`  Secret: ${secret}`);
  console.log(`  Hashlock: ${hashlock}`);

  // Check balance
  try {
    await validateTokenBalance(
      srcTokenAddress,
      account.address,
      makingAmount,
      srcPublicClient
    );
  } catch (error) {
    console.error("Insufficient balance:", error);
    return;
  }

  // Generate unique salt
  const salt = BigInt(keccak256(encodePacked(
    ["uint256", "address", "bytes32"],
    [BigInt(Date.now()), account.address, hashlock]
  )));

  // Build the order
  console.log("\nBuilding 1inch Limit Order...");
  const order: Order = buildOrder({
    maker: account.address,
    receiver: account.address,
    makerAsset: srcTokenAddress,
    takerAsset: dstTokenAddress,
    makingAmount,
    takingAmount,
    salt,
    allowPartialFills: false, // For atomic cross-chain swaps
    allowMultipleFills: false,
    needPostInteraction: true, // Required for escrow creation
  });

  console.log("Order structure:", {
    salt: order.salt.toString(),
    maker: order.maker,
    makerAsset: order.makerAsset,
    takerAsset: order.takerAsset,
    makingAmount: order.makingAmount.toString(),
    takingAmount: order.takingAmount.toString(),
    makerTraits: order.makerTraits.toString(),
  });

  // Sign the order using EIP-712
  console.log("\n✍️  Signing order with EIP-712...");
  try {
    // Approve tokens to LimitOrderProtocol
    const srcToken = createERC20Token(
      srcTokenAddress,
      srcPublicClient,
      srcWalletClient
    );

    console.log("Checking token allowance...");
    const allowance = await srcToken.read.allowance([
      account.address,
      srcAddresses.limitOrderProtocol,
    ]);

    if (allowance < makingAmount) {
      console.log("Approving tokens to LimitOrderProtocol...");
      const approveHash = await srcToken.write.approve([
        srcAddresses.limitOrderProtocol,
        makingAmount,
      ]);
      await waitForTransaction(srcPublicClient, approveHash);
      console.log("✅ Tokens approved");
    }

    // Sign the order
    const signature = await srcWalletClient.signTypedData({
      account,
      domain: {
        ...LIMIT_ORDER_PROTOCOL_DOMAIN,
        chainId: chains.srcChainId,
        verifyingContract: srcAddresses.limitOrderProtocol,
      },
      types: ORDER_TYPES,
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

    console.log("✅ Order signed successfully!");
    console.log("Signature:", signature);

    // Calculate order hash for tracking
    const orderHash = keccak256(encodePacked(
      ["bytes32", "address", "uint256"],
      [hashlock, account.address, order.salt]
    ));

    // Create order metadata
    const orderMetadata: OrderMetadata = {
      order,
      signature,
      orderHash,
      createdAt: Date.now(),
      chainId: chains.srcChainId,
      status: "pending",
    };

    // Save order and metadata
    const ordersDir = "./data/orders";
    await Deno.mkdir(ordersDir, { recursive: true });
    const orderFile = `${ordersDir}/order-${orderHash}.json`;
    
    // Include additional cross-chain metadata
    const fullOrderData = {
      ...orderMetadata,
      crossChainData: {
        secret,
        hashlock,
        srcChainId: chains.srcChainId,
        dstChainId: chains.dstChainId,
        srcToken: args.tokenA,
        dstToken: args.tokenB,
      },
    };

    await Deno.writeTextFile(orderFile, JSON.stringify(fullOrderData, (_, v) =>
      typeof v === "bigint" ? v.toString() : v
    , 2));

    // Save to state manager for backward compatibility
    const orderParams: OrderParams = {
      srcToken: srcTokenAddress,
      dstToken: dstTokenAddress,
      srcAmount: makingAmount,
      dstAmount: takingAmount,
      safetyDeposit: 0n, // Handled differently in new architecture
      secret,
      srcChainId: chains.srcChainId,
      dstChainId: chains.dstChainId,
    };

    const orderState: OrderState = {
      id: orderHash,
      params: orderParams,
      immutables: {
        orderHash,
        hashlock,
        maker: account.address,
        taker: "0x0000000000000000000000000000000000000000" as Address,
        token: srcTokenAddress,
        amount: makingAmount,
        safetyDeposit: 0n,
        timelocks: createTimelocks(),
      },
      srcEscrowAddress: "0x0000000000000000000000000000000000000000" as Address, // Will be set when Bob deploys
      status: OrderStatus.Created,
      createdAt: Date.now(),
    };

    const stateManager = new AliceStateManager();
    await stateManager.loadFromFile().catch(() => {});
    stateManager.addOrder(orderState, secret);
    await stateManager.saveToFile();

    console.log("\n✅ Order created and signed successfully!");
    console.log(`📋 Order Hash: ${orderHash}`);
    console.log(`💾 Order saved to: ${orderFile}`);
    console.log("\n📢 Important Notes:");
    console.log("- Alice does NOT create the source escrow directly");
    console.log("- The order is now discoverable by resolvers (Bob)");
    console.log("- Bob will deploy the source escrow when filling the order");
    console.log("- Use 'deno task alice:list-orders' to check order status");
    console.log("\nNext steps:");
    console.log("1. Wait for Bob to discover and fill your order");
    console.log("2. Once Bob deploys destination escrow, use 'alice:withdraw' to claim tokens");

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