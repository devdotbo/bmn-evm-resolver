# Bridge-Me-Not Resolver

Cross-chain atomic swap resolver implementation using viem and Deno.

## Quick Start

1. **Start the EVM chains** (in bmn-evm-contracts directory):
   ```bash
   ./scripts/multi-chain-setup.sh
   ```

2. **Start the resolver (Bob)**:
   ```bash
   deno task resolver:start
   ```

3. **Create an order (Alice)**:
   ```bash
   deno task alice:create-order --amount 100 --token-a TKA --token-b TKB
   ```

## Project Structure

- `src/resolver/` - Bob's resolver implementation
- `src/alice/` - Alice's test client implementation
- `src/config/` - Chain and contract configurations
- `abis/` - Contract ABIs from bmn-evm-contracts
- `PLAN.md` - Detailed implementation plan

## Development

See [PLAN.md](./PLAN.md) for the detailed implementation plan.

## Dependencies

- Deno runtime
- viem for blockchain interactions
- Local Anvil chains on ports 8545 and 8546