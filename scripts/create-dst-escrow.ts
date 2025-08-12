#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

// Minimal declarations for non-Deno linters
declare const Deno: any;

import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  encodeFunctionData,
  http,
  parseAbiParameters,
} from "viem";
import { base, optimism } from "viem/chains";
import { CREATE3_ADDRESSES } from "../src/config/contracts.ts";
import FactoryAbi from "../abis/CrossChainEscrowFactoryV2.json" with { type: "json" };
import { TokenApprovalManager } from "../src/utils/token-approvals.ts";

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < Deno.args.length; i++) {
    const a = Deno.args[i];
    if (a.startsWith("--")) {
      const [k, v] = a.split("=", 2);
      out[k.slice(2)] = v ?? Deno.args[++i];
    } else if (!out.file && a.endsWith(".json")) {
      out.file = a;
    }
  }
  return out;
}

function getRpc(chain: "base" | "optimism") {
  const local = Deno.env.get("LOCAL_RPC");
  const localBase = Deno.env.get("LOCAL_BASE_RPC");
  const localOp = Deno.env.get("LOCAL_OP_RPC");
  if (chain === "base" && (localBase || local)) return http((localBase || local) as string);
  if (chain === "optimism" && (localOp || local)) return http((localOp || local) as string);
  const key = Deno.env.get("ANKR_API_KEY") || "";
  if (chain === "base") return http(key ? `https://rpc.ankr.com/base/${key}` : "https://mainnet.base.org");
  return http(key ? `https://rpc.ankr.com/optimism/${key}` : "https://mainnet.optimism.io");
}

function toUint256Address(addr: Address): bigint {
  return BigInt(addr);
}

async function main() {
  const args = parseArgs();
  const filePath = args.file;
  if (!filePath) {
    console.error("Usage: deno run scripts/create-dst-escrow.ts pending-orders/<hash>.json");
    Deno.exit(1);
  }

  const data = JSON.parse(await Deno.readTextFile(filePath));
  const order = data.order;
  const extension: Hex = data.extensionData as Hex;
  const postSeg = ("0x" + (extension as string).slice(66)) as Hex; // drop offsets word
  const extra = ("0x" + postSeg.slice(42)) as Hex; // drop 20-byte target

  const [hashlock, dstChainIdRaw, dstToken, deposits, timelocks] = decodeAbiParameters(
    parseAbiParameters("bytes32,uint256,address,uint256,uint256"),
    extra,
  );

  const dstChainId = Number(dstChainIdRaw);
  const dstDeposit = (deposits as bigint) >> 128n;
  const srcDeposit = (deposits as bigint) & ((1n << 128n) - 1n);
  const srcCancelTs = (timelocks as bigint) >> 128n;
  const dstWithdrawTs = (timelocks as bigint) & ((1n << 128n) - 1n);

  const chain = dstChainId === base.id ? "base" : "optimism";
  const viemChain = chain === "base" ? base : optimism;
  const transport = getRpc(chain);

  const client = createPublicClient({ chain: viemChain as any, transport });
  const { privateKeyToAccount, nonceManager } = await import("viem/accounts");
  const pk = (Deno.env.get("RESOLVER_PRIVATE_KEY") || Deno.env.get("BOB_PRIVATE_KEY") || "") as `0x${string}`;
  if (!pk) {
    console.error("RESOLVER_PRIVATE_KEY or BOB_PRIVATE_KEY is required");
    Deno.exit(1);
  }
  const account = privateKeyToAccount(pk, { nonceManager });
  const wallet = createWalletClient({ chain: viemChain as any, transport, account });

  const factory = CREATE3_ADDRESSES.ESCROW_FACTORY_V2 as Address;
  const token = dstToken as Address;
  const dstAmount = BigInt(order.takingAmount);

  // Ensure factory approval on destination chain
  const approvals = new TokenApprovalManager(factory);
  await approvals.ensureApproval(client as any, wallet as any, token, account.address, dstAmount);

  // Build dstImmutables
  const dstImmutables = {
    orderHash: (await import("viem")).hashTypedData({
      domain: {
        name: "Bridge-Me-Not Orders",
        version: "1",
        chainId: Number(data.chainId), // source chain id used for order hash
        verifyingContract: (data.chainId === 8453
          ? CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_BASE
          : CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_OPTIMISM) as Address,
      },
      primaryType: "Order",
      types: {
        Order: [
          { name: "salt", type: "uint256" },
          { name: "maker", type: "address" },
          { name: "receiver", type: "address" },
          { name: "makerAsset", type: "address" },
          { name: "takerAsset", type: "address" },
          { name: "makingAmount", type: "uint256" },
          { name: "takingAmount", type: "uint256" },
          { name: "makerTraits", type: "uint256" },
        ],
      },
      message: {
        salt: BigInt(order.salt),
        maker: order.maker as Address,
        receiver: order.receiver as Address,
        makerAsset: order.makerAsset as Address,
        takerAsset: order.takerAsset as Address,
        makingAmount: BigInt(order.makingAmount),
        takingAmount: BigInt(order.takingAmount),
        makerTraits: BigInt(order.makerTraits),
      },
    }) as Hex,
    hashlock: hashlock as Hex,
    maker: toUint256Address(order.receiver as Address), // Alice on destination
    taker: toUint256Address(order.maker as Address),    // Alice withdraws
    token: toUint256Address(token),
    amount: dstAmount,
    safetyDeposit: dstDeposit,
    timelocks: 0n, // let factory/escrow compute from srcCancelTs & block timestamp
  } as const;

  const calldata = encodeFunctionData({
    abi: FactoryAbi.abi as any,
    functionName: "createDstEscrow",
    args: [dstImmutables as any, srcCancelTs],
  });

  console.log("📦 Creating destination escrow on", viemChain.id);
  const hash = await wallet.sendTransaction({ to: factory, data: calldata });
  console.log("📝 Tx sent:", hash);
  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log("✅ Mined:", receipt.transactionHash);
}

if (import.meta.main) {
  await main();
}



