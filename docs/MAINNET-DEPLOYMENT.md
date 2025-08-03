# Mainnet Deployment Guide

This guide covers deploying and operating the Bridge-Me-Not resolver on Base and Etherlink mainnet.

## Prerequisites

- Funded accounts on both Base and Etherlink mainnet
- BMN tokens for liquidity provision
- ETH for gas fees on both chains
- Access to RPC endpoints (public or private)

## Environment Setup

1. **Copy and configure environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Configure mainnet settings in `.env`**:
   ```env
   # Network Mode
   NETWORK_MODE=mainnet
   
   # Use test factory for initial testing
   USE_TEST_FACTORY=true
   
   # Base Mainnet
   BASE_RPC_URL=https://mainnet.base.org
   BASE_WS_URL=wss://base-mainnet.g.alchemy.com/v2/{your-api-key}
   
   # Etherlink Mainnet
   ETHERLINK_RPC_URL=https://node.mainnet.etherlink.com
   ETHERLINK_WS_URL=wss://node.mainnet.etherlink.com
   
   # Private Keys (NEVER commit!)
   RESOLVER_PRIVATE_KEY=0x...
   ALICE_PRIVATE_KEY=0x... # For testing
   ```

## Deployment Steps

### 1. Check Account Balances

Ensure your resolver account has sufficient funds:

```bash
deno task mainnet:check-balances
```

Required balances:
- ETH: ~0.1 ETH on each chain for gas
- BMN: Amount depends on expected order volume

### 2. Start the Resolver

For mainnet operations:

```bash
deno task mainnet:resolver
```

Or using the script directly:

```bash
./scripts/run-mainnet-resolver.sh
```

### 3. Monitor Operations

The resolver will:
- Monitor Base for new orders (normal flow)
- Monitor Etherlink for new orders (reverse flow)
- Execute profitable swaps automatically
- Handle timelock windows (5-15 minutes)

## Testing on Mainnet

### Create Test Orders

**Base → Etherlink**:
```bash
deno task mainnet:create-order
```

**Etherlink → Base**:
```bash
deno task mainnet:create-order-reverse
```

### Monitor Logs

Enable detailed logging:
```bash
LOG_LEVEL=DEBUG LOG_FILE=./logs/mainnet.log deno task mainnet:resolver
```

## Production Configuration

### 1. Factory Addresses

Current deployments:
- **CrossChainEscrowFactory**: `0xc72ed1E8a0649e51Cd046a0FfccC8f8c0bf385Fa`
- **BMN Token**: `0x8287CD2aC7E227D9D927F998EB600a0683a832A1`

### 2. Timelock Windows

Production timelocks (in seconds):
- **Source Withdrawal**: 0-300s (5 min) - Taker only
- **Source Public Withdrawal**: 300-600s (5-10 min) - Anyone
- **Source Cancellation**: 600-900s (10-15 min) - Maker only
- **Source Public Cancellation**: 900s+ (15 min+) - Anyone
- **Destination**: Similar structure with offsets

### 3. Gas Configuration

Mainnet gas settings are automatically applied:
- Higher gas buffers (50-100%)
- Retry logic for network congestion
- Automatic gas price adjustments

## Security Considerations

1. **Private Key Management**:
   - Use hardware wallets or secure key management
   - Never expose keys in logs or commits
   - Rotate keys periodically

2. **Monitoring**:
   - Set up alerts for failed transactions
   - Monitor account balances
   - Track gas usage and costs

3. **Risk Management**:
   - Start with small order amounts
   - Monitor profitability closely
   - Have emergency shutdown procedures

## Troubleshooting

### Common Issues

1. **"Insufficient gas" errors**:
   - Check ETH balance on both chains
   - Increase gas multipliers in mainnet config

2. **"Network congestion" errors**:
   - Resolver automatically retries with higher gas
   - Check network status on explorers

3. **"Timelock expired" errors**:
   - Ensure resolver responds within 5-minute windows
   - Check system time synchronization

### Debug Mode

Enable comprehensive debugging:
```bash
DEBUG=true LOG_LEVEL=TRACE deno task mainnet:resolver
```

## Monitoring Tools

### Balance Monitoring
```bash
# Check balances periodically
watch -n 60 'deno task mainnet:check-balances'
```

### Order Status
```bash
# Check resolver status
deno task resolver:status
```

### Log Analysis
```bash
# Follow logs
tail -f ./logs/mainnet.log | grep -E "(ERROR|Order completed)"
```

## Emergency Procedures

### Stop Resolver
```bash
# Graceful shutdown (Ctrl+C)
# Saves state before stopping
```

### Cancel Pending Orders
If needed, manually cancel orders after timelock:
```bash
# Use contract scripts in bmn-evm-contracts
cd ../bmn-evm-contracts
./scripts/cancel-order.sh <escrow-address>
```

## Performance Optimization

1. **RPC Endpoints**:
   - Use private RPC nodes for reliability
   - Configure multiple endpoints for failover

2. **Gas Optimization**:
   - Monitor gas prices and adjust strategy
   - Batch operations when possible

3. **Order Selection**:
   - Configure minimum profitability thresholds
   - Skip orders during high gas periods

## Next Steps

1. **Production Readiness**:
   - Implement monitoring and alerting
   - Set up automated backups
   - Create runbooks for operations

2. **Integration**:
   - Connect to 1inch Limit Order Protocol
   - Implement advanced order matching

3. **Scaling**:
   - Deploy multiple resolver instances
   - Implement load balancing