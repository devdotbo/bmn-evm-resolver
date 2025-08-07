# Atomic Swap Architecture

## Overview

A complete cross-chain atomic swap system that enables trustless token exchanges between different EVM chains without intermediaries.

## Core Components

### 1. Smart Contracts
- **HTLCEscrow**: Hash Time-Locked Contract for each chain
- **TokenWrapper**: Interface for ERC20 token interactions
- **Factory**: Deploy escrows with deterministic addresses

### 2. Participants
- **Alice (Maker)**: Initiates the swap, locks tokens on source chain
- **Bob (Taker/Resolver)**: Accepts the swap, locks tokens on destination chain

### 3. Infrastructure
- **Event Monitor**: Watches for on-chain events
- **State Manager**: Tracks swap states and secrets
- **Network Manager**: Handles multi-chain connections

## System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        ATOMIC SWAP FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Chain A (Base)                    Chain B (Optimism)          │
│  ┌─────────────┐                   ┌─────────────┐            │
│  │   Alice     │                   │    Bob      │            │
│  └──────┬──────┘                   └──────┬──────┘            │
│         │                                  │                    │
│         ▼                                  │                    │
│  1. Generate Secret                        │                    │
│     & Hashlock                             │                    │
│         │                                  │                    │
│         ▼                                  │                    │
│  2. Deploy HTLC_A ────────Broadcast───────▶│                    │
│     Lock 100 USDC                          │                    │
│     Hashlock: H(s)                         ▼                    │
│         │                           3. See HTLC_A               │
│         │                              Verify terms             │
│         │                                  │                    │
│         │                                  ▼                    │
│         │                           4. Deploy HTLC_B            │
│         │◀────────Broadcast────────   Lock 100 USDT            │
│         │                              Hashlock: H(s)           │
│         ▼                                  │                    │
│  5. See HTLC_B                             │                    │
│     Verify amount                          │                    │
│         │                                  │                    │
│         ▼                                  │                    │
│  6. Withdraw HTLC_B                        │                    │
│     Reveal Secret s ──────Public──────────▶│                    │
│     Get 100 USDT                           ▼                    │
│         │                           7. See Secret s             │
│         │                              Withdraw HTLC_A          │
│         │                              Get 100 USDC            │
│         ▼                                  ▼                    │
│    ✅ Success                         ✅ Success               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Properties

### Atomicity
- Either both parties get their tokens, or neither does
- No partial execution possible

### Trustlessness
- No third party required
- Smart contracts enforce the rules

### Time-bounded
- Timeouts prevent funds being locked forever
- Alice timeout > Bob timeout (prevents race conditions)

## State Transitions

```
INITIALIZED → ALICE_LOCKED → BOB_LOCKED → ALICE_WITHDRAWN → BOB_WITHDRAWN → COMPLETED
                    ↓              ↓              ↓                ↓
                 TIMEOUT       TIMEOUT       REFUNDED         REFUNDED
```

## Data Structures

### Swap Order
```typescript
interface SwapOrder {
  id: string;                    // Unique identifier
  maker: Address;                 // Alice's address
  taker?: Address;                // Bob's address (optional initially)
  
  // Source chain details
  srcChain: ChainId;
  srcToken: Address;
  srcAmount: BigNumber;
  srcEscrow?: Address;            // Deployed escrow address
  
  // Destination chain details
  dstChain: ChainId;
  dstToken: Address;
  dstAmount: BigNumber;
  dstEscrow?: Address;            // Deployed escrow address
  
  // HTLC parameters
  hashlock: bytes32;              // Hash of the secret
  secret?: bytes32;               // Revealed after withdrawal
  
  // Timeouts (timestamps)
  aliceTimeout: number;           // When Alice can refund
  bobTimeout: number;             // When Bob can refund
  
  // Status tracking
  status: SwapStatus;
  createdAt: number;
  completedAt?: number;
}
```

### HTLC State
```typescript
interface HTLCState {
  sender: Address;
  receiver: Address;
  token: Address;
  amount: BigNumber;
  hashlock: bytes32;
  timeout: number;
  withdrawn: boolean;
  refunded: boolean;
}
```

## Network Architecture

### Multi-chain Setup
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Base RPC   │     │ Optimism RPC │     │ Arbitrum RPC │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                           │
                    ┌──────▼───────┐
                    │ Network       │
                    │ Manager       │
                    └──────┬───────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
┌──────▼─────┐     ┌───────▼──────┐    ┌──────▼─────┐
│   Alice    │     │   Monitor    │    │    Bob     │
│   Client   │     │   Service    │    │   Client   │
└────────────┘     └──────────────┘    └────────────┘
```

## Event System

### Critical Events to Monitor
1. **HTLCCreated**: New escrow deployed
2. **HTLCWithdrawn**: Secret revealed
3. **HTLCRefunded**: Timeout reached
4. **TokenTransfer**: Track token movements

### Event Processing Flow
```
Event Emission → Event Capture → Validation → State Update → Action Trigger
```

## Error Handling

### Failure Scenarios
1. **Bob doesn't respond**: Alice refunds after timeout
2. **Alice doesn't withdraw**: Bob refunds after his timeout
3. **Network issues**: Retry mechanisms with exponential backoff
4. **Insufficient funds**: Pre-flight checks before locking
5. **Secret leak**: Bob must act quickly once secret is known

## Gas Optimization

### Strategies
1. Use CREATE2 for deterministic addresses
2. Pack struct data efficiently
3. Minimize storage operations
4. Batch operations where possible
5. Use events instead of storage for logs

## Next Steps

See the following documents for detailed specifications:
- [02-SMART-CONTRACTS.md](./02-SMART-CONTRACTS.md) - Contract specifications
- [03-ALICE-FLOW.md](./03-ALICE-FLOW.md) - Maker implementation
- [04-BOB-FLOW.md](./04-BOB-FLOW.md) - Taker implementation
- [05-SECURITY.md](./05-SECURITY.md) - Security considerations
- [06-IMPLEMENTATION-ROADMAP.md](./06-IMPLEMENTATION-ROADMAP.md) - Development plan