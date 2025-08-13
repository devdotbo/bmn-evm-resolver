/**
 * Alice Service API Contract
 * 
 * Type-safe API contract for Alice service operations
 * using oRPC and Zod for input/output validation
 */

import { oc } from "npm:@orpc/contract@latest";
import { z } from "npm:zod@latest";

// ============================================================================
// Schemas
// ============================================================================

/**
 * Chain ID enum for supported networks
 */
export const ChainIdSchema = z.union([
  z.literal(10),     // Optimism
  z.literal(8453),   // Base
]);

/**
 * Order creation parameters schema
 */
export const CreateOrderInputSchema = z.object({
  srcChainId: ChainIdSchema.describe("Source chain ID (8453 for Base, 10 for Optimism)"),
  dstChainId: ChainIdSchema.describe("Destination chain ID"),
  srcAmount: z.string()
    .regex(/^\d+$/, "Amount must be a positive integer string")
    .describe("Source token amount in wei (as string to handle BigInt)"),
  dstAmount: z.string()
    .regex(/^\d+$/, "Amount must be a positive integer string")
    .describe("Destination token amount in wei (as string to handle BigInt)"),
  tokenAddress: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address")
    .optional()
    .default("0x8287CD2aC7E227D9D927F998EB600a0683a832A1")
    .describe("Token contract address (defaults to BMN)"),
  resolverAddress: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address")
    .optional()
    .describe("Resolver address (defaults to env RESOLVER_ADDRESS)"),
  srcSafetyDeposit: z.string()
    .regex(/^\d+$/, "Safety deposit must be a positive integer string")
    .optional()
    .default("0")
    .describe("Source safety deposit in wei"),
  dstSafetyDeposit: z.string()
    .regex(/^\d+$/, "Safety deposit must be a positive integer string")
    .optional()
    .default("0")
    .describe("Destination safety deposit in wei"),
});

/**
 * Order creation response schema
 */
export const CreateOrderOutputSchema = z.object({
  success: z.boolean().describe("Whether the order was created successfully"),
  orderHash: z.string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid order hash")
    .describe("The unique hash of the created order"),
  hashlock: z.string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid hashlock")
    .describe("The hashlock for the HTLC"),
  filePath: z.string()
    .optional()
    .describe("Path to the stored order file"),
  srcChainId: z.number().describe("Source chain ID"),
  dstChainId: z.number().describe("Destination chain ID"),
  srcAmount: z.string().describe("Source amount in wei"),
  dstAmount: z.string().describe("Destination amount in wei"),
});

/**
 * Swap status schema
 */
export const SwapStatusSchema = z.enum([
  "ORDER_CREATED",
  "SOURCE_DEPOSITED",
  "DESTINATION_FUNDED",
  "DESTINATION_WITHDRAWN",
  "SOURCE_WITHDRAWN",
  "SECRET_REVEALED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]).describe("Current status of the swap");

/**
 * Get swap status input schema
 */
export const GetSwapStatusInputSchema = z.object({
  hashlock: z.string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid hashlock")
    .describe("The hashlock to query"),
});

/**
 * Get swap status output schema
 */
export const GetSwapStatusOutputSchema = z.object({
  hashlock: z.string().describe("The hashlock of the swap"),
  status: SwapStatusSchema.describe("Current status of the swap"),
  sourceEscrow: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .describe("Source escrow contract address"),
  destinationEscrow: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .describe("Destination escrow contract address"),
  secret: z.string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional()
    .describe("The revealed secret (only available after reveal)"),
  completed: z.boolean().describe("Whether the swap is completed"),
  createdAt: z.number().describe("Timestamp when the swap was created"),
  sourceDepositedAt: z.number().optional().describe("Timestamp of source deposit"),
  destinationFundedAt: z.number().optional().describe("Timestamp of destination funding"),
  destinationWithdrawnAt: z.number().optional().describe("Timestamp of destination withdrawal"),
  sourceWithdrawnAt: z.number().optional().describe("Timestamp of source withdrawal"),
});

/**
 * Pending order item schema
 */
export const PendingOrderSchema = z.object({
  orderHash: z.string().describe("Order hash"),
  hashlock: z.string().describe("Hashlock"),
  status: SwapStatusSchema.describe("Current status"),
  sourceChainId: z.number().describe("Source chain ID"),
  destinationChainId: z.number().describe("Destination chain ID"),
  amount: z.string().describe("Amount in wei"),
  createdAt: z.number().describe("Creation timestamp"),
});

/**
 * Get pending orders output schema
 */
export const GetPendingOrdersOutputSchema = z.object({
  count: z.number().describe("Total number of pending orders"),
  orders: z.array(PendingOrderSchema).describe("List of pending orders"),
});

/**
 * Reveal secret input schema
 */
export const RevealSecretInputSchema = z.object({
  hashlock: z.string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid hashlock")
    .describe("The hashlock to reveal the secret for"),
});

/**
 * Reveal secret output schema
 */
export const RevealSecretOutputSchema = z.object({
  success: z.boolean().describe("Whether the secret was revealed successfully"),
  hashlock: z.string().describe("The hashlock"),
  secret: z.string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .describe("The revealed secret"),
});

/**
 * Health check output schema
 */
export const HealthOutputSchema = z.object({
  status: z.literal("healthy").describe("Service health status"),
  service: z.literal("alice-api").describe("Service name"),
  timestamp: z.string().describe("Current timestamp in ISO format"),
  uptime: z.number().describe("Service uptime in seconds"),
});

// ============================================================================
// Error Schemas
// ============================================================================

export const ErrorCodes = {
  INPUT_VALIDATION_FAILED: {
    status: 422,
    message: "Input validation failed",
    data: z.object({
      formErrors: z.array(z.string()),
      fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
    }),
  },
  ORDER_CREATION_FAILED: {
    status: 400,
    message: "Failed to create order",
    data: z.object({
      reason: z.string(),
      details: z.any().optional(),
    }),
  },
  SWAP_NOT_FOUND: {
    status: 404,
    message: "Swap not found",
    data: z.object({
      hashlock: z.string(),
    }),
  },
  SECRET_NOT_FOUND: {
    status: 404,
    message: "Secret not found",
    data: z.object({
      hashlock: z.string(),
    }),
  },
  INSUFFICIENT_BALANCE: {
    status: 400,
    message: "Insufficient token balance",
    data: z.object({
      required: z.string(),
      available: z.string(),
      token: z.string(),
    }),
  },
} as const;

// ============================================================================
// Contract Definitions
// ============================================================================

/**
 * Create order contract
 */
export const createOrderContract = oc
  .route({
    method: "POST",
    path: "/api/alice/create-order",
  })
  .input(CreateOrderInputSchema)
  .output(CreateOrderOutputSchema)
  .errors(ErrorCodes);

/**
 * Get swap status contract
 */
export const getSwapStatusContract = oc
  .route({
    method: "GET",
    path: "/api/alice/swap-status/{hashlock}",
  })
  .input(GetSwapStatusInputSchema)
  .output(GetSwapStatusOutputSchema)
  .errors({
    SWAP_NOT_FOUND: ErrorCodes.SWAP_NOT_FOUND,
  });

/**
 * Get pending orders contract
 */
export const getPendingOrdersContract = oc
  .route({
    method: "GET",
    path: "/api/alice/pending-orders",
  })
  .output(GetPendingOrdersOutputSchema);

/**
 * Reveal secret contract
 */
export const revealSecretContract = oc
  .route({
    method: "POST",
    path: "/api/alice/reveal-secret/{hashlock}",
  })
  .input(RevealSecretInputSchema)
  .output(RevealSecretOutputSchema)
  .errors({
    SECRET_NOT_FOUND: ErrorCodes.SECRET_NOT_FOUND,
    SWAP_NOT_FOUND: ErrorCodes.SWAP_NOT_FOUND,
  });

/**
 * Health check contract
 */
export const healthContract = oc
  .route({
    method: "GET",
    path: "/health",
  })
  .output(HealthOutputSchema);

// ============================================================================
// Complete Router Contract
// ============================================================================

/**
 * Alice service complete router contract
 */
export const aliceContract = {
  health: healthContract,
  createOrder: createOrderContract,
  getSwapStatus: getSwapStatusContract,
  getPendingOrders: getPendingOrdersContract,
  revealSecret: revealSecretContract,
} as const;

// Export types for client usage
export type AliceContract = typeof aliceContract;