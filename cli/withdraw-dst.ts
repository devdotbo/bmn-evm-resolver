#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

// Alice reveals secret and withdraws from destination escrow

import { atomicWriteJson, readJson, nowMs } from "./_fs.ts";
import { base, optimism } from "viem/chains";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import {
  escrowDstV2Abi,
} from "../src/generated/contracts.ts";

function usage(): never {
  console.log("Usage: deno run -A --env-file=.env cli/withdraw-dst.ts --hashlock 0x...");
  Deno.exit(1);
}

function getArg(name: string): string | undefined {
  const idx = Deno.args.findIndex((a) => a === `--${name}`);
  if (idx >= 0) return Deno.args[idx + 1];
  return undefined;
}

const hashlock = getArg("hashlock");
if (!hashlock) usage();

async function main() {
  const secretFile = `./data/secrets/${hashlock}.json`;
  const dstFile = `./data/escrows/dst/${hashlock}.json`;
  const secretJson = await readJson<{ secret: Hex }>(secretFile);
  const dstJson = await readJson<{ dstChainId: number; escrowAddress: Address }>(dstFile);

  const ALICE_PK = (Deno.env.get("ALICE_PRIVATE_KEY") || "") as `0x${string}`;
  if (!ALICE_PK) {
    console.error("ALICE_PRIVATE_KEY missing");
    Deno.exit(1);
  }

  const account = privateKeyToAccount(ALICE_PK, { nonceManager });
  const dstChainId = dstJson.dstChainId as 10 | 8453;
  const ANKR = Deno.env.get("ANKR_API_KEY") || "";
  const chain = dstChainId === base.id ? base : optimism;
  const rpc = dstChainId === base.id
    ? (ANKR ? `https://rpc.ankr.com/base/${ANKR}` : "https://mainnet.base.org")
    : (ANKR ? `https://rpc.ankr.com/optimism/${ANKR}` : "https://mainnet.optimism.io");
  const client = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ chain, transport: http(rpc), account });

  // Attempt publicWithdraw first (no signature), fall back to withdraw
  let tx: Hex | null = null;
  try {
    const { request } = await client.simulateContract({
      account,
      address: dstJson.escrowAddress,
      abi: escrowDstV2Abi,
      functionName: "publicWithdraw",
      args: [secretJson.secret],
    } as any);
    tx = await wallet.writeContract(request as any);
  } catch (_e) {
    const { request } = await client.simulateContract({
      account,
      address: dstJson.escrowAddress,
      abi: escrowDstV2Abi,
      functionName: "withdraw",
      args: [secretJson.secret],
    } as any);
    tx = await wallet.writeContract(request as any);
  }

  const receipt = await client.waitForTransactionReceipt({ hash: tx! });
  await atomicWriteJson(`./data/escrows/dst/${hashlock}.withdraw.json`, {
    hashlock,
    dstChainId,
    escrowAddress: dstJson.escrowAddress,
    withdrawTxHash: receipt.transactionHash,
    gasUsed: receipt.gasUsed.toString(),
    withdrawnAt: nowMs(),
  });

  // Update status
  await atomicWriteJson(`./data/swaps/${hashlock}/status.json`, {
    hashlock,
    state: "DST_WITHDRAWN",
    updatedAt: nowMs(),
    refs: {
      dstWithdrawFile: `./data/escrows/dst/${hashlock}.withdraw.json`,
    },
  });

  console.log(receipt.transactionHash);
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});


