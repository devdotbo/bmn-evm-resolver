#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

// Alice reveals secret and withdraws from destination escrow

import { atomicWriteJson, readJson, nowMs } from "./_fs.ts";
import { base, optimism } from "viem/chains";
import { type Address, type Hex } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { getPrivateKey, type SupportedChainId } from "./cli-config.ts";
import { createWagmiConfig } from "./wagmi-config.ts";
import { waitForTransactionReceipt } from "@wagmi/core";
import { simulateEscrowDstV2Withdraw, writeEscrowDstV2Withdraw } from "../src/generated/contracts.ts";
import { parsePostInteractionData } from "../src/utils/escrow-creation.ts";
import { logErrorWithRevert } from "./logging.ts";

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
  const statusJson = await readJson<{ orderHash: Hex }>(`./data/swaps/${hashlock}/status.json`);
  // Load order for immutables reconstruction
  let orderJson: any;
  try { orderJson = await readJson<any>(`./data/orders/pending/${hashlock}.json`); } catch (_) {
    orderJson = await readJson<any>(`./data/orders/completed/${hashlock}.json`);
  }

  const ALICE_PK = (getPrivateKey("ALICE_PRIVATE_KEY") || "") as `0x${string}`;
  if (!ALICE_PK) {
    console.error("ALICE_PRIVATE_KEY missing");
    Deno.exit(1);
  }

  const account = privateKeyToAccount(ALICE_PK, { nonceManager });
  const dstChainId = dstJson.dstChainId as SupportedChainId;
  const _chain = dstChainId === base.id ? base : optimism;
  const wagmiConfig = createWagmiConfig();

  // Reconstruct immutables from order and extension data for destination escrow
  const ext = orderJson.extensionData as Hex;
  const parsed = parsePostInteractionData(ext);
  const deposits = parsed.deposits;
  const dstSafetyDeposit = deposits >> 128n;
  const timelocksPacked = parsed.timelocks; // already packed srcCancellation<<128 | dstWithdrawal
  const immutables = [
    statusJson.orderHash as Hex,
    hashlock as Hex,
    BigInt(orderJson.order.maker),
    BigInt(orderJson.order.receiver),
    BigInt(parsed.dstToken),
    BigInt(orderJson.order.takingAmount),
    dstSafetyDeposit,
    timelocksPacked,
  ] as any;

  // Use withdraw(secret, immutables)
  await simulateEscrowDstV2Withdraw(wagmiConfig as any, {
    chainId: dstChainId,
    account: account.address,
    address: dstJson.escrowAddress,
    args: [secretJson.secret, immutables],
  } as any);
  const txHash = await writeEscrowDstV2Withdraw(wagmiConfig as any, {
    chainId: dstChainId,
    account: account.address,
    address: dstJson.escrowAddress,
    args: [secretJson.secret, immutables],
  } as any);

  const receipt = await waitForTransactionReceipt(wagmiConfig as any, { chainId: dstChainId, hash: txHash! });
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

main().catch(async (e) => {
  await logErrorWithRevert(e, "withdraw-dst", {
    args: Deno.args,
    hashlock,
  });
  Deno.exit(1);
});


