# Factory Upgrade - Enhanced Event Emissions

## Overview

The EscrowFactory contract has been upgraded to enhance resolver implementation by emitting escrow addresses directly in events. This upgrade simplifies the resolver's job by eliminating the need to calculate CREATE2 addresses.

## Factory Addresses

### Previous Factory (v1)
- **Address**: `0x75ee15F6BfDd06Aee499ed95e8D92a114659f4d1`
- **Deployment**: Initial CREATE3 deployment
- **Events**: Did not emit escrow addresses in events
- **Status**: Deprecated (but still functional)

### New Factory (v2) 
- **Address**: `0x2B2d52Cf0080a01f457A4f64F41cbca500f787b1`
- **Deployment**: Enhanced version with improved events
- **Events**: Emits escrow addresses as first indexed parameter
- **Status**: Active (recommended for all new deployments)

## What Changed

### Event Enhancement

The factory now emits escrow addresses in events, making it easier for resolvers to track deployments:

```solidity
// Old events (v1)
event SourceEscrowDeployed(
    bytes32 indexed orderHash,
    // ... other parameters
);

// New events (v2) 
event SourceEscrowDeployed(
    address indexed srcEscrow,  // NEW: Escrow address as first indexed parameter
    bytes32 indexed orderHash,
    // ... other parameters
);
```

### Benefits

1. **Simplified Resolver Logic**: No need to calculate CREATE2 addresses
2. **Better Event Filtering**: Can filter events by escrow address directly
3. **Reduced Complexity**: Eliminates potential address calculation mismatches
4. **Backward Compatible**: Old factory still works, but new one is recommended

## Migration Guide

### For Resolver Developers

1. **Update Factory Address**: Change from old to new factory address
2. **Update Event Handling**: Use the emitted escrow address instead of calculating it
3. **Test Thoroughly**: Ensure your resolver works with both old and new events

### Configuration Updates

Update your environment variables:

```bash
# Old factory (deprecated)
# MAINNET_ESCROW_FACTORY=0x75ee15F6BfDd06Aee499ed95e8D92a114659f4d1

# New factory (recommended)
MAINNET_ESCROW_FACTORY=0x2B2d52Cf0080a01f457A4f64F41cbca500f787b1
BASE_ESCROW_FACTORY=0x2B2d52Cf0080a01f457A4f64F41cbca500f787b1
ETHERLINK_ESCROW_FACTORY=0x2B2d52Cf0080a01f457A4f64F41cbca500f787b1
```

### Event Listening Example

```typescript
// Old approach (still works with old factory)
const calculateEscrowAddress = (orderHash: string, isSource: boolean) => {
  // Complex CREATE2 calculation logic
};

// New approach (with enhanced factory)
const handleSourceEscrowDeployed = (event) => {
  const escrowAddress = event.args.srcEscrow; // Direct from event!
  const orderHash = event.args.orderHash;
  // No calculation needed
};
```

## Deployment Details

Both factories use the same CREATE3 deployment method, ensuring deterministic addresses across chains:

- **CREATE3 Factory**: `0x7B9e9BE124C5A0E239E04fDC93b66ead4e8C669d`
- **Deployment Salt**: Unique per factory version
- **Chains**: Base Mainnet (8453) and Etherlink Mainnet (42793)

## Recommendations

1. **New Deployments**: Always use the new factory
2. **Existing Systems**: Consider migrating to benefit from simplified event handling
3. **Monitoring**: Update your monitoring tools to handle both event formats during transition

## Technical Reference

For implementation details, see:
- Factory contract: `CrossChainEscrowFactory.sol`
- Event definitions: `IBaseEscrowFactory.sol`
- Resolver implementation: `src/resolver/monitor.ts`