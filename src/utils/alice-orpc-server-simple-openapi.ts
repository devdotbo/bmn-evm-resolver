/**
 * Alice oRPC Server with Simple OpenAPI Documentation
 * 
 * Simplified version that generates OpenAPI spec without OpenAPIHandler
 */

import { os, ORPCError } from "npm:@orpc/server@latest";
import { RPCHandler } from "npm:@orpc/server/fetch";
import { CORSPlugin } from "npm:@orpc/server/plugins";
import { OpenAPIGenerator } from "npm:@orpc/openapi@latest";
import { type Address, type Hex } from "viem";
import { z } from "zod";

import { LimitOrderAlice } from "../alice/limit-order-alice.ts";
import { SwapStateManager, SwapStatus } from "../state/swap-state-manager.ts";
import { SecretManager } from "../state/SecretManager.ts";
import {
  CreateOrderInputSchema,
  CreateOrderOutputSchema,
  GetSwapStatusInputSchema,
  GetSwapStatusOutputSchema,
  GetPendingOrdersOutputSchema,
  RevealSecretInputSchema,
  RevealSecretOutputSchema,
  HealthOutputSchema,
  ErrorCodes,
} from "../api/contracts/alice.contract.ts";

// ============================================================================
// Server Configuration
// ============================================================================

interface AliceOrpcServerConfig {
  port: number;
  limitOrderAlice: LimitOrderAlice;
  swapStateManager: SwapStateManager;
  secretManager: SecretManager;
  enableOpenAPI?: boolean;
  apiTitle?: string;
  apiVersion?: string;
}

// ============================================================================
// Context Type
// ============================================================================

interface AliceContext {
  limitOrderAlice: LimitOrderAlice;
  swapStateManager: SwapStateManager;
  secretManager: SecretManager;
  startTime: number;
}

// ============================================================================
// Procedure Implementations (reuse from original)
// ============================================================================

const createBaseProcedure = (config: AliceOrpcServerConfig) => {
  return os
    .$context<AliceContext>()
    .errors(ErrorCodes);
};

const createHealthProcedure = () => {
  const startTime = Date.now();
  
  return os
    .output(HealthOutputSchema)
    .handler(async () => {
      return {
        status: "healthy" as const,
        service: "alice-api" as const,
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
      };
    });
};

const createOrderProcedure = (config: AliceOrpcServerConfig) => {
  return createBaseProcedure(config)
    .input(CreateOrderInputSchema)
    .output(CreateOrderOutputSchema)
    .handler(async ({ input, context, errors }) => {
      try {
        const srcAmount = BigInt(input.srcAmount);
        const dstAmount = BigInt(input.dstAmount);
        const srcSafetyDeposit = BigInt(input.srcSafetyDeposit || "0");
        const dstSafetyDeposit = BigInt(input.dstSafetyDeposit || "0");
        
        const resolverAddress = input.resolverAddress || 
          (Deno.env.get("RESOLVER_ADDRESS") || "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5") as Address;
        
        console.log(`📝 oRPC: Creating order via API request`);
        console.log(`   Source: ${input.srcChainId}, Dest: ${input.dstChainId}`);
        console.log(`   SrcAmount: ${srcAmount}, DstAmount: ${dstAmount}`);
        
        if (!input.srcAmount || srcAmount === 0n) {
          throw errors.ORDER_CREATION_FAILED({
            data: {
              reason: "Invalid source amount",
              details: { srcAmount: input.srcAmount },
            },
          });
        }
        
        const orderHash = await context.limitOrderAlice.createOrder({
          srcChainId: input.srcChainId,
          dstChainId: input.dstChainId,
          srcAmount,
          dstAmount,
          resolverAddress: resolverAddress as string,
          srcSafetyDeposit,
          dstSafetyDeposit,
        });
        
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const tempHashlock = `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as Hex;
        
        let hashlock = tempHashlock;
        let filePath = "";
        try {
          const pendingDir = "./pending-orders";
          for await (const entry of Deno.readDir(pendingDir)) {
            if (entry.isFile && entry.name.endsWith(".json")) {
              const content = await Deno.readTextFile(`${pendingDir}/${entry.name}`);
              const data = JSON.parse(content);
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
        
        await context.swapStateManager.trackSwap(orderHash, {
          orderHash: orderHash as Hex,
          hashlock: hashlock as Hex,
          secret: "" as Hex,
          alice: (context.limitOrderAlice as any).account.address,
          bob: resolverAddress as Address,
          srcChainId: input.srcChainId,
          dstChainId: input.dstChainId,
          srcToken: input.tokenAddress as Address,
          dstToken: input.tokenAddress as Address,
          srcAmount,
          dstAmount,
          status: SwapStatus.CREATED,
          createdAt: Date.now(),
        });
        
        return {
          success: true,
          orderHash,
          hashlock,
          filePath: filePath || undefined,
          srcChainId: input.srcChainId,
          dstChainId: input.dstChainId,
          srcAmount: srcAmount.toString(),
          dstAmount: dstAmount.toString(),
        };
      } catch (error) {
        console.error("Failed to create order:", error);
        
        if (error instanceof Error) {
          if (error.message.includes("Insufficient")) {
            const match = error.message.match(/Have (\d+), need (\d+)/);
            if (match) {
              throw errors.INSUFFICIENT_BALANCE({
                data: {
                  available: match[1],
                  required: match[2],
                  token: input.tokenAddress || "BMN",
                },
              });
            }
          }
        }
        
        if (error instanceof ORPCError) {
          throw error;
        }
        
        throw errors.ORDER_CREATION_FAILED({
          data: {
            reason: error instanceof Error ? error.message : String(error),
            details: error instanceof Error ? { stack: error.stack } : undefined,
          },
        });
      }
    });
};

const getSwapStatusProcedure = (config: AliceOrpcServerConfig) => {
  return createBaseProcedure(config)
    .input(GetSwapStatusInputSchema)
    .output(GetSwapStatusOutputSchema)
    .handler(async ({ input, context, errors }) => {
      const swap = await context.swapStateManager.getSwapByHashlock(input.hashlock as Hex);
      
      if (!swap) {
        throw errors.SWAP_NOT_FOUND({
          data: { hashlock: input.hashlock },
        });
      }
      
      const mapStatus = (status: SwapStatus): string => {
        switch (status) {
          case SwapStatus.CREATED: return "ORDER_CREATED";
          case SwapStatus.ALICE_DEPOSITED: return "SOURCE_DEPOSITED";
          case SwapStatus.BOB_DEPOSITED: return "DESTINATION_FUNDED";
          case SwapStatus.DEST_WITHDRAWN: return "DESTINATION_WITHDRAWN";
          case SwapStatus.SOURCE_WITHDRAWN: return "SOURCE_WITHDRAWN";
          case SwapStatus.SECRET_REVEALED: return "SECRET_REVEALED";
          case SwapStatus.COMPLETED: return "COMPLETED";
          case SwapStatus.FAILED: return "FAILED";
          case SwapStatus.EXPIRED: return "CANCELLED";
          default: return status;
        }
      };
      
      return {
        hashlock: swap.hashlock,
        status: mapStatus(swap.status) as any,
        sourceEscrow: swap.srcEscrow,
        destinationEscrow: swap.dstEscrow,
        secret: swap.secretRevealedAt ? swap.secret : undefined,
        completed: swap.status === SwapStatus.COMPLETED,
        createdAt: swap.createdAt,
        sourceDepositedAt: swap.srcDepositedAt,
        destinationFundedAt: swap.dstDepositedAt,
        destinationWithdrawnAt: swap.dstWithdrawnAt,
        sourceWithdrawnAt: swap.srcWithdrawnAt,
      };
    });
};

const getPendingOrdersProcedure = (config: AliceOrpcServerConfig) => {
  return createBaseProcedure(config)
    .output(GetPendingOrdersOutputSchema)
    .handler(async ({ context }) => {
      const swaps = await context.swapStateManager.getPendingSwaps();
      
      const mapStatus = (status: SwapStatus): string => {
        switch (status) {
          case SwapStatus.CREATED: return "ORDER_CREATED";
          case SwapStatus.ALICE_DEPOSITED: return "SOURCE_DEPOSITED";
          case SwapStatus.BOB_DEPOSITED: return "DESTINATION_FUNDED";
          case SwapStatus.DEST_WITHDRAWN: return "DESTINATION_WITHDRAWN";
          case SwapStatus.SOURCE_WITHDRAWN: return "SOURCE_WITHDRAWN";
          case SwapStatus.SECRET_REVEALED: return "SECRET_REVEALED";
          case SwapStatus.COMPLETED: return "COMPLETED";
          case SwapStatus.FAILED: return "FAILED";
          case SwapStatus.EXPIRED: return "CANCELLED";
          default: return status;
        }
      };
      
      return {
        count: swaps.length,
        orders: swaps.map(s => ({
          orderHash: s.orderHash,
          hashlock: s.hashlock,
          status: mapStatus(s.status) as any,
          sourceChainId: s.srcChainId,
          destinationChainId: s.dstChainId,
          amount: s.srcAmount.toString(),
          createdAt: s.createdAt,
        })),
      };
    });
};

const revealSecretProcedure = (config: AliceOrpcServerConfig) => {
  return createBaseProcedure(config)
    .input(RevealSecretInputSchema)
    .output(RevealSecretOutputSchema)
    .handler(async ({ input, context, errors }) => {
      const secret = await context.secretManager.getSecretByHashlock(input.hashlock as Hex);
      
      if (!secret) {
        throw errors.SECRET_NOT_FOUND({
          data: { hashlock: input.hashlock },
        });
      }
      
      const swap = await context.swapStateManager.getSwapByHashlock(input.hashlock as Hex);
      
      if (!swap) {
        throw errors.SWAP_NOT_FOUND({
          data: { hashlock: input.hashlock },
        });
      }
      
      await context.swapStateManager.updateSwapStatus(
        swap.orderHash,
        SwapStatus.SECRET_REVEALED,
        { secretRevealedAt: Date.now() }
      );
      
      return {
        success: true,
        hashlock: input.hashlock,
        secret,
      };
    });
};

// ============================================================================
// Router Creation
// ============================================================================

export function createAliceRouter(config: AliceOrpcServerConfig) {
  const context: AliceContext = {
    limitOrderAlice: config.limitOrderAlice,
    swapStateManager: config.swapStateManager,
    secretManager: config.secretManager,
    startTime: Date.now(),
  };
  
  const router = {
    health: createHealthProcedure(),
    createOrder: createOrderProcedure(config),
    getSwapStatus: getSwapStatusProcedure(config),
    getPendingOrders: getPendingOrdersProcedure(config),
    revealSecret: revealSecretProcedure(config),
  };
  
  return { router, context };
}

// ============================================================================
// Simple OpenAPI Spec Generation
// ============================================================================

const generateSimpleOpenAPISpec = (config: AliceOrpcServerConfig) => {
  return {
    openapi: "3.0.0",
    info: {
      title: config.apiTitle || "Alice Atomic Swap API",
      version: config.apiVersion || "1.0.0",
      description: "Type-safe API for atomic swap operations with Alice service",
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: "Local development server",
      },
    ],
    paths: {
      "/health": {
        get: {
          summary: "Health Check",
          operationId: "healthCheck",
          tags: ["System"],
          responses: {
            "200": {
              description: "Service is healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", enum: ["healthy"] },
                      service: { type: "string" },
                      timestamp: { type: "string", format: "date-time" },
                      uptime: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/alice/createOrder": {
        post: {
          summary: "Create Atomic Swap Order",
          operationId: "createOrder",
          tags: ["Orders"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["srcChainId", "dstChainId", "srcAmount", "dstAmount"],
                  properties: {
                    srcChainId: { type: "number", enum: [8453, 10] },
                    dstChainId: { type: "number", enum: [8453, 10] },
                    srcAmount: { type: "string" },
                    dstAmount: { type: "string" },
                    tokenAddress: { type: "string" },
                    resolverAddress: { type: "string" },
                    srcSafetyDeposit: { type: "string" },
                    dstSafetyDeposit: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Order created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      orderHash: { type: "string" },
                      hashlock: { type: "string" },
                      filePath: { type: "string" },
                      srcChainId: { type: "number" },
                      dstChainId: { type: "number" },
                      srcAmount: { type: "string" },
                      dstAmount: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/alice/getSwapStatus": {
        post: {
          summary: "Get Swap Status",
          operationId: "getSwapStatus",
          tags: ["Swaps"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["hashlock"],
                  properties: {
                    hashlock: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Swap status retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      hashlock: { type: "string" },
                      status: { type: "string" },
                      sourceEscrow: { type: "string" },
                      destinationEscrow: { type: "string" },
                      secret: { type: "string" },
                      completed: { type: "boolean" },
                      createdAt: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/alice/getPendingOrders": {
        post: {
          summary: "Get Pending Orders",
          operationId: "getPendingOrders",
          tags: ["Orders"],
          responses: {
            "200": {
              description: "List of pending orders",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      count: { type: "number" },
                      orders: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            orderHash: { type: "string" },
                            hashlock: { type: "string" },
                            status: { type: "string" },
                            sourceChainId: { type: "number" },
                            destinationChainId: { type: "number" },
                            amount: { type: "string" },
                            createdAt: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/alice/revealSecret": {
        post: {
          summary: "Reveal Secret",
          operationId: "revealSecret",
          tags: ["Secrets"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["hashlock"],
                  properties: {
                    hashlock: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Secret revealed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      hashlock: { type: "string" },
                      secret: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: "System", description: "System health and status endpoints" },
      { name: "Orders", description: "Atomic swap order management" },
      { name: "Swaps", description: "Swap status and monitoring" },
      { name: "Secrets", description: "Secret management for atomic swaps" },
    ],
  };
};

// ============================================================================
// Scalar UI HTML
// ============================================================================

const getScalarHTML = (specUrl: string, title: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - API Documentation</title>
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <script
    id="api-reference"
    data-url="${specUrl}"
    data-configuration='${JSON.stringify({
      theme: "purple",
      hideDownloadButton: false,
    })}'
  ></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>
`;

// ============================================================================
// Server Class
// ============================================================================

export class AliceOrpcServerWithSimpleOpenAPI {
  private server?: Deno.HttpServer;
  private abortController?: AbortController;
  private handler: RPCHandler<any>;
  private openAPISpec: any;
  private context: AliceContext;
  
  constructor(private config: AliceOrpcServerConfig) {
    const { router, context } = createAliceRouter(config);
    this.context = context;
    
    this.handler = new RPCHandler(router, {
      plugins: [
        new CORSPlugin({
          origin: "*",
        }),
      ],
    });
    
    if (config.enableOpenAPI !== false) {
      this.openAPISpec = generateSimpleOpenAPISpec(config);
    }
  }
  
  async start(): Promise<void> {
    const handler = async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      
      // Serve OpenAPI specification
      if (url.pathname === "/openapi.json" && this.openAPISpec) {
        return new Response(
          JSON.stringify(this.openAPISpec, null, 2),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
      
      // Serve Scalar UI
      if (url.pathname === "/docs" && this.openAPISpec) {
        return new Response(
          getScalarHTML("/openapi.json", this.config.apiTitle || "Alice API"),
          {
            status: 200,
            headers: {
              "Content-Type": "text/html",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
      
      // Handle oRPC requests
      const { response, matched } = await this.handler.handle(req, {
        prefix: "/api/alice",
        context: this.context,
      });
      
      if (matched && response) {
        return response;
      }
      
      // Health endpoint
      if (url.pathname === "/health") {
        return new Response(
          JSON.stringify({
            status: "healthy",
            service: "alice-api",
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.context.startTime) / 1000),
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
      
      // Root endpoint
      if (url.pathname === "/") {
        return new Response(
          JSON.stringify({
            service: "alice-api",
            version: this.config.apiVersion || "1.0.0",
            documentation: "/docs",
            openapi: "/openapi.json",
            health: "/health",
            endpoints: {
              health: "GET /health",
              createOrder: "POST /api/alice/createOrder",
              getSwapStatus: "POST /api/alice/getSwapStatus",
              getPendingOrders: "POST /api/alice/getPendingOrders",
              revealSecret: "POST /api/alice/revealSecret",
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
      
      // 404
      return new Response(
        JSON.stringify({ error: "Not Found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    };
    
    this.abortController = new AbortController();
    this.server = Deno.serve({ 
      port: this.config.port, 
      signal: this.abortController.signal 
    }, handler);
    
    console.log(`🌐 Alice oRPC server with OpenAPI started on port ${this.config.port}`);
    console.log(`📚 API Documentation: http://localhost:${this.config.port}/docs`);
    console.log(`📋 OpenAPI Spec: http://localhost:${this.config.port}/openapi.json`);
    console.log(`🔧 API endpoints:`);
    console.log(`   GET  /health`);
    console.log(`   POST /api/alice/createOrder`);
    console.log(`   POST /api/alice/getSwapStatus`);
    console.log(`   POST /api/alice/getPendingOrders`);
    console.log(`   POST /api/alice/revealSecret`);
  }
  
  async stop() {
    if (this.abortController) {
      console.log("🛑 Alice oRPC server stopping...");
      this.abortController.abort();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

export type AliceRouter = ReturnType<typeof createAliceRouter>["router"];