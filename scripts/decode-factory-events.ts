#!/usr/bin/env -S deno run --allow-net --allow-env

// Minimal declarations for non-Deno linters
declare const Deno: any;

import {
  createPublicClient,
  http,
  parseAbiItem,
  decodeEventLog,
  type Address,
} from "viem";
import { CREATE3_ADDRESSES } from "../src/config/contracts.ts";

function parseArgs() {
  const out: Record<string, string> = {};
  for (let i = 0; i < Deno.args.length; i++) {
    const a = Deno.args[i];
    if (a.startsWith("--")) {
      const [k, v] = a.split("=", 2);
      if (v !== undefined) out[k.slice(2)] = v; else out[k.slice(2)] = Deno.args[++i];
    } else if (!out.tx && a.startsWith("0x")) {
      out.tx = a;
    }
  }
  return out;
}

function getRpc(chainId: number) {
  const key = Deno.env.get("ANKR_API_KEY") || "";
  if (chainId === 10) return http(key ? `https://rpc.ankr.com/optimism/${key}` : "https://mainnet.optimism.io");
  return http(key ? `https://rpc.ankr.com/base/${key}` : "https://mainnet.base.org");
}

async function main() {
  const args = parseArgs();
  const tx = args.tx as `0x${string}` | undefined;
  const chainId = Number(args.chain || args.chainId || 8453);
  const factory = (args.factory || CREATE3_ADDRESSES.ESCROW_FACTORY_V2) as Address;
  if (!tx) {
    console.error("Usage: deno run --allow-net --allow-env scripts/decode-factory-events.ts --tx <0xHASH> [--chain 8453|10] [--factory 0x...]");
    Deno.exit(1);
  }

  const client = createPublicClient({ transport: getRpc(chainId) });
  const receipt = await client.getTransactionReceipt({ hash: tx });
  const factoryLower = factory.toLowerCase();

  // Support both legacy v2.2 docs events and SimplifiedEscrowFactory events
  const eventParsers = [
    // Legacy/docs style
    parseAbiItem("event PostInteractionExecuted(bytes32 indexed orderHash, address indexed taker, address srcEscrow, address dstEscrow)"),
    parseAbiItem("event PostInteractionFailed(bytes32 indexed orderHash, address indexed taker, string reason)"),
    parseAbiItem("event EscrowCreated(address indexed escrowAddress, uint8 indexed escrowType, bytes32 indexed immutablesHash)"),
    // SimplifiedEscrowFactory (deployed)
    parseAbiItem("event PostInteractionEscrowCreated(address indexed escrow, bytes32 indexed hashlock, address indexed protocol, address taker, uint256 amount)"),
    parseAbiItem("event SrcEscrowCreated(address indexed escrow, bytes32 indexed orderHash, address indexed maker, address taker, uint256 amount)"),
    parseAbiItem("event DstEscrowCreated(address indexed escrow, bytes32 indexed hashlock, address indexed taker)"),
  ];

  const found: Array<Record<string, unknown>> = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== factoryLower) continue;
    for (const abi of eventParsers) {
      try {
        const d = decodeEventLog({ abi: [abi], data: log.data, topics: log.topics });
        found.push({
          tx,
          blockNumber: receipt.blockNumber,
          event: (abi as any).name,
          args: d.args,
        });
        break;
      } catch {
        // try next parser
      }
    }
  }

  const replacer = (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value;
  if (found.length === 0) {
    console.log(JSON.stringify({ tx, info: "no factory events found", factory }, replacer, 2));
  } else {
    console.log(JSON.stringify(found, replacer, 2));
  }
}

if (import.meta.main) {
  await main();
}


