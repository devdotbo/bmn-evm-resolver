import { AliceStateManager } from "./state.ts";
import { formatTokenAmount, CHAIN_NAMES } from "../config/constants.ts";
import { getCurrentPhase, formatDuration, getTimeUntilTimelock } from "../utils/timelocks.ts";
import type { OrderState } from "../types/index.ts";

/**
 * List all orders created by Alice
 */
export async function listOrders(): Promise<void> {
  console.log("=== Alice's Orders ===\n");

  // Load state
  const stateManager = new AliceStateManager();
  const loaded = await stateManager.loadFromFile();
  
  if (!loaded) {
    console.log("No saved orders found.");
    console.log("\nTo create an order, use:");
    console.log("  deno task alice:create-order --amount <amount>");
    return;
  }

  // Get statistics
  const stats = stateManager.getStatistics();
  console.log("Order Statistics:");
  console.log(`  Total Orders: ${stats.total}`);
  console.log(`  Active Orders: ${stats.active}`);
  console.log(`  Completed Orders: ${stats.completed}`);
  console.log(`  Orders with Secrets: ${stats.withSecrets}`);
  console.log();

  // Get all orders
  const orders = stateManager.getAllOrders();
  
  if (orders.length === 0) {
    console.log("No orders found.");
    return;
  }

  // Sort by creation date (newest first)
  orders.sort((a, b) => b.createdAt - a.createdAt);

  // Display active orders first
  const activeOrders = orders.filter(o => 
    o.status !== "COMPLETED" && o.status !== "CANCELLED" && o.status !== "FAILED"
  );

  if (activeOrders.length > 0) {
    console.log("Active Orders:");
    console.log("─".repeat(100));
    for (const order of activeOrders) {
      await displayOrderDetails(order, stateManager);
    }
  }

  // Display completed/cancelled orders
  const inactiveOrders = orders.filter(o => 
    o.status === "COMPLETED" || o.status === "CANCELLED" || o.status === "FAILED"
  );

  if (inactiveOrders.length > 0) {
    console.log("\nCompleted/Cancelled Orders:");
    console.log("─".repeat(100));
    for (const order of inactiveOrders) {
      displayOrderSummary(order);
    }
  }

  // Show helpful commands
  console.log("\nAvailable Commands:");
  console.log("  Create Order:  deno task alice:create-order --amount <amount>");
  console.log("  Withdraw:      deno task alice:withdraw --order-id <orderId>");
  console.log("  Check Status:  deno task alice:list-orders");
}

/**
 * Display detailed order information
 */
async function displayOrderDetails(order: OrderState, stateManager: AliceStateManager): Promise<void> {
  const hasSecret = stateManager.getSecret(order.id) !== undefined;
  const phase = getCurrentPhase(order.immutables.timelocks);
  const now = BigInt(Math.floor(Date.now() / 1000));
  
  console.log(`Order ID: ${order.id}`);
  console.log(`  Status: ${order.status} | Phase: ${phase}`);
  console.log(`  Created: ${new Date(order.createdAt).toLocaleString()}`);
  console.log(`  Chains: ${CHAIN_NAMES[order.params.srcChainId]} → ${CHAIN_NAMES[order.params.dstChainId]}`);
  console.log(`  Amount: ${formatTokenAmount(order.params.srcAmount)} tokens`);
  console.log(`  Safety Deposit: ${formatTokenAmount(order.params.safetyDeposit)} tokens`);
  console.log(`  Has Secret: ${hasSecret ? "Yes ✓" : "No ✗"}`);
  
  // Show escrow addresses
  if (order.srcEscrowAddress) {
    console.log(`  Source Escrow: ${order.srcEscrowAddress}`);
  }
  if (order.dstEscrowAddress) {
    console.log(`  Destination Escrow: ${order.dstEscrowAddress}`);
  } else if (order.status === "SRC_ESCROW_DEPLOYED") {
    console.log(`  Destination Escrow: Waiting for resolver...`);
  }
  
  // Show timelock information
  const timelocks = order.immutables.timelocks;
  console.log("  Timelocks:");
  
  // Destination timelocks (for Alice to withdraw)
  if (now < timelocks.dstWithdrawal) {
    const remaining = getTimeUntilTimelock(timelocks.dstWithdrawal);
    console.log(`    Withdrawal Available In: ${formatDuration(remaining)}`);
  } else if (now < timelocks.dstCancellation) {
    console.log(`    Withdrawal: ACTIVE ✓`);
    const remaining = getTimeUntilTimelock(timelocks.dstCancellation);
    console.log(`    Cancellation In: ${formatDuration(remaining)}`);
  } else {
    console.log(`    Status: Can be cancelled by Bob`);
  }
  
  // Show next action
  console.log("  Next Action:");
  if (order.status === "SRC_ESCROW_DEPLOYED" && !order.dstEscrowAddress) {
    console.log(`    → Waiting for resolver to deploy destination escrow`);
  } else if (order.status === "DST_ESCROW_DEPLOYED" && hasTimelockPassed(timelocks.dstWithdrawal)) {
    console.log(`    → Run: deno task alice:withdraw --order-id ${order.id}`);
  } else if (order.status === "DST_ESCROW_DEPLOYED") {
    const remaining = getTimeUntilTimelock(timelocks.dstWithdrawal);
    console.log(`    → Wait ${formatDuration(remaining)} before withdrawal`);
  } else if (order.status === "SECRET_REVEALED") {
    console.log(`    → Order complete, Bob is claiming source tokens`);
  }
  
  console.log("─".repeat(100));
}

/**
 * Display order summary for completed/cancelled orders
 */
function displayOrderSummary(order: OrderState): void {
  const date = new Date(order.createdAt).toLocaleDateString();
  const amount = formatTokenAmount(order.params.srcAmount);
  const chains = `${order.params.srcChainId} → ${order.params.dstChainId}`;
  
  console.log(
    `${order.id.substring(0, 20)}... | ${date} | ${amount} tokens | ${chains} | ${order.status}`
  );
}

/**
 * Check if timelock has passed
 */
function hasTimelockPassed(timelock: bigint): boolean {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return now >= timelock;
}

// Main entry point
if (import.meta.main) {
  await listOrders();
}