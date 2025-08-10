#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

import { parseUnits } from "viem";
import { LimitOrderAlice } from "../src/alice/limit-order-alice.ts";

function getEnvOrThrow(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function main() {
  const resolver = getEnvOrThrow("RESOLVER");
  const amountStr = Deno.env.get("AMOUNT") ?? "0.01"; // BMN amount (18 decimals)
  const srcChainId = Number(Deno.env.get("SRC_CHAIN") ?? 8453); // Base
  const dstChainId = Number(Deno.env.get("DST_CHAIN") ?? 10); // Optimism
  const srcDepositStr = Deno.env.get("SRC_DEPOSIT") ?? "0";
  const dstDepositStr = Deno.env.get("DST_DEPOSIT") ?? "0";

  const amount = parseUnits(amountStr as `${number}`, 18);
  const srcDeposit = parseUnits(srcDepositStr as `${number}`, 18);
  const dstDeposit = parseUnits(dstDepositStr as `${number}`, 18);

  const alice = new LimitOrderAlice();
  await alice.init();

  console.log("\nCreating order…");
  console.log(`  From chain: ${srcChainId}`);
  console.log(`  To chain:   ${dstChainId}`);
  console.log(`  Amount:     ${amountStr} BMN`);
  console.log(`  Resolver:   ${resolver}`);

  const orderHash = await alice.createOrder({
    srcChainId,
    dstChainId,
    srcAmount: amount,
    dstAmount: amount,
    resolverAddress: resolver,
    srcSafetyDeposit: srcDeposit,
    dstSafetyDeposit: dstDeposit,
  });

  console.log(`\nORDER_HASH:${orderHash}`);
}

if (import.meta.main) {
  await main();
}
