#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

// Bob withdraws from source escrow using secret

import { atomicWriteJson, readJson, nowMs } from "./_fs.ts";
import { base } from "viem/chains";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { escrowSrcV2Abi } from "./abis.ts";
import { getPrivateKey, getRpcUrl } from "./cli-config.ts";

function usage(): never {
  console.log("Usage: deno run -A --env-file=.env cli/withdraw-src.ts --hashlock 0x...");
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
  const secretJson = await readJson<{ secret: Hex }>(`./data/secrets/${hashlock}.json`);
  const fillJson = await readJson<{ postInteraction: { srcEscrow?: Address } }>(`./data/fills/${hashlock}.json`);
  if (!fillJson.postInteraction?.srcEscrow) {
    console.error("No srcEscrow recorded in fills file");
    Deno.exit(1);
  }
  const srcEscrow = fillJson.postInteraction.srcEscrow as Address;

  const BOB_PK = (getPrivateKey("BOB_PRIVATE_KEY") || getPrivateKey("RESOLVER_PRIVATE_KEY") || "") as `0x${string}`;
  if (!BOB_PK) {
    console.error("BOB_PRIVATE_KEY or RESOLVER_PRIVATE_KEY missing");
    Deno.exit(1);
  }
  const account = privateKeyToAccount(BOB_PK, { nonceManager });
  const ANKR = Deno.env.get("ANKR_API_KEY") || "";
  // Source chain is Base for PoC; adjust by reading a src record if needed
  const chain = base;
  const rpc = getRpcUrl(8453);
  const client = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ chain, transport: http(rpc), account });

  const { request } = await client.simulateContract({
    account,
    address: srcEscrow,
    abi: escrowSrcV2Abi,
    functionName: "withdraw",
    args: [secretJson.secret],
  } as any);
  const tx = await wallet.writeContract(request as any);
  const receipt = await client.waitForTransactionReceipt({ hash: tx });

  await atomicWriteJson(`./data/escrows/src/${hashlock}.withdraw.json`, {
    hashlock,
    srcChainId: base.id,
    escrowAddress: srcEscrow,
    withdrawTxHash: receipt.transactionHash,
    gasUsed: receipt.gasUsed.toString(),
    withdrawnAt: nowMs(),
  });

  await atomicWriteJson(`./data/swaps/${hashlock}/status.json`, {
    hashlock,
    state: "SRC_WITHDRAWN",
    updatedAt: nowMs(),
    refs: {
      srcWithdrawFile: `./data/escrows/src/${hashlock}.withdraw.json`,
    },
  });

  console.log(receipt.transactionHash);
}

main().catch(async (e) => {
  console.error("unhandled_error:", e);
  try {
    const { decodeRevert } = await import("./limit-order.ts");
    const dec: any = (decodeRevert as any)(e);
    if (dec?.selector) console.error(`revert_selector: ${dec.selector}`);
    if (dec?.data) console.error(`revert_data: ${dec.data}`);
  } catch (decErr) {
    console.error("decode_error_failed:", decErr);
  }
  throw e;
});


