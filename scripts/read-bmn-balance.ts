#!/usr/bin/env -S deno run --allow-net --allow-env

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import IERC20Abi from "../abis/IERC20.json" with { type: "json" };
import { CREATE3_ADDRESSES } from "../src/config/contracts.ts";

async function main() {
  const address = Deno.env.get("ADDRESS") || Deno.env.get("RESOLVER_ADDRESS") ||
    "";
  if (!address) {
    console.error("Provide ADDRESS env var");
    Deno.exit(1);
  }
  const ankrKey = Deno.env.get("ANKR_API_KEY") || "";
  const rpcUrl = ankrKey
    ? `https://rpc.ankr.com/base/${ankrKey}`
    : "https://mainnet.base.org";
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
  const BMN = CREATE3_ADDRESSES.BMN_TOKEN as `0x${string}`;
  const balance = await client.readContract({
    address: BMN,
    abi: IERC20Abi.abi,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  });
  console.log(
    `BMN balance of ${address} on Base: ${balance} wei (${
      Number(balance) / 1e18
    } BMN)`,
  );
}

if (import.meta.main) {
  await main();
}
