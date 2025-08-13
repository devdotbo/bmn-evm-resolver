#!/usr/bin/env -S deno run --allow-all --env-file=.env

/**
 * Test Complete Atomic Swap Flow
 * 
 * This script:
 * 1. Creates an order as Alice with a secret
 * 2. Bob fills the order on source chain
 * 3. Bob creates destination escrow
 * 4. Alice reveals secret on destination
 * 5. Bob withdraws using secret on source
 */

import { LimitOrderAlice } from "../src/alice/limit-order-alice.ts";
import { SecretRevealer, withdrawWithSecret } from "../src/utils/secret-reveal.ts";
import { createDestinationEscrow, extractImmutables } from "../src/utils/escrow-creation.ts";
import { fillLimitOrder } from "../src/utils/limit-order.ts";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { base, optimism } from "viem/chains";

const BMN_TOKEN_BASE = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address;
const BMN_TOKEN_OPTIMISM = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address;

async function main() {
  console.log("🧪 Testing Complete Atomic Swap Flow");
  console.log("=====================================\n");
  
  // Get keys from environment
  const alicePrivateKey = Deno.env.get("ALICE_PRIVATE_KEY");
  const bobPrivateKey = Deno.env.get("BOB_PRIVATE_KEY");
  
  if (!alicePrivateKey || !bobPrivateKey) {
    console.error("❌ Both ALICE_PRIVATE_KEY and BOB_PRIVATE_KEY must be set");
    Deno.exit(1);
  }
  
  // Initialize components
  const alice = new LimitOrderAlice(alicePrivateKey);
  const secretRevealer = new SecretRevealer();
  
  // Get addresses from wallets
  const aliceAddress = alice.baseWallet?.account?.address || alice.optimismWallet?.account?.address;
  const bobAddress = Deno.env.get("BOB_ADDRESS") || "0x...";
  
  console.log(`👩 Alice: ${aliceAddress}`);
  console.log(`🤖 Bob: ${bobAddress}\n`);
  
  // Step 1: Alice creates order with secret
  console.log("📝 Step 1: Alice creates order with secret");
  console.log("==========================================");
  
  const { secret, hashlock } = secretRevealer.generateSecret();
  console.log(`🔐 Generated secret`);
  console.log(`   Secret: ${secret}`);
  console.log(`   Hashlock: ${hashlock}`);
  
  const amount = 10000000000000000n; // 0.01 BMN
  
  const orderResult = await alice.createAndSignOrder({
    chainId: 8453, // Base
    makerAsset: BMN_TOKEN_BASE,
    takerAsset: BMN_TOKEN_BASE,
    makingAmount: amount,
    takingAmount: amount,
    receiver: alice.address,
    hashlock,
    dstChainId: 10n, // Optimism
    dstToken: BMN_TOKEN_OPTIMISM,
    srcSafetyDeposit: amount / 100n,
    dstSafetyDeposit: amount / 100n,
  });
  
  console.log(`✅ Order created`);
  console.log(`   Order Hash: ${orderResult.orderHash}`);
  console.log(`   Extension Data: ${orderResult.extensionData?.slice(0, 66)}...`);
  
  // Save order for Bob to process
  const orderData = {
    order: orderResult.order,
    signature: orderResult.signature,
    extensionData: orderResult.extensionData,
    chainId: 8453,
    hashlock,
    timestamp: Date.now(),
  };
  
  await Deno.mkdir("./pending-orders", { recursive: true });
  await Deno.writeTextFile(
    `./pending-orders/${hashlock}.json`,
    JSON.stringify(orderData, null, 2)
  );
  
  console.log(`💾 Order saved to pending-orders/${hashlock}.json\n`);
  
  // Step 2: Bob fills the order on source chain
  console.log("🤖 Step 2: Bob fills order on Base");
  console.log("===================================");
  
  try {
    const fillResult = await fillLimitOrder({
      order: orderResult.order,
      signature: orderResult.signature as Hex,
      fillAmount: amount,
      chainId: 8453,
      extensionData: orderResult.extensionData as Hex,
      resolverPrivateKey: bobPrivateKey,
    });
    
    console.log(`✅ Order filled on Base`);
    console.log(`   Transaction: ${fillResult.transactionHash}`);
    console.log(`   Source Escrow: ${fillResult.srcEscrow || "checking..."}\n`);
    
    // Wait for source escrow to be created
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Step 3: Bob creates destination escrow
    console.log("🏭 Step 3: Bob creates destination escrow on Optimism");
    console.log("====================================================");
    
    const immutables = extractImmutables(
      orderResult.order,
      orderResult.extensionData as Hex
    );
    
    const destResult = await createDestinationEscrow(
      immutables,
      bobPrivateKey
    );
    
    console.log(`✅ Destination escrow created`);
    console.log(`   Address: ${destResult.escrow}`);
    console.log(`   Transaction: ${destResult.hash}\n`);
    
    // Save escrow pair info
    await Deno.mkdir("./escrow-pairs", { recursive: true });
    await Deno.writeTextFile(
      `./escrow-pairs/${hashlock}.json`,
      JSON.stringify({
        sourceChain: 8453,
        sourceEscrow: fillResult.srcEscrow || "unknown",
        destChain: 10,
        destEscrow: destResult.escrow,
        hashlock,
        timestamp: new Date().toISOString(),
      }, null, 2)
    );
    
    // Wait for destination escrow to be ready
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Step 4: Alice reveals secret on destination
    console.log("🔓 Step 4: Alice reveals secret on Optimism");
    console.log("==========================================");
    
    const revealTx = await secretRevealer.revealSecret(
      destResult.escrow,
      secret,
      10, // Optimism
      alicePrivateKey
    );
    
    console.log(`✅ Secret revealed and tokens withdrawn`);
    console.log(`   Transaction: ${revealTx}\n`);
    
    // Wait for secret to be revealed
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Step 5: Bob withdraws using revealed secret
    console.log("💰 Step 5: Bob withdraws on Base using secret");
    console.log("============================================");
    
    const withdrawTx = await withdrawWithSecret(
      fillResult.srcEscrow as Address,
      secret,
      8453, // Base
      bobPrivateKey
    );
    
    console.log(`✅ Bob withdrew tokens on Base`);
    console.log(`   Transaction: ${withdrawTx}\n`);
    
    // Final status
    console.log("🎉 ATOMIC SWAP COMPLETED SUCCESSFULLY!");
    console.log("======================================");
    console.log(`✅ Alice sent ${amount} BMN on Base`);
    console.log(`✅ Alice received ${amount} BMN on Optimism`);
    console.log(`✅ Bob sent ${amount} BMN on Optimism`);
    console.log(`✅ Bob received ${amount} BMN on Base`);
    console.log(`✅ Swap executed atomically with hashlock ${hashlock}`);
    
  } catch (error) {
    console.error(`❌ Error during atomic swap:`, error);
    
    // Clean up pending order
    try {
      await Deno.remove(`./pending-orders/${hashlock}.json`);
    } catch {}
  }
}

main().catch(console.error);