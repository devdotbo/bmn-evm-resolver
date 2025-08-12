#!/usr/bin/env -S deno run --allow-net --allow-env

// Minimal declarations for non-Deno linters
declare const Deno: any;

import { createPublicClient, http } from "viem";
import { base, optimism } from "viem/chains";
import FactoryAbi from "../abis/SimplifiedEscrowFactoryV2_3.json" with { type: "json" };
import { CREATE3_ADDRESSES } from "../src/config/contracts.ts";

async function main() {
  const resolver = (Deno.env.get("RESOLVER_ADDRESS") || Deno.env.get("RESOLVER") || "").trim();
  if (!resolver) {
    console.error("Set RESOLVER_ADDRESS or RESOLVER in env.");
    Deno.exit(1);
  }
  const key = Deno.env.get("ANKR_API_KEY") || "";
  const clientBase = createPublicClient({ chain: base, transport: http(key ? `https://rpc.ankr.com/base/${key}` : "https://mainnet.base.org") });
  const clientOp = createPublicClient({ chain: optimism, transport: http(key ? `https://rpc.ankr.com/optimism/${key}` : "https://mainnet.optimism.io") });
  const factory = CREATE3_ADDRESSES.ESCROW_FACTORY_V2 as `0x${string}`;
  const isBase = await clientBase.readContract({ address: factory, abi: FactoryAbi.abi as any, functionName: "isWhitelistedResolver", args: [resolver as `0x${string}`] });
  const isOp = await clientOp.readContract({ address: factory, abi: FactoryAbi.abi as any, functionName: "isWhitelistedResolver", args: [resolver as `0x${string}`] });
  console.log(JSON.stringify({ chainId: 8453, network: "Base", factory, resolver, isWhitelisted: Boolean(isBase) }, null, 2));
  console.log(JSON.stringify({ chainId: 10, network: "Optimism", factory, resolver, isWhitelisted: Boolean(isOp) }, null, 2));
}

if (import.meta.main) {
  await main();
}



