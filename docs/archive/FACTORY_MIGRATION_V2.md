# Factory V2.1.0 Migration Documentation

## Overview

This document outlines the migration process for the Bridge-Me-Not resolver from CrossChainEscrowFactory v1.1.0 to v2.1.0. The new factory introduces critical security features including resolver whitelisting and emergency pause functionality.

## Migration Status

- **Date**: January 6, 2025
- **Old Factory Version**: v1.1.0 (INSECURE)
- **New Factory Version**: v2.1.0 (SECURE)
- **Status**: Implementation Complete, Awaiting Deployment

## Key Changes in V2.1.0

### Security Enhancements
1. **Resolver Whitelist**: Only authorized resolvers can create destination escrows
2. **Emergency Pause**: Protocol can be halted in case of security issues
3. **Enhanced Access Control**: Improved owner-only functions
4. **Same ABI**: No breaking changes to existing integrations

### Address Updates

#### New Factory Addresses (v2.1.0)
- **Base**: `0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A`
- **Optimism**: `0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A`
- **Etherlink**: Not deployed

#### Old Factory Addresses (v1.1.0 - TO BE DEPRECATED)
- **Base**: `0x2B2d52Cf0080a01f457A4f64F41cbca500f787b1`
- **Optimism**: `0xB916C3edbFe574fFCBa688A6B92F72106479bD6c`

#### Limit Order Protocol Addresses
- **Base**: `0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06`
- **Optimism**: `0x44716439C19c2E8BD6E1bCB5556ed4C31dA8cDc7`

## Implementation Changes

### 1. Configuration Updates

**File**: `src/config/contracts.ts`
- Updated `CREATE3_ADDRESSES` with v2.1.0 factory addresses
- Added limit order protocol addresses
- Maintained backward compatibility references

### 2. Security Infrastructure

**New File**: `src/utils/factory-security.ts`
- Whitelist verification functions
- Emergency pause detection
- Factory version checking
- Continuous security monitoring

**New File**: `src/resolver/base-resolver.ts`
- Base class with built-in security features
- Automatic pre-operation security checks
- Error handling for security reverts
- Retry logic with security awareness

### 3. Error Handling

New error types implemented:
- `NotWhitelistedError`: Thrown when resolver is not whitelisted
- `FactoryPausedError`: Thrown when factory is paused

### 4. Monitoring & Verification

**Scripts Created**:
- `scripts/verify-factory-migration.ts`: Comprehensive migration verification
- `scripts/test-factory-connection.ts`: Test resolver connectivity
- `scripts/cast-migration-verify.sh`: Foundry cast-based verification
- `scripts/migration-checklist.ts`: Post-migration validation

## Migration Steps

### Step 1: Pre-Migration Verification
```bash
# Check current status
deno run --allow-net --allow-env scripts/verify-factory-migration.ts
```

### Step 2: Update Configuration
```bash
# Copy new environment variables
cp .env.example .env
# Edit .env with your credentials
```

### Step 3: Verify Whitelist Status
```bash
# Using cast
./scripts/cast-migration-verify.sh <RESOLVER_ADDRESS>

# Or using Deno
deno run --allow-net --allow-env scripts/test-factory-connection.ts
```

### Step 4: Test Connection
```bash
# Run connection test
deno run --allow-net --allow-env scripts/test-factory-connection.ts
```

### Step 5: Run Migration Checklist
```bash
# Verify all steps completed
deno run --allow-net --allow-env --allow-read scripts/migration-checklist.ts
```

## Resolver-Specific Considerations

### Limit Order Integration
The resolver integrates with the SimpleLimitOrderProtocol deployed separately. The factory migration does not affect limit order functionality, but monitoring has been enhanced to handle security features.

### State Management
The resolver uses:
- **SecretManager**: Local Deno KV for secret storage
- **PonderClient**: Indexer integration for order monitoring

Both systems are compatible with the new factory security features.

### Error Recovery
The resolver now includes:
- Automatic retry with exponential backoff
- Security-aware error handling
- Graceful degradation when factory is paused

## Testing Recommendations

### 1. Whitelist Verification
```typescript
// Test whitelist status
const status = await checkFactorySecurity(
  chainId,
  factoryAddress,
  resolverAddress,
  rpcUrl
);
console.log("Whitelisted:", status.isWhitelisted);
```

### 2. Pause Handling
```typescript
// Test pause detection
try {
  await preOperationCheck(chainId);
} catch (error) {
  if (error instanceof FactoryPausedError) {
    console.log("Factory is paused, waiting...");
  }
}
```

### 3. End-to-End Test
1. Create a test order with small amounts
2. Monitor security status during execution
3. Verify proper error handling

## Monitoring Setup

### Continuous Monitoring
```typescript
const monitor = new FactorySecurityMonitor(
  resolverAddress,
  chains,
  onStatusChange,
  60000 // Check every minute
);
await monitor.start();
```

### Alert Conditions
- Resolver removed from whitelist
- Factory paused
- Version mismatch detected

## Troubleshooting

### Common Issues

#### "Not whitelisted resolver" Error
- **Cause**: Resolver address not in factory whitelist
- **Solution**: Contact protocol team for whitelisting
- **Verification**: Run `scripts/verify-factory-migration.ts`

#### "Protocol is paused" Error
- **Cause**: Emergency pause activated
- **Solution**: Wait for unpause, monitor status
- **Verification**: Check `emergencyPaused()` on factory

#### Connection Failures
- **Cause**: RPC issues or incorrect addresses
- **Solution**: Verify RPC endpoints and factory addresses
- **Verification**: Run `scripts/test-factory-connection.ts`

## Rollback Plan

If issues arise during migration:

1. **Immediate**: Resolver will automatically stop operations if not whitelisted
2. **Manual Override**: Set factory addresses back to v1.1.0 in config
3. **Monitor**: Old factory remains operational for 30 days

## Success Metrics

Migration is successful when:
- [x] All configuration files updated
- [x] Security monitoring implemented
- [x] Error handling in place
- [ ] Resolver whitelisted on both chains
- [ ] Successful test swap completed
- [ ] 24 hours of stable operation

## Support Channels

- **Technical Issues**: GitHub issues
- **Urgent Security**: Contact security team
- **General Questions**: Discord #resolver-support

## Appendix: Quick Commands

```bash
# Verify migration
deno run --allow-net --allow-env scripts/verify-factory-migration.ts

# Test connection
deno run --allow-net --allow-env scripts/test-factory-connection.ts

# Run checklist
deno run --allow-net --allow-env --allow-read scripts/migration-checklist.ts

# Cast verification
./scripts/cast-migration-verify.sh $RESOLVER_ADDRESS

# Start resolver with monitoring
ENABLE_SECURITY_MONITORING=true deno run --allow-all src/index.ts
```

---

**Document Version**: 1.0  
**Last Updated**: January 6, 2025  
**Author**: Bridge-Me-Not Resolver Team