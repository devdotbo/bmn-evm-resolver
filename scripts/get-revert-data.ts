import { createPublicClient, http, type Hex } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({
  chain: base,
  transport: http("https://erpc.up.railway.app/main/evm/8453"),
});

// Read the latest order file
import { readdir, readFile } from "node:fs/promises";
const files = await readdir("./pending-orders");
const latestFile = files.find(f => f.endsWith(".json"));

if (\!latestFile) {
  console.error("No order files found");
  Deno.exit(1);
}

const orderData = JSON.parse(await readFile(`./pending-orders/${latestFile}`, "utf-8"));

// Prepare the calldata for fillOrderArgs
const calldata = "0x5d9dbf53" + // fillOrderArgs selector
  // Encode the order struct and other parameters
  "..."; // This would be complex to encode manually

// Instead, let's use viem's simulateContract to get the error
try {
  const result = await client.simulateContract({
    address: "0xe767105dcfB3034a346578afd2aFD8e583171489",
    abi: [{
      name: "fillOrderArgs",
      type: "function",
      inputs: [
        { name: "order", type: "tuple", components: [
          { name: "salt", type: "uint256" },
          { name: "maker", type: "address" },
          { name: "receiver", type: "address" },
          { name: "makerAsset", type: "address" },
          { name: "takerAsset", type: "address" },
          { name: "makingAmount", type: "uint256" },
          { name: "takingAmount", type: "uint256" },
          { name: "makerTraits", type: "uint256" }
        ]},
        { name: "r", type: "bytes32" },
        { name: "vs", type: "bytes32" },
        { name: "amount", type: "uint256" },
        { name: "takerTraits", type: "uint256" },
        { name: "args", type: "bytes" }
      ],
      outputs: [
        { name: "", type: "uint256" },
        { name: "", type: "uint256" },
        { name: "", type: "bytes32" }
      ]
    }],
    functionName: "fillOrderArgs",
    args: [
      {
        salt: BigInt(orderData.order.salt),
        maker: orderData.order.maker,
        receiver: orderData.order.receiver,
        makerAsset: orderData.order.makerAsset,
        takerAsset: orderData.order.takerAsset,
        makingAmount: BigInt(orderData.order.makingAmount),
        takingAmount: BigInt(orderData.order.takingAmount),
        makerTraits: BigInt(orderData.order.makerTraits)
      },
      orderData.signature.slice(0, 66) as Hex, // r
      "0x" + (((parseInt(orderData.signature.slice(130, 132), 16) - 27) << 255) | parseInt(orderData.signature.slice(66, 130), 16)).toString(16).padStart(64, "0") as Hex, // vs
      BigInt(orderData.order.makingAmount),
      BigInt("0x800000d40000000000000000000000000000000000000000002386f26fc10000"),
      orderData.extensionData as Hex
    ],
    account: "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5",
  });
} catch (error: any) {
  console.log("Error details:", error);
  if (error.cause?.data) {
    console.log("Revert data:", error.cause.data);
  }
}
