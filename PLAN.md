# Bridge-Me-Not Resolver Implementation Plan

This document outlines the implementation plan for the Bridge-Me-Not resolver, which handles cross-chain atomic swaps using the 1inch cross-chain-swap protocol.

## Overview

The resolver consists of two main components:
1. **Bob (Resolver)** - The liquidity provider who monitors orders and executes swaps
2. **Alice (Test Client)** - A test implementation for creating and executing orders

## Architecture

```
┌─────────────────────┐
│   Alice (Client)    │
│  - Create Order     │
│  - Lock on Src      │
│  - Withdraw on Dst  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Bob (Resolver)    │
│  - Monitor Orders   │
│  - Deploy EscrowDst │
│  - Reveal Secret    │
│  - Claim on Src     │
└─────────────────────┘
```

## Technology Stack

- **Runtime**: Deno (TypeScript)
- **Blockchain Library**: viem
- **Contract Interaction**: Bridge-Me-Not EVM contracts
- **Chains**: Local Anvil instances (Chain A: 8545, Chain B: 8546)

## Implementation Steps

### Phase 1: Project Setup

1. **Configure Deno Environment**
   - Add viem and required dependencies to deno.json
   - Set up TypeScript configuration
   - Create project structure

2. **Chain Configuration**
   - Define chain configurations for local Anvil instances
   - Set up RPC providers for both chains
   - Configure wallet clients for Alice and Bob

3. **Contract Setup**
   - Load contract ABIs from `abis/` directory
   - Create contract instances for:
     - EscrowFactory (both chains)
     - EscrowSrc
     - EscrowDst
     - LimitOrderProtocol
     - ERC20 tokens

### Phase 2: Bob (Resolver) Implementation

1. **Order Monitoring Service**
   - Listen to `SrcEscrowCreated` events from EscrowFactory
   - Parse order immutables and validate profitability
   - Check resolver has sufficient liquidity on destination chain

2. **Order Execution Logic**
   - Calculate deterministic EscrowDst address
   - Deploy EscrowDst on destination chain
   - Lock tokens in EscrowDst with safety deposit
   - Monitor for secret reveal

3. **Secret Management**
   - Monitor EscrowDst for withdrawal events
   - Extract revealed secret from transaction
   - Use secret to withdraw from EscrowSrc

4. **Error Handling & Recovery**
   - Handle failed deployments
   - Implement retry logic
   - Cancel orders if timelocks expire

### Phase 3: Alice (Test Client) Implementation

1. **Order Creation**
   - Generate random secrets and compute hashlocks
   - Create order parameters with proper timelocks
   - Approve tokens for EscrowFactory

2. **Source Chain Operations**
   - Deploy EscrowSrc through LimitOrderProtocol
   - Monitor for EscrowDst deployment
   - Track order status

3. **Destination Chain Operations**
   - Wait for Bob to deploy EscrowDst
   - Reveal secret by withdrawing from EscrowDst
   - Verify tokens received

### Phase 4: CLI Interface

1. **Resolver CLI Commands**
   ```bash
   deno task resolver:start    # Start resolver monitoring
   deno task resolver:status   # Show active orders
   deno task resolver:stop     # Stop resolver
   ```

2. **Alice CLI Commands**
   ```bash
   deno task alice:create-order --amount 100 --token-a TKA --token-b TKB
   deno task alice:list-orders
   deno task alice:withdraw --order-id <id>
   ```

### Phase 5: Testing & Validation

1. **Unit Tests**
   - Test order creation logic
   - Test secret generation and validation
   - Test timelock calculations

2. **Integration Tests**
   - Test full swap flow
   - Test cancellation scenarios
   - Test multiple concurrent orders

3. **Error Scenarios**
   - Test insufficient liquidity
   - Test expired timelocks
   - Test invalid secrets

## File Structure

```
bmn-evm-resolver/
├── abis/                    # Contract ABIs
│   ├── EscrowFactory.json
│   ├── EscrowSrc.json
│   ├── EscrowDst.json
│   └── ...
├── src/
│   ├── config/
│   │   ├── chains.ts       # Chain configurations
│   │   └── contracts.ts    # Contract addresses
│   ├── resolver/
│   │   ├── monitor.ts      # Order monitoring service
│   │   ├── executor.ts     # Order execution logic
│   │   └── index.ts        # Resolver entry point
│   ├── alice/
│   │   ├── order.ts        # Order creation
│   │   ├── withdraw.ts     # Withdrawal logic
│   │   └── index.ts        # Alice entry point
│   ├── utils/
│   │   ├── contracts.ts    # Contract helpers
│   │   ├── timelocks.ts    # Timelock utilities
│   │   └── secrets.ts      # Secret management
│   └── types/
│       └── index.ts        # TypeScript types
├── tests/
│   ├── resolver.test.ts
│   └── alice.test.ts
├── scripts/
│   └── deploy-local.ts     # Local deployment helper
├── deno.json
├── main.ts                 # Main entry point
└── PLAN.md                # This file
```

## Key Implementation Details

### Timelock Configuration
```typescript
interface Timelocks {
  srcWithdrawal: number;      // 5 minutes (demo)
  srcPublicWithdrawal: number; // 10 minutes
  srcCancellation: number;     // 15 minutes
  srcPublicCancellation: number; // 20 minutes
  dstWithdrawal: number;       // 5 minutes
  dstCancellation: number;     // 15 minutes
}
```

### Order Immutables Structure
```typescript
interface Immutables {
  orderHash: `0x${string}`;
  hashlock: `0x${string}`;
  maker: Address;
  taker: Address;
  token: Address;
  amount: bigint;
  safetyDeposit: bigint;
  timelocks: Timelocks;
}
```

### Event Monitoring
- Use viem's `watchContractEvent` for real-time monitoring
- Implement reconnection logic for reliability
- Store order state in memory (can extend to persistent storage)

## Security Considerations

1. **Private Key Management**
   - Use environment variables for private keys
   - Never commit keys to version control

2. **Order Validation**
   - Verify all order parameters before execution
   - Check token balances and allowances
   - Validate timelocks are reasonable

3. **Error Recovery**
   - Implement proper error handling
   - Log all critical operations
   - Allow manual intervention for stuck orders

## Next Steps

1. Set up basic Deno project with viem
2. Implement order monitoring for Bob
3. Create simple order creation for Alice
4. Test basic swap flow
5. Add CLI interface
6. Extend with advanced features

## Notes

- This is a hackathon implementation - production usage requires audits
- Currently using mock tokens for testing
- Timelocks are shortened for demo purposes
- Safety deposits are minimal for testing