# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bridge-Me-Not Resolver - A cross-chain atomic swap resolver implementation using viem and Deno for the 1inch cross-chain-swap protocol.

## Key Commands

### Development Tasks
```bash
# Start the resolver (Bob - liquidity provider)
deno task resolver:start

# Check resolver status
deno task resolver:status

# Create an order (Alice - test client)
deno task alice:create-order --amount 100 --token-a TKA --token-b TKB

# List Alice's orders
deno task alice:list-orders

# Withdraw from an order
deno task alice:withdraw --order-id <id>

# Development mode with file watching
deno task dev
```

### Before Running
1. Start the EVM chains in the bmn-evm-contracts directory:
   ```bash
   ./scripts/multi-chain-setup.sh
   ```
2. Chains run on:
   - Chain A: http://localhost:8545 (ID: 1337)
   - Chain B: http://localhost:8546 (ID: 1338)

## Architecture Overview

The system implements a trustless cross-chain swap protocol with two main actors:

### Components
- **Bob (Resolver)**: Liquidity provider that monitors orders, deploys destination escrows, and executes swaps
- **Alice (Test Client)**: Creates orders and withdraws funds by revealing secrets

### Flow
1. Alice creates an order with a hashlock on the source chain
2. Bob monitors for profitable orders and deploys a matching escrow on the destination chain
3. Alice withdraws from the destination escrow, revealing the secret
4. Bob uses the revealed secret to claim funds from the source escrow

### Contract Interaction
The resolver interacts with Bridge-Me-Not EVM contracts:
- `EscrowFactory`: Deploys escrow contracts on both chains
- `EscrowSrc`: Source chain escrow holding Alice's tokens
- `EscrowDst`: Destination chain escrow holding Bob's tokens
- `LimitOrderProtocol`: Manages order creation on source chain

### Key Implementation Files
- `src/resolver/`: Bob's monitoring and execution logic
- `src/alice/`: Alice's order creation and withdrawal logic
- `src/config/chains.ts`: Chain configurations and test accounts
- `abis/`: Contract ABIs from bmn-evm-contracts

### Security Model
- Uses hashlocks for atomic swaps (secret reveal mechanism)
- Timelocks ensure funds can be recovered if counterparty fails
- Safety deposits protect against griefing attacks

## Important Notes

- Uses Anvil test accounts with hardcoded private keys (only for local development)
- Timelocks are shortened for demo purposes (5-20 minutes)
- Currently configured for mock tokens (TKA, TKB) on local test chains