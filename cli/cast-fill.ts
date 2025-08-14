#!/usr/bin/env -S deno run -A --env-file=.env

// Fill order using Foundry cast directly (no wagmi). Requires `cast` in PATH.

import { type Address, type Hex } from "viem";
import { readJson, ensureDir, atomicWriteJson, nowMs } from "./_fs.ts";
import { getCliAddresses, getPrivateKey, getRpcUrl, type SupportedChainId } from "./cli-config.ts";

function usage(): never {
  console.log("Usage: deno task cast:fill -- --file ./data/orders/pending/{hashlock}.json [--dry-run]");
  Deno.exit(1);
}

function getArg(name: string): string | undefined {
  const idx = Deno.args.findIndex((a) => a === `--${name}`);
  if (idx >= 0) return Deno.args[idx + 1];
  return undefined;
}

const fileArg = getArg("file");
const isDryRun = Deno.args.includes("--dry-run");
if (!fileArg) usage();

interface OrderFile {
  version: number;
  chainId: number;
  order: {
    salt: string;
    maker: Address;
    receiver: Address;
    makerAsset: Address;
    takerAsset: Address;
    makingAmount: string;
    takingAmount: string;
    makerTraits: string;
  };
  signature: { r: Hex; vs: Hex };
  extensionData: Hex;
  orderHash: Hex;
  hashlock: string;
  srcChainId: number;
  dstChainId: number;
  createdAt: number;
}

function hasExtensionFlag(makerTraits: bigint): boolean {
  const HAS_EXTENSION_BIT = 1n << 249n;
  return (makerTraits & HAS_EXTENSION_BIT) !== 0n;
}

async function main() {
  const order: OrderFile = await readJson<OrderFile>(fileArg!);

  const SRC = order.srcChainId as SupportedChainId;
  const addrs = getCliAddresses(SRC);
  const protocol = addrs.limitOrderProtocol as string;
  const bmnToken = addrs.tokens.BMN as string;
  const rpc = getRpcUrl(SRC);

  // Choose signer: prefer resolver for PrivateOrder created by our flow; fallback to bob
  const pk = getPrivateKey("RESOLVER_PRIVATE_KEY") || getPrivateKey("BOB_PRIVATE_KEY");
  if (!pk) {
    console.error("Missing RESOLVER_PRIVATE_KEY or BOB_PRIVATE_KEY in env");
    Deno.exit(1);
  }

  // Compute takerTraits: MakerAmount flag + argsExtensionLength if maker declared extension; threshold = 0
  const makerTraitsBig = BigInt(order.order.makerTraits);
  const extLenBytes = order.extensionData.startsWith("0x") ? ((order.extensionData.length - 2) / 2) | 0 : (order.extensionData.length / 2) | 0;
  const argsExtLen = hasExtensionFlag(makerTraitsBig) ? BigInt(extLenBytes) : 0n;
  const makerAmountFlag = 1n << 255n;
  const takerTraits = (makerAmountFlag | (argsExtLen << 224n) | 0n).toString();
  const argsBytes = hasExtensionFlag(makerTraitsBig) ? order.extensionData : ("0x" as Hex);

  // Convert Address fields to uint256 decimal strings for cast (Address is uint256 in ABI)
  const makerUint = BigInt(order.order.maker).toString();
  const receiverUint = BigInt(order.order.receiver).toString();
  const makerAssetUint = BigInt(order.order.makerAsset).toString();
  const takerAssetUint = BigInt(order.order.takerAsset).toString();

  // Tuple argument for cast (must be a single string with parentheses) using uint256 types for Address fields
  const orderTuple = `(${order.order.salt},${makerUint},${receiverUint},${makerAssetUint},${takerAssetUint},${order.order.makingAmount},${order.order.takingAmount},${order.order.makerTraits})`;

  const cmdArgs = [
    "send",
    protocol,
    "fillOrderArgs((uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),bytes32,bytes32,uint256,uint256,bytes)",
    orderTuple,
    order.signature.r,
    order.signature.vs,
    order.order.makingAmount,
    takerTraits,
    argsBytes,
    "--private-key",
    pk,
    "--rpc-url",
    rpc,
  ];

  const _cmd = ["cast", ...cmdArgs];
  console.log(["cast", ...cmdArgs.map((a) => (a.includes(" ") ? JSON.stringify(a) : a))].join(" "));

  if (isDryRun) return;

  // Pre-check: skip if already invalidated/filled (remaining == 0)
  try {
    const remArgs = [
      "call",
      protocol,
      "remainingInvalidatorForOrder(address,bytes32)(uint256)",
      order.order.maker,
      order.orderHash,
      "--rpc-url",
      rpc,
    ];
    const rem = new Deno.Command("cast", { args: remArgs, stdin: "null", stdout: "piped", stderr: "piped" });
    const remOut = await rem.output();
    if (remOut.code === 0) {
      const remTxt = new TextDecoder().decode(remOut.stdout).trim();
      const remaining = remTxt.startsWith("0x") ? BigInt(remTxt) : BigInt(remTxt);
      if (remaining === 0n) {
        console.log("Order already invalidated/filled (remaining=0). Skipping send.");
        await ensureDir("./data/orders/completed");
        try { await Deno.rename(fileArg!, `./data/orders/completed/${order.hashlock}.json`); } catch (e) { const msg = e instanceof Error ? e.message : String(e); console.warn(`Failed to move order file to completed (non-fatal): ${msg}`); }
        return;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`Pre-check remainingInvalidatorForOrder failed, proceeding to send anyway. Reason: ${msg}`, e);
  }

  // Ensure maker allowance for protocol (maker -> protocol for makerAsset)
  const maker = order.order.maker as string;
  const makingAmount = BigInt(order.order.makingAmount);
  const alicePk = getPrivateKey("ALICE_PRIVATE_KEY");
  if (alicePk) {
    try {
      const callArgs = [
        "call",
        bmnToken,
        "allowance(address,address)(uint256)",
        maker,
        protocol,
        "--rpc-url",
        rpc,
      ];
      const call = new Deno.Command("cast", { args: callArgs, stdin: "null", stdout: "piped", stderr: "piped" });
      const out = await call.output();
      let allowance = 0n;
      if (out.code === 0) {
        const raw = new TextDecoder().decode(out.stdout).trim();
        const m = raw.match(/(0x[0-9a-fA-F]+|\d+)/);
        if (m && m[1]) {
          const token = m[1];
          allowance = token.startsWith("0x") ? BigInt(token) : BigInt(token);
        }
      }
      if (allowance < makingAmount) {
        const approveArgs = [
          "send",
          bmnToken,
          "approve(address,uint256)",
          protocol,
          (makingAmount * 10n).toString(),
          "--private-key",
          alicePk,
          "--rpc-url",
          rpc,
        ];
        const approve = new Deno.Command("cast", { args: approveArgs, stdin: "null", stdout: "piped", stderr: "piped" });
        const aout = await approve.output();
        if (aout.code !== 0) {
          console.error(new TextDecoder().decode(aout.stderr));
        } else {
          console.log(new TextDecoder().decode(aout.stdout));
        }
      }
    } catch (e) {
      console.error("Allowance check/approve failed (continuing):", e);
    }
  } else {
    console.warn("ALICE_PRIVATE_KEY not set; cannot auto-approve maker allowance.");
  }

  try {
    const p = new Deno.Command("cast", { args: cmdArgs, stdin: "null", stdout: "piped", stderr: "piped" });
    const out = await p.output();
    const stdout = new TextDecoder().decode(out.stdout);
    const stderr = new TextDecoder().decode(out.stderr);
    if (out.code !== 0) {
      console.error(stderr);
      Deno.exit(out.code);
    }
    console.log(stdout);

    // On success, persist fill artifact and move order file out of pending to avoid refilling invalidated orders
    const statusLine = stdout.split("\n").find((l) => l.includes("status"));
    const txHashLine = stdout.split("\n").find((l) => l.toLowerCase().includes("transactionhash"));
    const ok = !!statusLine && statusLine.includes("1 (success)");
    const txHash = txHashLine ? txHashLine.split(/\s+/).pop() : undefined;
    try {
      await ensureDir("./data/fills");
      await atomicWriteJson(`./data/fills/${order.hashlock}.json`, {
        hashlock: order.hashlock,
        orderHash: order.orderHash,
        srcChainId: order.srcChainId,
        taker: (getPrivateKey("RESOLVER_PRIVATE_KEY") ? "RESOLVER" : "BOB"),
        txHash: txHash,
        writtenAt: nowMs(),
        ok: !!ok,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to write fill artifact (non-fatal): ${msg}`, e);
    }
    if (ok) {
      try {
        await ensureDir("./data/orders/completed");
        await Deno.rename(fileArg!, `./data/orders/completed/${order.hashlock}.json`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`Failed to move order file to completed (non-fatal): ${msg}`, e);
      }
    }
  } catch (e) {
    console.error("Failed to execute cast. Ensure Foundry is installed and `cast` is in PATH.");
    console.error(e);
    Deno.exit(1);
  }
}

main();


