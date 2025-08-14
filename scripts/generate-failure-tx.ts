#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

/**
 * Generate intentional failure transactions for Tenderly debugging
 * This script creates transactions that will fail on-chain for debugging purposes
 * 
 * Usage: deno run -A --env-file=.env scripts/generate-failure-tx.ts --type TYPE
 * 
 * Types:
 * - invalid-time: Attempt withdrawal before timelock window
 * - no-allowance: Fill order without token approvals  
 * - wrong-immutables: Use incorrect immutables for withdrawal
 * - zero-amount: Try to fill order with zero amount
 * - invalid-escrow: Try to withdraw from non-existent escrow
 */

import { base as _base, optimism as _optimism } from "viem/chains";
import { type Address, type Hex, keccak256 } from "viem";
import { privateKeyToAccount, nonceManager as _nonceManager } from "viem/accounts";
import { createWalletClient as _createWalletClient, http as _http } from "viem";

const failureType = Deno.args.includes("--type") 
  ? Deno.args[Deno.args.indexOf("--type") + 1]
  : "invalid-time";

const validTypes = ["invalid-time", "no-allowance", "wrong-immutables", "zero-amount", "invalid-escrow"];
if (!validTypes.includes(failureType)) {
  console.error(`Invalid failure type: ${failureType}`);
  console.error(`Valid types: ${validTypes.join(", ")}`);
  Deno.exit(1);
}

console.log(`Generating ${failureType} failure transaction...`);
console.log("==========================================");

// Get private keys from environment
const ALICE_PK = Deno.env.get("ALICE_PRIVATE_KEY") as `0x${string}`;
const BOB_PK = (Deno.env.get("BOB_PRIVATE_KEY") || Deno.env.get("RESOLVER_PRIVATE_KEY")) as `0x${string}`;
const ANKR_API_KEY = Deno.env.get("ANKR_API_KEY") || "";

if (!ALICE_PK || !BOB_PK) {
  console.error("Missing required private keys in environment");
  Deno.exit(1);
}

const _baseRpc = ANKR_API_KEY 
  ? `https://rpc.ankr.com/base/${ANKR_API_KEY}`
  : "https://mainnet.base.org";

const _optimismRpc = ANKR_API_KEY
  ? `https://rpc.ankr.com/optimism/${ANKR_API_KEY}`
  : "https://mainnet.optimism.io";

async function generateInvalidTimeFailure() {
  console.log("\nGenerating InvalidTime failure...");
  console.log("This will attempt to withdraw from a destination escrow before the timelock window opens.");
  
  // Use the cast:withdraw:dst command which doesn't simulate first
  const hashlock = "0x" + "a".repeat(64); // Dummy hashlock for this test
  
  // Create a fake order and escrow data
  const orderData = {
    version: 1,
    chainId: 8453,
    order: {
      salt: "1000000000000000000",
      maker: privateKeyToAccount(ALICE_PK).address,
      receiver: privateKeyToAccount(ALICE_PK).address,
      makerAsset: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1",
      takerAsset: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1",
      makingAmount: "10000000000000000",
      takingAmount: "10000000000000000",
      makerTraits: "0"
    },
    signature: { r: "0x" + "0".repeat(64), vs: "0x" + "0".repeat(64) },
    extensionData: "0x",
    orderHash: keccak256("0x1234"),
    hashlock: hashlock,
    srcChainId: 8453,
    dstChainId: 10,
    createdAt: Date.now()
  };
  
  // Create data directories
  await Deno.mkdir("./data/orders/pending", { recursive: true });
  await Deno.mkdir("./data/escrows/dst", { recursive: true });
  await Deno.mkdir(`./data/swaps/${hashlock}`, { recursive: true });
  await Deno.mkdir("./data/secrets", { recursive: true });
  
  // Write test data files
  await Deno.writeTextFile(
    `./data/orders/pending/${hashlock}.json`,
    JSON.stringify(orderData, null, 2)
  );
  
  await Deno.writeTextFile(
    `./data/escrows/dst/${hashlock}.json`,
    JSON.stringify({
      hashlock: hashlock,
      dstChainId: 10,
      escrowAddress: "0x0000000000000000000000000000000000000001", // Dummy address
      createTxHash: "0x" + "0".repeat(64),
      writtenAt: Date.now()
    }, null, 2)
  );
  
  await Deno.writeTextFile(
    `./data/swaps/${hashlock}/status.json`,
    JSON.stringify({
      hashlock: hashlock,
      orderHash: orderData.orderHash,
      state: "DST_CREATED",
      updatedAt: Date.now(),
      refs: {},
      error: null
    }, null, 2)
  );
  
  await Deno.writeTextFile(
    `./data/secrets/${hashlock}.json`,
    JSON.stringify({
      hashlock: hashlock,
      secret: "0x" + "1".repeat(64),
      revealedAt: Date.now()
    }, null, 2)
  );
  
  // Set extension data with future timelocks
  const futureTime = BigInt(Math.floor(Date.now() / 1000) + 7200); // 2 hours from now
  const timelocksPacked = (futureTime << 128n) | futureTime; 
  
  // Create minimal extension data
  const extensionData = "0x" + 
    "0000000000000000000000000000000000000000000000000000000000000020" + // offset
    "0000000000000000000000000000000000000000000000000000000000000100" + // length
    timelocksPacked.toString(16).padStart(64, "0");
  
  orderData.extensionData = extensionData as Hex;
  await Deno.writeTextFile(
    `./data/orders/pending/${hashlock}.json`,
    JSON.stringify(orderData, null, 2)
  );
  
  console.log("Test data files created.");
  console.log("\nNow run:");
  console.log(`deno task cast:withdraw:dst -- --hashlock ${hashlock}`);
  console.log("\nThis will submit a transaction that will fail with InvalidTime error.");
  console.log("Check the transaction on Tenderly for debugging.");
}

async function generateNoAllowanceFailure() {
  console.log("\nGenerating no-allowance failure...");
  console.log("This will attempt to fill an order without proper token approvals.");
  
  // First create an order
  console.log("Creating test order...");
  const orderCmd = `deno task order:create -- --src 8453 --dst 10 --srcAmount 10000000000000000 --dstAmount 10000000000000000 --resolver ${privateKeyToAccount(BOB_PK).address}`;
  
  const p = new Deno.Command("sh", {
    args: ["-c", orderCmd],
    stdout: "piped",
    stderr: "piped"
  });
  
  const output = await p.output();
  const hashlock = new TextDecoder().decode(output.stdout).trim();
  
  if (!hashlock || hashlock.length !== 66) {
    console.error("Failed to create order");
    return;
  }
  
  console.log(`Order created with hashlock: ${hashlock}`);
  
  // Now attempt to fill without approvals using cast:fill
  console.log("\nNow run:");
  console.log(`deno task cast:fill -- --file ./data/orders/pending/${hashlock}.json --skip-approval`);
  console.log("\nThis will submit a transaction that will fail with TransferFromMakerToTakerFailed error.");
}

async function generateWrongImmutablesFailure() {
  console.log("\nGenerating wrong-immutables failure...");
  console.log("This will attempt to withdraw with incorrect immutables.");
  
  // Similar setup to invalid-time but with wrong immutables
  const hashlock = "0x" + "b".repeat(64);
  
  // Create test data files (similar to above but with different values)
  await Deno.mkdir("./data/orders/pending", { recursive: true });
  await Deno.mkdir("./data/escrows/dst", { recursive: true });
  await Deno.mkdir(`./data/swaps/${hashlock}`, { recursive: true });
  await Deno.mkdir("./data/secrets", { recursive: true });
  
  const wrongOrderHash = "0x" + "9".repeat(64);
  
  await Deno.writeTextFile(
    `./data/swaps/${hashlock}/status.json`,
    JSON.stringify({
      hashlock: hashlock,
      orderHash: wrongOrderHash, // This will cause immutables mismatch
      state: "DST_CREATED",
      updatedAt: Date.now(),
      refs: {},
      error: null
    }, null, 2)
  );
  
  console.log("Test data with wrong immutables created.");
  console.log("\nThis would cause an InvalidImmutables error when attempting withdrawal.");
}

function generateZeroAmountFailure() {
  console.log("\nGenerating zero-amount failure...");
  console.log("This will attempt to fill an order with zero amount.");
  
  // Create order with zero amounts
  console.log("\nRun this command to create a zero-amount order:");
  console.log(`deno task order:create -- --src 8453 --dst 10 --srcAmount 0 --dstAmount 0 --resolver ${privateKeyToAccount(BOB_PK).address}`);
  console.log("\nThen attempt to fill it. This should fail with MakingAmountTooLow error.");
}

async function generateInvalidEscrowFailure() {
  console.log("\nGenerating invalid-escrow failure...");
  console.log("This will attempt to withdraw from a non-existent escrow address.");
  
  const hashlock = "0x" + "c".repeat(64);
  const invalidEscrow = "0x" + "9".repeat(40);
  
  await Deno.mkdir("./data/escrows/dst", { recursive: true });
  
  await Deno.writeTextFile(
    `./data/escrows/dst/${hashlock}.json`,
    JSON.stringify({
      hashlock: hashlock,
      dstChainId: 10,
      escrowAddress: invalidEscrow as Address,
      createTxHash: "0x" + "0".repeat(64),
      writtenAt: Date.now()
    }, null, 2)
  );
  
  console.log(`Test data created with invalid escrow address: ${invalidEscrow}`);
  console.log("\nAttempting to withdraw from this address will fail as it's not a valid escrow contract.");
}

// Main execution
async function main() {
  switch (failureType) {
    case "invalid-time":
      await generateInvalidTimeFailure();
      break;
    case "no-allowance":
      await generateNoAllowanceFailure();
      break;
    case "wrong-immutables":
      await generateWrongImmutablesFailure();
      break;
    case "zero-amount":
      await generateZeroAmountFailure();
      break;
    case "invalid-escrow":
      await generateInvalidEscrowFailure();
      break;
    default:
      console.error(`Unknown failure type: ${failureType}`);
  }
  
  console.log("\n=== Failure transaction generation complete ===");
  console.log("Use the generated commands/data to create on-chain failure transactions for debugging.");
}

main().catch(console.error);