#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

// Alice reveals secret and withdraws from destination escrow

import { atomicWriteJson, readJson, nowMs } from "./_fs.ts";
import { base, optimism } from "viem/chains";
import { type Address, type Hex } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { getPrivateKey, type SupportedChainId, getCliAddresses } from "./cli-config.ts";
import { createWagmiConfig } from "./wagmi-config.ts";
import { waitForTransactionReceipt } from "@wagmi/core";
import { simulateEscrowDstV2Withdraw, writeEscrowDstV2Withdraw } from "../src/generated/contracts.ts";
import { parsePostInteractionData } from "../src/utils/escrow-creation.ts";
import { logErrorWithRevert } from "./logging.ts";
import { 
  getTimelockStatus, 
  waitUntilDstWithdrawWindow, 
  isDstWithdrawWindowOpen,
  formatTimeRemaining,
  secondsUntilDstWithdraw 
} from "./timelock-utils.ts";

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
  
  // Load required files with proper error handling
  let secretJson: { secret: Hex };
  let dstJson: { dstChainId: number; escrowAddress: Address; immutables?: any };
  let statusJson: { orderHash: Hex };
  let orderJson: any;
  
  try {
    secretJson = await readJson<{ secret: Hex }>(secretFile);
  } catch (e) {
    console.error(`Failed to read secret file: ${secretFile}`);
    throw e;
  }
  
  try {
    dstJson = await readJson<{ dstChainId: number; escrowAddress: Address }>(dstFile);
  } catch (e) {
    console.error(`Failed to read destination escrow file: ${dstFile}`);
    throw e;
  }
  
  try {
    statusJson = await readJson<{ orderHash: Hex }>(`./data/swaps/${hashlock}/status.json`);
  } catch (e) {
    console.error(`Failed to read status file: ./data/swaps/${hashlock}/status.json`);
    throw e;
  }
  
  // Load order for immutables reconstruction
  try {
    orderJson = await readJson<any>(`./data/orders/pending/${hashlock}.json`);
  } catch (_) {
    try {
      orderJson = await readJson<any>(`./data/orders/completed/${hashlock}.json`);
    } catch (e) {
      console.error(`Failed to read order file for hashlock: ${hashlock}`);
      throw e;
    }
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
  const addresses = getCliAddresses(dstChainId);

  // Use stored immutables if available, otherwise reconstruct
  let immutables: any;
  
  if (dstJson.immutables) {
    // Use exact immutables from escrow creation
    immutables = [
      dstJson.immutables.orderHash as Hex,
      dstJson.immutables.hashlock as Hex,
      dstJson.immutables.maker as Address,
      dstJson.immutables.receiver as Address,
      dstJson.immutables.token as Address,
      BigInt(dstJson.immutables.amount),
      BigInt(dstJson.immutables.safetyDeposit),
      BigInt(dstJson.immutables.timelocks),
    ];
  } else {
    // Fallback: Reconstruct immutables from order and extension data for destination escrow
    let ext = orderJson.extensionData as Hex;
    
    // Validate extension data exists
    if (!ext || ext === "0x") {
      console.error("Extension data missing from order");
      Deno.exit(1);
    }
    
    // Skip the 4-byte offsets header if present
    if (ext.startsWith("0x000000")) {
      // Has offsets header, skip first 4 bytes
      ext = ("0x" + ext.slice(10)) as Hex;
    }
    
    let parsed;
    try {
      parsed = parsePostInteractionData(ext);
    } catch (e) {
      console.error("Failed to parse PostInteraction data from extension");
      throw e;
    }
    
    // Extract values with validation
    const deposits = parsed.deposits || 0n;
    const dstSafetyDeposit = deposits >> 128n;
    const originalTimelocks = parsed.timelocks; // packed as srcCancellation<<128 | dstWithdrawal
    
    // Repack timelocks for destination escrow
    // Original packing: srcCancellation<<128 | dstWithdrawal (absolute timestamps)
    const dstWithdrawalTimestamp = originalTimelocks & ((1n << 128n) - 1n);
    const srcCancellationTimestamp = originalTimelocks >> 128n;
    
    // TimelocksLib expects:
    // - Bits 224-255: deployedAt (base timestamp)
    // - Other stages: offsets from deployedAt (not absolute timestamps)
    // Use current timestamp as deployedAt (should match what was used during creation)
    const deployedAt = BigInt(Math.floor(Date.now() / 1000));
    const deployedAt32 = deployedAt & 0xFFFFFFFFn;
    
    // Calculate offsets from deployedAt
    const dstWithdrawalOffset = (dstWithdrawalTimestamp > deployedAt) 
      ? (dstWithdrawalTimestamp - deployedAt) & 0xFFFFFFFFn 
      : 0n;
    const dstCancellationOffset = (srcCancellationTimestamp > deployedAt) 
      ? (srcCancellationTimestamp - deployedAt) & 0xFFFFFFFFn 
      : 0n;
    
    // Pack timelocks with deployedAt and offsets
    // Stage 4 (DstWithdrawal): bits 128-159 (offset from deployedAt)
    // Stage 6 (DstCancellation): bits 192-223 (offset from deployedAt)
    // DeployedAt: bits 224-255 (base timestamp)
    const timelocksPacked = (deployedAt32 << 224n) | (dstCancellationOffset << 192n) | (dstWithdrawalOffset << 128n);
    
    // Use configured BMN token address as fallback for dstToken if needed
    const dstToken = parsed.dstToken && parsed.dstToken !== "0x0000000000000000000000000000000000000000" 
      ? parsed.dstToken 
      : addresses.tokens.BMN;
      
    // Check timelock status (use original for status check)
    const timelockStatus = getTimelockStatus(originalTimelocks);
    
    if (!timelockStatus.dstWithdrawal.isOpen) {
      console.log(`Destination withdrawal window not yet open.`);
      console.log(`Time remaining: ${timelockStatus.dstWithdrawal.formatted}`);
      console.log(`Window opens at timestamp: ${timelockStatus.dstWithdrawal.timestamp}`);
      
      // Ask if user wants to wait
      const shouldWait = Deno.args.includes("--wait");
      if (shouldWait) {
        console.log("Waiting for window to open...");
        await waitUntilDstWithdrawWindow(timelockStatus.dstWithdrawal.timestamp);
        console.log("Window is now open, proceeding with withdrawal");
      } else {
        console.log("Use --wait flag to automatically wait for the window to open");
        Deno.exit(1);
      }
    }
    
    immutables = [
      statusJson.orderHash as Hex,
      hashlock as Hex,
      orderJson.order.maker as Address,  // Keep as address, not BigInt
      orderJson.order.receiver as Address,  // Keep as address, not BigInt
      dstToken as Address,  // Keep as address, not BigInt
      BigInt(orderJson.order.takingAmount),
      dstSafetyDeposit,
      timelocksPacked,
    ];
  }

  // Use withdraw(secret, immutables)
  await simulateEscrowDstV2Withdraw(wagmiConfig as any, {
    chainId: dstChainId,
    account: account.address,
    address: dstJson.escrowAddress,
    args: [secretJson.secret, immutables],
  } as any);
  const txHash = await writeEscrowDstV2Withdraw(wagmiConfig as any, {
    chainId: dstChainId,
    account: account as any,
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


