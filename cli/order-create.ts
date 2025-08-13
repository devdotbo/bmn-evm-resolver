#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

// Alice creates an order, writes ./data/orders/pending/{hashlock}.json and ./data/swaps/{hashlock}/status.json

import { base, optimism } from "viem/chains";
import {
  createWalletClient,
  http,
  type Address,
  type Hex,
  keccak256,
} from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { ensureDir, atomicWriteJson, nowMs } from "./_fs.ts";
import {
  encode1inchExtension,
  encodePostInteractionData,
  MAKER_TRAITS,
  packTimelocks,
  generateNonce,
} from "../src/utils/postinteraction-v2.ts";
import { getContractAddresses } from "../src/config/contracts.ts";
import {
  type OrderInput,
  signOrder,
} from "../src/utils/eip712-signer.ts";

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

const SRC = Number(srcArg);
const DST = Number(dstArg);
const SRC_AMOUNT = BigInt(srcAmountArg);
const DST_AMOUNT = BigInt(dstAmountArg);
const RESOLVER = resolverArg as Address;

const ANKR_API_KEY = Deno.env.get("ANKR_API_KEY") || "";
const ALICE_PK = (Deno.env.get("ALICE_PRIVATE_KEY") || "") as `0x${string}`;
if (!ALICE_PK) {
  console.error("ALICE_PRIVATE_KEY missing");
  Deno.exit(1);
}

const account = privateKeyToAccount(ALICE_PK, { nonceManager });
const srcChain = SRC === base.id ? base : optimism;
const srcRpc = SRC === base.id
  ? (ANKR_API_KEY ? `https://rpc.ankr.com/base/${ANKR_API_KEY}` : "https://mainnet.base.org")
  : (ANKR_API_KEY ? `https://rpc.ankr.com/optimism/${ANKR_API_KEY}` : "https://mainnet.optimism.io");

const wallet = createWalletClient({ chain: srcChain, transport: http(srcRpc), account });

const addressesSrc = getContractAddresses(SRC);
const addressesDst = getContractAddresses(DST);

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

  // Get order hash from chain using generated action (requires config + params object)
  const wagmiCore = await import("@wagmi/core");
  const { base: baseChain, optimism: opChain } = await import("viem/chains");
  const { simpleLimitOrderProtocolAddress, readSimpleLimitOrderProtocolHashOrder } = await import("../src/generated/contracts.ts");
  const config = wagmiCore.createConfig({
    chains: [baseChain, opChain],
    transports: {
      [baseChain.id]: wagmiCore.http(srcRpc),
      [opChain.id]: wagmiCore.http(srcRpc),
    },
  } as any);
  const orderHash = await readSimpleLimitOrderProtocolHashOrder(config as any, {
    address: simpleLimitOrderProtocolAddress[SRC as 10 | 8453],
    args: [[
      order.salt,
      order.maker,
      order.receiver,
      order.makerAsset,
      order.takerAsset,
      order.makingAmount,
      order.takingAmount,
      order.makerTraits,
    ]],
  } as any);

  // Sign EIP-712
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

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});


