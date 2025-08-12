#!/usr/bin/env -S deno run --allow-all
// Test signature recovery to debug BadSignature error

import { 
  hashTypedData, 
  recoverAddress, 
  type Hex, 
  type Address 
} from "viem";

const orderFile = "pending-orders/0x52bded6db558e3f56fcac51251fc2e8c4acdfdb009dc29ae757b5a2dad66fc4e.json";
const data = JSON.parse(await Deno.readTextFile(orderFile));

// Protocol address on Base
const protocol = "0xe767105dcfB3034a346578afd2aFD8e583171489" as Address;
const chainId = 8453;

// Create the exact same typed data that the protocol will hash
const domain = {
  name: "Bridge-Me-Not Orders",
  version: "1",
  chainId,
  verifyingContract: protocol,
};

const types = {
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
};

const order = {
  salt: BigInt(data.order.salt),
  maker: data.order.maker as Address,
  receiver: data.order.receiver as Address,
  makerAsset: data.order.makerAsset as Address,
  takerAsset: data.order.takerAsset as Address,
  makingAmount: BigInt(data.order.makingAmount),
  takingAmount: BigInt(data.order.takingAmount),
  makerTraits: BigInt(data.order.makerTraits),
};

console.log("Order data:");
console.log(JSON.stringify(order, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
console.log();

// Calculate the hash
const orderHash = hashTypedData({
  domain,
  primaryType: "Order",
  types,
  message: order,
});

console.log("Order hash:", orderHash);
console.log();

// Test full signature recovery
const fullSignature = data.signature as Hex;
console.log("Full signature:", fullSignature);
console.log("Signature length:", (fullSignature.length - 2) / 2, "bytes");

try {
  const recovered1 = await recoverAddress({
    hash: orderHash,
    signature: fullSignature,
  });
  console.log("Recovered from full signature:", recovered1);
  console.log("Expected maker:", data.order.maker);
  console.log("Match:", recovered1.toLowerCase() === data.order.maker.toLowerCase());
} catch (e) {
  console.log("Failed to recover from full signature:", e);
}

console.log();

// Test r,vs recovery (what the contract uses)
const r = ('0x' + fullSignature.slice(2, 66)) as Hex;
const vs = ('0x' + fullSignature.slice(66, 130)) as Hex;

console.log("Split signature:");
console.log("  r:", r);
console.log("  vs:", vs);

// Manually reconstruct v and s for verification
const vsBigInt = BigInt(vs);
const v = Number((vsBigInt >> 255n) + 27n);
const s = ('0x' + (vsBigInt & ((1n << 255n) - 1n)).toString(16).padStart(64, '0')) as Hex;

console.log("  Extracted v:", v);
console.log("  Extracted s:", s);

try {
  // Try recovery with v,r,s
  const recovered2 = await recoverAddress({
    hash: orderHash,
    signature: {
      r,
      s,
      v: v as 27 | 28,
    },
  });
  console.log("Recovered from v,r,s:", recovered2);
  console.log("Match:", recovered2.toLowerCase() === data.order.maker.toLowerCase());
} catch (e) {
  console.log("Failed to recover from v,r,s:", e);
}

// Also try the compact format that Solidity ECDSA.recover expects
console.log();
console.log("Testing compact signature format:");

// The contract expects r (32 bytes) and vs (32 bytes) where vs = (v-27) << 255 | s
// Let's verify our vs is correctly formatted
const vFromSig = parseInt(fullSignature.slice(130, 132), 16);
const sFromSig = '0x' + fullSignature.slice(66, 130);
const compactVs = ((BigInt(vFromSig - 27) << 255n) | BigInt(sFromSig)) as bigint;
const compactVsHex = '0x' + compactVs.toString(16).padStart(64, '0');

console.log("Original v from signature:", vFromSig);
console.log("Original s from signature:", sFromSig);
console.log("Compact vs (for contract):", compactVsHex);
console.log("Our vs matches:", compactVsHex.toLowerCase() === vs.toLowerCase());

// Simulate what the contract does
console.log();
console.log("=== Simulating Contract's ECDSA.recover ===");
console.log("The contract will call: ECDSA.recover(orderHash, r, vs)");
console.log("  orderHash:", orderHash);
console.log("  r:", r);
console.log("  vs:", vs);
console.log();

// Check if the issue might be with the order encoding
console.log("=== Checking Order Encoding ===");
console.log("Maker traits (decimal):", data.order.makerTraits);
console.log("Maker traits (hex):", '0x' + BigInt(data.order.makerTraits).toString(16));

// The makerTraits value seems very large, let's decode it
const makerTraitsBigInt = BigInt(data.order.makerTraits);
const allowPartialFill = (makerTraitsBigInt & (1n << 0n)) !== 0n;
const needPostInteraction = (makerTraitsBigInt & (1n << 1n)) !== 0n;
const useBitInvalidator = (makerTraitsBigInt & (1n << 8n)) !== 0n;
const useRemainingInvalidator = (makerTraitsBigInt & (1n << 9n)) !== 0n;
const allowMultipleFills = (makerTraitsBigInt & (1n << 10n)) !== 0n;
const needPreInteraction = (makerTraitsBigInt & (1n << 11n)) !== 0n;
const usePermit2 = (makerTraitsBigInt & (1n << 17n)) !== 0n;
const hasExtension = (makerTraitsBigInt & (1n << 21n)) !== 0n;
const hasAmountAndReceiver = (makerTraitsBigInt & (1n << 23n)) !== 0n;

console.log("Decoded maker traits:");
console.log("  allowPartialFill:", allowPartialFill);
console.log("  needPostInteraction:", needPostInteraction);
console.log("  useBitInvalidator:", useBitInvalidator);
console.log("  useRemainingInvalidator:", useRemainingInvalidator);
console.log("  allowMultipleFills:", allowMultipleFills);
console.log("  needPreInteraction:", needPreInteraction);
console.log("  usePermit2:", usePermit2);
console.log("  hasExtension:", hasExtension);
console.log("  hasAmountAndReceiver:", hasAmountAndReceiver);