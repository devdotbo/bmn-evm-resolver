#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
// Minimal declarations for non-Deno linters
declare const Deno: any;

import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  http,
  decodeErrorResult,
  encodeFunctionData,
  decodeAbiParameters,
  parseAbiParameters,
  hashTypedData,
  recoverAddress,
  parseAbi,
} from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { base, optimism } from "viem/chains";
import { getContractAddresses } from "../src/config/contracts.ts";
import SimpleLimitOrderProtocolAbi from "../abis/SimpleLimitOrderProtocol.json" with { type: "json" };

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

function toHexBytes(hex: string): number {
  return (hex.length - 2) / 2;
}

function computeTakerTraits(order: any, extensionData: string): bigint {
  const makerAmountFlag = 1n << 255n;
  const argsExtLen = BigInt(toHexBytes(extensionData));
  const threshold = BigInt(order.takingAmount) & ((1n << 185n) - 1n);
  return makerAmountFlag | (argsExtLen << 224n) | threshold;
}

// no split; we will pass bytes signature directly

async function ensureAllowance(
  client: any,
  wallet: any,
  token: Address,
  owner: Address,
  spender: Address,
  minAmount: bigint,
): Promise<void> {
  const allowance = await client.readContract({
    address: token,
    abi: parseAbi([
      "function allowance(address owner, address spender) view returns (uint256)",
    ]),
    functionName: "allowance",
    args: [owner, spender],
  });
  if ((allowance as bigint) >= minAmount) {
    console.log(`allowance ok for ${owner} -> ${spender}: ${allowance}`);
    return;
  }
  console.log(`approving ${spender} for ${owner} amount ${minAmount}`);
  const hash = await wallet.writeContract({
    address: token,
    abi: parseAbi([
      "function approve(address spender, uint256 amount) returns (bool)",
    ]),
    functionName: "approve",
    args: [spender, minAmount * 10n],
    account: wallet.account as any,
  });
  await client.waitForTransactionReceipt({ hash });
  console.log(`approve tx: ${hash}`);
}

async function main() {
  const file = Deno.args[0] || (await (async () => {
    for await (const entry of Deno.readDir("./pending-orders")) {
      if (entry.isFile && entry.name) return entry.name;
    }
    return undefined;
  })());
  if (!file) {
    console.error("No pending-orders file found");
    Deno.exit(1);
  }
  const path = file.startsWith("pending-orders/") ? file : `pending-orders/${file}`;
  const data = JSON.parse(await Deno.readTextFile(path));

  const chainId = Number(data.chainId);
  const transport = chainId === 8453 ? getRpc("base") : getRpc("optimism");
  const client = createPublicClient({ chain: chainId === 8453 ? (base as any) : (optimism as any), transport });
  const walletTransport = transport;

  const addrs = getContractAddresses(chainId);
  const protocol: Address = addrs.limitOrderProtocol as Address;
  const token: Address = addrs.tokens.BMN as Address;
  const factory: Address = addrs.escrowFactory as Address;

  const takerTraits = computeTakerTraits(data.order, data.extensionData);

  // Pre-flight & diagnostics
  const argsLen = BigInt(toHexBytes(data.extensionData));
  // Local signature sanity check: recover maker from typed digest
  try {
    const digest = hashTypedData({
      domain: {
        name: "Bridge-Me-Not Orders",
        version: "1",
        chainId,
        verifyingContract: protocol,
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
        salt: BigInt(data.order.salt),
        maker: data.order.maker as Address,
        receiver: data.order.receiver as Address,
        makerAsset: data.order.makerAsset as Address,
        takerAsset: data.order.takerAsset as Address,
        makingAmount: BigInt(data.order.makingAmount),
        takingAmount: BigInt(data.order.takingAmount),
        makerTraits: BigInt(data.order.makerTraits),
      },
    });
    const recovered = await recoverAddress({ hash: digest as Hex, signature: data.signature as Hex });
    const ok = recovered.toLowerCase() === (data.order.maker as string).toLowerCase();
    console.log("signature:", ok ? "valid" : "INVALID", recovered, "expected", data.order.maker);
  } catch (e) {
    console.log("signature: local check failed", (e as any)?.message || String(e));
  }

  // Ensure allowances for maker and taker on the fork using env private keys
  try {
    const makerPk = Deno.env.get("ALICE_PRIVATE_KEY");
    const takerPk = Deno.env.get("RESOLVER_PRIVATE_KEY") || Deno.env.get("BOB_PRIVATE_KEY");
    if (makerPk) {
      const makerAccount = privateKeyToAccount(makerPk as `0x${string}`, { nonceManager });
      const makerWallet = createWalletClient({
        account: makerAccount,
        chain: (chainId === 8453 ? base : optimism) as any,
        transport: walletTransport,
      });
      await ensureAllowance(
        client,
        makerWallet,
        token,
        makerAccount.address,
        protocol,
        BigInt(data.order.makingAmount),
      );
    }
    if (takerPk) {
      const takerAccount = privateKeyToAccount(takerPk as `0x${string}`, { nonceManager });
      const takerWallet = createWalletClient({
        account: takerAccount,
        chain: (chainId === 8453 ? base : optimism) as any,
        transport: walletTransport,
      });
      await ensureAllowance(
        client,
        takerWallet,
        token,
        takerAccount.address,
        protocol,
        BigInt(data.order.takingAmount),
      );
      // Factory needs to pull funds in postInteraction
      await ensureAllowance(
        client,
        takerWallet,
        token,
        takerAccount.address,
        factory,
        BigInt(data.order.makingAmount),
      );
    }
  } catch (e) {
    console.log("allowance setup skipped/failed:", (e as any)?.message || String(e));
  }

  const argsLenFromTraits = (takerTraits >> 224n) & ((1n << 24n) - 1n);
  const makerAmountFlagOn = (takerTraits & (1n << 255n)) !== 0n;
  const offsetsWord = (data.extensionData as string).slice(0, 66);
  console.log("🧩 1inch extension diagnostics");
  console.log(`   bytes(extension): ${argsLen}`);
  console.log(`   offsets[0..31]:  ${offsetsWord}`);
  console.log("   takerTraits:");
  console.log(`     maker-amount: ${makerAmountFlagOn ? "on" : "off"}`);
  console.log(`     argsExtLen:   ${argsLenFromTraits}`);
  console.log(`     threshold:    ${BigInt(data.order.takingAmount) & ((1n<<185n)-1n)}`);
  console.log(`   amount:         ${BigInt(data.order.makingAmount)}`);
  if (argsLenFromTraits !== argsLen) {
    throw new Error(`argsExtensionLength mismatch: ${argsLenFromTraits} vs ${argsLen}`);
  }

  // Try decode extraData inside extension for sanity
  try {
    const ext = data.extensionData as Hex;
    if (ext && ext.length >= 66) {
      const postSeg = ("0x" + ext.slice(66)) as Hex;
      if ((postSeg.length - 2) / 2 >= 20) {
        const extra = ("0x" + postSeg.slice(42)) as Hex;
        const [hashlock, dstChainId, dstToken, deposits, timelocks] = decodeAbiParameters(
          parseAbiParameters("bytes32,uint256,address,uint256,uint256"),
          extra,
        );
        const now = BigInt(Math.floor(Date.now() / 1000));
        const srcCancel = (timelocks as bigint) >> 128n;
        const dstWithdraw = (timelocks as bigint) & ((1n << 128n) - 1n);
        console.log("   decoded extraData:");
        console.log("     hashlock:", hashlock);
        console.log("     dstChainId:", dstChainId);
        console.log("     dstToken:", dstToken);
        console.log("     deposits:", deposits);
        console.log("     timelocks:", timelocks);
        console.log("     time(now, srcCancel, dstWithdraw):", now, srcCancel, dstWithdraw);
      }
    }
  } catch (_e) {}

  try {
    const account = (Deno.env.get("RESOLVER_ADDRESS") ||
      "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5") as Address;

    // Print raw calldata for debug_traceCall
    const calldata = encodeFunctionData({
      abi: SimpleLimitOrderProtocolAbi.abi,
      functionName: "fillContractOrderArgs",
      args: [
        {
          salt: BigInt(data.order.salt),
          maker: data.order.maker,
          receiver: data.order.receiver,
          makerAsset: data.order.makerAsset,
          takerAsset: data.order.takerAsset,
          makingAmount: BigInt(data.order.makingAmount),
          takingAmount: BigInt(data.order.takingAmount),
          makerTraits: BigInt(data.order.makerTraits),
        },
        data.signature as Hex,
        BigInt(data.order.makingAmount),
        takerTraits,
        data.extensionData as Hex,
      ],
    });
    console.log("calldata:", calldata);
    // Also emit and persist a JSON payload ready for simulators (Tenderly/Anvil)
    const payload = {
      function: "fillContractOrderArgs",
      to: protocol,
      from: account,
      data: calldata,
      value: "0x0",
      chainId,
    } as const;
    console.log(JSON.stringify(payload, null, 2));
    try {
      const outDir = "./calldata";
      await Deno.mkdir(outDir, { recursive: true });
      const outFile = `${outDir}/${(data.hashlock || "order").toString()}.json`;
      await Deno.writeTextFile(outFile, JSON.stringify(payload));
      console.log(`saved: ${outFile}`);
    } catch (_e) {}
    await client.simulateContract({
      address: protocol,
      abi: SimpleLimitOrderProtocolAbi.abi,
      functionName: "fillContractOrderArgs",
      args: [
        {
          salt: BigInt(data.order.salt),
          maker: data.order.maker,
          receiver: data.order.receiver,
          makerAsset: data.order.makerAsset,
          takerAsset: data.order.takerAsset,
          makingAmount: BigInt(data.order.makingAmount),
          takingAmount: BigInt(data.order.takingAmount),
          makerTraits: BigInt(data.order.makerTraits),
        },
        data.signature as Hex,
        BigInt(data.order.makingAmount),
        takerTraits,
        data.extensionData as Hex,
      ],
      account,
    });
    console.log("simulate: success (no revert)");
  } catch (e) {
    const msg = (e as any)?.shortMessage || (e as any)?.message || String(e);
    const candidates: unknown[] = [
      (e as any)?.data,
      (e as any)?.cause?.data,
      (e as any)?.cause?.data?.data,
      (e as any)?.cause?.cause?.data,
    ];
    const hexInMessage = (msg.match(/0x[0-9a-fA-F]{8,}/)?.[0]) as string | undefined;
    if (hexInMessage) candidates.push(hexInMessage);

    let decoded: { errorName?: string; args?: any[] } | null = null;
    for (const c of candidates) {
      const data = typeof c === "string" && c.startsWith("0x") ? (c as Hex) : undefined;
      if (!data) continue;
      try {
        const res = decodeErrorResult({ abi: SimpleLimitOrderProtocolAbi.abi, data });
        decoded = { errorName: (res as any).errorName, args: (res as any).args };
        break;
      } catch { /* try next */ }
    }

    console.error("simulate: revert");
    if (decoded?.errorName) {
      console.error(`  name: ${decoded.errorName}`);
      if (decoded.args && decoded.args.length > 0) {
        console.error(`  args: ${JSON.stringify(decoded.args)}`);
      }
    } else {
      console.error(msg);
    }
  }
}

if ((import.meta as any).main) {
  await main();
}


