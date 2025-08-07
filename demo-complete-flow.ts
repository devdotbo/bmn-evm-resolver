#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

/**
 * Demonstration of the complete Bridge-Me-Not cross-chain swap flow
 * This simulates what would happen in a real deployment
 */

import { keccak256, toHex } from "viem";

console.log(`
════════════════════════════════════════════════════════════════════════
    Bridge-Me-Not Cross-Chain Swap Flow Demonstration
════════════════════════════════════════════════════════════════════════

This demo simulates the complete atomic swap flow between Base and Optimism.

`);

// Step 1: Alice creates an order
console.log("STEP 1: Alice Creates Order");
console.log("============================");
const secret = "0x307861373938363435313664366435393539653161313939633439333066353630333434666666383865643863663062613065343966623234313464613864323764";
const hashlock = keccak256(secret as `0x${string}`);
const orderHash = "0x6bc85fea9ec88eea7ff09e304db4ef2d6139b3660203f7e48353c2ce780f9109";

console.log("✅ Alice creates order on Base chain:");
console.log(`   - Order Hash: ${orderHash}`);
console.log(`   - Hashlock: ${hashlock}`);
console.log(`   - Secret: ${secret.slice(0, 20)}... (kept private)`);
console.log(`   - Amount: 1 BMN token`);
console.log(`   - From: Base (Chain 8453)`);
console.log(`   - To: Optimism (Chain 10)`);
console.log("");

// Step 2: Tokens transferred
console.log("STEP 2: Source Escrow Created");
console.log("==============================");
console.log("✅ Alice's 1 BMN token locked in escrow on Base");
console.log("   - Transaction confirmed");
console.log("   - Escrow contract deployed");
console.log("   - Tokens locked with hashlock");
console.log("");

// Step 3: Resolver sees the order
console.log("STEP 3: Resolver (Bob) Detects Order");
console.log("=====================================");
console.log("✅ Resolver monitoring system detects new order:");
console.log("   - Validates profitability");
console.log("   - Checks hashlock");
console.log("   - Prepares to deploy destination escrow");
console.log("");

// Step 4: Resolver deploys destination
console.log("STEP 4: Resolver Deploys Destination Escrow");
console.log("============================================");
console.log("✅ Resolver deploys escrow on Optimism:");
console.log("   - Locks 1 BMN token on Optimism");
console.log("   - Uses same hashlock: " + hashlock);
console.log("   - Escrow Address: 0x... (simulated)");
console.log("   - Waiting for Alice to reveal secret");
console.log("");

// Step 5: Alice withdraws from destination
console.log("STEP 5: Alice Withdraws from Destination");
console.log("=========================================");
console.log("✅ Alice's monitor detects destination escrow:");
console.log("   - Submits withdrawal transaction on Optimism");
console.log("   - Reveals secret: " + secret.slice(0, 30) + "...");
console.log("   - Claims 1 BMN token from Bob's escrow");
console.log("");

// Step 6: Resolver claims source
console.log("STEP 6: Resolver Claims Source Funds");
console.log("=====================================");
console.log("✅ Resolver uses revealed secret:");
console.log("   - Submits secret to source escrow on Base");
console.log("   - Claims 1 BMN token from Alice's escrow");
console.log("   - Atomic swap complete!");
console.log("");

// Summary
console.log("════════════════════════════════════════════════════════════════════════");
console.log("                        SWAP COMPLETE!");
console.log("════════════════════════════════════════════════════════════════════════");
console.log("");
console.log("Final State:");
console.log("  • Alice: Started with 1 BMN on Base → Ended with 1 BMN on Optimism ✅");
console.log("  • Bob:   Started with 1 BMN on Optimism → Ended with 1 BMN on Base ✅");
console.log("");
console.log("Security Properties:");
console.log("  • Atomic: Either both swaps complete or neither does");
console.log("  • Trustless: No intermediary required");
console.log("  • Cross-chain: Works across any EVM chains");
console.log("");
console.log("Note: In production, this would use:");
console.log("  • 1inch Limit Order Protocol for order creation");
console.log("  • On-chain escrow contracts with proper validation");
console.log("  • Indexer for real-time event monitoring");
console.log("  • Automated resolver bots for execution");
console.log("");