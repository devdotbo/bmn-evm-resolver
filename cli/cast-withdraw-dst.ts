#!/usr/bin/env -S deno run -A --env-file=.env

import { type Address, type Hex } from "viem";
import { readJson } from "./_fs.ts";
import { getPrivateKey, getRpcUrl, type SupportedChainId } from "./cli-config.ts";
import { parsePostInteractionData } from "../src/utils/escrow-creation.ts";

function usage(): never {
  console.log("Usage: deno task cast:withdraw:dst -- --hashlock 0x...");
  Deno.exit(1);
}

function getArg(name: string): string | undefined {
  const idx = Deno.args.findIndex((a) => a === `--${name}`);
  return idx >= 0 ? Deno.args[idx + 1] : undefined;
}

const hashlock = getArg("hashlock");
if (!hashlock) usage();

async function readOrderByHashlock(h: string): Promise<any> {
  const pending = `./data/orders/pending/${h}.json`;
  const completed = `./data/orders/completed/${h}.json`;
  try {
    return await readJson<any>(pending);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`Pending order not found or unreadable at ${pending}. Falling back to completed. Reason: ${msg}`, e);
  }
  return await readJson<any>(completed);
}

async function main() {
  const secretJson = await readJson<{ secret: Hex }>(`./data/secrets/${hashlock}.json`);
  const dstJson = await readJson<{ dstChainId: number; escrowAddress: Address }>(`./data/escrows/dst/${hashlock}.json`);
  const status = await readJson<{ orderHash: Hex }>(`./data/swaps/${hashlock}/status.json`).catch(() => ({ orderHash: undefined as any }));
  const order = await readOrderByHashlock(hashlock!);

  const dstChainId = order.dstChainId as SupportedChainId;
  const rpc = getRpcUrl(dstChainId);
  const pk = getPrivateKey("ALICE_PRIVATE_KEY");
  if (!pk) {
    console.error("ALICE_PRIVATE_KEY missing");
    Deno.exit(1);
  }

  // Reconstruct immutables from order + extension
  const parsed = parsePostInteractionData(order.extensionData as Hex);
  const deposits = parsed.deposits;
  const dstSafetyDeposit = deposits >> 128n;
  const timelocksPacked = parsed.timelocks;

  const makerUint = BigInt(order.order.maker).toString();
  const takerUint = BigInt(order.order.receiver).toString();
  const tokenUint = BigInt(parsed.dstToken as Address).toString();
  const amountStr = order.order.takingAmount;
  const safetyStr = dstSafetyDeposit.toString();
  const timelocksStr = timelocksPacked.toString();

  const orderHashHex: Hex = (status.orderHash || order.orderHash) as Hex;

  // Nested tuple for withdraw
  const immutablesTuple = `(${orderHashHex},${hashlock},${makerUint},${takerUint},${tokenUint},${amountStr},${safetyStr},${timelocksStr})`;

  const cmdArgs = [
    "send",
    dstJson.escrowAddress,
    "withdraw(bytes32,(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256,uint256))",
    secretJson.secret,
    immutablesTuple,
    "--private-key",
    pk,
    "--rpc-url",
    rpc,
    "--gas-limit",
    "1200000",
  ];

  console.log(["cast", ...cmdArgs.map((a) => (a.includes(" ") ? JSON.stringify(a) : a))].join(" "));

  const p = new Deno.Command("cast", { args: cmdArgs, stdin: "null", stdout: "piped", stderr: "piped" });
  const out = await p.output();
  const stdout = new TextDecoder().decode(out.stdout);
  const stderr = new TextDecoder().decode(out.stderr);
  if (out.code !== 0) {
    console.error(stderr);
    Deno.exit(out.code);
  }
  console.log(stdout);
}

main();


