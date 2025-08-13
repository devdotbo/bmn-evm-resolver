import { createPublicClient, http, type Address, type Hex, recoverAddress, hashTypedData } from "viem";
import { base } from "viem/chains";

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

console.log("Verifying signature...");
console.log("Order maker:", orderData.order.maker);
console.log("Signature:", orderData.signature);

// The order hash that was signed
const orderHash = "0xa9d4e44d6dac4587cf20fbb5c2a95a2d091a6ad76a6e72e2d7df6b1e01d78b4c";

try {
  // Recover the signer from the signature
  const recoveredAddress = await recoverAddress({
    hash: orderHash as Hex,
    signature: orderData.signature as Hex,
  });
  
  console.log("Recovered address:", recoveredAddress);
  
  if (recoveredAddress.toLowerCase() === orderData.order.maker.toLowerCase()) {
    console.log("✅ Signature is VALID - signer matches maker");
  } else {
    console.log("❌ Signature is INVALID - signer does not match maker");
  }
} catch (error) {
  console.error("Error verifying signature:", error);
}
