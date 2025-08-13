import { createPublicClient, http, type Address, type Hex } from "viem";
import { base } from "viem/chains";
import SimpleLimitOrderProtocolAbi from "../abis/SimpleLimitOrderProtocol.json" with { type: "json" };

const PROTOCOL = "0xe767105dcfB3034a346578afd2aFD8e583171489" as Address;

const client = createPublicClient({
  chain: base,
  transport: http("https://erpc.up.railway.app/main/evm/8453"),
});

// Read the latest order
const orderFiles = [];
for await (const entry of Deno.readDir("./pending-orders")) {
  if (entry.isFile && entry.name.endsWith(".json")) {
    orderFiles.push(entry.name);
  }
}

if (orderFiles.length === 0) {
  console.error("No order files found");
  Deno.exit(1);
}

const orderData = JSON.parse(await Deno.readTextFile(`./pending-orders/${orderFiles[0]}`));

console.log("Checking order status...");
console.log("Order hash:", orderData.hashlock);
console.log("Maker:", orderData.order.maker);
console.log("Maker traits:", orderData.order.makerTraits);

// Extract nonce from makerTraits
const makerTraits = BigInt(orderData.order.makerTraits);
const nonce = (makerTraits >> 96n) & ((1n << 40n) - 1n);
console.log("Nonce from traits:", nonce.toString());

// Check bit invalidator for the maker
const slot = nonce >> 8n; // slot = nonce / 256
const bit = nonce & 255n; // bit position in slot

console.log(`Checking bit invalidator slot ${slot}, bit ${bit}`);

const invalidatorValue = await client.readContract({
  address: PROTOCOL,
  abi: SimpleLimitOrderProtocolAbi.abi,
  functionName: "bitInvalidatorForOrder",
  args: [orderData.order.maker, slot],
});

console.log("Invalidator value:", invalidatorValue.toString(16));

const bitMask = 1n << bit;
const isInvalidated = (BigInt(invalidatorValue) & bitMask) !== 0n;

if (isInvalidated) {
  console.log("\n❌ The order has been INVALIDATED\!");
  console.log("This could mean:");
  console.log("- The order was already filled");
  console.log("- The order was cancelled");
  console.log("- The nonce was already used");
} else {
  console.log("\n✅ The order is VALID");
}

// Also check the order hash
const orderHash = await client.readContract({
  address: PROTOCOL,
  abi: SimpleLimitOrderProtocolAbi.abi,
  functionName: "hashOrder",
  args: [[
    BigInt(orderData.order.salt),
    orderData.order.maker,
    orderData.order.receiver,
    orderData.order.makerAsset,
    orderData.order.takerAsset,
    BigInt(orderData.order.makingAmount),
    BigInt(orderData.order.takingAmount),
    BigInt(orderData.order.makerTraits),
  ]],
});

console.log("\nComputed order hash:", orderHash);

// Check remaining amount for this order
const remaining = await client.readContract({
  address: PROTOCOL,
  abi: SimpleLimitOrderProtocolAbi.abi,
  functionName: "remainingInvalidatorForOrder",
  args: [orderData.order.maker, orderHash],
});

console.log("Remaining amount:", remaining.toString());
