# Bridge-Me-Not EVM Resolver Architecture

## System Overview

Bridge-Me-Not is a cross-chain atomic swap system enabling trustless token
exchanges between Base and Optimism networks. The system uses Hash Time-Locked
Contracts (HTLCs) with EIP-712 signed limit orders to ensure atomic execution
without intermediary trust.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CROSS-CHAIN FLOW                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  BASE NETWORK                          OPTIMISM NETWORK                 │
│  ┌─────────────┐                       ┌─────────────┐                 │
│  │    Alice    │                       │   Resolver  │                 │
│  └──────┬──────┘                       └──────┬──────┘                 │
│         │                                      │                        │
│         ▼                                      ▼                        │
│  ┌──────────────────┐            ┌──────────────────┐                 │
│  │SimpleLimitOrder  │            │SimpleLimitOrder  │                 │
│  │   Protocol       │            │   Protocol       │                 │
│  └────────┬─────────┘            └────────┬─────────┘                 │
│           │                                │                           │
│           ▼                                ▼                           │
│  ┌──────────────────────────────────────────────────┐                 │
│  │      SimplifiedEscrowFactory v2.2.0              │                 │
│  │              (Same address both chains)          │                 │
│  │   Triggers PostInteraction with bits 249/251     │                 │
│  └────────┬──────────────────────────┬──────────────┘                 │
│           │                          │                                 │
│           ▼                          ▼                                 │
│    ┌──────────┐              ┌──────────┐                            │
│    │ Escrow A │◄────HTLC────►│ Escrow B │                            │
│    └──────────┘              └──────────┘                            │
│      (Atomic)                  (Atomic)                               │
│                                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│                         MONITORING LAYER                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────┐                  │
│  │                 Ponder Indexer                   │                  │
│  │  - Monitors blockchain events                    │                  │
│  │  - Indexes escrow creations                      │                  │
│  │  - Tracks order states                           │                  │
│  │  - SQL over HTTP API                            │                  │
│  └─────────────────────────────────────────────────┘                  │
│                           ▲                                            │
│                           │ Query                                      │
│                           │                                            │
│  ┌─────────────────────────────────────────────────┐                  │
│  │             UnifiedResolver Service              │                  │
│  │  - Monitors profitable orders                    │                  │
│  │  - Executes atomic fills                         │                  │
│  │  - Manages secret reveals                        │                  │
│  └─────────────────────────────────────────────────┘                  │
│                                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### 1. LimitOrderAlice

**Purpose**: Creates and signs cross-chain limit orders using EIP-712 standard.

**Key Features**:

- Generates cryptographically secure secrets for HTLC
- Creates EIP-712 typed data structures for order validation
- Includes factory `postInteraction` with bits 249/251 for atomic escrow
  creation
- Properly formats extension with offset-based structure
- Includes extension hash in salt (lower 160 bits)
- Supports both market making and single order modes

**Location**: `src/alice/mainnet-alice.ts`

### 2. SimpleLimitOrderProtocol

**Purpose**: On-chain protocol for executing atomic swaps with limit order
semantics.

**Key Features**:

- Validates EIP-712 signatures
- Executes token swaps atomically
- Triggers escrow creation via `postInteraction` using bits 249 and 251
- Ensures order uniqueness via nonces
- Properly formatted extension hash in salt (lower 160 bits)

**Deployment**:

- Base: `0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06`
- Optimism: `0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7`

### 3. SimplifiedEscrowFactory v2.2.0

**Purpose**: Creates and manages HTLC escrows for cross-chain atomic swaps with
PostInteraction support.

**Key Features**:

- Atomic escrow creation via PostInteraction callback
- Uses bits 249 and 251 for proper 1inch protocol integration
- Deterministic escrow address generation
- Time-locked fund protection
- Hash-based secret reveals
- Emergency withdrawal after timeout
- Whitelisted resolver support

**Deployment**: `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68`

- Deployed at same address on both Base and Optimism
- Version: 2.2.0
- Implements IPostInteraction interface

### 4. PonderClient

**Purpose**: Provides SQL over HTTP interface to query indexed blockchain data.

**Key Features**:

- Real-time event indexing
- SQL query interface
- Escrow state tracking
- Order history management

**Location**: Integrated in `src/resolver/unified-resolver.ts`

### 5. UnifiedResolver

**Purpose**: Automated service that monitors and fills profitable cross-chain
orders.

**Key Features**:

- Continuous order monitoring
- Profitability calculation
- Atomic order execution
- Secret management and reveal timing
- Multi-wallet support for parallelization

**Location**: `src/resolver/unified-resolver.ts`

### 6. SecretManager

**Purpose**: Local state management for secrets and order tracking.

**Key Features**:

- Deno KV-based persistent storage
- Secret lifecycle management
- Order state tracking
- Automatic cleanup of expired data

**Location**: `src/state/secret-manager.ts`

## Contract Addresses (Mainnet)

### Core Contracts

| Contract                       | Base                                         | Optimism                                     |
| ------------------------------ | -------------------------------------------- | -------------------------------------------- |
| SimplifiedEscrowFactory v2.2.0 | `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68` | `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68` |
| SimpleLimitOrderProtocol       | `0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06` | `0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7` |
| BMN Token                      | `0x8287CD2aC7E227D9D927F998EB600a0683a832A1` | `0x8287CD2aC7E227D9D927F998EB600a0683a832A1` |

### Token Addresses

| Token | Base                                         | Optimism                                     |
| ----- | -------------------------------------------- | -------------------------------------------- |
| USDC  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |
| WETH  | `0x4200000000000000000000000000000000000006` | `0x4200000000000000000000000000000000000006` |

## Order Flow Sequence

### Phase 1: Order Creation

1. **Alice initializes** with wallet and RPC endpoints
2. **Generate secret** using cryptographically secure random bytes
3. **Calculate hash** of the secret for HTLC
4. **Create order** with:
   - Token pairs and amounts
   - Maker/taker addresses
   - Secret hash
   - Expiry times
   - PostInteraction extension with factory address
   - Proper bit flags (249/251) for atomic execution
5. **Sign order** using EIP-712 standard
   - Salt includes extension hash for PostInteraction
6. **Store order** in local state with secret

### Phase 2: Order Discovery

1. **Resolver queries** indexer for new escrows
2. **Filter orders** by:
   - Token pairs supported
   - Profitability threshold
   - Time remaining
3. **Validate orders** checking:
   - Signature validity
   - Token balances
   - Approval states

### Phase 3: Order Execution

1. **Resolver fills order** on destination chain:
   ```
   SimpleLimitOrderProtocol.fillOrder() →
   PostInteraction triggered (bits 249/251) →
   Factory.postInteraction() called atomically →
   Factory.deployEscrow() →
   Escrow B created with funds locked
   ```

   **PostInteraction Flow Details**:
   - Bit 249: Enable PostInteraction for maker
   - Bit 251: Enable PostInteraction for resolver
   - Extension format: offset-based with factory address and escrow params
   - Salt contains extension hash in lower 160 bits

2. **Alice detects** Escrow B creation via monitoring

3. **Alice reveals secret** to Escrow B:
   ```
   Escrow B.withdraw(secret) →
   Funds released to Alice
   ```

4. **Resolver uses secret** to withdraw from Escrow A:
   ```
   Escrow A.withdraw(secret) →
   Funds released to Resolver
   ```

### Phase 4: Completion

1. **Both escrows settled** atomically
2. **Order marked complete** in indexer
3. **State cleaned up** in SecretManager

### Failure Scenarios

- **No fill**: After timeout, Alice can cancel and recover funds
- **Partial execution**: If only one escrow created, timeout allows withdrawal
- **Secret not revealed**: Both parties can withdraw after timeout

## Running Instructions

### Prerequisites

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Clone repository
git clone https://github.com/your-org/bmn-evm-resolver
cd bmn-evm-resolver
```

### Environment Configuration

Create `.env` file:

```bash
# RPC Endpoints
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_KEY

# Wallet Configuration
ALICE_PRIVATE_KEY=0x...  # Order creator wallet
RESOLVER_PRIVATE_KEY=0x...  # Order filler wallet

# Indexer Configuration
INDEXER_URL=https://your-indexer.com
INDEXER_API_KEY=your_api_key

# Optional: Telegram Notifications
TELEGRAM_BOT_TOKEN=bot_token
TELEGRAM_CHAT_ID=chat_id
```

### Running Alice (Order Creator)

```bash
# Single order mode
deno run --allow-all alice-mainnet.ts \
  --maker-amount 100 \
  --taker-amount 99.5 \
  --source-chain base \
  --destination-chain optimism

# Market maker mode (continuous orders)
deno run --allow-all alice-mainnet.ts \
  --market-maker \
  --spread 0.005 \
  --order-size 100 \
  --interval 300
```

### Running Resolver (Background Service)

```bash
# Start resolver service
deno run --allow-all src/resolver/unified-resolver.ts

# With custom configuration
deno run --allow-all src/resolver/unified-resolver.ts \
  --min-profit 0.001 \
  --max-gas-price 50 \
  --poll-interval 10000
```

### Production Deployment

For production, use process manager:

```bash
# Install PM2
npm install -g pm2

# Start services
pm2 start --interpreter="deno" --interpreter-args="run --allow-all" alice-mainnet.ts --name alice
pm2 start --interpreter="deno" --interpreter-args="run --allow-all" src/resolver/unified-resolver.ts --name resolver

# Monitor
pm2 logs
pm2 status
```

### Docker Deployment

```dockerfile
FROM denoland/deno:1.40.0

WORKDIR /app
COPY . .

RUN deno cache src/resolver/unified-resolver.ts

CMD ["run", "--allow-all", "src/resolver/unified-resolver.ts"]
```

```yaml
# docker-compose.yml
version: "3.8"
services:
  resolver:
    build: .
    env_file: .env
    restart: unless-stopped
    volumes:
      - ./data:/app/data
```

## Security Considerations

1. **Private Key Management**
   - Never commit private keys
   - Use environment variables
   - Consider hardware wallets for production

2. **Secret Generation**
   - Use cryptographically secure random sources
   - Never reuse secrets across orders
   - Store secrets encrypted at rest

3. **Order Validation**
   - Always verify signatures on-chain
   - Check token approvals before execution
   - Implement slippage protection

4. **Monitoring**
   - Track gas prices to avoid overpaying
   - Monitor for failed transactions
   - Alert on unusual patterns

## Performance Optimization

1. **Parallel Processing**
   - Use multiple resolver wallets
   - Batch RPC calls where possible
   - Implement connection pooling

2. **Caching Strategy**
   - Cache token metadata
   - Store recent gas prices
   - Maintain order book locally

3. **Resource Management**
   - Implement circuit breakers
   - Rate limit external API calls
   - Clean up expired state regularly

## Troubleshooting

### Common Issues

1. **Order not filling**
   - Check token balances
   - Verify approvals
   - Ensure sufficient gas
   - Check profitability settings

2. **Secret reveal failures**
   - Verify correct secret hash
   - Check escrow timeout
   - Ensure proper chain selection

3. **Indexer connection issues**
   - Verify API credentials
   - Check network connectivity
   - Monitor rate limits

### Debug Commands

```bash
# Check order status
deno run --allow-all scripts/check-order.ts --order-hash 0x...

# Verify escrow state
deno run --allow-all scripts/check-escrow.ts --escrow-address 0x...

# Test secret reveal
deno run --allow-all scripts/test-reveal.ts --secret 0x... --escrow 0x...
```

## Support and Resources

- **Documentation**: https://docs.bridge-me-not.com
- **Discord**: https://discord.gg/bridge-me-not
- **GitHub Issues**: https://github.com/your-org/bmn-evm-resolver/issues

---

Last Updated: January 2025 Version: 2.2.0

## PostInteraction Integration

### How PostInteraction Works

The PostInteraction mechanism enables atomic escrow creation immediately after a
limit order fill:

1. **Order Creation**: Alice creates an order with:
   - Bits 249 and 251 set in the `makerTraits` field
   - Extension containing factory address and escrow parameters
   - Salt with extension hash in lower 160 bits

2. **Order Filling**: When resolver fills the order:
   ```solidity
   // SimpleLimitOrderProtocol detects bits 249/251
   if (postInteractionEnabled) {
       // Calls factory.postInteraction() atomically
       IPostInteraction(extension.factory).postInteraction(
           order,
           extension.data,
           makingAmount,
           takingAmount,
           remainingAmount,
           extraData
       );
   }
   ```

3. **Atomic Escrow Creation**: Factory creates escrow in same transaction:
   - No separate transaction needed
   - Funds locked immediately
   - Eliminates front-running risks

### Extension Format

```typescript
// Extension structure for PostInteraction
const extension = {
  // Offset to factory address (32 bytes)
  offset: 32,
  // Factory address (20 bytes)
  factory: "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68",
  // Escrow parameters
  data: {
    hashlock: bytes32,
    timelock: uint256,
    tokenA: address,
    tokenB: address,
    // ... other params
  },
};
```

### Resolver Whitelist

The v2.2.0 factory includes a whitelist mechanism:

- Only whitelisted resolvers can trigger PostInteraction
- Current whitelisted resolver: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
- Prevents unauthorized escrow creation
- Maintains system security
