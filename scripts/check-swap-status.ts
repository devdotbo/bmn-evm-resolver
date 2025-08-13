#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

import { SwapStateManager } from "../src/state/swap-state-manager.ts";

const hashlock = "0xddd1a5183cf69a7e454c10371e9a8e2bd4ebf92139499b6149f812e860fa2c9d";

const manager = new SwapStateManager();
await manager.init();

const swap = await manager.getSwapByHashlock(hashlock);

if (swap) {
  console.log("Swap Status:", swap.status);
  console.log("Source Escrow:", swap.srcEscrow || "Not created");
  console.log("Dest Escrow:", swap.dstEscrow || "Not created");
  console.log("Alice Deposited:", swap.srcDepositedAt ? new Date(swap.srcDepositedAt) : "No");
  console.log("Bob Deposited:", swap.dstDepositedAt ? new Date(swap.dstDepositedAt) : "No");
} else {
  console.log("Swap not found");
}

await manager.close();