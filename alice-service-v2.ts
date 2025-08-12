#!/usr/bin/env -S deno run --allow-all --env-file=.env

/**
 * Alice Service V2 - Enhanced with automatic secret reveal
 * 
 * This service:
 * 1. Creates limit orders with secrets
 * 2. Monitors for destination escrow creation
 * 3. Reveals secrets to claim tokens
 */

import { LimitOrderAlice } from "./src/alice/limit-order-alice.ts";
import { SecretRevealer } from "./src/utils/secret-reveal.ts";
import { type Address, type Hex } from "viem";

interface OrderWithSecret {
  orderHash: Hex;
  hashlock: Hex;
  secret: Hex;
  sourceChain: number;
  destChain: number;
  destToken: Address;
  timestamp: number;
}

class AliceServiceV2 {
  private alice: LimitOrderAlice;
  private secretRevealer: SecretRevealer;
  private ordersWithSecrets: Map<string, OrderWithSecret> = new Map();
  private processedEscrows: Set<string> = new Set();
  
  constructor(privateKey: string) {
    this.alice = new LimitOrderAlice(privateKey);
    this.secretRevealer = new SecretRevealer();
  }
  
  /**
   * Create a new order with a secret
   */
  async createOrderWithSecret(params: {
    sourceChain: number;
    destChain: number;
    sourceToken: Address;
    destToken: Address;
    amount: bigint;
    receiver?: Address;
  }): Promise<OrderWithSecret> {
    // Generate secret and hashlock
    const { secret, hashlock } = this.secretRevealer.generateSecret();
    
    console.log(`🔐 Generated secret for new order`);
    console.log(`   Hashlock: ${hashlock}`);
    
    // Create the order with this hashlock
    const orderResult = await this.alice.createAndSignOrder({
      chainId: params.sourceChain,
      makerAsset: params.sourceToken,
      takerAsset: params.sourceToken, // Same token on source
      makingAmount: params.amount,
      takingAmount: params.amount,
      receiver: params.receiver || this.alice.address,
      hashlock,
      dstChainId: BigInt(params.destChain),
      dstToken: params.destToken,
      srcSafetyDeposit: params.amount / 100n, // 1% safety deposit
      dstSafetyDeposit: params.amount / 100n,
    });
    
    // Store order with secret
    const orderWithSecret: OrderWithSecret = {
      orderHash: orderResult.orderHash as Hex,
      hashlock,
      secret,
      sourceChain: params.sourceChain,
      destChain: params.destChain,
      destToken: params.destToken,
      timestamp: Date.now(),
    };
    
    this.ordersWithSecrets.set(orderResult.orderHash, orderWithSecret);
    
    // Save to file for persistence
    await Deno.writeTextFile(
      `./alice-orders/${orderResult.orderHash}.json`,
      JSON.stringify(orderWithSecret, null, 2)
    );
    
    console.log(`✅ Order created with secret management`);
    console.log(`   Order Hash: ${orderResult.orderHash}`);
    
    return orderWithSecret;
  }
  
  /**
   * Monitor for destination escrows and reveal secrets
   */
  async monitorAndReveal(): Promise<void> {
    // Check escrow-pairs directory for new destination escrows
    try {
      const entries = Deno.readDir("./escrow-pairs");
      
      for await (const entry of entries) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          const escrowPair = JSON.parse(
            await Deno.readTextFile(`./escrow-pairs/${entry.name}`)
          );
          
          // Check if we have the secret for this hashlock
          const hashlock = escrowPair.hashlock;
          
          // Find order with this hashlock
          let orderWithSecret: OrderWithSecret | undefined;
          for (const [_, order] of this.ordersWithSecrets) {
            if (order.hashlock === hashlock) {
              orderWithSecret = order;
              break;
            }
          }
          
          // Also check saved orders
          if (!orderWithSecret) {
            try {
              const savedOrders = Deno.readDir("./alice-orders");
              for await (const orderFile of savedOrders) {
                if (orderFile.isFile && orderFile.name.endsWith(".json")) {
                  const saved = JSON.parse(
                    await Deno.readTextFile(`./alice-orders/${orderFile.name}`)
                  );
                  if (saved.hashlock === hashlock) {
                    orderWithSecret = saved;
                    this.secretRevealer.storeSecret(hashlock, saved.secret);
                    break;
                  }
                }
              }
            } catch {
              // alice-orders directory might not exist
            }
          }
          
          if (orderWithSecret && !this.processedEscrows.has(escrowPair.destEscrow)) {
            console.log(`\n🎯 Found destination escrow for our order!`);
            console.log(`   Hashlock: ${hashlock}`);
            console.log(`   Dest Escrow: ${escrowPair.destEscrow}`);
            console.log(`   Dest Chain: ${escrowPair.destChain}`);
            
            // Reveal the secret
            const privateKey = Deno.env.get("ALICE_PRIVATE_KEY");
            if (!privateKey) {
              console.error("❌ ALICE_PRIVATE_KEY not set");
              continue;
            }
            
            try {
              await this.secretRevealer.revealSecret(
                escrowPair.destEscrow,
                orderWithSecret.secret,
                escrowPair.destChain,
                privateKey
              );
              
              this.processedEscrows.add(escrowPair.destEscrow);
              
              // Mark order as completed
              await Deno.writeTextFile(
                `./alice-orders/${orderWithSecret.orderHash}-completed.json`,
                JSON.stringify({
                  ...orderWithSecret,
                  completedAt: new Date().toISOString(),
                  destEscrow: escrowPair.destEscrow,
                }, null, 2)
              );
              
              console.log(`✅ Secret revealed and tokens claimed!`);
            } catch (error) {
              console.error(`❌ Failed to reveal secret:`, error);
            }
          }
        }
      }
    } catch (error) {
      // escrow-pairs directory might not exist yet
      if (!(error instanceof Deno.errors.NotFound)) {
        console.error("Error monitoring escrow pairs:", error);
      }
    }
  }
  
  /**
   * Run the monitoring loop
   */
  async run(): Promise<void> {
    console.log("👩 Alice Service V2 Started");
    console.log("================================");
    console.log(`Address: ${this.alice.address}`);
    
    // Create directories
    await Deno.mkdir("./alice-orders", { recursive: true });
    await Deno.mkdir("./escrow-pairs", { recursive: true });
    
    // Load existing orders
    try {
      const entries = Deno.readDir("./alice-orders");
      for await (const entry of entries) {
        if (entry.isFile && entry.name.endsWith(".json") && !entry.name.includes("-completed")) {
          const order = JSON.parse(
            await Deno.readTextFile(`./alice-orders/${entry.name}`)
          );
          this.ordersWithSecrets.set(order.orderHash, order);
          this.secretRevealer.storeSecret(order.hashlock, order.secret);
          console.log(`📂 Loaded existing order: ${order.orderHash}`);
        }
      }
    } catch {
      // alice-orders directory might not exist
    }
    
    // Main loop
    while (true) {
      await this.monitorAndReveal();
      await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10 seconds
    }
  }
}

// Main execution
async function main() {
  const privateKey = Deno.env.get("ALICE_PRIVATE_KEY");
  if (!privateKey) {
    console.error("❌ ALICE_PRIVATE_KEY environment variable is required");
    Deno.exit(1);
  }
  
  const service = new AliceServiceV2(privateKey);
  
  // Start health server
  const healthServer = Deno.serve({ port: 8001 }, (req) => {
    const url = new URL(req.url);
    
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "healthy",
        service: "alice-v2",
        timestamp: new Date().toISOString(),
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    
    if (url.pathname === "/create-order" && req.method === "POST") {
      // Handle order creation via HTTP
      return new Response("Order creation endpoint", { status: 501 });
    }
    
    return new Response("Not Found", { status: 404 });
  });
  
  // Run the service
  await service.run();
}

main().catch(console.error);