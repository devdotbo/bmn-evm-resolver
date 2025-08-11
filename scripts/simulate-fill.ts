#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
// Minimal declarations for non-Deno linters
declare const Deno: any;

import {
  Address,
  Hex,
  createPublicClient,
  http,
  decodeErrorResult,
} from "viem";
import SimpleLimitOrderProtocolAbi from "../abis/SimpleLimitOrderProtocol.json" with { type: "json" };

function getRpc(chain: "base" | "optimism") {
  const key = Deno.env.get("ANKR_API_KEY") || "";
  if (chain === "base") return http(key ? `https://rpc.ankr.com/base/${key}` : "https://mainnet.base.org");
  return http(key ? `https://rpc.ankr.com/optimism/${key}` : "https://mainnet.optimism.io");
}

function toHexBytes(hex: string): number {
  return (hex.length - 2) / 2;
}

function computeTakerTraits(order: any, extensionData: string): bigint {
  const makerAmountFlag = 1n << 255n;
  const argsExtLen = BigInt(toHexBytes(extensionData));
  const threshold = BigInt(order.takingAmount) & ((1n << 185n) - 1n);
  return makerAmountFlag | (argsExtLen << 224n) | threshold;
}

function splitSig(sig: string): { r: Hex; vs: Hex } {
  const r = sig.slice(0, 66) as Hex;
  const s = sig.slice(66, 130);
  const v = sig.slice(130, 132);
  const vNum = parseInt(v, 16);
  let sWithV = s;
  if (vNum === 28 || vNum === 1) {
    const sBig = BigInt("0x" + s);
    const vMask = 1n << 255n;
    sWithV = (sBig | vMask).toString(16).padStart(64, "0");
  }
  return { r, vs: ("0x" + sWithV) as Hex };
}

async function main() {
  const file = Deno.args[0] || (await (async () => {
    for await (const entry of Deno.readDir("./pending-orders")) {
      if (entry.isFile && entry.name) return entry.name;
    }
    return undefined;
  })());
  if (!file) {
    console.error("No pending-orders file found");
    Deno.exit(1);
  }
  const path = file.startsWith("pending-orders/") ? file : `pending-orders/${file}`;
  const data = JSON.parse(await Deno.readTextFile(path));

  const chainId = Number(data.chainId);
  const transport = chainId === 8453 ? getRpc("base") : getRpc("optimism");
  const client = createPublicClient({ chain: undefined as any, transport });

  const protocol: Address = (chainId === 8453
    ? "0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06"
    : "0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7") as Address;

  const { r, vs } = splitSig(data.signature);
  const takerTraits = computeTakerTraits(data.order, data.extensionData);

  try {
    const account = (Deno.env.get("RESOLVER_ADDRESS") ||
      "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5") as Address;
    await client.simulateContract({
      address: protocol,
      abi: SimpleLimitOrderProtocolAbi.abi,
      functionName: "fillOrderArgs",
      args: [
        {
          salt: BigInt(data.order.salt),
          maker: data.order.maker,
          receiver: data.order.receiver,
          makerAsset: data.order.makerAsset,
          takerAsset: data.order.takerAsset,
          makingAmount: BigInt(data.order.makingAmount),
          takingAmount: BigInt(data.order.takingAmount),
          makerTraits: BigInt(data.order.makerTraits),
        },
        r,
        vs,
        BigInt(data.order.makingAmount),
        takerTraits,
        data.extensionData as Hex,
      ],
      account,
    });
    console.log("simulate: success (no revert)");
  } catch (e) {
    const msg = (e as any)?.shortMessage || (e as any)?.message || String(e);
    const candidates: unknown[] = [
      (e as any)?.data,
      (e as any)?.cause?.data,
      (e as any)?.cause?.data?.data,
      (e as any)?.cause?.cause?.data,
    ];
    const hexInMessage = (msg.match(/0x[0-9a-fA-F]{8,}/)?.[0]) as string | undefined;
    if (hexInMessage) candidates.push(hexInMessage);

    let decoded: { errorName?: string; args?: any[] } | null = null;
    for (const c of candidates) {
      const data = typeof c === "string" && c.startsWith("0x") ? (c as Hex) : undefined;
      if (!data) continue;
      try {
        const res = decodeErrorResult({ abi: SimpleLimitOrderProtocolAbi.abi, data });
        decoded = { errorName: (res as any).errorName, args: (res as any).args };
        break;
      } catch { /* try next */ }
    }

    console.error("simulate: revert");
    if (decoded?.errorName) {
      console.error(`  name: ${decoded.errorName}`);
      if (decoded.args && decoded.args.length > 0) {
        console.error(`  args: ${JSON.stringify(decoded.args)}`);
      }
    } else {
      console.error(msg);
    }
  }
}

if ((import.meta as any).main) {
  await main();
}


