#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

// Bob withdraws from source escrow using secret

import { atomicWriteJson, readJson, nowMs } from "./_fs.ts";
import { base } from "viem/chains";
import { type Address, type Hex } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { getPrivateKey } from "./cli-config.ts";
import { createWagmiConfig } from "./wagmi-config.ts";
import { waitForTransactionReceipt } from "@wagmi/core";
import { simulateEscrowSrcV2Withdraw, writeEscrowSrcV2Withdraw } from "../src/generated/contracts.ts";
import { logErrorWithRevert } from "./logging.ts";

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
  const wagmiConfig = createWagmiConfig();

  await simulateEscrowSrcV2Withdraw(wagmiConfig as any, {
    chainId: base.id,
    account: account.address,
    address: srcEscrow,
    args: [secretJson.secret],
  } as any);
  const tx = await writeEscrowSrcV2Withdraw(wagmiConfig as any, {
    chainId: base.id,
    account: account.address,
    address: srcEscrow,
    args: [secretJson.secret],
  } as any);
  const receipt = await waitForTransactionReceipt(wagmiConfig as any, { chainId: base.id, hash: tx as Hex });

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
  await logErrorWithRevert(e, "withdraw-src", {
    args: Deno.args,
    hashlock,
  });
  Deno.exit(1);
});


