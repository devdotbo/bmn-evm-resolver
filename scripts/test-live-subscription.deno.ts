#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Test Live Data Subscription using @ponder/client
 * 
 * This script demonstrates real-time data subscriptions via Server-Sent Events (SSE)
 * from the Ponder indexer using SQL over HTTP.
 * 
 * Run: deno run --allow-net --allow-env --allow-read scripts/test-live-subscription.deno.ts
 */

import { createClient, eq, desc, and, or } from "npm:@ponder/client@0.12.0";
import * as schema from "../src/indexer/ponder.schema.ts";

const INDEXER_URL = Deno.env.get("INDEXER_URL") || "http://localhost:42069";
const RESOLVER_ADDRESS = Deno.env.get("RESOLVER_PRIVATE_KEY") 
  ? "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5" // Default resolver address
  : "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5";

console.log("🔴 Live Data Subscription Test");
console.log(`📍 Server: ${INDEXER_URL}`);
console.log(`👤 Resolver: ${RESOLVER_ADDRESS}`);
console.log("=".repeat(50));

async function testLiveSubscriptions() {
  try {
    // Create client
    const client = createClient(`${INDEXER_URL}/sql`, { schema });
    console.log("✅ Client created successfully\n");

    // Store unsubscribe functions
    const unsubscribers: Array<() => void> = [];

    // 1. Live subscription to atomic swaps
    console.log("📡 Subscribing to atomic swaps...");
    const { unsubscribe: unsubSwaps } = client.live(
      (db) => db
        .select()
        .from(schema.atomicSwap)
        .where(
          and(
            eq(schema.atomicSwap.srcTaker, RESOLVER_ADDRESS.toLowerCase()),
            or(
              eq(schema.atomicSwap.status, "pending"),
              eq(schema.atomicSwap.status, "src_created")
            )
          )
        )
        .orderBy(desc(schema.atomicSwap.srcCreatedAt))
        .execute(),
      (data) => {
        console.log(`\n🔄 [Atomic Swaps Update] ${new Date().toISOString()}`);
        console.log(`  Found ${data.length} pending swaps`);
        data.forEach((swap: any, i: number) => {
          console.log(`  ${i + 1}. Order: ${swap.orderHash?.slice(0, 10)}...`);
          console.log(`     Status: ${swap.status}`);
          console.log(`     Src Chain: ${swap.srcChainId} → Dst Chain: ${swap.dstChainId}`);
        });
      },
      (error) => {
        console.error("❌ Atomic swap subscription error:", error);
      }
    );
    unsubscribers.push(unsubSwaps);

    // 2. Live subscription to source escrows
    console.log("📡 Subscribing to source escrows...");
    const { unsubscribe: unsubSrc } = client.live(
      (db) => db
        .select()
        .from(schema.srcEscrow)
        .where(
          and(
            eq(schema.srcEscrow.taker, RESOLVER_ADDRESS.toLowerCase()),
            eq(schema.srcEscrow.status, "created")
          )
        )
        .orderBy(desc(schema.srcEscrow.createdAt))
        .limit(10)
        .execute(),
      (data) => {
        console.log(`\n🔄 [Source Escrows Update] ${new Date().toISOString()}`);
        console.log(`  Found ${data.length} active escrows`);
        data.forEach((escrow: any, i: number) => {
          console.log(`  ${i + 1}. Escrow: ${escrow.escrowAddress?.slice(0, 10)}...`);
          console.log(`     Order: ${escrow.orderHash?.slice(0, 10)}...`);
          console.log(`     Amount: ${escrow.srcAmount} ${escrow.srcToken}`);
        });
      },
      (error) => {
        console.error("❌ Source escrow subscription error:", error);
      }
    );
    unsubscribers.push(unsubSrc);

    // 3. Live subscription to chain statistics
    console.log("📡 Subscribing to chain statistics...");
    const { unsubscribe: unsubStats } = client.live(
      (db) => db
        .select()
        .from(schema.chainStatistics)
        .execute(),
      (data) => {
        console.log(`\n🔄 [Chain Statistics Update] ${new Date().toISOString()}`);
        data.forEach((stat: any) => {
          console.log(`  Chain ${stat.chainId}:`);
          console.log(`    Src Escrows: ${stat.totalSrcEscrows}`);
          console.log(`    Dst Escrows: ${stat.totalDstEscrows}`);
          console.log(`    Withdrawals: ${stat.totalWithdrawals}`);
          console.log(`    Cancellations: ${stat.totalCancellations}`);
        });
      },
      (error) => {
        console.error("❌ Chain statistics subscription error:", error);
      }
    );
    unsubscribers.push(unsubStats);

    // 4. Live subscription to recent withdrawals
    console.log("📡 Subscribing to withdrawal events...");
    const { unsubscribe: unsubWithdrawals } = client.live(
      (db) => db
        .select()
        .from(schema.escrowWithdrawal)
        .orderBy(desc(schema.escrowWithdrawal.withdrawnAt))
        .limit(5)
        .execute(),
      (data) => {
        console.log(`\n🔄 [Recent Withdrawals Update] ${new Date().toISOString()}`);
        console.log(`  Last ${data.length} withdrawals:`);
        data.forEach((withdrawal: any, i: number) => {
          console.log(`  ${i + 1}. Escrow: ${withdrawal.escrowAddress?.slice(0, 10)}...`);
          console.log(`     Secret: ${withdrawal.secret?.slice(0, 10)}...`);
          console.log(`     Block: ${withdrawal.blockNumber}`);
        });
      },
      (error) => {
        console.error("❌ Withdrawal subscription error:", error);
      }
    );
    unsubscribers.push(unsubWithdrawals);

    // 5. Live subscription to BMN token transfers
    console.log("📡 Subscribing to BMN token transfers...");
    const { unsubscribe: unsubTransfers } = client.live(
      (db) => db
        .select()
        .from(schema.bmnTransfer)
        .orderBy(desc(schema.bmnTransfer.timestamp))
        .limit(5)
        .execute(),
      (data) => {
        console.log(`\n🔄 [BMN Transfers Update] ${new Date().toISOString()}`);
        console.log(`  Last ${data.length} transfers:`);
        data.forEach((transfer: any, i: number) => {
          console.log(`  ${i + 1}. From: ${transfer.from?.slice(0, 10)}... → To: ${transfer.to?.slice(0, 10)}...`);
          console.log(`     Amount: ${transfer.value}`);
          console.log(`     Chain: ${transfer.chainId}`);
        });
      },
      (error) => {
        console.error("❌ BMN transfer subscription error:", error);
      }
    );
    unsubscribers.push(unsubTransfers);

    console.log("\n✨ All subscriptions active!");
    console.log("📊 Monitoring 5 live data streams:");
    console.log("   1. Atomic Swaps (pending/src_created)");
    console.log("   2. Source Escrows (created status)");
    console.log("   3. Chain Statistics");
    console.log("   4. Recent Withdrawals");
    console.log("   5. BMN Token Transfers");
    console.log("\n⏳ Listening for updates... (Press Ctrl+C to stop)\n");

    // Handle graceful shutdown
    const handleShutdown = () => {
      console.log("\n\n🛑 Shutting down subscriptions...");
      unsubscribers.forEach(unsub => unsub());
      console.log("✅ All subscriptions closed");
      Deno.exit(0);
    };

    // Register signal handlers
    Deno.addSignalListener("SIGINT", handleShutdown);
    Deno.addSignalListener("SIGTERM", handleShutdown);

    // Keep the script running
    await new Promise(() => {});

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    Deno.exit(1);
  }
}

// Run the test
console.log("🚀 Starting live subscription test...\n");
await testLiveSubscriptions();