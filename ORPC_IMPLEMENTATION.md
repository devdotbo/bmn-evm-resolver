# oRPC Implementation for BMN Resolver

## Overview

This document describes the oRPC (Open RPC) implementation for the BMN resolver system, providing type-safe APIs for atomic swap operations between Alice and Bob services.

## Key Benefits

### Before (Manual HTTP API)
- Manual route handling with string paths
- No compile-time type checking
- Manual JSON parsing and validation
- Inconsistent error handling
- Parameter name mismatches (sourceChainId vs srcChainId)
- Runtime errors from undefined values

### After (oRPC Implementation)
- Type-safe procedures with automatic validation
- Compile-time type checking for all API calls
- Automatic input/output validation with Zod schemas
- Structured error handling with typed error codes
- Consistent parameter naming across the system
- OpenAPI-compatible endpoints

## Architecture

```
┌─────────────────────────────────────────────┐
│            Alice Service (oRPC)             │
├─────────────────────────────────────────────┤
│  Contract Definition (alice.contract.ts)    │
│  - Input/Output Schemas (Zod)               │
│  - Error Definitions                        │
│  - Route Specifications                     │
├─────────────────────────────────────────────┤
│  Server Implementation (alice-orpc-server)  │
│  - Type-safe procedures                     │
│  - Automatic validation                     │
│  - CORS support                            │
│  - OpenAPI endpoints                       │
├─────────────────────────────────────────────┤
│  Client Usage (trigger-atomic-swap-orpc)    │
│  - Type-safe client                        │
│  - Autocomplete support                    │
│  - Typed error handling                    │
└─────────────────────────────────────────────┘
```

## Files Created/Modified

### New Files

1. **`src/api/contracts/alice.contract.ts`**
   - Central contract definition with all schemas
   - Zod validation schemas for inputs/outputs
   - Typed error definitions
   - OpenAPI route specifications

2. **`src/utils/alice-orpc-server.ts`**
   - oRPC server implementation
   - Replaces manual HTTP route handling
   - Type-safe procedure implementations
   - Automatic input validation and error handling

3. **`alice-service-orpc.ts`**
   - Updated Alice service using oRPC server
   - Maintains all existing functionality
   - Improved type safety and error handling

4. **`scripts/trigger-atomic-swap-orpc.ts`**
   - Type-safe client implementation
   - No manual fetch calls or JSON parsing
   - Better error handling with typed errors
   - Full autocomplete support

5. **`scripts/test-orpc-integration.ts`**
   - Comprehensive test suite for oRPC implementation
   - Tests validation, error handling, and type safety

### Modified Files

1. **`src/alice/limit-order-alice.ts`**
   - Added input validation for srcAmount/dstAmount
   - Fixed formatUnits undefined error
   - Improved error messages

## API Endpoints

All endpoints now have full type safety and automatic validation:

```typescript
// Health Check
GET  /health
GET  /api/alice/health

// Order Management
POST /api/alice/create-order
  Input: {
    srcChainId: 10 | 8453,
    dstChainId: 10 | 8453,
    srcAmount: string,      // Wei amount as string
    dstAmount: string,      // Wei amount as string
    tokenAddress?: string,  // Optional, defaults to BMN
    resolverAddress?: string,
    srcSafetyDeposit?: string,
    dstSafetyDeposit?: string
  }
  Output: {
    success: boolean,
    orderHash: string,
    hashlock: string,
    filePath?: string,
    srcChainId: number,
    dstChainId: number,
    srcAmount: string,
    dstAmount: string
  }

// Swap Status
GET  /api/alice/swap-status/{hashlock}
  Output: {
    hashlock: string,
    status: SwapStatus,
    sourceEscrow?: string,
    destinationEscrow?: string,
    secret?: string,
    completed: boolean,
    createdAt: number,
    // ... timestamps
  }

// Pending Orders
GET  /api/alice/pending-orders
  Output: {
    count: number,
    orders: PendingOrder[]
  }

// Secret Management
POST /api/alice/reveal-secret/{hashlock}
  Output: {
    success: boolean,
    hashlock: string,
    secret: string
  }
```

## Error Handling

Structured error codes with typed data:

```typescript
// Input validation errors
INPUT_VALIDATION_FAILED: {
  status: 422,
  data: {
    formErrors: string[],
    fieldErrors: Record<string, string[]>
  }
}

// Business logic errors
ORDER_CREATION_FAILED: {
  status: 400,
  data: { reason: string, details?: any }
}

INSUFFICIENT_BALANCE: {
  status: 400,
  data: { required: string, available: string, token: string }
}

SWAP_NOT_FOUND: {
  status: 404,
  data: { hashlock: string }
}

SECRET_NOT_FOUND: {
  status: 404,
  data: { hashlock: string }
}
```

## Usage Examples

### Starting the Service

```bash
# Start Alice service with oRPC
./alice-service-orpc.ts

# Or with Docker
docker compose up -d --build alice
```

### Client Usage

```typescript
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

// Create type-safe client
const client = createORPCClient(
  new RPCLink({ url: "http://localhost:8001/api/alice" })
);

// Make type-safe API calls with autocomplete
const [error, result] = await client.createOrder({
  srcChainId: 8453,  // Type-checked: only 10 or 8453 allowed
  dstChainId: 10,
  srcAmount: "1000000000000000",
  dstAmount: "1000000000000000",
});

// Handle typed errors
if (error) {
  if (error.code === "INSUFFICIENT_BALANCE") {
    console.log(`Need ${error.data.required} but have ${error.data.available}`);
  }
}
```

### Testing

```bash
# Run integration tests
./scripts/test-orpc-integration.ts

# Trigger atomic swap with oRPC client
./scripts/trigger-atomic-swap-orpc.ts

# With options
./scripts/trigger-atomic-swap-orpc.ts --reverse --amount 50000000000000000
```

## Migration Path

1. **Phase 1** (Completed): Implement oRPC for Alice service
   - Contract definition
   - Server implementation
   - Client migration
   - Testing

2. **Phase 2** (Next): Implement oRPC for Bob service
   - Create bob.contract.ts
   - Implement bob-orpc-server.ts
   - Update bob-service.ts

3. **Phase 3**: Unified API Gateway
   - Combine Alice and Bob contracts
   - Single oRPC router for both services
   - Shared error handling

## Benefits Achieved

1. **Type Safety**: Complete end-to-end type safety from server to client
2. **Developer Experience**: Autocomplete, inline documentation, compile-time checks
3. **Reliability**: Automatic validation prevents runtime errors
4. **Maintainability**: Single source of truth for API contracts
5. **Documentation**: Self-documenting APIs with OpenAPI support
6. **Testing**: Easier to test with mocked clients

## Future Enhancements

1. **OpenAPI Documentation**: Generate and serve OpenAPI spec at `/api/docs`
2. **Client SDK Generation**: Auto-generate SDKs for different languages
3. **Monitoring**: Add oRPC interceptors for logging and metrics
4. **Rate Limiting**: Implement rate limiting at the oRPC layer
5. **WebSocket Support**: Add real-time updates using oRPC WebSocket adapter

## Troubleshooting

### Common Issues

1. **Type errors in IDE**: Ensure Deno LSP is configured correctly
2. **Connection refused**: Check service is running on correct port
3. **Validation errors**: Check input matches Zod schemas in contract
4. **Import errors**: Use `npm:` prefix for npm packages in Deno

### Debug Mode

Enable debug logging:
```bash
DEBUG=orpc* ./alice-service-orpc.ts
```

## Resources

- [oRPC Documentation](https://orpc.unnoq.com/)
- [Zod Documentation](https://zod.dev/)
- [Contract Definition](./src/api/contracts/alice.contract.ts)
- [Server Implementation](./src/utils/alice-orpc-server.ts)