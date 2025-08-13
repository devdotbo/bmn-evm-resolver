#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

// Bob executes: approvals -> fill order -> create dst escrow. Writes data/fills and data/escrows/dst

import { base, optimism } from "viem/chains";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { atomicWriteJson, ensureDir, readJson, nowMs } from "./_fs.ts";
import { orderToStruct } from "./eip712.ts";
import { ensureApprovals as ensureLimitOrderApprovals, fillLimitOrder, type FillOrderParams, decodeRevert } from "./limit-order.ts";
import { simplifiedEscrowFactoryAbi } from "./abis.ts";
import { getCliAddresses, getPrivateKey, getRpcUrl, type SupportedChainId } from "./cli-config.ts";

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
  const ANKR = Deno.env.get("ANKR_API_KEY") || "";
  const BOB_PK = (getPrivateKey("BOB_PRIVATE_KEY") || getPrivateKey("RESOLVER_PRIVATE_KEY") || "") as `0x${string}`;
  if (!BOB_PK) {
    console.error("BOB_PRIVATE_KEY or RESOLVER_PRIVATE_KEY missing");
    Deno.exit(1);
  }
  const account = privateKeyToAccount(BOB_PK, { nonceManager });
  const chain = SRC === base.id ? base : optimism;
  const rpc = getRpcUrl(SRC);
  const client = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ chain, transport: http(rpc), account });

  const addrs = getCliAddresses(SRC);

  // Ensure approvals (Bob for protocol + factory)
  await ensureLimitOrderApprovals(
    client as any,
    wallet as any,
    order.order.takerAsset as Address,
    addrs.limitOrderProtocol,
    addrs.escrowFactory,
    BigInt(order.order.takingAmount),
  );

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

  // Reconstruct standard 65-byte signature from (r,vs)
  const rHex = order.signature.r as Hex;
  const vsBig = BigInt(order.signature.vs);
  const v = Number((vsBig >> 255n) + 27n);
  const sBig = vsBig & ((1n << 255n) - 1n);
  const sHex = `0x${sBig.toString(16).padStart(64, "0")}` as Hex;
  const sigFull = (rHex + sHex.slice(2) + v.toString(16).padStart(2, "0")) as Hex;

  const fillParams: FillOrderParams = {
    order: {
      salt: orderStruct.salt,
      maker: orderStruct.maker as any,
      receiver: orderStruct.receiver as any,
      makerAsset: orderStruct.makerAsset as any,
      takerAsset: orderStruct.takerAsset as any,
      makingAmount: orderStruct.makingAmount,
      takingAmount: orderStruct.takingAmount,
      makerTraits: orderStruct.makerTraits,
    },
    signature: sigFull,
    extensionData: order.extensionData,
    fillAmount: orderStruct.makingAmount,
  };

  const fillRes = await fillLimitOrder(
    client as any,
    wallet as any,
    addrs.limitOrderProtocol,
    fillParams,
  );
  const fillReceipt = await client.waitForTransactionReceipt({ hash: fillRes.hash });

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
  const dstChain = dstChainId === base.id ? base : optimism;
  const dstRpc = getRpcUrl(dstChainId);
  const _dstClient = createPublicClient({ chain: dstChain, transport: http(dstRpc) });
  const _dstWallet = createWalletClient({ chain: dstChain, transport: http(dstRpc), account });

  // immutables are computed onchain from order + extension in v2.3; call createDstEscrow with tuple from events is not possible directly.
  // For this PoC CLI, rely on factory helper to compute address after create call.
  const factoryAddr = getCliAddresses(dstChainId).escrowFactory;
  let tx: Hex;
  try {
    tx = await _dstWallet.writeContract({
      address: factoryAddr,
      abi: simplifiedEscrowFactoryAbi as any,
      functionName: "createDstEscrow",
      args: [{
        orderHash: order.orderHash as Hex,
        hashlock: order.hashlock as Hex,
        maker: 0n,
        taker: 0n,
        token: 0n,
        amount: 0n,
        safetyDeposit: 0n,
        timelocks: 0n,
      } as any],
      account,
      chain: null,
    } as any);
  } catch (e: any) {
    const dec = decodeRevert(e);
    if (dec?.selector) console.error(`factory.revert_selector: ${dec.selector}`);
    if (dec?.data) console.error(`factory.revert_data: ${dec.data}`);
    throw e;
  }
  const receipt = await _dstClient.waitForTransactionReceipt({ hash: tx });

  let escrowAddress: Address | null = null;
  try {
    const res = await _dstClient.readContract({
      address: factoryAddr,
      abi: simplifiedEscrowFactoryAbi as any,
      functionName: "addressOfEscrow",
      args: [{
        orderHash: order.orderHash as Hex,
        hashlock: order.hashlock as Hex,
        maker: 0n,
        taker: 0n,
        token: 0n,
        amount: 0n,
        safetyDeposit: 0n,
        timelocks: 0n,
      } as any, false],
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
  // Always show the full error object
  console.error("unhandled_error:", e);
  try {
    const dec: any = decodeRevert(e);
    if (dec?.selector) console.error(`revert_selector: ${dec.selector}`);
    if (dec?.data) console.error(`revert_data: ${dec.data}`);
  } catch (decErr) {
    console.error("decode_error_failed:", decErr);
  }
  throw e;
});


