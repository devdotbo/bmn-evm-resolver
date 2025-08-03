#!/usr/bin/env -S deno run --allow-read --allow-env --allow-net --allow-write

/**
 * Script to create a test order on mainnet using TestEscrowFactory
 * This script simulates Alice creating an order from Etherlink to Base (reverse direction)
 */

import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http, parseEther, encodeFunctionData } from "viem";
import { baseMainnet, etherlinkMainnet } from "../src/config/chains.ts";
import { MAINNET_CONFIG, getFactoryAddress } from "../src/config/mainnet.ts";
import TestEscrowFactoryABI from "../abis/TestEscrowFactory.json" with { type: "json" };
import IERC20ABI from "../abis/IERC20.json" with { type: "json" };

// Helper function to convert address to uint256 (Address type from solidity-utils)
function addressToUint256(address: string): bigint {
  return BigInt(address);
}

// Helper function to pack timelocks into a single uint256
function packTimelocks(timelocks: {
  srcWithdrawal: bigint;
  srcPublicWithdrawal: bigint;
  srcCancellation: bigint;
  srcPublicCancellation: bigint;
  dstWithdrawal: bigint;
  dstCancellation: bigint;
}): bigint {
  // The timelocks are packed as offsets from deployment time
  // Each timelock is stored as uint32 (4 bytes)
  
  // For testing, we'll use relative offsets from current time
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  
  // Convert absolute timestamps to relative offsets
  const srcWithdrawalOffset = timelocks.srcWithdrawal - currentTime;
  const srcPublicWithdrawalOffset = timelocks.srcPublicWithdrawal - currentTime;
  const srcCancellationOffset = timelocks.srcCancellation - currentTime;
  const srcPublicCancellationOffset = timelocks.srcPublicCancellation - currentTime;
  const dstWithdrawalOffset = timelocks.dstWithdrawal - currentTime;
  const dstCancellationOffset = timelocks.dstCancellation - currentTime;
  
  // Pack into uint256 (deployedAt will be set by contract)
  let packed = 0n;
  packed |= (srcWithdrawalOffset & 0xFFFFFFFFn) << 192n;
  packed |= (srcPublicWithdrawalOffset & 0xFFFFFFFFn) << 160n;
  packed |= (srcCancellationOffset & 0xFFFFFFFFn) << 128n;
  packed |= (srcPublicCancellationOffset & 0xFFFFFFFFn) << 96n;
  packed |= (dstWithdrawalOffset & 0xFFFFFFFFn) << 64n;
  packed |= (dstWithdrawalOffset & 0xFFFFFFFFn) << 32n; // dstPublicWithdrawal = dstWithdrawal
  packed |= (dstCancellationOffset & 0xFFFFFFFFn);
  
  return packed;
}

// Load environment variables
const ALICE_PRIVATE_KEY = Deno.env.get("ALICE_PRIVATE_KEY");
if (!ALICE_PRIVATE_KEY) {
  console.error("❌ ALICE_PRIVATE_KEY not set in environment");
  Deno.exit(1);
}

// Configuration
const AMOUNT = parseEther("10"); // 10 BMN
const SAFETY_DEPOSIT = BigInt(MAINNET_CONFIG.SAFETY_DEPOSIT); // 0.00001 ETH

// Create clients for Etherlink (source for reverse flow)
const aliceAccount = privateKeyToAccount(ALICE_PRIVATE_KEY as `0x${string}`);
const etherlinkClient = createWalletClient({
  account: aliceAccount,
  chain: etherlinkMainnet,
  transport: http(Deno.env.get("ETHERLINK_RPC_URL")),
});

const etherlinkPublicClient = createPublicClient({
  chain: etherlinkMainnet,
  transport: http(Deno.env.get("ETHERLINK_RPC_URL")),
});

async function createOrder() {
  console.log("🔄 Creating test order on Etherlink mainnet (reverse direction)...");
  console.log(`Alice address: ${aliceAccount.address}`);
  
  // Generate secret and hashlock
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const hashlock = await crypto.subtle.digest("SHA-256", secret);
  const hashlockHex = `0x${Array.from(new Uint8Array(hashlock)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  const secretHex = `0x${Array.from(secret).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  
  console.log(`Secret: ${secretHex}`);
  console.log(`Hashlock: ${hashlockHex}`);
  
  // Get current block timestamp from chain (not local time)
  const block = await etherlinkPublicClient.getBlock();
  const currentTime = Number(block.timestamp);
  
  // Prepare timelocks
  const timelocks = {
    srcWithdrawal: BigInt(currentTime + MAINNET_CONFIG.TIMELOCKS.srcWithdrawal),
    srcPublicWithdrawal: BigInt(currentTime + MAINNET_CONFIG.TIMELOCKS.srcPublicWithdrawal),
    srcCancellation: BigInt(currentTime + MAINNET_CONFIG.TIMELOCKS.srcCancellation),
    srcPublicCancellation: BigInt(currentTime + MAINNET_CONFIG.TIMELOCKS.srcPublicCancellation),
    dstWithdrawal: BigInt(currentTime + MAINNET_CONFIG.TIMELOCKS.dstWithdrawal),
    dstCancellation: BigInt(currentTime + MAINNET_CONFIG.TIMELOCKS.dstCancellation),
  };
  
  // Pack timelocks
  const packedTimelocks = packTimelocks(timelocks);
  
  // Prepare immutables with proper types
  const immutables = {
    orderHash: hashlockHex as `0x${string}`, // Using hashlock as order hash for simplicity
    hashlock: hashlockHex as `0x${string}`,
    maker: addressToUint256(aliceAccount.address),
    taker: addressToUint256("0x0000000000000000000000000000000000000000"), // Any taker
    token: addressToUint256(MAINNET_CONFIG.CONTRACTS.bmnToken),
    amount: AMOUNT,
    safetyDeposit: SAFETY_DEPOSIT,
    timelocks: packedTimelocks,
  };
  
  // Get factory address
  const factoryAddress = getFactoryAddress();
  console.log(`Using factory: ${factoryAddress}`);
  
  // Check BMN balance
  const bmnBalance = await etherlinkPublicClient.readContract({
    address: MAINNET_CONFIG.CONTRACTS.bmnToken as `0x${string}`,
    abi: IERC20ABI.abi,
    functionName: "balanceOf",
    args: [aliceAccount.address],
  }) as bigint;
  
  console.log(`Alice BMN balance: ${bmnBalance / BigInt(10 ** 18)} BMN`);
  
  if (bmnBalance < AMOUNT) {
    console.error("❌ Insufficient BMN balance");
    Deno.exit(1);
  }
  
  // Approve BMN transfer
  console.log("📝 Approving BMN transfer...");
  const approveTx = await etherlinkClient.writeContract({
    address: MAINNET_CONFIG.CONTRACTS.bmnToken as `0x${string}`,
    abi: IERC20ABI.abi,
    functionName: "approve",
    args: [factoryAddress, AMOUNT],
  });
  
  console.log(`Approval tx: ${approveTx}`);
  await etherlinkPublicClient.waitForTransactionReceipt({ hash: approveTx });
  
  // Create source escrow
  console.log("🔐 Creating source escrow...");
  const createTx = await etherlinkClient.writeContract({
    address: factoryAddress as `0x${string}`,
    abi: TestEscrowFactoryABI.abi,
    functionName: "createSrcEscrowForTesting",
    args: [immutables, AMOUNT],
    value: SAFETY_DEPOSIT, // Send safety deposit
  });
  
  console.log(`Create escrow tx: ${createTx}`);
  const receipt = await etherlinkPublicClient.waitForTransactionReceipt({ hash: createTx });
  
  // Parse logs to find escrow address
  let escrowAddress = "";
  for (const log of receipt.logs) {
    if (log.topics[0] === "0x0e534c62f0afd2fa0f0fa71198e8aa2d549f24daf2bb47de0d5486c7ce9288ca") { // SrcEscrowCreated event
      // The escrow address should be in the log data
      console.log("Found SrcEscrowCreated event");
      break;
    }
  }
  
  // Compute escrow address
  const computedAddress = await etherlinkPublicClient.readContract({
    address: factoryAddress as `0x${string}`,
    abi: TestEscrowFactoryABI.abi,
    functionName: "computeSrcEscrowAddress",
    args: [immutables],
  }) as string;
  
  escrowAddress = computedAddress;
  
  console.log("✅ Order created successfully!");
  console.log(`Escrow address: ${escrowAddress}`);
  console.log(`Explorer: https://explorer.etherlink.com/tx/${createTx}`);
  
  // Save order details for Alice to use later
  const orderData = {
    orderId: hashlockHex,
    secret: secretHex,
    escrowAddress,
    immutables: {
      ...immutables,
      // Convert back to addresses for storage
      maker: aliceAccount.address,
      taker: "0x0000000000000000000000000000000000000000",
      token: MAINNET_CONFIG.CONTRACTS.bmnToken,
    },
    timelocks,
    createdAt: new Date().toISOString(),
    chain: "etherlink",
    direction: "reverse",
  };
  
  await Deno.writeTextFile(
    `./orders/mainnet-order-reverse-${Date.now()}.json`,
    JSON.stringify(orderData, null, 2)
  );
  
  console.log("\n📄 Order details saved to ./orders/");
  console.log("Alice can use this to withdraw from destination escrow later");
}

// Create orders directory if it doesn't exist
try {
  await Deno.mkdir("./orders", { recursive: true });
} catch {
  // Directory might already exist
}

// Run the script
await createOrder();