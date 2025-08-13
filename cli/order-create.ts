#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

// Alice creates an order, writes ./data/orders/pending/{hashlock}.json and ./data/swaps/{hashlock}/status.json

import { base, optimism } from "viem/chains";
import { type Address, type Hex, keccak256 } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { ensureDir, atomicWriteJson, nowMs } from "./_fs.ts";
import { encode1inchExtension, encodePostInteractionData, MAKER_TRAITS, packTimelocks, generateNonce } from "./postinteraction.ts";
import { type OrderInput, signOrder } from "./eip712.ts";
import { getCliAddresses, getPrivateKey, getRpcUrl, type SupportedChainId } from "./cli-config.ts";
import { createWagmiConfig } from "./wagmi-config.ts";
import { readSimpleLimitOrderProtocolHashOrder } from "../src/generated/contracts.ts";
import { logErrorWithRevert } from "./logging.ts";

function usage(): never {
  console.log("Usage: deno run -A --env-file=.env cli/order-create.ts --src 8453|10 --dst 10|8453 --srcAmount <wei> --dstAmount <wei> --resolver 0x...");
  Deno.exit(1);
}

function getArg(name: string): string | undefined {
  const idx = Deno.args.findIndex((a) => a === `--${name}`);
  if (idx >= 0) return Deno.args[idx + 1];
  return undefined;
}

const srcArg = getArg("src");
const dstArg = getArg("dst");
const srcAmountArg = getArg("srcAmount");
const dstAmountArg = getArg("dstAmount");
const resolverArg = getArg("resolver");

if (!srcArg || !dstArg || !srcAmountArg || !dstAmountArg || !resolverArg) usage();

const SRC = Number(srcArg) as SupportedChainId;
const DST = Number(dstArg) as SupportedChainId;
const SRC_AMOUNT = BigInt(srcAmountArg);
const DST_AMOUNT = BigInt(dstAmountArg);
const RESOLVER = resolverArg as Address;

const _ANKR_API_KEY = Deno.env.get("ANKR_API_KEY") || "";
const ALICE_PK = (getPrivateKey("ALICE_PRIVATE_KEY") || "") as `0x${string}`;
if (!ALICE_PK) {
  console.error("ALICE_PRIVATE_KEY missing");
  Deno.exit(1);
}

const account = privateKeyToAccount(ALICE_PK, { nonceManager });
const srcChain = SRC === base.id ? base : optimism;
const srcRpc = getRpcUrl(SRC);

const wagmiConfig = createWagmiConfig();

const addressesSrc = getCliAddresses(SRC);
const addressesDst = getCliAddresses(DST);

const BMN_SRC = addressesSrc.tokens.BMN;
const BMN_DST = addressesDst.tokens.BMN;
const LOP = addressesSrc.limitOrderProtocol;
const FACTORY = addressesSrc.escrowFactory;

// Timelocks: 3600s cancel window on src, 300s dst withdraw window
const timelocks = packTimelocks(3600, 300);
const nonce = generateNonce();

// placeholder example removed (recomputed when secret exists)

// Rebuild extension after we place hashlock
function rebuildExtension(secret: Hex): { extension: Hex; hashlock: string } {
  const hashlock = keccak256(secret);
  const pi = encodePostInteractionData(FACTORY, {
    srcImplementation: "0x0000000000000000000000000000000000000000" as Address,
    dstImplementation: "0x0000000000000000000000000000000000000000" as Address,
    timelocks,
    hashlock: hashlock as Hex,
    dstChainId: BigInt(DST),
    srcMaker: account.address,
    srcTaker: RESOLVER,
    srcToken: BMN_SRC,
    srcAmount: SRC_AMOUNT,
    srcSafetyDeposit: 0n,
    dstReceiver: account.address,
    dstToken: BMN_DST,
    dstAmount: DST_AMOUNT,
    dstSafetyDeposit: 0n,
    nonce,
  });
  return { extension: encode1inchExtension(pi), hashlock };
}

function randomSecret(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function main() {
  const secret = randomSecret();
  const { extension, hashlock } = rebuildExtension(secret);

  // makerTraits: set extension + postInteraction + random nonce bits
  const makerTraits = MAKER_TRAITS.build({ postInteraction: true, hasExtension: true, allowMultipleFills: true });

  // Build order
  const order: OrderInput = {
    salt: (BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) << 160n) | (BigInt(keccak256(extension)) & ((1n << 160n) - 1n)),
    maker: account.address,
    receiver: account.address,
    makerAsset: BMN_SRC,
    takerAsset: BMN_SRC,
    makingAmount: SRC_AMOUNT,
    takingAmount: DST_AMOUNT,
    makerTraits,
  };

// Compute on-chain order hash using wagmi-generated action
const orderHash = await readSimpleLimitOrderProtocolHashOrder(wagmiConfig as any, {
  chainId: SRC,
  args: [[
    order.salt,
    BigInt(order.maker),
    BigInt(order.receiver),
    BigInt(order.makerAsset),
    BigInt(order.takerAsset),
    order.makingAmount,
    order.takingAmount,
    order.makerTraits,
  ] as any],
} as any);

// Sign EIP-712
// Create a temporary viem wallet client only for signing
const { createWalletClient, http } = await import("viem");
const wallet = createWalletClient({ chain: srcChain, transport: http(srcRpc), account });
const sig = await signOrder(wallet as any, order, SRC, LOP);

  // Prepare artifacts
  const baseDir = `./data`;
  const orderDir = `${baseDir}/orders/pending`;
  const swapDir = `${baseDir}/swaps/${hashlock}`;
  await ensureDir(orderDir);
  await ensureDir(swapDir);

  const orderFile = `${orderDir}/${hashlock}.json`;
  const orderJson = {
    version: 1,
    chainId: SRC,
    order: {
      salt: order.salt.toString(),
      maker: order.maker,
      receiver: order.receiver,
      makerAsset: order.makerAsset,
      takerAsset: order.takerAsset,
      makingAmount: order.makingAmount.toString(),
      takingAmount: order.takingAmount.toString(),
      makerTraits: order.makerTraits.toString(),
    },
    signature: { r: sig.r, vs: sig.vs },
    extensionData: extension,
    orderHash,
    hashlock,
    srcChainId: SRC,
    dstChainId: DST,
    createdAt: nowMs(),
  };
  await atomicWriteJson(orderFile, orderJson);

  // Write initial status
  const statusFile = `${swapDir}/status.json`;
  await atomicWriteJson(statusFile, {
    hashlock,
    orderHash,
    state: "ORDER_CREATED",
    updatedAt: nowMs(),
    refs: { orderFile },
    error: null,
  });

  // Persist secret file (PoC as requested)
  await ensureDir(`${baseDir}/secrets`);
  await atomicWriteJson(`${baseDir}/secrets/${hashlock}.json`, {
    hashlock,
    secret,
    revealedAt: nowMs(),
  });

  console.log(hashlock);
}

main().catch(async (e) => {
  await logErrorWithRevert(e, "order-create", {
    args: Deno.args,
  });
  // Do not rethrow to keep process reporting clean; still exit non-zero
  Deno.exit(1);
});


