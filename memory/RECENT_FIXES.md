# Recent Fixes and Resolutions

## 1. Token Approval Target Fix

### Issue
The initial implementation was approving tokens to the wrong contract address. Tokens were being approved to `LimitOrderProtocol` instead of `EscrowFactory`.

### Root Cause
Misunderstanding of the contract architecture. The `EscrowFactory` is responsible for deploying escrow contracts and needs the approval to transfer tokens when creating escrows.

### Fix Applied
**File**: `src/alice/create-order.ts`

Changed from:
```typescript
await tokenA.write.approve([limitOrderProtocol.address, amount]);
```

To:
```typescript
await tokenA.write.approve([escrowFactoryA.address, amount]);
```

### Verification
- Token approvals now target the correct contract
- EscrowFactory can successfully transfer tokens when deploying escrows
- Orders can be created without approval errors

## 2. @ponder/client Dependency Removal

### Issue
Resolver failing to start with error: "Could not resolve '@ponder/client'"

### Root Cause
The `@ponder/client` import was present in the resolver code but:
1. The dependency wasn't installed
2. The import wasn't actually being used in the code

### Fix Applied
**File**: `src/resolver/resolver.ts`

Removed the unused import:
```typescript
// Removed: import { createClient } from '@ponder/client';
```

### Verification
- Resolver starts successfully without the import
- No functionality was lost as the import wasn't being used

## 3. Environment Configuration for Mainnet

### Issue
Missing mainnet configuration in environment variables, preventing mainnet deployment.

### Root Cause
The `.env.example` only contained local testnet configuration. Mainnet addresses and chain configurations were not defined.

### Fix Applied
**File**: `.env` (created from updated `.env.example`)

Added mainnet configuration:
```bash
# Mainnet Configuration
CHAIN_A_RPC=https://mainnet.base.org
CHAIN_B_RPC=https://node.mainnet.etherlink.com
CHAIN_A_ID=8453
CHAIN_B_ID=42793

# Mainnet Contract Addresses
BMN_TOKEN_ADDR=0x6225A0055D560d132e7d8167D5b5b26cebD64a0C
ESCROW_FACTORY_A_ADDR=0xE5dC3215324eE06A7693E5c67D8Be0a811F42288
ESCROW_FACTORY_B_ADDR=0xeb1aAdAC0a10Ac2eDFCbE496C3BCBc1dea4F994b
LIMIT_ORDER_PROTOCOL_ADDR=0xdBB02F45E83A56D6b8e387BB3F08cB39309Cb8fE
```

### Verification
- Mainnet deployment successful
- All contract addresses resolve correctly
- Chain IDs match expected values

## 4. Recovery Script Creation

### Issue
Order created but not processed by resolver, funds locked in escrow.

### Root Cause
Resolver encountered an error during initial order processing, leaving the order in a pending state.

### Fix Applied
**File**: `scripts/recovery/withdraw-expired-order.ts` (created)

Created a recovery script that:
1. Checks order status
2. Verifies timeout has expired
3. Allows Alice to withdraw funds
4. Provides clear status messages

### Usage
```bash
deno task alice:withdraw --order-id 1
```

### Verification
- Script successfully identifies expired orders
- Can initiate withdrawal transactions
- Provides clear feedback on order status

## 5. Chain Configuration Updates

### Issue
Inconsistent chain configuration between local and mainnet modes.

### Root Cause
The chain configuration was hardcoded for local testing and didn't properly switch for mainnet.

### Fix Applied
**File**: `src/config/chains.ts`

- Added proper environment variable reading
- Implemented conditional configuration based on network mode
- Ensured correct chain IDs and RPC URLs

### Verification
- Mainnet mode uses correct chain IDs (8453, 42793)
- RPC URLs point to correct endpoints
- Configuration switches properly based on environment

## Summary of All Fixes

| Issue | Status | Impact |
|-------|--------|---------|
| Token Approval Target | ✅ FIXED | Critical - Orders can now be created |
| @ponder/client Dependency | ✅ FIXED | High - Resolver can start |
| Mainnet Configuration | ✅ FIXED | High - Mainnet deployment enabled |
| Recovery Script | ✅ CREATED | Medium - Funds can be recovered |
| Chain Configuration | ✅ FIXED | High - Proper network connectivity |

## Lessons Learned

1. **Contract Architecture**: Always verify which contract needs token approvals
2. **Dependency Management**: Remove unused imports to prevent deployment issues
3. **Environment Configuration**: Maintain separate configs for different networks
4. **Recovery Mechanisms**: Always have manual recovery options for failed transactions
5. **Testing**: Test on mainnet with small amounts first