#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  encodeAbiParameters,
  parseAbiParameters,
  hashTypedData,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const privateKey = Deno.env.get("ALICE_PRIVATE_KEY");
if (!privateKey || !privateKey.startsWith("0x")) {
  throw new Error("ALICE_PRIVATE_KEY not set or invalid");
}
const account = privateKeyToAccount(privateKey as `0x${string}`);
const client = createPublicClient({
  chain: base,
  transport: http("https://erpc.up.railway.app/main/evm/8453"),
});
const wallet = createWalletClient({
  account,
  chain: base,
  transport: http("https://erpc.up.railway.app/main/evm/8453"),
});

const protocol = "0xe767105dcfB3034a346578afd2aFD8e583171489" as Address; // Same on both chains
const factory = "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address;
const token = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address;
const resolver = "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5" as Address;

// Create order with future timelocks
const now = Math.floor(Date.now() / 1000);
const srcCancel = now + 3600; // 1 hour from now
const dstWithdraw = now + 300; // 5 minutes from now
const timelocks = (BigInt(srcCancel) << 128n) | BigInt(dstWithdraw);

// Generate random hashlock
const hashlockBytes = new Uint8Array(32);
crypto.getRandomValues(hashlockBytes);
const hashlock = "0x" + Array.from(hashlockBytes).map(b => b.toString(16).padStart(2, "0")).join("") as Hex;

// Create extension data for PostInteraction
// Destination chain is Optimism (10)
const extraData = encodeAbiParameters(
  parseAbiParameters("bytes32,uint256,address,uint256,uint256"),
  [hashlock, 10n, token, 0n, timelocks]
);

// Add factory address (20 bytes) before extraData
const postInteractionData = factory.slice(2) + extraData.slice(2);
// Add offsets word (32 bytes) at the beginning
const offsetsWord = "000000b4" + "0".repeat(56); // 180 bytes offset
const extensionData = ("0x" + offsetsWord + postInteractionData) as Hex;

// Create order
const salt = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
const order = {
  salt,
  maker: account.address,
  receiver: account.address,
  makerAsset: token,
  takerAsset: token,
  makingAmount: parseUnits("0.01", 18),
  takingAmount: parseUnits("0.01", 18),
  makerTraits: BigInt("0x4a00000000000000000000009fb72263000000000000000000000000000000"),
};

// Sign order
const signature = await wallet.signTypedData({
  domain: {
    name: "Bridge-Me-Not Orders",
    version: "1",
    chainId: 8453, // Base
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
  message: order,
});

// Save order
const orderData = {
  order: {
    ...order,
    salt: order.salt.toString(),
    makingAmount: order.makingAmount.toString(),
    takingAmount: order.takingAmount.toString(),
    makerTraits: order.makerTraits.toString(),
  },
  signature,
  extensionData,
  chainId: 8453, // Base
  hashlock,
  timestamp: Date.now(),
};

const filename = `pending-orders/${hashlock}.json`;
await Deno.writeTextFile(filename, JSON.stringify(orderData, null, 2));

console.log(`✅ Created new order: ${filename}`);
console.log(`   Hashlock: ${hashlock}`);
console.log(`   Expires: ${new Date(srcCancel * 1000).toISOString()}`);
console.log(`   Withdrawable: ${new Date(dstWithdraw * 1000).toISOString()}`);