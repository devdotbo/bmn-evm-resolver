#!/usr/bin/env -S deno run --allow-net --allow-env

// Minimal declarations for non-Deno linters
declare const Deno: any;

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import FactoryAbi from "../abis/CrossChainEscrowFactoryV2.json" with { type: "json" };
import { CREATE3_ADDRESSES } from "../src/config/contracts.ts";

async function main() {
  const resolver = (Deno.env.get("RESOLVER_ADDRESS") || Deno.env.get("RESOLVER") || "").trim();
  if (!resolver) {
    console.error("Set RESOLVER_ADDRESS or RESOLVER in env.");
    Deno.exit(1);
  }
  const key = Deno.env.get("ANKR_API_KEY") || "";
  const client = createPublicClient({ chain: base, transport: http(key ? `https://rpc.ankr.com/base/${key}` : "https://mainnet.base.org") });
  const factory = CREATE3_ADDRESSES.ESCROW_FACTORY_V2 as `0x${string}`;
  const is = await client.readContract({ address: factory, abi: FactoryAbi.abi as any, functionName: "isWhitelistedResolver", args: [resolver as `0x${string}`] });
  console.log(JSON.stringify({ chainId: 8453, factory, resolver, isWhitelisted: Boolean(is) }, null, 2));
}

if (import.meta.main) {
  await main();
}



