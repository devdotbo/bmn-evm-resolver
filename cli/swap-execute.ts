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
import { parsePostInteractionData } from "../src/utils/escrow-creation.ts";
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
  // Choose signer that matches makerTraits.allowedSender (low 80 bits) when present
  const pkBob = getPrivateKey("BOB_PRIVATE_KEY");
  const pkResolver = getPrivateKey("RESOLVER_PRIVATE_KEY");
  if (!pkBob && !pkResolver) {
    console.error("BOB_PRIVATE_KEY or RESOLVER_PRIVATE_KEY missing");
    Deno.exit(1);
  }
  const _chain = SRC === base.id ? base : optimism;
  const wagmiConfig = createWagmiConfig();

  const addrs = getCliAddresses(SRC);

  // Choose signer now (before approvals) based on allowedSender low 80 bits
  const allowedSenderMaskPre = (1n << 80n) - 1n;
  const allowedSenderLow80Pre = BigInt(order.order.makerTraits) & allowedSenderMaskPre;
  let account = pkBob ? privateKeyToAccount(pkBob, { nonceManager }) : undefined;
  const resolverAccount = pkResolver ? privateKeyToAccount(pkResolver, { nonceManager }) : undefined;
  const toLow80Pre = (addr: string) => (BigInt(addr) & allowedSenderMaskPre);
  if (allowedSenderLow80Pre !== 0n) {
    const bobMatches = account && toLow80Pre(account.address) === allowedSenderLow80Pre;
    const resolverMatches = resolverAccount && toLow80Pre(resolverAccount.address) === allowedSenderLow80Pre;
    if (resolverMatches && !bobMatches) account = resolverAccount!;
    if (!bobMatches && !resolverMatches && resolverAccount) account = resolverAccount;
  } else {
    if (resolverAccount) account = resolverAccount;
  }
  if (!account) account = (pkBob || pkResolver) ? privateKeyToAccount((pkBob || pkResolver)!, { nonceManager }) : undefined as any;
  if (!account) {
    console.error("No usable signer account");
    Deno.exit(1);
  }

  // Ensure approvals (Bob/Resolver for protocol + factory) using wagmi actions
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
  // account already selected earlier before approvals

  // Compute takerTraits based on maker-declared extension and threshold
  const computedArgsExtLenBytes = BigInt((order.extensionData.length - 2) / 2);
  const makerAmountFlag = 1n << 255n;
  const threshold = orderStruct.takingAmount & ((1n << 185n) - 1n);
  const HAS_EXTENSION_BIT = 1n << 249n;
  const makerDeclaredExtension = (orderStruct.makerTraits & HAS_EXTENSION_BIT) !== 0n;
  const argsExtLen = makerDeclaredExtension ? computedArgsExtLenBytes : 0n;
  const takerTraits = makerAmountFlag | (argsExtLen << 224n) | threshold;

  // Fill using wagmi action with r/vs directly
  // Order tuple should use EIP-712 message types: address fields remain addresses
  const orderTuple = [
    orderStruct.salt,
    order.order.maker,
    order.order.receiver,
    order.order.makerAsset,
    order.order.takerAsset,
    orderStruct.makingAmount,
    orderStruct.takingAmount,
    orderStruct.makerTraits,
  ] as const;
  const fillHash = await writeSimpleLimitOrderProtocolFillOrderArgs(wagmiConfig as any, {
    chainId: SRC,
    account: account as any,
    gas: 2_500_000n as any,
    args: [
      orderTuple as any,
      order.signature.r,
      order.signature.vs,
      orderStruct.makingAmount,
      takerTraits,
      makerDeclaredExtension ? order.extensionData : ("0x" as Hex),
    ] as any,
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
    extensionData: order.extensionData,  // Store extension data for withdrawal
    postInteraction: {
      executed: false,
      srcEscrow: null,
    },
    writtenAt: nowMs(),
  });

  // Create destination escrow (idempotent): call factory.createDstEscrow with immutables
  // Use readSimplifiedEscrowFactoryV2_3AddressOfEscrow for address if tx doesn't emit
  const dstChainId = order.dstChainId as SupportedChainId;
  const dstAddrs = getCliAddresses(dstChainId);
  
  // Parse PostInteraction data from extension to get immutables
  // Skip the 4-byte offsets header if present
  let extensionForParsing = order.extensionData;
  if (extensionForParsing.startsWith("0x000000")) {
    // Has offsets header, skip first 4 bytes
    extensionForParsing = "0x" + extensionForParsing.slice(10) as Hex;
  }
  
  const parsed = parsePostInteractionData(extensionForParsing);
  const deposits = parsed.deposits || 0n;
  const dstSafetyDeposit = deposits >> 128n;
  const dstToken = parsed.dstToken && parsed.dstToken !== "0x0000000000000000000000000000000000000000" 
    ? parsed.dstToken 
    : dstAddrs.tokens.BMN;
  
  // Repack timelocks for destination escrow
  // Original packing: srcCancellation<<128 | dstWithdrawal (absolute timestamps)
  const dstWithdrawalTimestamp = parsed.timelocks & ((1n << 128n) - 1n);
  const srcCancellationTimestamp = parsed.timelocks >> 128n;
  
  // TimelocksLib expects:
  // - Bits 224-255: deployedAt (base timestamp)
  // - Other stages: offsets from deployedAt (not absolute timestamps)
  // Use current timestamp as deployedAt
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
  const dstTimelocks = (deployedAt32 << 224n) | (dstCancellationOffset << 192n) | (dstWithdrawalOffset << 128n);
  
  const immutablesTuple = [
    order.orderHash as Hex,
    order.hashlock as Hex,
    order.order.maker as Address,  // Keep as address, not BigInt
    order.order.receiver as Address,  // Keep as address, not BigInt  
    dstToken as Address,  // Keep as address, not BigInt
    BigInt(order.order.takingAmount),
    dstSafetyDeposit,
    dstTimelocks,  // Correctly packed for destination escrow
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`read addressOfEscrow failed (will rely on events/status): ${msg}`);
  }

  const dstDir = `./data/escrows/dst`;
  await ensureDir(dstDir);
  await atomicWriteJson(`${dstDir}/${order.hashlock}.json`, {
    hashlock: order.hashlock,
    dstChainId,
    escrowAddress,
    createTxHash: receipt.transactionHash,
    immutables: {
      orderHash: order.orderHash,
      hashlock: order.hashlock,
      maker: order.order.maker,
      receiver: order.order.receiver,
      token: dstToken,
      amount: order.order.takingAmount,
      safetyDeposit: dstSafetyDeposit.toString(),
      timelocks: dstTimelocks.toString(),  // Store exact timelocks used
    },
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


