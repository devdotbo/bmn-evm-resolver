#!/usr/bin/env -S deno run --allow-read

// Minimal declarations for non-Deno linters
declare const Deno: any;

import { parseAbiItem } from "viem";

const HELP = `human2abi - Parse human-readable ABI signatures into ABI JSON

Usage:
  deno run scripts/human2abi.ts --sig "function balanceOf(address owner) view returns (uint256)"
  deno run scripts/human2abi.ts --file ./signatures.txt --array

Options:
  --sig <signature>    Human-readable ABI item. Repeat for multiple lines.
  --file <path>        Read signatures from a file (one per line; empty lines & // comments ignored).
  --array              Output a JSON array [AbiItem, ...].
  --abi                Output { "abi": [AbiItem, ...] }.
  --compact            Minify JSON (no pretty-print).
  --help               Show this help.

Examples:
  deno run scripts/human2abi.ts \
    --sig 'function publicWithdrawSigned(bytes32 secret,(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables, bytes resolverSignature)' \
    --abi
`;

interface CliOptions {
  sigs: string[];
  file?: string;
  outMode: "item" | "array" | "abi";
  pretty: boolean;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { sigs: [], outMode: "item", pretty: true, help: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "--sig":
        if (!args[i + 1]) throw new Error("--sig requires a value");
        opts.sigs.push(args[++i]);
        break;
      case "--file":
        if (!args[i + 1]) throw new Error("--file requires a path");
        opts.file = args[++i];
        break;
      case "--array":
        opts.outMode = "array";
        break;
      case "--abi":
        opts.outMode = "abi";
        break;
      case "--compact":
        opts.pretty = false;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        if (a.startsWith("-")) throw new Error(`Unknown option: ${a}`);
        // Treat bare args as signatures for convenience
        opts.sigs.push(a);
        break;
    }
  }
  return opts;
}

async function readFileSignatures(path: string): Promise<string[]> {
  const raw = await Deno.readTextFile(path);
  return raw
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0 && !l.startsWith("//"));
}

try {
  const opts = parseArgs(Deno.args);
  if (opts.help || (!opts.file && opts.sigs.length === 0)) {
    console.log(HELP);
    Deno.exit(0);
  }

  let signatures: string[] = [...opts.sigs];
  if (opts.file) {
    const fromFile = await readFileSignatures(opts.file);
    signatures.push(...fromFile);
  }

  if (signatures.length === 0) {
    console.error("No signatures provided. Use --sig or --file.\n\n" + HELP);
    Deno.exit(1);
  }

  // Decide parsing strategy:
  // - If any line starts with "struct ", treat the whole set as one item (struct + item)
  // - Otherwise, parse each signature independently
  const hasStruct = signatures.some((s) => s.trimStart().startsWith("struct "));

  const items = hasStruct
    ? [parseAbiItem(signatures as any)]
    : signatures.map((s) => parseAbiItem(s as any));

  const space = opts.pretty ? 2 : 0;
  if (opts.outMode === "abi") {
    console.log(JSON.stringify({ abi: items }, null, space));
  } else if (opts.outMode === "array") {
    console.log(JSON.stringify(items, null, space));
  } else {
    console.log(JSON.stringify(items[0], null, space));
  }
} catch (err) {
  console.error(`Error: ${(err as Error).message}`);
  Deno.exit(1);
}


