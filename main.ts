/**
 * Bridge-Me-Not Resolver
 * 
 * A cross-chain atomic swap resolver implementation using the 1inch cross-chain-swap protocol.
 * 
 * Available commands:
 * - deno task resolver:start    - Start the resolver (Bob)
 * - deno task resolver:status   - Check resolver status
 * - deno task alice:create-order - Create a new order (Alice)
 * - deno task alice:list-orders  - List all orders
 * - deno task alice:withdraw     - Withdraw from destination escrow
 * 
 * For more information, see README.md
 */

console.log(`
╔══════════════════════════════════════════╗
║       Bridge-Me-Not Resolver v1.0        ║
╚══════════════════════════════════════════╝

Cross-chain atomic swap resolver for the 1inch protocol.

Available commands:

Resolver (Bob):
  deno task resolver:start    Start the resolver
  deno task resolver:status   Check resolver status

Client (Alice):
  deno task alice:create-order --amount <amount>  Create a new order
  deno task alice:list-orders                     List all orders  
  deno task alice:withdraw --order-id <id>        Withdraw tokens

Development:
  deno task dev               Start in development mode

Environment Setup:
  1. Start EVM chains in bmn-evm-contracts:
     ./scripts/multi-chain-setup.sh

  2. Set environment variables:
     RESOLVER_PRIVATE_KEY=0x...
     ALICE_PRIVATE_KEY=0x...
     
     Contract addresses:
     CHAIN_A_ESCROW_FACTORY=0x...
     CHAIN_A_LIMIT_ORDER_PROTOCOL=0x...
     CHAIN_B_ESCROW_FACTORY=0x...
     CHAIN_B_LIMIT_ORDER_PROTOCOL=0x...
     
     Token addresses:
     CHAIN_A_TOKEN_TKA=0x...
     CHAIN_A_TOKEN_TKB=0x...
     CHAIN_B_TOKEN_TKA=0x...
     CHAIN_B_TOKEN_TKB=0x...

For detailed documentation, see:
- README.md for quick start
- PLAN.md for implementation details
- CLAUDE.md for development guidance
`);

// Export main types and utilities for external use
export * from "./src/types/index.ts";
export * from "./src/utils/secrets.ts";
export * from "./src/utils/timelocks.ts";
export * from "./src/utils/contracts.ts";
export * from "./src/resolver/index.ts";
