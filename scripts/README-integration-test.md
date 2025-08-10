# Bridge-Me-Not Integration Test Suite

This directory contains comprehensive integration tests for the Bridge-Me-Not
atomic swap protocol.

## Overview

The integration test suite validates the complete atomic swap flow:

1. Environment setup and verification
2. Resolver (Bob) startup and monitoring
3. Order creation by Alice with ETH safety deposits
4. Order discovery and destination escrow deployment by Bob
5. Alice's withdrawal revealing the secret
6. Bob's automatic claim from source escrow
7. Final state verification

## Test Scripts

### `integration-test-flow.ts`

The main integration test that orchestrates the complete atomic swap flow.

**Features:**

- Supports local, testnet, and mainnet environments
- Validates ETH safety deposits (0.00002 ETH)
- Monitors order progression through all states
- Verifies final token balances
- Provides detailed error reporting

**Usage:**

```bash
# Test on local chains
deno run --allow-all scripts/integration-test-flow.ts

# Test on mainnet with BMN token
deno run --allow-all scripts/integration-test-flow.ts --network mainnet --token-a BMN --token-b BMN

# Test with verbose output
deno run --allow-all scripts/integration-test-flow.ts --verbose
```

### `test-flow.sh`

Shell script that orchestrates the test environment and runs the integration
test.

**Features:**

- Checks prerequisites (deno, nc)
- Manages local chain startup/shutdown
- Verifies contract deployments
- Handles environment file selection
- Provides colored output for clarity

**Usage:**

```bash
# Run with default settings (local, TKA/TKB)
./scripts/test-flow.sh

# Test on mainnet with BMN
./scripts/test-flow.sh --network mainnet --token-a BMN --token-b BMN

# Enable verbose output
./scripts/test-flow.sh --verbose
```

### `setup-test-environment.ts`

Prepares the test environment before running integration tests.

**Features:**

- Verifies contract deployments on both chains
- Funds test accounts with ETH and tokens (local mode)
- Sets up token approvals for contracts
- Checks indexer connectivity
- Validates minimum balance requirements

**Usage:**

```bash
# Setup local test environment
deno run --allow-all scripts/setup-test-environment.ts --funding-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Setup mainnet environment (no funding)
deno run --allow-all scripts/setup-test-environment.ts --network mainnet --skip-funding
```

## Environment Requirements

### Local Testing

1. Start local chains:
   ```bash
   cd ../bmn-evm-contracts
   ./scripts/multi-chain-setup.sh
   ```

2. Deploy contracts (if not already deployed):
   ```bash
   cd ../bmn-evm-contracts
   forge script script/Deploy.s.sol --broadcast
   ```

3. Create `.env` file:
   ```bash
   cp .env.example .env
   # Edit .env with your test private keys
   ```

### Mainnet Testing

1. Create `.env.mainnet` file with your mainnet private keys
2. Ensure accounts have sufficient ETH and BMN tokens
3. Verify contracts are deployed on both Base and Etherlink

## Test Flow Details

### 1. Environment Setup

- Loads contract addresses from environment or deployment files
- Verifies all required contracts are deployed
- Checks account balances (ETH and tokens)
- Validates network connectivity

### 2. Resolver Startup

- Starts Bob's resolver in the background
- Waits for initialization
- Verifies resolver is monitoring for orders

### 3. Order Creation

- Alice creates a limit order with:
  - Token amount (e.g., 10 TKA/BMN)
  - ETH safety deposit (0.00002 ETH)
  - Secret/hashlock for atomicity
- Order is saved to state and file system

### 4. Order Discovery

- Resolver detects the new order
- Validates profitability
- Checks safety deposit
- Deploys destination escrow on target chain

### 5. Alice's Withdrawal

- Waits for destination escrow deployment
- Validates timelock has passed
- Reveals secret on-chain
- Claims tokens from destination escrow

### 6. Bob's Claim

- Monitors for secret reveal event
- Uses revealed secret to claim from source escrow
- Updates order status to completed

### 7. Final Verification

- Checks both orders show completed status
- Verifies token balances changed correctly
- Confirms atomic swap succeeded

## Key Safety Features

1. **ETH Safety Deposits**: Prevents griefing attacks
2. **Timelocks**: Ensures fair cancellation windows
3. **Hashlock Atomicity**: Guarantees all-or-nothing execution
4. **State Persistence**: Survives resolver restarts
5. **Multi-chain Support**: Works across any EVM chains

## Troubleshooting

### Common Issues

1. **"Contract addresses not configured"**
   - Ensure environment variables are set
   - Check deployment files exist in `deployments/`

2. **"Insufficient balance"**
   - Run `setup-test-environment.ts` with funding key
   - Ensure accounts have ETH for gas and safety deposits

3. **"Order not discovered"**
   - Verify resolver is running
   - Check resolver logs for errors
   - Ensure correct network mode is set

4. **"Timelock not passed"**
   - Wait for the required time (5-20 minutes)
   - Check order creation timestamp

### Debug Mode

Enable verbose output to see detailed progress:

```bash
./scripts/test-flow.sh --verbose
```

Check resolver logs:

```bash
tail -f logs/resolver.log
```

## CI/CD Integration

The integration test can be run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Integration Test
  run: |
    ./scripts/test-flow.sh --network testnet
```

## Progressive Testing Strategy

1. **Local Development**: Fast iteration with local chains
2. **Testnet Validation**: Real network conditions
3. **Mainnet Verification**: Final production testing

Always test in this order to minimize costs and risks.
