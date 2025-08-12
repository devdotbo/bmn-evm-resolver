#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

// Minimal declarations for non-Deno linters
declare const Deno: any;

import {
  createPublicClient,
  http,
  parseAbiItem,
  decodeEventLog,
  type Address,
  type Hex,
} from "viem";
import { base, optimism } from "viem/chains";
import { CREATE3_ADDRESSES } from "../src/config/contracts.ts";

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < Deno.args.length; i++) {
    const a = Deno.args[i];
    if (a.startsWith("--")) {
      const [k, v] = a.split("=", 2);
      out[k.slice(2)] = v ?? Deno.args[++i];
    } else if (!out.file && a.endsWith(".json")) {
      out.file = a;
    } else if (!out.hashlock && a.startsWith("0x") && a.length === 66) {
      out.hashlock = a;
    }
  }
  return out;
}

function getRpc(chain: "base" | "optimism") {
  const local = Deno.env.get("LOCAL_RPC");
  const localBase = Deno.env.get("LOCAL_BASE_RPC");
  const localOp = Deno.env.get("LOCAL_OP_RPC");
  if (chain === "base" && (localBase || local)) return http((localBase || local) as string);
  if (chain === "optimism" && (localOp || local)) return http((localOp || local) as string);

  const key = Deno.env.get("ANKR_API_KEY") || "";
  if (chain === "base") return http(key ? `https://rpc.ankr.com/base/${key}` : "https://mainnet.base.org");
  return http(key ? `https://rpc.ankr.com/optimism/${key}` : "https://mainnet.optimism.io");
}

async function loadLatestPendingOrderPath(): Promise<string | undefined> {
  try {
    const files: string[] = [];
    for await (const e of Deno.readDir("./pending-orders")) {
      if (e.isFile && e.name.endsWith(".json")) files.push(`pending-orders/${e.name}`);
    }
    files.sort((a, b) => a.localeCompare(b));
    return files.pop();
  } catch {
    return undefined;
  }
}

async function main() {
  const args = parseArgs();

  // Resolve input file or hashlock
  let filePath = args.file;
  if (!filePath && !args.hashlock) {
    filePath = await loadLatestPendingOrderPath();
  }
  if (!filePath && !args.hashlock) {
    console.error("No pending order file or --hashlock provided");
    Deno.exit(1);
  }

  // Load hashlock and chainId
  let hashlock: Hex | undefined = args.hashlock as Hex | undefined;
  let chainId: number | undefined = args.chain ? Number(args.chain) : undefined;

  if (filePath) {
    const j = JSON.parse(await Deno.readTextFile(filePath));
    hashlock = (hashlock || j.hashlock) as Hex;
    chainId = chainId ?? Number(j.chainId);
  }

  if (!hashlock || typeof hashlock !== "string" || hashlock.length !== 66) {
    console.error("Invalid or missing hashlock");
    Deno.exit(1);
  }

  // Choose chain
  const chain = chainId === base.id ? "base" : "optimism";
  const viemChain = chain === "base" ? base : optimism;

  const client = createPublicClient({ chain: viemChain as any, transport: getRpc(chain) });
  const factory: Address = CREATE3_ADDRESSES.ESCROW_FACTORY_V2 as Address;

  // Determine search window
  const head = await client.getBlockNumber();
  const window = BigInt(args.fromBlocks ? Number(args.fromBlocks) : 30000);
  const fromBlock = head > window ? (head - window) : 0n;

  const POST_CREATED = parseAbiItem(
    "event PostInteractionEscrowCreated(address indexed escrow, bytes32 indexed hashlock, address indexed protocol, address taker, uint256 amount)",
  );
  const DST_CREATED = parseAbiItem(
    "event DstEscrowCreated(address indexed escrow, bytes32 indexed hashlock, address indexed taker)",
  );

  const results: any = { chainId: viemChain.id, factory, hashlock, fromBlock: fromBlock.toString(), toBlock: head.toString(), events: [] as any[] };

  // Query PostInteractionEscrowCreated by hashlock
  const postLogs = await client.getLogs({
    address: factory,
    event: POST_CREATED as any,
    args: { hashlock: hashlock as Hex },
    fromBlock,
    toBlock: head,
  } as any);

  for (const log of postLogs as any[]) {
    const decoded = decodeEventLog({ abi: [POST_CREATED], data: log.data, topics: log.topics });
    results.events.push({
      type: "PostInteractionEscrowCreated",
      blockNumber: log.blockNumber?.toString?.() ?? "",
      txHash: log.transactionHash,
      escrow: (decoded.args as any).escrow,
      protocol: (decoded.args as any).protocol,
      taker: (decoded.args as any).taker,
      amount: ((decoded.args as any).amount ?? 0n).toString(),
    });
  }

  // Query DstEscrowCreated by hashlock (same chain if dst == src for test; otherwise run on dst chain separately)
  const dstLogs = await client.getLogs({
    address: factory,
    event: DST_CREATED as any,
    args: { hashlock: hashlock as Hex },
    fromBlock,
    toBlock: head,
  } as any);

  for (const log of dstLogs as any[]) {
    const decoded = decodeEventLog({ abi: [DST_CREATED], data: log.data, topics: log.topics });
    results.events.push({
      type: "DstEscrowCreated",
      blockNumber: log.blockNumber?.toString?.() ?? "",
      txHash: log.transactionHash,
      escrow: (decoded.args as any).escrow,
      taker: (decoded.args as any).taker,
    });
  }

  const replacer = (_k: string, v: unknown) => typeof v === "bigint" ? v.toString() : v;
  console.log(JSON.stringify(results, replacer, 2));
}

if (import.meta.main) {
  await main();
}



