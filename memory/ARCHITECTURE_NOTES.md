# Architecture Notes - Bridge-Me-Not Atomic Swap Protocol

## Core Concept: Trustless Cross-Chain Atomic Swaps

The Bridge-Me-Not protocol enables trustless token swaps between two EVM chains without requiring a bridge or trusted intermediary. It uses hashlocked timelocked contracts (HTLCs) to ensure atomicity.

## Key Architectural Components

### 1. Smart Contracts

#### EscrowFactory
- **Purpose**: Deploys and manages individual escrow contracts
- **Key Functions**:
  - `createEscrowSrc()`: Creates source chain escrow (Alice's funds)
  - `createEscrowDst()`: Creates destination chain escrow (Bob's funds)
- **Critical Note**: This contract needs token approval, NOT LimitOrderProtocol

#### EscrowSrc (Source Chain Escrow)
- **Deployed by**: Alice (via EscrowFactory)
- **Holds**: Alice's tokens on the source chain
- **Unlock Conditions**:
  - Bob can claim with correct preimage (secret)
  - Alice can reclaim after timeout (20 minutes)
- **Security**: Longer timeout protects Alice

#### EscrowDst (Destination Chain Escrow)
- **Deployed by**: Bob (via EscrowFactory)
- **Holds**: Bob's tokens on the destination chain
- **Unlock Conditions**:
  - Alice can claim with correct preimage (reveals secret)
  - Bob can reclaim after timeout (5 minutes)
- **Security**: Shorter timeout protects Bob

#### LimitOrderProtocol
- **Purpose**: Order management and discovery
- **Functions**:
  - Stores order metadata
  - Emits events for order discovery
  - Does NOT handle tokens directly

### 2. Atomic Swap Flow

```
1. Order Creation (Alice)
   ├─> Generate secret and hashlock
   ├─> Approve tokens to EscrowFactory
   ├─> Deploy EscrowSrc with hashlock
   └─> Create order in LimitOrderProtocol

2. Order Discovery (Bob)
   ├─> Monitor LimitOrderProtocol events
   ├─> Evaluate order profitability
   └─> Decide to fill order

3. Order Filling (Bob)
   ├─> Approve tokens to EscrowFactory
   ├─> Deploy EscrowDst with same hashlock
   └─> Wait for Alice to reveal secret

4. Secret Revelation (Alice)
   ├─> Call withdraw on EscrowDst
   ├─> Reveals preimage (secret)
   └─> Claims Bob's tokens

5. Completion (Bob)
   ├─> Extract revealed secret from blockchain
   ├─> Call withdraw on EscrowSrc with secret
   └─> Claims Alice's tokens
```

### 3. Security Model

#### Hashlock Security
- **Secret Generation**: Alice generates a cryptographically secure random secret
- **Hashlock**: `keccak256(secret)` stored in both escrows
- **Atomic Property**: Same secret unlocks both escrows

#### Timelock Protection
- **Source Timeout** (20 min): Longer to protect Alice
  - Alice needs time to withdraw from destination
  - Prevents Bob from claiming and reclaiming
- **Destination Timeout** (5 min): Shorter to protect Bob
  - Bob needs to act quickly after Alice reveals
  - Limits Bob's capital lock-up time

#### Safety Deposit
- **Amount**: 0.00002 ETH
- **Purpose**: Prevent griefing attacks
- **Mechanism**: Alice loses deposit if she doesn't reveal secret

### 4. Contract Interactions

#### Token Approval Flow
```
Alice's Token A -> approve() -> EscrowFactory A
                                      |
                                      v
                               createEscrowSrc()
                                      |
                                      v
                                 EscrowSrc
                                (holds tokens)
```

**Critical**: Tokens must be approved to EscrowFactory, not LimitOrderProtocol!

#### Event Flow
```
LimitOrderProtocol -> OrderCreated event
                           |
                           v
                    Bob's Resolver
                    (monitors events)
                           |
                           v
                    EscrowFactory B
                    (Bob deploys EscrowDst)
```

### 5. Resolver Architecture

#### Components
1. **Event Monitor**: Watches for OrderCreated events
2. **Profitability Calculator**: Evaluates orders
3. **Order Filler**: Deploys destination escrows
4. **Secret Extractor**: Monitors for revealed secrets
5. **Claim Executor**: Claims source escrow funds

#### Key Design Decisions
- **Stateless Operation**: Can restart without losing state
- **Event-Driven**: Reacts to blockchain events
- **Safety Margins**: Accounts for gas costs and timing

### 6. Why This Architecture?

#### Why Separate Escrows?
- **Isolation**: Each swap is independent
- **Simplicity**: Clear ownership and state
- **Gas Efficiency**: Only deploy what's needed

#### Why Factory Pattern?
- **Consistency**: Ensures correct escrow deployment
- **Permission**: Factory has approval to move tokens
- **Tracking**: Centralized order management

#### Why Two Timelocks?
- **Game Theory**: Prevents either party from griefing
- **Capital Efficiency**: Bob's funds locked for less time
- **Safety**: Sufficient time for on-chain operations

### 7. Common Misconceptions

1. **"LimitOrderProtocol handles tokens"**
   - FALSE: It only manages order metadata
   - EscrowFactory handles all token operations

2. **"Timeouts should be equal"**
   - FALSE: Asymmetric timeouts protect both parties
   - Source > Destination is critical

3. **"Secret can be reused"**
   - FALSE: Each order needs a unique secret
   - Reuse would compromise security

### 8. Integration Points

#### For Order Creators (Alice)
1. Generate secure random secret
2. Approve tokens to EscrowFactory
3. Call createOrder with proper parameters
4. Monitor destination escrow
5. Withdraw when Bob fills

#### For Resolvers (Bob)
1. Monitor OrderCreated events
2. Evaluate profitability
3. Deploy destination escrow
4. Wait for secret revelation
5. Claim source escrow

### 9. Failure Modes and Recovery

#### Order Not Filled
- **Cause**: No resolver found it profitable
- **Recovery**: Alice withdraws after source timeout

#### Alice Doesn't Reveal
- **Cause**: Alice changes mind or goes offline
- **Recovery**: Bob reclaims after destination timeout
- **Penalty**: Alice loses safety deposit

#### Bob Doesn't Claim
- **Cause**: Bob goes offline after Alice reveals
- **Recovery**: Bob loses funds (his fault)
- **Prevention**: Automated monitoring

### 10. Gas Optimization

- **Minimal Storage**: Only essential data on-chain
- **Event-Driven**: Use logs instead of storage where possible
- **Batch Operations**: Multiple orders can be processed together
- **Efficient Encoding**: Packed structs and parameters