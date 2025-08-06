#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

import { SimpleAlice } from "./src/alice/simple-alice.ts";
import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["action", "order", "resolver", "src-chain", "dst-chain", "amount"],
    default: {
      action: "help",
      "src-chain": "8453", // Base
      "dst-chain": "10", // Optimism
      amount: "1000000000000000000", // 1 token
    },
  });

  const alice = new SimpleAlice();
  
  // Initialize SecretManager
  await alice.init();

  switch (args.action) {
    case "create":
      if (!args.resolver) {
        console.error("❌ Resolver address required (--resolver <address>)");
        Deno.exit(1);
      }
      
      const orderHash = await alice.createOrder({
        srcChainId: parseInt(args["src-chain"]),
        dstChainId: parseInt(args["dst-chain"]),
        srcAmount: BigInt(args.amount),
        dstAmount: BigInt(args.amount), // Same amount for simplicity
        resolverAddress: args.resolver,
        srcSafetyDeposit: BigInt(args.amount) / 100n, // 1% safety deposit
        dstSafetyDeposit: BigInt(args.amount) / 100n,
      });
      
      console.log(`✅ Order created: ${orderHash}`);
      break;

    case "list":
      const orders = await alice.listOrders();
      console.log("\n📋 Your orders:");
      console.log("================");
      for (const order of orders) {
        console.log(`\nOrder: ${order.orderHash}`);
        console.log(`  Status: ${order.status}`);
        console.log(`  Source Chain: ${order.srcChain}`);
        console.log(`  Dest Chain: ${order.dstChain}`);
        console.log(`  Amount: ${order.srcAmount}`);
        console.log(`  Created: ${order.createdAt}`);
      }
      break;

    case "withdraw":
      if (!args.order) {
        console.error("❌ Order hash required (--order <hash>)");
        Deno.exit(1);
      }
      
      await alice.withdrawFromDestination(args.order);
      console.log("✅ Withdrawal complete!");
      break;

    case "monitor":
      console.log("🤖 Starting auto-monitor mode...");
      console.log("   Alice will automatically withdraw when Bob deploys destination escrows");
      console.log("   Press Ctrl+C to stop");
      await alice.monitorAndWithdraw();
      break;

    case "help":
    default:
      console.log(`
Bridge-Me-Not Alice Client (Simplified)
=======================================

Usage: deno run alice.ts --action <action> [options]

Actions:
  create    Create a new cross-chain swap order
  list      List all your orders
  withdraw  Withdraw from destination escrow (reveals secret)
  monitor   Auto-monitor and withdraw when destination escrows are ready

Options:
  --resolver <address>   Resolver address (for create)
  --order <hash>        Order hash (for withdraw)
  --src-chain <id>      Source chain ID (default: 8453 - Base)
  --dst-chain <id>      Destination chain ID (default: 10 - Optimism)
  --amount <wei>        Amount in wei (default: 1e18)

Examples:
  # Create an order from Base to Optimism
  deno run alice.ts --action create --resolver 0x123...

  # List all orders
  deno run alice.ts --action list

  # Withdraw from destination
  deno run alice.ts --action withdraw --order 0xabc...

  # Auto-monitor and withdraw
  deno run alice.ts --action monitor
      `);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}