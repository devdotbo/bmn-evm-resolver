#!/usr/bin/env -S deno run -A --env-file=.env

import { type Address, type Hex } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { readJson, ensureDir, atomicWriteJson, nowMs } from "./_fs.ts";
import { createWagmiConfig } from "./wagmi-config.ts";
import { getCliAddresses } from "./cli-config.ts";
import { getPrivateKey, type SupportedChainId } from "./cli-config.ts";
import {
  writeSimplifiedEscrowFactoryV2_3CreateDstEscrow,
  readSimplifiedEscrowFactoryV2_3AddressOfEscrow,
  readIerc20Allowance,
  writeIerc20Approve,
} from "../src/generated/contracts.ts";
import { parsePostInteractionData } from "../src/utils/escrow-creation.ts";

function usage(): never {
  console.log("Usage: deno task create:dst -- --hashlock 0x...");
  Deno.exit(1);
}

function getArg(name: string): string | undefined {
  const idx = Deno.args.findIndex((a) => a === `--${name}`);
  return idx >= 0 ? Deno.args[idx + 1] : undefined;
}

const hashlock = getArg("hashlock");
if (!hashlock) usage();

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

async function readOrderByHashlock(h: string): Promise<OrderFile> {
  const pending = `./data/orders/pending/${h}.json`;
  const completed = `./data/orders/completed/${h}.json`;
  try { return await readJson<OrderFile>(pending); } catch (_) {}
  return await readJson<OrderFile>(completed);
}

async function main() {
  const order = await readOrderByHashlock(hashlock!);
  const dstChainId = order.dstChainId as SupportedChainId;

  const pk = (getPrivateKey("RESOLVER_PRIVATE_KEY") || getPrivateKey("BOB_PRIVATE_KEY")) as `0x${string}` | null;
  if (!pk) {
    console.error("RESOLVER_PRIVATE_KEY or BOB_PRIVATE_KEY missing");
    Deno.exit(1);
  }
  const account = privateKeyToAccount(pk, { nonceManager });
  const wagmi = createWagmiConfig();
  const addrs = getCliAddresses(dstChainId);

  // Reconstruct immutables for destination escrow
  const parsed = parsePostInteractionData(order.extensionData);
  const dstSafetyDeposit = parsed.deposits >> 128n;
  const timelocksPacked = parsed.timelocks;
  // Use BMN for dst token (parsed may be zero if decode fails)
  const dstToken = (addrs.tokens.BMN as Address) || (parsed.dstToken as Address);
  const needed = BigInt(order.order.takingAmount) + dstSafetyDeposit;
  const immutables = [
    order.orderHash as Hex,
    order.hashlock as Hex,
    BigInt(order.order.maker),
    BigInt(order.order.receiver),
    BigInt(dstToken),
    BigInt(order.order.takingAmount),
    dstSafetyDeposit,
    timelocksPacked,
  ] as any;

  // Ensure resolver has allowance to factory for dst token to fund escrow
  const currentAllowance = await readIerc20Allowance(wagmi as any, {
    chainId: dstChainId,
    address: dstToken,
    args: [account.address, addrs.escrowFactory],
  } as any);
  if (currentAllowance < needed) {
    const txApprove = await writeIerc20Approve(wagmi as any, {
      chainId: dstChainId,
      account: account as any,
      address: dstToken,
      args: [addrs.escrowFactory, needed * 10n],
    } as any);
    // Best-effort wait; ignore errors if RPC doesn't support receipts here
    try {
      const { waitForTransactionReceipt } = await import("@wagmi/core");
      await waitForTransactionReceipt(wagmi as any, { chainId: dstChainId, hash: txApprove as Hex });
    } catch (_) {}
  }

  const txHash = await writeSimplifiedEscrowFactoryV2_3CreateDstEscrow(wagmi as any, {
    chainId: dstChainId,
    account: account as any,
    args: [immutables],
  } as any);

  // Try to resolve the escrow address deterministically
  let escrowAddress: Address | null = null;
  try {
    const addr = await readSimplifiedEscrowFactoryV2_3AddressOfEscrow(wagmi as any, {
      chainId: dstChainId,
      args: [immutables, false],
    } as any);
    escrowAddress = addr as Address;
  } catch (_) {
    // ignore
  }

  await ensureDir("./data/escrows/dst");
  await atomicWriteJson(`./data/escrows/dst/${order.hashlock}.json`, {
    hashlock: order.hashlock,
    dstChainId,
    escrowAddress,
    createTxHash: txHash,
    writtenAt: nowMs(),
  });

  console.log(escrowAddress || "0x");
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});


