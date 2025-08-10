# Deno KV Integration for Resolver State Management

## Overview

The Bridge-Me-Not resolver uses Deno KV for persistent local state management,
particularly for tracking secrets and atomic swap operations.

## Setup Requirements

### 1. Enable Deno KV Flag

Deno KV requires the `--unstable-kv` flag to be enabled. This has been added to
all Deno tasks in `deno.json`:

```json
{
  "tasks": {
    "resolver": "deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv --env-file=.env resolver.ts",
    "alice": "deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv --env-file=.env alice.ts"
  }
}
```

## Architecture

### SecretManager

The `SecretManager` class provides a persistent storage layer for secrets using
Deno KV:

```typescript
src/state/SecretManager.ts
├── init() - Initialize KV database
├── storeSecret() - Store revealed secrets locally
├── getSecretByHashlock() - Retrieve secrets by hashlock
├── getSecretByOrderHash() - Retrieve secrets by order hash  
├── confirmSecret() - Mark secrets as successfully used
├── markFailed() - Mark failed secret operations
├── getPendingSecrets() - Get secrets awaiting processing
└── getStatistics() - Get storage statistics
```

### Integration with SimpleResolver

The resolver integrates the SecretManager for local state:

```typescript
// In SimpleResolver constructor
this.secretManager = new SecretManager();

// In start() method
await this.secretManager.init();

// Main processing loop
await this.monitorForRevealedSecrets(); // Watch for on-chain secrets
await this.processLocalSecrets(); // Process stored secrets
```

## Data Flow

1. **Secret Discovery**: Monitor blockchain events for revealed secrets
2. **Local Storage**: Store secrets in Deno KV with metadata
3. **Processing**: Use stored secrets to withdraw from source escrows
4. **Status Tracking**: Mark secrets as confirmed/failed after processing

## Schema Compatibility Issues

### Current Limitations

The `escrowWithdrawal` table schema lacks certain fields needed for complete
secret tracking:

- `hashlock` - Not available in current schema
- `orderHash` - Not available in current schema

### Temporary Solution

The `monitorForRevealedSecrets()` function is temporarily disabled until the
indexer schema is updated to include these fields.

```typescript
private async monitorForRevealedSecrets() {
  // Temporarily disabled: Schema missing hashlock and orderHash fields
  return;
  
  // Implementation commented out...
}
```

## Running the Resolver

```bash
# Start the resolver with KV support
deno task resolver

# Expected output
🚀 Bridge-Me-Not Resolver (Simplified)
=====================================
✅ SecretManager initialized with Deno KV
📊 SecretManager stats: {"total":0,"pending":0,"confirmed":0,"failed":0}
🔍 Querying pending atomic swaps...
```

## Troubleshooting

### Error: "Deno.openKv is not a function"

**Solution**: Ensure the `--unstable-kv` flag is included in your run command.

### Error: "Cannot convert undefined or null to object"

**Cause**: Schema mismatch in Drizzle ORM queries. **Solution**: Check that all
selected fields exist in the schema definition.

## Future Improvements

1. **Schema Updates**: Add missing fields to `escrowWithdrawal` table:
   - `hashlock` field for direct secret lookup
   - `orderHash` field for order correlation

2. **Enhanced Monitoring**: Re-enable `monitorForRevealedSecrets()` once schema
   is updated

3. **Performance Optimization**: Implement batched secret processing for
   efficiency

## Security Considerations

- Secrets are stored locally in Deno KV with proper access controls
- The resolver only stores secrets it needs for withdrawals
- Failed operations are tracked to prevent retry loops
- All secrets are encrypted at rest by Deno KV

## Related Files

- `/src/state/SecretManager.ts` - KV storage implementation
- `/src/resolver/simple-resolver.ts` - Resolver integration
- `/src/indexer/ponder-client.ts` - Indexer client with schema queries
- `/deno.json` - Deno configuration with KV flags
