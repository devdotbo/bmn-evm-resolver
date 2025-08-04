# Phase 1 Update Summary: CREATE3 Contract Addresses and BMN Token Configuration

## Overview
Successfully updated the Bridge-Me-Not EVM Resolver to use the new CREATE3-deployed contract addresses as specified in Phase 1 of the execution plan.

## Changes Made

### 1. Contract Address Updates

#### Updated Files:
- `src/config/contracts.ts`
- `src/config/mainnet.ts`
- `.env.example`
- `.env.mainnet.example`

#### New CREATE3 Addresses:
- **ESCROW_FACTORY**: `0x75ee15F6BfDd06Aee499ed95e8D92a114659f4d1` (previously `0xc72ed1E8a0649e51Cd046a0FfccC8f8c0bf385Fa`)
- **BMN_TOKEN**: `0x8287CD2aC7E227D9D927F998EB600a0683a832A1` (previously `0x18ae5BB6E03Dc346eA9fd1afA78FEc314343857e`)

### 2. BMN Token Configuration

Added comprehensive BMN token configuration in `src/config/contracts.ts`:
```typescript
export const BMN_TOKEN_CONFIG = {
  address: CREATE3_ADDRESSES.BMN_TOKEN,
  decimals: 18,
  symbol: "BMN",
  name: "Bridge-Me-Not",
  totalSupply: parseUnits("20000000", 18), // 20 million BMN tokens
} as const;
```

### 3. Safety Deposit Updates

Updated safety deposit to use ETH instead of tokens:
- **Amount**: `0.00002 ETH` (~$0.03-0.04 at $2000/ETH)
- **Location**: `src/config/constants.ts`
- Added `SAFETY_DEPOSIT_ETH` constant
- Updated `calculateSafetyDeposit()` to return fixed ETH amount
- Added `calculateSafetyDepositLegacy()` for backward compatibility

### 4. Alice Script Updates

Updated Alice's mainnet order creation scripts:
- `src/alice/create-mainnet-order.ts`
- `src/alice/create-mainnet-order-reverse.ts`

Changes:
- Use `BMN_TOKEN_CONFIG.address` instead of hardcoded address
- Use `SAFETY_DEPOSIT_ETH` for safety deposits
- Added ETH balance check for safety deposit
- Removed safety deposit from BMN balance requirement

### 5. Chain Configuration Enhancements

Updated `src/config/chains.ts`:
- Added re-exports for CREATE3 addresses
- Added import of contract configurations

Updated `src/config/constants.ts`:
- Added BMN token constants
- Added BMN to mock token prices
- Added Base and Etherlink to chain names

### 6. Environment File Updates

Updated example environment files with new addresses:
- `.env.example`: Updated commented mainnet configuration
- `.env.mainnet.example`: Updated with new CREATE3 addresses

## Key Benefits

1. **Deterministic Addresses**: CREATE3 ensures same addresses across all chains
2. **Reduced Capital Requirements**: ETH safety deposits (0.00002 ETH) instead of token-based
3. **Improved Configuration**: Centralized BMN token configuration
4. **Better Type Safety**: All addresses properly typed as `Address`
5. **Clear Documentation**: Added comments explaining CREATE3 addresses

## Testing Recommendations

1. Test with local chains to verify contract interactions
2. Verify BMN token transfers with new address
3. Test safety deposit functionality with ETH
4. Ensure escrow factory creates escrows at expected addresses
5. Test both normal and reverse order flows

## Next Steps

This completes Phase 1 of the execution plan. The resolver is now configured to work with the new CREATE3-deployed contracts. Proceed with testing before moving to Phase 2 (Event Processing - Queue Implementation).