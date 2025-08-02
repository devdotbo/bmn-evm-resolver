import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";
import { privateKeyToAccount } from "viem/accounts";
import { chainB } from "../config/chains.ts";
import {
  getContractAddresses,
  areContractsConfigured,
  loadContractAddressesFromEnv,
} from "../config/contracts.ts";
import {
  createPublicClientForChain,
  createWalletClientForChain,
  createEscrowDst,
  createEscrowFactory,
  waitForTransaction,
} from "../utils/contracts.ts";
import { computeEscrowDstAddress, getProxyBytecodeHash } from "../utils/addresses.ts";
import { validateSecret } from "../utils/secrets.ts";
import { hasTimelockPassed, formatDuration, getTimeUntilTimelock, packTimelocks } from "../utils/timelocks.ts";
import { validateForWithdrawal } from "../utils/validation.ts";
import { formatTokenAmount } from "../config/constants.ts";
import { AliceStateManager } from "./state.ts";
import { OrderStatus } from "../types/index.ts";

/**
 * Withdraw from destination escrow (Alice)
 */
export async function withdrawFromOrder(args: {
  orderId: string;
  privateKey: `0x${string}`;
}): Promise<void> {
  console.log("=== Withdrawing from Destination Escrow ===\n");

  // Load contract addresses
  loadContractAddressesFromEnv();

  // Check configuration
  if (!areContractsConfigured(1338)) {
    console.error("Contract addresses not configured for destination chain.");
    return;
  }

  // Get account
  const account = privateKeyToAccount(args.privateKey);
  console.log(`Alice address: ${account.address}`);

  // Load state
  const stateManager = new AliceStateManager();
  const loaded = await stateManager.loadFromFile();
  if (!loaded) {
    console.error("No saved orders found. Please create an order first.");
    return;
  }

  // Get order
  const order = stateManager.getOrder(args.orderId);
  if (!order) {
    console.error(`Order ${args.orderId} not found.`);
    console.log("\nAvailable orders:");
    const orders = stateManager.getAllOrders();
    for (const o of orders) {
      console.log(`  ${o.id} - Status: ${o.status}`);
    }
    return;
  }

  // Get secret
  const secret = stateManager.getSecret(args.orderId);
  if (!secret) {
    console.error(`Secret not found for order ${args.orderId}`);
    return;
  }

  console.log(`Order Details:`);
  console.log(`  ID: ${order.id}`);
  console.log(`  Status: ${order.status}`);
  console.log(`  Amount: ${formatTokenAmount(order.params.dstAmount)} tokens`);

  // Validate order state
  try {
    validateForWithdrawal(order);
  } catch (error) {
    console.error("Order not ready for withdrawal:", error);
    
    // Check if we need to wait for destination escrow
    if (!order.dstEscrowAddress) {
      console.log("\nWaiting for resolver to deploy destination escrow...");
      console.log("Please ensure the resolver is running.");
      return;
    }
    
    return;
  }

  // Create clients
  const dstPublicClient = createPublicClientForChain(chainB);
  const dstWalletClient = createWalletClientForChain(chainB, args.privateKey);

  // Get destination escrow address
  let dstEscrowAddress = order.dstEscrowAddress;
  
  if (!dstEscrowAddress) {
    // Try to compute it
    console.log("Computing destination escrow address...");
    const dstAddresses = getContractAddresses(1338);
    const proxyBytecodeHash = getProxyBytecodeHash(1338);
    
    // For destination escrow, Bob is the maker
    // We need to know Bob's address to compute the correct immutables
    console.log("Note: Cannot compute destination escrow address without Bob's address");
    console.log("Please wait for Bob to deploy the escrow and try again.");
    return;
  }

  console.log(`Destination escrow: ${dstEscrowAddress}`);

  // Check timelock
  const now = BigInt(Math.floor(Date.now() / 1000));
  const withdrawalTimelock = order.immutables.timelocks.dstWithdrawal;
  
  if (!hasTimelockPassed(withdrawalTimelock)) {
    const remaining = getTimeUntilTimelock(withdrawalTimelock);
    console.error(`Withdrawal timelock not yet passed.`);
    console.log(`Time remaining: ${formatDuration(remaining)}`);
    return;
  }

  // Validate secret
  if (!validateSecret(secret, order.immutables.hashlock)) {
    console.error("Secret does not match hashlock!");
    return;
  }

  // Create escrow contract instance
  const escrow = createEscrowDst(
    dstEscrowAddress,
    dstPublicClient,
    dstWalletClient
  );

  try {
    console.log("\nWithdrawing from destination escrow...");
    console.log(`Revealing secret: ${secret}`);
    
    // Prepare immutables for destination escrow
    // On destination chain, Bob is the maker and Alice is the taker
    const dstImmutables = {
      orderHash: order.immutables.orderHash,
      hashlock: order.immutables.hashlock,
      maker: order.immutables.taker, // Bob's address (was taker on source)
      taker: order.immutables.maker, // Alice's address (was maker on source)
      token: order.params.dstToken,
      amount: order.params.dstAmount,
      safetyDeposit: order.params.safetyDeposit,
      timelocks: packTimelocks(order.immutables.timelocks),
    };
    
    // Call withdraw function with secret and immutables
    const hash = await escrow.write.withdraw([secret, dstImmutables]);
    console.log(`Transaction hash: ${hash}`);
    
    // Wait for confirmation
    const receipt = await waitForTransaction(dstPublicClient, hash);
    
    if (receipt.status === "success") {
      console.log("\n✅ Withdrawal successful!");
      console.log(`Tokens received: ${formatTokenAmount(order.params.dstAmount)}`);
      
      // Update order state
      stateManager.updateOrder(order.id, {
        status: OrderStatus.Completed,
        secretRevealed: true,
      });
      await stateManager.saveToFile();
      
      console.log("\nThe secret has been revealed on-chain.");
      console.log("Bob can now withdraw from the source escrow using this secret.");
    } else {
      console.error("❌ Withdrawal failed!");
      console.log("Transaction reverted. Please check:");
      console.log("- The timelock has passed");
      console.log("- The secret is correct");
      console.log("- The escrow has not already been withdrawn");
    }
  } catch (error) {
    console.error("Error during withdrawal:", error);
    
    // Common error reasons
    if (error.message?.includes("Timelock")) {
      console.log("\nThe withdrawal timelock has not passed yet.");
    } else if (error.message?.includes("Invalid secret")) {
      console.log("\nThe provided secret is invalid.");
    } else if (error.message?.includes("Already withdrawn")) {
      console.log("\nThe escrow has already been withdrawn.");
    }
  }
}

// Main entry point
if (import.meta.main) {
  const flags = parseArgs(Deno.args, {
    string: ["order-id", "private-key"],
  });

  if (!flags["order-id"]) {
    console.error("Usage: deno task alice:withdraw --order-id <orderId>");
    console.error("\nTo list your orders: deno task alice:list-orders");
    Deno.exit(1);
  }

  const privateKey = flags["private-key"] || Deno.env.get("ALICE_PRIVATE_KEY");
  if (!privateKey || !privateKey.startsWith("0x")) {
    console.error("Please provide --private-key or set ALICE_PRIVATE_KEY environment variable");
    Deno.exit(1);
  }

  await withdrawFromOrder({
    orderId: flags["order-id"],
    privateKey: privateKey as `0x${string}`,
  });
}