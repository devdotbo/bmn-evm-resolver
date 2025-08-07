# Unified Resolver Documentation

## Overview

The Unified Resolver is a mainnet-ready implementation that integrates:
- **PonderClient**: SQL over HTTP for indexer queries
- **SimpleLimitOrderProtocol**: For filling cross-chain atomic swap orders
- **SecretManager**: Local state management using Deno KV
- **Multi-chain support**: Base and Optimism mainnets

## Architecture

### Key Components

1. **Indexer Integration** (`PonderClient`)
   - Queries pending atomic swaps via SQL over HTTP
   - Monitors for new orders and withdrawals
   - Tracks swap status across chains

2. **Order Filling** (`SimpleLimitOrderProtocol`)
   - Fills orders through the limit order protocol instead of direct factory calls
   - Supports both Base and Optimism chains
   - Handles order signing and execution

3. **Local State** (`SecretManager`)
   - Stores revealed secrets locally using Deno KV
   - Tracks withdrawal status
   - Manages order processing state

## Contract Addresses

### Factory V2 (v2.1.0)
- **Address**: `0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A` (same on Base and Optimism)

### SimpleLimitOrderProtocol
- **Base**: `0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06`
- **Optimism**: `0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7`

## Configuration

### Environment Variables

```bash
# Required
RESOLVER_PRIVATE_KEY=0x...        # Resolver's private key

# Optional
ANKR_API_KEY=...                  # Ankr API key for RPC access
INDEXER_URL=http://localhost:42069 # Indexer endpoint
POLLING_INTERVAL=10000             # Polling interval in ms
MIN_PROFIT_BPS=50                  # Minimum profit in basis points (50 = 0.5%)
```

## Usage

### Running the Resolver

```bash
# Run with environment file
deno task resolver

# Or run directly with environment variables
RESOLVER_PRIVATE_KEY=0x... ANKR_API_KEY=... deno run --allow-all run-resolver.ts
```

### Testing Configuration

```bash
# Test resolver configuration and connectivity
deno task resolver:test

# Or run directly
deno run --allow-all test-resolver.ts
```

## Workflow

### 1. Order Discovery
```typescript
// The resolver monitors for pending atomic swaps
const pendingSwaps = await ponderClient.getPendingAtomicSwaps(resolverAddress);
```

### 2. Profitability Check
```typescript
// Calculates profit based on safety deposits
const profitBps = ((dstDeposit - srcDeposit) * 10000n) / srcDeposit;
if (profitBps >= minProfitBps) {
  // Order is profitable
}
```

### 3. Order Filling
```typescript
// Fill order through SimpleLimitOrderProtocol
await limitOrderProtocol.fillOrder({
  order: orderData,
  r: signature.r,
  vs: signature.vs,
  amount: fillAmount,
  takerTraits: 0n
});
```

### 4. Secret Management
```typescript
// Store revealed secrets locally
await secretManager.storeSecret({
  secret: revealedSecret,
  orderHash: orderHash,
  escrowAddress: escrowAddress,
  chainId: chainId
});
```

### 5. Withdrawal
```typescript
// Withdraw from source escrow using revealed secret
await escrowSrc.withdraw(secret);
```

## Features

### Simple & Functional
- No security monitoring or whitelist checks
- No emergency pause handling
- Focus on core functionality

### Mainnet Ready
- Uses v2.1.0 factory addresses
- Integrates with SimpleLimitOrderProtocol
- Supports Base and Optimism mainnets

### Efficient State Management
- Local Deno KV for secret storage
- Tracks processed orders to avoid duplicates
- Maintains withdrawal status

## Example Output

```
🚀 Starting unified resolver with address: 0x...
📊 SecretManager stats: {"total":0,"pending":0,"confirmed":0,"failed":0}
🔍 Querying pending atomic swaps for: 0x...
🎯 Found pending swap: 0x...
💰 Profit calculation: 75 bps (min: 50)
✅ Order is profitable, proceeding to fill
🔨 Filling order on chain 8453 via SimpleLimitOrderProtocol
📝 Fill order transaction sent: 0x...
✅ Order filled successfully in tx: 0x...
📍 Destination escrow created at: 0x...
```

## Profitability Settings

The resolver includes configurable profitability checks:

- **MIN_PROFIT_BPS**: Minimum profit in basis points
  - 50 = 0.5% (default)
  - 100 = 1%
  - 200 = 2%

Only orders that meet the minimum profit threshold will be filled.

## Error Handling

The resolver includes robust error handling:
- Graceful shutdown on SIGINT/SIGTERM
- Continues operation on individual order failures
- Logs all errors for debugging

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/your-org/bmn-evm-resolver
cd bmn-evm-resolver

# Install dependencies (automatic with Deno)
deno cache run-resolver.ts

# Run tests
deno task resolver:test

# Start resolver
deno task resolver
```

### Extending the Resolver

The resolver is designed to be extensible:

1. **Custom Profitability Logic**: Override `isProfitable()` method
2. **Additional Chain Support**: Add chain configurations in `constructor`
3. **Custom Order Selection**: Modify `processPendingOrders()` logic
4. **Enhanced Secret Management**: Extend `SecretManager` class

## Security Considerations

- **Private Key**: Keep `RESOLVER_PRIVATE_KEY` secure
- **API Keys**: Use dedicated API keys for production
- **Monitoring**: Implement external monitoring for production deployments
- **Rate Limiting**: Consider implementing rate limits for RPC calls

## Troubleshooting

### Common Issues

1. **"RESOLVER_PRIVATE_KEY not set"**
   - Set the environment variable with your resolver's private key

2. **"Failed to connect to indexer"**
   - Check that the indexer is running and accessible
   - Verify the INDEXER_URL is correct

3. **"Failed to connect to Base/Optimism RPC"**
   - Check your internet connection
   - Verify ANKR_API_KEY if using Ankr endpoints
   - Try using public RPC endpoints

4. **"Order not profitable"**
   - Adjust MIN_PROFIT_BPS to a lower value
   - Check that orders have sufficient safety deposits

## Support

For issues or questions:
- GitHub Issues: [Report bugs or feature requests]
- Documentation: [Full documentation]
- Discord: [Community support]