import { OrderStateManager } from "./state.ts";
import { formatDuration, getCurrentPhase } from "../utils/timelocks.ts";
import { formatTokenAmount } from "../config/constants.ts";
import { CHAIN_NAMES } from "../config/constants.ts";

/**
 * Status utility for checking resolver state
 */
export async function showResolverStatus(): Promise<void> {
  console.log("=== Bridge-Me-Not Resolver Status ===\n");

  // Load state
  const stateManager = new OrderStateManager();
  
  try {
    const loaded = await stateManager.loadFromFile();
    if (!loaded) {
      console.log("No saved state found. Resolver may not have been run yet.");
      return;
    }
  } catch (error) {
    console.error("Error loading state:", error);
    return;
  }

  // Get statistics
  const stats = stateManager.getStatistics();
  console.log("Order Statistics:");
  console.log(`  Total Orders: ${stats.total}`);
  console.log(`  Created: ${stats.CREATED || 0}`);
  console.log(`  Src Escrow Deployed: ${stats.SRC_ESCROW_DEPLOYED || 0}`);
  console.log(`  Dst Escrow Deployed: ${stats.DST_ESCROW_DEPLOYED || 0}`);
  console.log(`  Secret Revealed: ${stats.SECRET_REVEALED || 0}`);
  console.log(`  Completed: ${stats.COMPLETED || 0}`);
  console.log(`  Cancelled: ${stats.CANCELLED || 0}`);
  console.log(`  Failed: ${stats.FAILED || 0}`);
  console.log();

  // Show active orders
  const activeOrders = stateManager.getActiveOrders();
  if (activeOrders.length > 0) {
    console.log(`Active Orders (${activeOrders.length}):`);
    console.log("─".repeat(80));
    
    for (const order of activeOrders) {
      await displayOrderDetails(order);
    }
  } else {
    console.log("No active orders.");
  }

  // Show recent completed orders
  const completedOrders = stateManager.getOrdersByStatus("COMPLETED" as any);
  const recentCompleted = completedOrders
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  if (recentCompleted.length > 0) {
    console.log("\nRecent Completed Orders:");
    console.log("─".repeat(80));
    
    for (const order of recentCompleted) {
      displayOrderSummary(order);
    }
  }

  // Show orders needing action
  const ordersNeedingAction = stateManager.getOrdersNeedingAction();
  if (ordersNeedingAction.length > 0) {
    console.log("\nOrders Requiring Action:");
    console.log("─".repeat(80));
    
    for (const order of ordersNeedingAction) {
      console.log(`Order ${order.id}: Deploy destination escrow`);
    }
  }
}

/**
 * Display detailed order information
 * @param order The order to display
 */
async function displayOrderDetails(order: any): Promise<void> {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const phase = getCurrentPhase(order.immutables.timelocks);
  
  console.log(`Order ID: ${order.id}`);
  console.log(`  Status: ${order.status}`);
  console.log(`  Phase: ${phase}`);
  console.log(`  Created: ${new Date(order.createdAt).toLocaleString()}`);
  console.log(`  Source Chain: ${CHAIN_NAMES[order.params.srcChainId] || order.params.srcChainId}`);
  console.log(`  Destination Chain: ${CHAIN_NAMES[order.params.dstChainId] || order.params.dstChainId}`);
  console.log(`  Amount: ${formatTokenAmount(BigInt(order.params.srcAmount))} tokens`);
  console.log(`  Safety Deposit: ${formatTokenAmount(BigInt(order.params.safetyDeposit))} tokens`);
  
  // Show addresses if available
  if (order.srcEscrowAddress) {
    console.log(`  Source Escrow: ${order.srcEscrowAddress}`);
  }
  if (order.dstEscrowAddress) {
    console.log(`  Destination Escrow: ${order.dstEscrowAddress}`);
  }
  
  // Show timelock status
  console.log("  Timelocks:");
  const timelocks = order.immutables.timelocks;
  
  const dstWithdrawal = BigInt(timelocks.dstWithdrawal);
  const dstCancellation = BigInt(timelocks.dstCancellation);
  
  if (now < dstWithdrawal) {
    const remaining = dstWithdrawal - now;
    console.log(`    Dst Withdrawal: ${formatDuration(remaining)} remaining`);
  } else if (now < dstCancellation) {
    console.log(`    Dst Withdrawal: ACTIVE`);
    const remaining = dstCancellation - now;
    console.log(`    Dst Cancellation: ${formatDuration(remaining)} remaining`);
  } else {
    console.log(`    Dst Cancellation: ACTIVE`);
  }
  
  if (order.secretRevealed) {
    console.log(`  Secret Revealed: Yes`);
  }
  
  console.log("─".repeat(80));
}

/**
 * Display order summary
 * @param order The order to display
 */
function displayOrderSummary(order: any): void {
  const completedAt = new Date(order.createdAt).toLocaleString();
  const amount = formatTokenAmount(order.params.srcAmount);
  
  console.log(
    `${order.id.substring(0, 16)}... | ${completedAt} | ${amount} tokens | ${order.status}`
  );
}

/**
 * Format resolver configuration for display
 */
export function displayResolverConfig(config: any): void {
  console.log("=== Resolver Configuration ===\n");
  console.log(`Minimum Profit: ${config.minProfitBps / 100}%`);
  console.log(`Max Concurrent Orders: ${config.maxConcurrentOrders}`);
  console.log("\nConfigured Chains:");
  
  for (const [chainId, chainConfig] of Object.entries(config.chains)) {
    console.log(`  ${CHAIN_NAMES[Number(chainId)] || chainId}:`);
    console.log(`    RPC: ${(chainConfig as any).rpcUrl}`);
    console.log(`    Escrow Factory: ${(chainConfig as any).escrowFactory}`);
  }
  
  console.log("\nConfigured Tokens:");
  for (const [symbol, tokenConfig] of Object.entries(config.tokens)) {
    console.log(`  ${symbol}: ${(tokenConfig as any).address}`);
  }
}

// Main entry point for status command
if (import.meta.main) {
  await showResolverStatus();
}