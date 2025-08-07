#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

import { LimitOrderAlice } from "./src/alice/limit-order-alice.ts";
import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["action", "order", "resolver", "src-chain", "dst-chain", "amount"],
    default: {
      action: "help",
      "src-chain": "10", // Optimism
      "dst-chain": "8453", // Base
      amount: "1000000000000000000", // 1 BMN token
      resolver: "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5", // Default resolver
    },
  });

  const alice = new LimitOrderAlice();
  
  // Initialize SecretManager
  await alice.init();

  switch (args.action) {
    case "create":
      console.log("🚀 Creating MAINNET atomic swap order via Limit Order Protocol");
      console.log("===========================================================");
      console.log(`From: Chain ${args["src-chain"]} (${args["src-chain"] === "10" ? 'Optimism' : 'Base'})`);
      console.log(`To: Chain ${args["dst-chain"]} (${args["dst-chain"] === "10" ? 'Optimism' : 'Base'})`);
      console.log(`Resolver: ${args.resolver}`);
      console.log(`Amount: ${BigInt(args.amount) / 10n**18n} BMN tokens`);
      
      const orderHash = await alice.createOrder({
        srcChainId: parseInt(args["src-chain"]),
        dstChainId: parseInt(args["dst-chain"]),
        srcAmount: BigInt(args.amount),
        dstAmount: BigInt(args.amount), // Same amount for simplicity
        resolverAddress: args.resolver,
        srcSafetyDeposit: BigInt(args.amount) / 100n, // 1% safety deposit
        dstSafetyDeposit: BigInt(args.amount) / 100n,
      });
      
      console.log(`\n🎉 Order created successfully!`);
      console.log(`Order Hash: ${orderHash}`);
      console.log(`\nNext steps:`);
      console.log(`1. Resolver will detect this order and fill it via limit order protocol`);
      console.log(`2. Run: deno task alice --action monitor`);
      console.log(`3. Alice will auto-withdraw when destination is ready`);
      break;

    case "list":
      const orders = await alice.listOrders();
      console.log("\n📋 Your MAINNET orders:");
      console.log("=======================");
      if (orders.length === 0) {
        console.log("No orders found");
      } else {
        for (const order of orders) {
          console.log(`\nOrder: ${order.orderHash}`);
          console.log(`  Status: ${order.status}`);
          console.log(`  Source Chain: ${order.srcChain} (${order.srcChain === 10 ? 'Optimism' : 'Base'})`);
          console.log(`  Dest Chain: ${order.dstChain} (${order.dstChain === 10 ? 'Optimism' : 'Base'})`);
          console.log(`  Amount: ${order.srcAmount}`);
          console.log(`  Created: ${order.createdAt}`);
        }
      }
      break;

    case "withdraw":
      if (!args.order) {
        console.error("❌ Order hash required (--order <hash>)");
        Deno.exit(1);
      }
      
      await alice.withdrawFromDestination(args.order);
      break;

    case "monitor":
      console.log("🤖 Starting MAINNET auto-monitor mode...");
      console.log("   Alice will automatically withdraw when Bob deploys destination escrows");
      console.log("   Press Ctrl+C to stop");
      await alice.monitorAndWithdraw();
      break;

    case "help":
    default:
      console.log(`
Bridge-Me-Not MAINNET Alice Client (Limit Order Protocol)
=========================================================

Usage: deno task alice --action <action> [options]

Actions:
  create    Create a new cross-chain swap order
  list      List all your orders
  withdraw  Withdraw from destination escrow (reveals secret)
  monitor   Auto-monitor and withdraw when destination escrows are ready

Options:
  --resolver <address>   Resolver address (default: 0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5)
  --order <hash>        Order hash (for withdraw)
  --src-chain <id>      Source chain ID (default: 10 - Optimism)
  --dst-chain <id>      Destination chain ID (default: 8453 - Base)
  --amount <wei>        Amount in wei (default: 1e18 - 1 BMN token)

Examples:
  # Create an order from Optimism to Base (1 BMN token)
  deno task alice --action create

  # Create 10 BMN tokens swap from Base to Optimism
  deno task alice --action create --src-chain 8453 --dst-chain 10 --amount 10000000000000000000

  # List all orders
  deno task alice --action list

  # Auto-monitor and withdraw
  deno task alice --action monitor
      `);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}