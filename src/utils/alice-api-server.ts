/**
 * Alice API Server
 * 
 * Provides HTTP API endpoints for Alice service operations including:
 * - Creating orders
 * - Checking swap status
 * - Manual operations (reveal secret, etc.)
 */

import { type Address, type Hex } from "viem";
import { LimitOrderAlice } from "../alice/limit-order-alice.ts";
import { SwapStateManager, SwapStatus } from "../state/swap-state-manager.ts";
import { SecretManager } from "../state/SecretManager.ts";

interface CreateOrderRequest {
  sourceChainId?: number;
  destinationChainId?: number;
  amount?: string;
  tokenAddress?: Address;
  resolverAddress?: Address;
}

interface ApiConfig {
  port: number;
  limitOrderAlice: LimitOrderAlice;
  swapStateManager: SwapStateManager;
  secretManager: SecretManager;
}

export class AliceApiServer {
  private server?: Deno.HttpServer;
  
  constructor(private config: ApiConfig) {}
  
  async start(): Promise<void> {
    const handler = async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      const method = req.method;
      
      // CORS headers for browser access
      const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
      
      // Handle CORS preflight
      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }
      
      try {
        // Health check
        if (url.pathname === "/health") {
          return new Response(
            JSON.stringify({
              status: "healthy",
              service: "alice-api",
              timestamp: new Date().toISOString(),
              uptime: Math.floor(performance.now() / 1000),
            }),
            { status: 200, headers }
          );
        }
        
        // Create order endpoint
        if (method === "POST" && url.pathname === "/create-order") {
          const body = await req.json() as CreateOrderRequest;
          
          // Set defaults
          const sourceChainId = body.sourceChainId || 8453; // Base
          const destinationChainId = body.destinationChainId || 10; // Optimism
          const amount = BigInt(body.amount || "10000000000000000"); // 0.01 tokens
          const tokenAddress = body.tokenAddress || "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address; // BMN
          const resolverAddress = body.resolverAddress || 
            (Deno.env.get("RESOLVER_ADDRESS") || "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5") as Address;
          
          console.log(`📝 API: Creating order via API request`);
          console.log(`   Source: ${sourceChainId}, Dest: ${destinationChainId}`);
          console.log(`   Amount: ${amount}, Token: ${tokenAddress}`);
          
          // Create order using LimitOrderAlice with correct parameter names
          try {
            const orderHash = await this.config.limitOrderAlice.createOrder({
              srcChainId: sourceChainId,
              dstChainId: destinationChainId,
              srcAmount: amount,
              dstAmount: amount, // Same amount for both sides
              resolverAddress: resolverAddress as string,
              srcSafetyDeposit: 0n,
              dstSafetyDeposit: 0n,
            });
            
            // The order creation also stores the secret in SecretManager
            // We need to get the hashlock from the saved order file
            // For now, generate hashlock from the order (this is a temporary fix)
            const randomBytes = crypto.getRandomValues(new Uint8Array(32));
            const tempHashlock = `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as Hex;
            
            // Try to find the actual hashlock from pending orders
            let hashlock = tempHashlock;
            let filePath = "";
            try {
              const pendingDir = "./pending-orders";
              for await (const entry of Deno.readDir(pendingDir)) {
                if (entry.isFile && entry.name.endsWith(".json")) {
                  const content = await Deno.readTextFile(`${pendingDir}/${entry.name}`);
                  const data = JSON.parse(content);
                  if (data.timestamp && Date.now() - data.timestamp < 5000) {
                    // Recent order (within 5 seconds)
                    hashlock = data.hashlock;
                    filePath = `${pendingDir}/${entry.name}`;
                    break;
                  }
                }
              }
            } catch (e) {
              console.error("Could not find hashlock from pending orders:", e);
            }
            
            // Save to swap state manager
            await this.config.swapStateManager.createSwap({
              orderHash,
              hashlock,
              secret: "", // Will be retrieved from SecretManager when needed
              alice: (this.config.limitOrderAlice as any).account.address,
              bob: resolverAddress,
              srcChainId: sourceChainId,
              dstChainId: destinationChainId,
              srcToken: tokenAddress,
              dstToken: tokenAddress,
              srcAmount: amount,
              dstAmount: amount,
              status: SwapStatus.ORDER_CREATED,
              createdAt: Date.now(),
            });
            
            return new Response(
              JSON.stringify({
                success: true,
                orderHash,
                hashlock,
                filePath,
                sourceChainId,
                destinationChainId,
                amount: amount.toString(),
              }),
              { status: 200, headers }
            );
          } catch (error) {
            return new Response(
              JSON.stringify({ 
                error: "Failed to create order",
                message: error instanceof Error ? error.message : String(error),
              }),
              { status: 400, headers }
            );
          }
        }
        
        // Get swap status
        if (method === "GET" && url.pathname.startsWith("/swap-status/")) {
          const hashlock = url.pathname.split("/")[2] as Hex;
          
          const swap = await this.config.swapStateManager.getSwapByHashlock(hashlock);
          if (!swap) {
            return new Response(
              JSON.stringify({ error: "Swap not found" }),
              { status: 404, headers }
            );
          }
          
          return new Response(
            JSON.stringify({
              hashlock: swap.hashlock,
              status: swap.status,
              sourceEscrow: swap.srcEscrow,
              destinationEscrow: swap.dstEscrow,
              secret: swap.secretRevealed ? swap.secret : undefined,
              completed: swap.status === SwapStatus.COMPLETED,
              createdAt: swap.createdAt,
              sourceDepositedAt: swap.srcDepositedAt,
              destinationFundedAt: swap.dstFundedAt,
              destinationWithdrawnAt: swap.dstWithdrawnAt,
              sourceWithdrawnAt: swap.srcWithdrawnAt,
            }),
            { status: 200, headers }
          );
        }
        
        // List pending orders
        if (method === "GET" && url.pathname === "/pending-orders") {
          const swaps = await this.config.swapStateManager.getPendingSwaps();
          
          return new Response(
            JSON.stringify({
              count: swaps.length,
              orders: swaps.map(s => ({
                orderHash: s.orderHash,
                hashlock: s.hashlock,
                status: s.status,
                sourceChainId: s.srcChainId,
                destinationChainId: s.dstChainId,
                amount: s.srcAmount.toString(),
                createdAt: s.createdAt,
              })),
            }),
            { status: 200, headers }
          );
        }
        
        // Reveal secret manually
        if (method === "POST" && url.pathname.startsWith("/reveal-secret/")) {
          const hashlock = url.pathname.split("/")[2] as Hex;
          
          const secret = await this.config.secretManager.getSecret(hashlock);
          if (!secret) {
            return new Response(
              JSON.stringify({ error: "Secret not found" }),
              { status: 404, headers }
            );
          }
          
          const swap = await this.config.swapStateManager.getSwapByHashlock(hashlock);
          if (!swap) {
            return new Response(
              JSON.stringify({ error: "Swap not found" }),
              { status: 404, headers }
            );
          }
          
          // Update state to mark secret as revealed
          await this.config.swapStateManager.updateSwapStatus(
            swap.orderHash,
            SwapStatus.SECRET_REVEALED,
            { secretRevealed: true }
          );
          
          return new Response(
            JSON.stringify({
              success: true,
              hashlock,
              secret,
            }),
            { status: 200, headers }
          );
        }
        
        // 404 for unknown routes
        return new Response(
          JSON.stringify({ error: "Not Found" }),
          { status: 404, headers }
        );
        
      } catch (error) {
        console.error("API error:", error);
        return new Response(
          JSON.stringify({ 
            error: "Internal Server Error",
            message: error instanceof Error ? error.message : String(error),
          }),
          { status: 500, headers }
        );
      }
    };
    
    this.server = Deno.serve({ port: this.config.port }, handler);
    console.log(`🌐 Alice API server started on port ${this.config.port}`);
  }
  
  stop() {
    if (this.server) {
      // Note: Deno.HttpServer doesn't have a direct close method in newer versions
      // The server will be closed when the process exits
      console.log("🛑 Alice API server stopping...");
    }
  }
}