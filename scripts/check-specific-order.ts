import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";
import SimpleLimitOrderProtocolAbi from "../abis/SimpleLimitOrderProtocol.json" with { type: "json" };

const PROTOCOL = "0xe767105dcfB3034a346578afd2aFD8e583171489" as Address;

const client = createPublicClient({
  chain: base,
  transport: http("https://erpc.up.railway.app/main/evm/8453"),
});

// Read the current order
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

console.log("Checking order:", orderData.hashlock);
console.log("Order hash from Alice:", "0x28d9c6bd2b77e7237732923b2d3844948a0d3eff120b9740c89db43a4318192f");

// Check if this exact order hash has been filled
const orderHash = "0x28d9c6bd2b77e7237732923b2d3844948a0d3eff120b9740c89db43a4318192f";

try {
  const remaining = await client.readContract({
    address: PROTOCOL,
    abi: SimpleLimitOrderProtocolAbi.abi,
    functionName: "remainingInvalidatorForOrder",
    args: [orderData.order.maker, orderHash],
  });
  
  console.log("\nOrder status:");
  console.log("Remaining amount:", remaining.toString());
  
  if (remaining === 0n) {
    console.log("❌ Order has been completely filled\!");
  } else {
    console.log("✅ Order is still fillable\!");
    console.log(`   ${remaining} wei remaining`);
  }
} catch (error) {
  if (error.message.includes("RemainingInvalidatedOrder")) {
    console.log("\n❌ Order has been invalidated (filled or cancelled)");
  } else {
    console.error("Error checking order:", error.message);
  }
}
