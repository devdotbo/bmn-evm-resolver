#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

// Bob withdraws from source escrow using secret

import { atomicWriteJson, readJson, nowMs } from "./_fs.ts";
import { base } from "viem/chains";
import { type Address, type Hex } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { getPrivateKey } from "./cli-config.ts";
import { createWagmiConfig } from "./wagmi-config.ts";
import { waitForTransactionReceipt } from "@wagmi/core";
import { simulateEscrowSrcV2Withdraw, writeEscrowSrcV2Withdraw, readSimplifiedEscrowFactoryV2_3Escrows } from "../src/generated/contracts.ts";
import { logErrorWithRevert } from "./logging.ts";
import { parsePostInteractionData } from "../src/utils/escrow-creation.ts";
import { readJson as readFsJson } from "./_fs.ts";
import { getBlock, getTransactionReceipt } from "@wagmi/core";

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
const addressOverride = getArg("address");
if (!hashlock) usage();

async function main() {
  const secretJson = await readJson<{ secret: Hex }>(`./data/secrets/${hashlock}.json`);
  let srcEscrow: Address | null = (addressOverride as Address | null) || null;
  try {
    const fillJson = await readJson<{ postInteraction?: { srcEscrow?: Address } }>(`./data/fills/${hashlock}.json`);
    srcEscrow = (fillJson.postInteraction?.srcEscrow || null) as Address | null;
  } catch (_) {
    // fills file might not exist; proceed to resolve via factory
  }

  const wagmiConfig = createWagmiConfig();
  if (!srcEscrow || srcEscrow === ("0x0000000000000000000000000000000000000000" as Address)) {
    try {
      const addr = await readSimplifiedEscrowFactoryV2_3Escrows(wagmiConfig as any, {
        chainId: base.id,
        args: [hashlock as Hex],
      } as any);
      srcEscrow = addr as Address;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to resolve srcEscrow from factory mapping: ${msg}`);
      throw e;
    }
  }
  if (!srcEscrow || srcEscrow === ("0x0000000000000000000000000000000000000000" as Address)) {
    console.error("Could not determine srcEscrow address");
    Deno.exit(1);
  }

  const BOB_PK = (getPrivateKey("BOB_PRIVATE_KEY") || getPrivateKey("RESOLVER_PRIVATE_KEY") || "") as `0x${string}`;
  if (!BOB_PK) {
    console.error("BOB_PRIVATE_KEY or RESOLVER_PRIVATE_KEY missing");
    Deno.exit(1);
  }
  const account = privateKeyToAccount(BOB_PK, { nonceManager });
  // Build exact source immutables to satisfy onlyValidImmutables
  // Load order & fills to reconstruct timelocks using the fill block.timestamp
  let orderJson: any;
  try {
    orderJson = await readFsJson(`./data/orders/pending/${hashlock}.json`).catch(() => readFsJson(`./data/orders/completed/${hashlock}.json`));
  } catch (e) {
    console.error("Failed to read order json for hashlock", e);
    Deno.exit(1);
  }
  let fillsJson: any;
  try {
    fillsJson = await readFsJson(`./data/fills/${hashlock}.json`);
  } catch (e) {
    console.error("Failed to read fills json (needed for fill tx hash)", e);
    Deno.exit(1);
  }

  const parsed = parsePostInteractionData(orderJson.extensionData as Hex);
  const deposits: bigint = parsed.deposits || 0n;
  const srcSafetyDeposit = deposits & ((1n << 128n) - 1n);
  const packedOriginal = parsed.timelocks as bigint; // srcCancellation<<128 | dstWithdrawal (absolute)
  const dstWithdrawalAbs = packedOriginal & ((1n << 128n) - 1n);
  const srcCancellationAbs = packedOriginal >> 128n;

  // Use the actual fill block timestamp as deployedAt
  let deployedAt32 = 0n;
  try {
    const receipt = await getTransactionReceipt(wagmiConfig as any, { chainId: base.id, hash: fillsJson.fillTxHash });
    const block = await getBlock(wagmiConfig as any, { chainId: base.id, blockNumber: receipt.blockNumber });
    const ts = BigInt(Number(block.timestamp));
    deployedAt32 = ts & 0xFFFFFFFFn;
  } catch (e) {
    console.error("Failed to resolve fill block timestamp", e);
    Deno.exit(1);
  }

  // Offsets relative to deployedAt (mirroring factory logic)
  const srcWithdrawalOffset = 300n;
  const srcPublicWithdrawalOffset = 600n;
  const srcCancellationOffset = srcCancellationAbs > deployedAt32 ? (srcCancellationAbs - deployedAt32) & 0xFFFFFFFFn : 0n;
  const srcPublicCancellationOffset = (srcCancellationOffset + 300n) & 0xFFFFFFFFn;
  const dstWithdrawalOffset = dstWithdrawalAbs > deployedAt32 ? (dstWithdrawalAbs - deployedAt32) & 0xFFFFFFFFn : 0n;
  const dstPublicWithdrawalOffset = (dstWithdrawalOffset + 300n) & 0xFFFFFFFFn;
  const dstCancellationOffset = 7200n;

  const srcTimelocks = (deployedAt32 << 224n)
    | (dstCancellationOffset << 192n)
    | (dstPublicWithdrawalOffset << 160n)
    | (dstWithdrawalOffset << 128n)
    | (srcPublicCancellationOffset << 96n)
    | (srcCancellationOffset << 64n)
    | (srcPublicWithdrawalOffset << 32n)
    | (srcWithdrawalOffset);

  const makerAddr = orderJson.order.maker as Address;
  const takerAddr = (fillsJson.taker || account.address) as Address;
  const tokenAddr = orderJson.order.makerAsset as Address;
  const makingAmount = BigInt(orderJson.order.makingAmount);
  const immutables = [
    orderJson.orderHash as Hex,
    hashlock as Hex,
    BigInt(makerAddr),
    BigInt(takerAddr),
    BigInt(tokenAddr),
    makingAmount,
    srcSafetyDeposit,
    srcTimelocks,
  ] as any;

  await simulateEscrowSrcV2Withdraw(wagmiConfig as any, {
    chainId: base.id,
    account: account as any,
    address: srcEscrow,
    args: [secretJson.secret, immutables],
  } as any);
  const tx = await writeEscrowSrcV2Withdraw(wagmiConfig as any, {
    chainId: base.id,
    account: account as any,
    address: srcEscrow,
    args: [secretJson.secret, immutables],
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


