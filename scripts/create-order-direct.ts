#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv

/**
 * Direct Order Creation - Bypasses API, uses library directly
 * 
 * Usage:
 * ./scripts/create-order-direct.ts
 */

import { LimitOrderAlice } from "../src/alice/limit-order-alice.ts";
import { SwapStateManager, SwapStatus } from "../src/state/swap-state-manager.ts";
import { SecretManager } from "../src/state/SecretManager.ts";
import { type Address, type Hex } from "viem";

// Configuration
const SRC_CHAIN_ID = 8453; // Base
const DST_CHAIN_ID = 10;   // Optimism
const SRC_AMOUNT = "1000000000000000000"; // 1 BMN
const DST_AMOUNT = "900000000000000000";  // 0.9 BMN (10% profit for Bob)
const TOKEN_ADDRESS = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address;
const RESOLVER_ADDRESS = "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5" as Address;

async function createOrderDirect() {
  console.log("🚀 Creating order directly (no API)...\n");

  // Initialize services
  const alice = new LimitOrderAlice();
  const swapStateManager = new SwapStateManager();
  const secretManager = new SecretManager();

  await alice.init();
  await swapStateManager.init();
  await secretManager.init();

  try {
    // Create the order
    console.log("📝 Creating limit order:");
    console.log(`   Source Chain: ${SRC_CHAIN_ID} (Base)`);
    console.log(`   Dest Chain: ${DST_CHAIN_ID} (Optimism)`);
    console.log(`   Source Amount: ${SRC_AMOUNT} (1 BMN)`);
    console.log(`   Dest Amount: ${DST_AMOUNT} (0.9 BMN)`);
    console.log(`   Token: ${TOKEN_ADDRESS}`);
    console.log(`   Resolver: ${RESOLVER_ADDRESS}\n`);

    const orderHash = await alice.createOrder({
      srcChainId: SRC_CHAIN_ID,
      dstChainId: DST_CHAIN_ID,
      srcAmount: BigInt(SRC_AMOUNT),
      dstAmount: BigInt(DST_AMOUNT),
      resolverAddress: RESOLVER_ADDRESS,
      srcSafetyDeposit: 0n,
      dstSafetyDeposit: 0n,
    });

    console.log(`✅ Order created successfully!`);
    console.log(`   Order Hash: ${orderHash}\n`);

    // Find the hashlock from pending orders
    let hashlock = "";
    let filePath = "";
    const pendingDir = "./pending-orders";
    
    try {
      for await (const entry of Deno.readDir(pendingDir)) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          const content = await Deno.readTextFile(`${pendingDir}/${entry.name}`);
          const data = JSON.parse(content);
          // Check if this is our recent order (within 5 seconds)
          if (data.timestamp && Date.now() - data.timestamp < 5000) {
            hashlock = data.hashlock;
            filePath = `${pendingDir}/${entry.name}`;
            break;
          }
        }
      }
    } catch (e) {
      console.error("Could not find hashlock from pending orders:", e);
    }

    if (hashlock) {
      console.log(`📋 Order Details:`);
      console.log(`   Hashlock: ${hashlock}`);
      console.log(`   File: ${filePath}\n`);

      // Track in state manager
      await swapStateManager.trackSwap(orderHash, {
        orderHash: orderHash as Hex,
        hashlock: hashlock as Hex,
        secret: "" as Hex,
        alice: (alice as any).account.address,
        bob: RESOLVER_ADDRESS,
        srcChainId: SRC_CHAIN_ID,
        dstChainId: DST_CHAIN_ID,
        srcToken: TOKEN_ADDRESS,
        dstToken: TOKEN_ADDRESS,
        srcAmount: BigInt(SRC_AMOUNT),
        dstAmount: BigInt(DST_AMOUNT),
        status: SwapStatus.CREATED,
        createdAt: Date.now(),
      });

      console.log("✅ Order tracked in state manager");
      console.log("\n🎯 Next Steps:");
      console.log("1. Bob will automatically pick up this order from pending-orders/");
      console.log("2. Bob will fill the order and create escrows");
      console.log("3. Monitor the swap progress");
      console.log("\nTo check status, use hashlock:", hashlock);
    }

  } catch (error) {
    console.error("❌ Failed to create order:", error);
    process.exit(1);
  } finally {
    await swapStateManager.close();
  }
}

// Run
if (import.meta.main) {
  await createOrderDirect();
}