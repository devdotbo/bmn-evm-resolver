/**
 * State synchronization utilities between Alice and Bob (resolver)
 * This module handles synchronizing order state between different actors
 */

import { OrderState, OrderStatus } from "../types/index.ts";
import { ORDER_STATE_FILE, ALICE_STATE_FILE } from "../config/constants.ts";

/**
 * Load resolver state from file
 * @returns Resolver orders or empty array
 */
export async function loadResolverState(): Promise<OrderState[]> {
  try {
    const content = await Deno.readTextFile(ORDER_STATE_FILE);
    const data = JSON.parse(content);
    
    // Convert entries back to OrderState objects
    const orders: OrderState[] = [];
    for (const [_, order] of data.orders) {
      orders.push(order);
    }
    
    return orders;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return [];
    }
    throw error;
  }
}

/**
 * Load Alice state from file
 * @returns Alice's order data
 */
export async function loadAliceState(): Promise<any> {
  try {
    const content = await Deno.readTextFile(ALICE_STATE_FILE);
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return { orders: [], secrets: [], timestamp: Date.now() };
    }
    throw error;
  }
}

/**
 * Sync destination escrow addresses from resolver to Alice
 * Updates Alice's state with destination escrow addresses deployed by resolver
 */
export async function syncDestinationEscrows(): Promise<void> {
  try {
    // Load both states
    const resolverOrders = await loadResolverState();
    const aliceData = await loadAliceState();
    
    let updated = false;
    
    // Iterate through resolver orders
    for (const resolverOrder of resolverOrders) {
      const escrowAddress = resolverOrder.actualDstEscrowAddress || resolverOrder.dstEscrowAddress;
      if (!escrowAddress) continue;
      
      // Find matching order in Alice's state
      const aliceOrderIndex = aliceData.orders.findIndex(
        ([orderId]: [string, any]) => orderId === resolverOrder.id
      );
      
      if (aliceOrderIndex !== -1) {
        const [orderId, aliceOrder] = aliceData.orders[aliceOrderIndex];
        
        // Update if destination escrow is not set
        if (!aliceOrder.actualDstEscrowAddress && !aliceOrder.dstEscrowAddress || 
            aliceOrder.dstEscrowAddress === "0x0000000000000000000000000000000000000000") {
          
          console.log(`Syncing destination escrow for order ${orderId}`);
          console.log(`  Escrow address: ${escrowAddress}`);
          
          // Update Alice's order with both addresses
          aliceOrder.dstEscrowAddress = resolverOrder.dstEscrowAddress;
          aliceOrder.actualDstEscrowAddress = resolverOrder.actualDstEscrowAddress;
          aliceOrder.status = "DST_ESCROW_DEPLOYED";
          
          // Also update the taker address to Bob's address
          if (resolverOrder.immutables?.taker && 
              aliceOrder.immutables.taker === "0x0000000000000000000000000000000000000000") {
            aliceOrder.immutables.taker = resolverOrder.immutables.taker;
          }
          
          updated = true;
        }
      }
    }
    
    // Save updated Alice state if changes were made
    if (updated) {
      aliceData.timestamp = Date.now();
      await Deno.writeTextFile(ALICE_STATE_FILE, JSON.stringify(aliceData, null, 2));
      console.log("✅ Alice state synchronized with resolver");
    } else {
      console.log("No updates needed - states are in sync");
    }
  } catch (error) {
    console.error("Error syncing states:", error);
  }
}

/**
 * Watch for state changes and sync automatically
 * @param intervalMs Check interval in milliseconds
 */
export async function watchAndSyncStates(intervalMs = 2000): Promise<void> {
  console.log("Starting state synchronization watcher...");
  
  // Initial sync
  await syncDestinationEscrows();
  
  // Set up periodic sync
  setInterval(async () => {
    await syncDestinationEscrows();
  }, intervalMs);
}

// Main entry point for standalone sync script
if (import.meta.main) {
  const args = Deno.args;
  
  if (args.includes("--watch")) {
    // Watch mode
    await watchAndSyncStates();
  } else {
    // One-time sync
    await syncDestinationEscrows();
  }
}