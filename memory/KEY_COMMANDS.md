# Key Commands Reference

## Order Creation (Alice)

### Create a Cross-Chain Swap Order
```bash
# Create order for 10 BMN tokens (mainnet)
deno task alice:create-order --amount 10 --token-a BMN --token-b BMN

# Create order for custom amount
deno task alice:create-order --amount 100 --token-a BMN --token-b BMN

# Create order (local testnet)
deno task alice:create-order --amount 10 --token-a TKA --token-b TKB
```

### List Active Orders
```bash
# Show all orders created by Alice
deno task alice:list-orders
```

### Withdraw from Order
```bash
# Withdraw funds after Bob fills the order (reveal secret)
deno task alice:withdraw --order-id 1

# Recover funds from expired order (after timeout)
deno task alice:withdraw --order-id 1 --expired
```

## Resolver Operations (Bob)

### Start the Resolver
```bash
# Start resolver in mainnet mode
deno task resolver:start

# Start resolver with custom monitoring interval
MONITORING_INTERVAL=5000 deno task resolver:start

# Start resolver in development mode (with file watching)
deno task dev
```

### Check Resolver Status
```bash
# Get current resolver status and statistics
deno task resolver:status
```

### Stop Resolver
```bash
# Gracefully stop the resolver
deno task resolver:stop
```

## Recovery Commands

### Withdraw Expired Order (Manual Recovery)
```bash
# Run the recovery script directly
deno run --allow-all scripts/recovery/withdraw-expired-order.ts --order-id 1

# Using Alice's withdraw task
deno task alice:withdraw --order-id 1
```

### Check Order Status
```bash
# Check specific order details
deno run --allow-all scripts/check-order-status.ts --order-id 1
```

## Testing Commands

### Run Complete Test Flow
```bash
# Run mainnet test flow
./scripts/test-flow.sh mainnet

# Run local testnet flow
./scripts/test-flow.sh local
```

### Run Unit Tests
```bash
# Run all tests
deno test

# Run specific test file
deno test src/resolver/resolver.test.ts

# Run tests with coverage
deno test --coverage
```

## Development Commands

### Start Development Mode
```bash
# Start with file watching and auto-reload
deno task dev

# Start with debug logging
DEBUG=* deno task dev
```

### Check Token Balances
```bash
# Check all account balances
deno run --allow-all scripts/check-balances.ts

# Check specific account
deno run --allow-all scripts/check-balances.ts --address 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

### Approve Tokens
```bash
# Manually approve tokens (if needed)
deno run --allow-all scripts/approve-tokens.ts --amount 1000
```

## Environment Setup

### Setup Environment Variables
```bash
# Copy example env and configure
cp .env.example .env

# Or use the setup script
./scripts/setup-env.sh
```

### Switch Networks
```bash
# For mainnet
export NETWORK_MODE=mainnet

# For local testnet
export NETWORK_MODE=local
```

## Debugging Commands

### Check Contract State
```bash
# Check escrow factory state
cast call $ESCROW_FACTORY_A_ADDR "orderCount()(uint256)" --rpc-url $CHAIN_A_RPC

# Check specific order
cast call $ESCROW_FACTORY_A_ADDR "orders(uint256)(address,address,uint256,bytes32,uint256,address)" 1 --rpc-url $CHAIN_A_RPC

# Check token balance
cast call $BMN_TOKEN_ADDR "balanceOf(address)(uint256)" $ALICE_ADDR --rpc-url $CHAIN_A_RPC
```

### Monitor Events
```bash
# Watch for order created events
cast events --rpc-url $CHAIN_A_RPC --address $ESCROW_FACTORY_A_ADDR "OrderCreated(uint256,address,address,uint256,bytes32,uint256)"

# Watch for withdrawals
cast events --rpc-url $CHAIN_B_RPC --address $ESCROW_FACTORY_B_ADDR "Withdrawn(address,uint256,bytes32)"
```

## Common Workflows

### Complete Order Flow (Manual)
```bash
# 1. Start resolver
deno task resolver:start

# 2. In another terminal, create order
deno task alice:create-order --amount 10 --token-a BMN --token-b BMN

# 3. Wait for resolver to fill order (watch logs)

# 4. Alice withdraws from destination
deno task alice:withdraw --order-id 1

# 5. Check final balances
deno run --allow-all scripts/check-balances.ts
```

### Recovery Flow
```bash
# 1. Check order status
deno task alice:list-orders

# 2. If order expired, withdraw
deno task alice:withdraw --order-id 1

# 3. Verify funds recovered
deno run --allow-all scripts/check-balances.ts
```

## Important Parameters

- **Security Deposit**: 0.00002 ETH (20000000000000 wei)
- **Source Timelock**: 20 minutes (1200 seconds)
- **Destination Timelock**: 5 minutes (300 seconds)
- **Monitoring Interval**: 10 seconds (10000 ms)
- **Profit Margin**: Configured in resolver (default 1%)

## Environment Variables

Key variables to set:
- `ALICE_PRIVATE_KEY`: Order creator's private key
- `BOB_PRIVATE_KEY`: Resolver's private key
- `CHAIN_A_RPC`: Base RPC URL
- `CHAIN_B_RPC`: Etherlink RPC URL
- `NETWORK_MODE`: "mainnet" or "local"