# Bridge-Me-Not Resolver

Cross-chain atomic swap resolver implementation using viem and Deno for the 1inch cross-chain-swap protocol. Features real-time WebSocket monitoring for events and reliable HTTP transport for transaction execution.

## Quick Start

### Prerequisites

- Deno runtime installed
- Node.js (for running Anvil chains)
- bmn-evm-contracts deployed (see deployment logs above)

### 1. Setup Environment

```bash
# Automatically populate .env from deployment files
./scripts/setup-env.sh

# Or manually copy and edit .env.example
cp .env.example .env
```

### 2. Start the Chains

In the bmn-evm-contracts directory:
```bash
./scripts/multi-chain-setup.sh
```

Chains will run on:
- Chain A: http://localhost:8545 (ID: 1337)
- Chain B: http://localhost:8546 (ID: 1338)

### 3. Run Complete Test Flow

```bash
# Automated end-to-end test
./scripts/test-flow.sh
```

Or run components individually:

```bash
# Start the resolver (Bob) with environment checks
./scripts/start-resolver.sh

# In another terminal, run Alice's swap
./scripts/alice-swap.sh --amount 100 --auto
```

## Available Commands

### Resolver (Bob - Liquidity Provider)
```bash
deno task resolver:start    # Start the resolver with WebSocket monitoring
deno task resolver:status   # Check resolver status and statistics
```

### Alice (Test Client)
```bash
deno task alice:create-order --amount 100 --token-a TKA --token-b TKB
deno task alice:list-orders                      # List all orders
deno task alice:withdraw --order-id <order-id>   # Withdraw from escrow
```

### Helper Scripts
```bash
./scripts/setup-env.sh      # Setup environment from deployments
./scripts/test-flow.sh      # Run complete test flow
./scripts/start-resolver.sh # Start resolver with checks
./scripts/alice-swap.sh     # Alice's complete swap flow
```

## Architecture

### Components
- **Resolver (Bob)**: Monitors orders, deploys escrows, executes swaps
- **Alice Client**: Creates orders, withdraws funds, reveals secrets

### Transport Strategy
- **WebSocket**: Real-time event monitoring for new orders and withdrawals
- **HTTP**: Reliable transaction execution and state queries

### Security Model
- Hashlock-based atomic swaps ensure trustless execution
- Timelocks protect funds if counterparty fails
- Safety deposits prevent griefing attacks

## Project Structure

```
├── src/
│   ├── resolver/        # Bob's resolver implementation
│   │   ├── index.ts     # Main resolver entry point
│   │   ├── monitor.ts   # WebSocket event monitoring
│   │   ├── executor.ts  # Transaction execution
│   │   ├── state.ts     # Order state management
│   │   └── profitability.ts # Profit calculations
│   ├── alice/           # Alice's test client
│   │   ├── create-order.ts  # Order creation
│   │   ├── withdraw.ts      # Secret reveal & withdrawal
│   │   └── state.ts         # Client state management
│   ├── config/          # Chain and contract configurations
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utility functions
├── scripts/             # Helper scripts for testing
├── deployments/         # Contract deployment info
├── abis/               # Contract ABIs
└── deno.json           # Deno configuration
```

## Configuration

### Environment Variables

Required environment variables (see `.env.example`):
- `RESOLVER_PRIVATE_KEY` - Bob's private key
- `ALICE_PRIVATE_KEY` - Alice's private key
- `CHAIN_A_ESCROW_FACTORY` - Factory contract on Chain A
- `CHAIN_A_LIMIT_ORDER_PROTOCOL` - Order protocol on Chain A
- `CHAIN_B_ESCROW_FACTORY` - Factory contract on Chain B
- `CHAIN_B_LIMIT_ORDER_PROTOCOL` - Order protocol on Chain B
- Token addresses for both chains

### Contract Loading Priority

1. Environment variables (highest priority)
2. Deployment JSON files in `deployments/`
3. Hardcoded placeholders (fallback)

## Development

### Running in Development Mode
```bash
deno task dev
```

### State Management

- Resolver state: `resolver-state.json`
- Alice state: `alice-state.json`

Both files are automatically created and updated during execution.

### Troubleshooting

1. **Chains not running**: Ensure Anvil chains are started in bmn-evm-contracts
2. **Contract not found**: Run `./scripts/setup-env.sh` to load addresses
3. **WebSocket errors**: Falls back to HTTP polling automatically
4. **State conflicts**: Delete state JSON files to start fresh

## Documentation

- [PLAN.md](./PLAN.md) - Detailed implementation plan
- [CLAUDE.md](./CLAUDE.md) - Development guidance for Claude Code

## Dependencies

- Deno runtime (v1.37+)
- viem for blockchain interactions
- Local Anvil chains on ports 8545 and 8546
- Deployed Bridge-Me-Not contracts