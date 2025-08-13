#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

// Bob executes: approvals -> fill order -> create dst escrow. Writes data/fills and data/escrows/dst

import { base, optimism } from "viem/chains";
import { type Address, type Hex } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { atomicWriteJson, ensureDir, readJson, nowMs } from "./_fs.ts";
import { orderToStruct } from "./eip712.ts";
import { getCliAddresses, getPrivateKey, type SupportedChainId } from "./cli-config.ts";
import { createWagmiConfig } from "./wagmi-config.ts";
import { waitForTransactionReceipt } from "@wagmi/core";
import {
  readIerc20Allowance,
  writeIerc20Approve,
  writeSimpleLimitOrderProtocolFillOrderArgs,
  writeSimplifiedEscrowFactoryV2_3CreateDstEscrow,
  readSimplifiedEscrowFactoryV2_3AddressOfEscrow,
} from "../src/generated/contracts.ts";
import { logErrorWithRevert } from "./logging.ts";

function usage(): never {
  console.log("Usage: deno run -A --env-file=.env cli/swap-execute.ts --file ./data/orders/pending/{hashlock}.json");
  Deno.exit(1);
}

function getArg(name: string): string | undefined {
  const idx = Deno.args.findIndex((a) => a === `--${name}`);
  if (idx >= 0) return Deno.args[idx + 1];
  return undefined;
}

const fileArg = getArg("file");
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

async function main() {
  const order: OrderFile = await readJson<OrderFile>(fileArg!);

  const SRC = order.srcChainId as SupportedChainId;
  const BOB_PK = (getPrivateKey("BOB_PRIVATE_KEY") || getPrivateKey("RESOLVER_PRIVATE_KEY") || "") as `0x${string}`;
  if (!BOB_PK) {
    console.error("BOB_PRIVATE_KEY or RESOLVER_PRIVATE_KEY missing");
    Deno.exit(1);
  }
  const account = privateKeyToAccount(BOB_PK, { nonceManager });
  const _chain = SRC === base.id ? base : optimism;
  const wagmiConfig = createWagmiConfig();

  const addrs = getCliAddresses(SRC);

  // Ensure approvals (Bob for protocol + factory) using wagmi actions
  const needed = BigInt(order.order.takingAmount);
  const currentAllowance = await readIerc20Allowance(wagmiConfig, {
    chainId: SRC,
    address: order.order.takerAsset as Address,
    args: [account.address, addrs.limitOrderProtocol],
  });
  if (currentAllowance < needed) {
    const approveHash = await writeIerc20Approve(wagmiConfig as any, {
      chainId: SRC,
      account: account as any,
      address: order.order.takerAsset as Address,
      args: [addrs.limitOrderProtocol, needed * 10n],
    });
    await waitForTransactionReceipt(wagmiConfig, { chainId: SRC, hash: approveHash });
  }
  const facAllowance = await readIerc20Allowance(wagmiConfig, {
    chainId: SRC,
    address: order.order.takerAsset as Address,
    args: [account.address, addrs.escrowFactory],
  });
  if (facAllowance < needed) {
    const approveHash = await writeIerc20Approve(wagmiConfig as any, {
      chainId: SRC,
      account: account as any,
      address: order.order.takerAsset as Address,
      args: [addrs.escrowFactory, needed * 10n],
    });
    await waitForTransactionReceipt(wagmiConfig, { chainId: SRC, hash: approveHash });
  }

  const orderStruct = orderToStruct({
    salt: BigInt(order.order.salt),
    maker: order.order.maker,
    receiver: order.order.receiver,
    makerAsset: order.order.makerAsset,
    takerAsset: order.order.takerAsset,
    makingAmount: BigInt(order.order.makingAmount),
    takingAmount: BigInt(order.order.takingAmount),
    makerTraits: BigInt(order.order.makerTraits),
  });

  // Compute takerTraits based on extension length and threshold
  const computedArgsExtLenBytes = BigInt((order.extensionData.length - 2) / 2);
  const makerAmountFlag = 1n << 255n;
  const threshold = orderStruct.takingAmount & ((1n << 185n) - 1n);
  const takerTraits = makerAmountFlag | (computedArgsExtLenBytes << 224n) | threshold;

  // Fill using wagmi action with r/vs directly
  const orderTuple = [
    orderStruct.salt,
    orderStruct.maker,
    orderStruct.receiver,
    orderStruct.makerAsset,
    orderStruct.takerAsset,
    orderStruct.makingAmount,
    orderStruct.takingAmount,
    orderStruct.makerTraits,
  ] as const;
  const fillHash = await writeSimpleLimitOrderProtocolFillOrderArgs(wagmiConfig as any, {
    chainId: SRC,
    account: account as any,
    args: [orderTuple as any, order.signature.r, order.signature.vs, orderStruct.makingAmount, takerTraits, order.extensionData] as any,
  } as any);
  const fillReceipt = await waitForTransactionReceipt(wagmiConfig as any, { chainId: SRC, hash: fillHash as Hex });

  const fillsDir = `./data/fills`;
  await ensureDir(fillsDir);
  await atomicWriteJson(`${fillsDir}/${order.hashlock}.json`, {
    hashlock: order.hashlock,
    orderHash: order.orderHash,
    srcChainId: order.srcChainId,
    taker: account.address,
    fillTxHash: fillReceipt.transactionHash,
    gasUsed: fillReceipt.gasUsed.toString(),
    postInteraction: {
      executed: false,
      srcEscrow: null,
    },
    writtenAt: nowMs(),
  });

  // Create destination escrow (idempotent): call factory.createDstEscrow with immutables
  // Use readSimplifiedEscrowFactoryV2_3AddressOfEscrow for address if tx doesn't emit
  const dstChainId = order.dstChainId as SupportedChainId;
  const immutablesTuple = [
    order.orderHash as Hex,
    order.hashlock as Hex,
    0n,
    0n,
    0n,
    0n,
    0n,
    0n,
  ] as any;
  const dstHash = await writeSimplifiedEscrowFactoryV2_3CreateDstEscrow(wagmiConfig as any, {
    chainId: dstChainId,
    account: account as any,
    args: [immutablesTuple],
  } as any);
  const receipt = await waitForTransactionReceipt(wagmiConfig as any, { chainId: dstChainId, hash: dstHash as Hex });

  let escrowAddress: Address | null = null;
  try {
    const res = await readSimplifiedEscrowFactoryV2_3AddressOfEscrow(wagmiConfig as any, {
      chainId: dstChainId,
      args: [immutablesTuple, false],
    } as any);
    escrowAddress = res as Address;
  } catch (_e) {
    // ignore; will rely on recorded events or later status checks
  }

  const dstDir = `./data/escrows/dst`;
  await ensureDir(dstDir);
  await atomicWriteJson(`${dstDir}/${order.hashlock}.json`, {
    hashlock: order.hashlock,
    dstChainId,
    escrowAddress,
    createTxHash: receipt.transactionHash,
    writtenAt: nowMs(),
  });

  // Update status
  const statusFile = `./data/swaps/${order.hashlock}/status.json`;
  await atomicWriteJson(statusFile, {
    hashlock: order.hashlock,
    orderHash: order.orderHash,
    state: "DST_CREATED",
    updatedAt: nowMs(),
    refs: {
      orderFile: fileArg,
      fillFile: `./data/fills/${order.hashlock}.json`,
      dstEscrowFile: `./data/escrows/dst/${order.hashlock}.json`,
    },
    error: null,
  });

  console.log(escrowAddress || "0x");
}

main().catch(async (e) => {
  await logErrorWithRevert(e, "swap-execute", {
    args: Deno.args,
    file: fileArg,
  });
  Deno.exit(1);
});


