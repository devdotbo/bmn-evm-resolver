# 🚀 Mainnet Deployment Ready

## ✅ System Status: READY FOR PRODUCTION

### 🎯 Quick Start

```bash
# 1. Set environment variables
export RESOLVER_PRIVATE_KEY="0x..."  # Your resolver private key
export ANKR_API_KEY="your_key"       # Ankr API key for RPC
export INDEXER_URL="http://localhost:42069"  # Ponder indexer URL

# 2. Run the resolver
deno task resolver

# 3. Alice creates orders (in another terminal)
export ALICE_PRIVATE_KEY="0x..."
deno run --allow-all alice.ts --action create --resolver 0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5
```

### 📋 Deployment Checklist

#### ✅ Smart Contracts (Mainnet)
- [x] **CrossChainEscrowFactory v2.1.0**: `0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A`
  - Deployed on Base ✅
  - Deployed on Optimism ✅
  - Version: "2.1.0-bmn-secure"
  
- [x] **SimpleLimitOrderProtocol**
  - Base: `0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06` ✅
  - Optimism: `0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7` ✅

- [x] **Resolver Whitelist Status**
  - Address: `0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5`
  - Whitelisted on Base ✅
  - Whitelisted on Optimism ✅

#### ✅ Infrastructure
- [x] **Ponder Indexer**: Running at `http://localhost:42069`
  - SQL over HTTP endpoint: `http://localhost:42069/sql`
  - Monitoring all required events
  - Schema includes atomic swaps, escrows, withdrawals

- [x] **UnifiedResolver**: Complete implementation
  - PonderClient for SQL queries ✅
  - SimpleLimitOrderProtocol integration ✅
  - SecretManager with Deno KV ✅
  - Profitability checks ✅

- [x] **LimitOrderAlice**: Order creation system
  - EIP-712 signature generation ✅
  - PostInteraction for factory triggers ✅
  - Secret management ✅
  - Auto-withdrawal monitoring ✅

### 🔄 Complete Flow (Tested)

```
1. Alice creates EIP-712 signed limit order
   ↓
2. Order includes postInteraction data for factory
   ↓
3. Ponder indexer captures OrderFilled events
   ↓
4. Resolver queries indexer via SQL/HTTP
   ↓
5. Resolver fills order via SimpleLimitOrderProtocol
   ↓
6. Protocol triggers factory.postSourceEscrow()
   ↓
7. Resolver creates destination escrow
   ↓
8. Alice withdraws by revealing secret
   ↓
9. Resolver withdraws using revealed secret
```

### 📊 Current Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| MIN_PROFIT_BPS | 0 | No minimum profit required (configurable) |
| POLLING_INTERVAL | 10000ms | Check for orders every 10 seconds |
| Factory Version | v2.1.0 | Secure version with whitelist |
| Resolver Address | 0xfdF1d...b7B5 | Whitelisted on both chains |

### 🛠️ Production Deployment

#### Using PM2
```bash
# Install PM2
npm install -g pm2

# Start resolver
pm2 start --interpreter="deno" --interpreter-args="run --allow-all --env-file=.env" run-resolver.ts --name bmn-resolver

# Monitor
pm2 logs bmn-resolver
pm2 status
```

#### Using Docker
```bash
# Build image
docker build -t bmn-resolver .

# Run container
docker run -d \
  --name bmn-resolver \
  --env-file .env \
  --restart unless-stopped \
  bmn-resolver
```

#### Using systemd
```bash
# Create service file at /etc/systemd/system/bmn-resolver.service
sudo systemctl daemon-reload
sudo systemctl enable bmn-resolver
sudo systemctl start bmn-resolver
```

### 📈 Monitoring

- **Indexer Health**: `curl http://localhost:42069/health`
- **Resolver Logs**: Check for "✅ Found X pending swaps"
- **Secret Manager Stats**: Monitor pending/confirmed/failed secrets
- **On-chain Events**: Track OrderFilled and EscrowCreated events

### 🔐 Security Considerations

1. **Private Key Management**
   - Use environment variables only
   - Never commit keys to git
   - Run security scan before commits: `./scripts/security-check.sh`

2. **Whitelist Status**
   - Resolver must remain whitelisted
   - Monitor for factory pause events
   - Check whitelist status regularly

3. **Profit Settings**
   - Currently set to 0% for testing
   - Increase MIN_PROFIT_BPS for production
   - Consider gas costs in profitability

### 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Resolver not whitelisted" | Contact admin to whitelist resolver address |
| "No pending swaps" | Check if indexer is running and synced |
| "Failed to connect to indexer" | Verify INDEXER_URL and network connectivity |
| "Insufficient funds" | Ensure resolver has tokens and ETH for gas |
| "Secret already revealed" | Normal - another party revealed first |

### 📞 Support Channels

- **Technical Issues**: Check ARCHITECTURE.md
- **Contract Issues**: Verify addresses match this document
- **Indexer Issues**: Check Ponder logs at indexer URL
- **Security Issues**: Run `./scripts/security-check.sh`

### ✅ Final Verification

Run these commands to verify everything is ready:

```bash
# 1. Test indexer connection
deno run --allow-all test-indexer-query.ts

# 2. Test resolver configuration
deno task resolver:test

# 3. Dry run Alice order
DRY_RUN=true deno run --allow-all alice.ts --action create

# 4. Check resolver whitelist
deno run --allow-all scripts/verify-factory-migration.ts
```

---

## 🎉 System Ready for Mainnet

All components are deployed, tested, and operational. The resolver is whitelisted and ready to process atomic swaps between Base and Optimism networks.

**Next Steps:**
1. Fund resolver with tokens and ETH
2. Set appropriate MIN_PROFIT_BPS for production
3. Deploy resolver as background service
4. Monitor for incoming orders
5. Track successful swaps

Last Updated: 2025-01-07