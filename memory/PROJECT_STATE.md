# Bridge-Me-Not EVM Resolver - Project State

## Current Status: MAINNET DEPLOYMENT ACTIVE

### Deployment Status
- **Environment**: Production Mainnet
- **Primary Chains**: 
  - Base (Chain ID: 8453)
  - Etherlink (Chain ID: 42793)
- **Status**: Contracts deployed and configured, resolver ready to process orders

### Key Contract Addresses (Mainnet)

#### Base Chain (8453)
- **BMN Token**: `0x6225A0055D560d132e7d8167D5b5b26cebD64a0C`
- **Escrow Factory**: `0xE5dC3215324eE06A7693E5c67D8Be0a811F42288`
- **Limit Order Protocol**: `0xdBB02F45E83A56D6b8e387BB3F08cB39309Cb8fE`

#### Etherlink Chain (42793)
- **BMN Token**: `0x6225A0055D560d132e7d8167D5b5b26cebD64a0C`
- **Escrow Factory**: `0xeb1aAdAC0a10Ac2eDFCbE496C3BCBc1dea4F994b`

### Account Balances

#### Alice (Order Creator)
- **Address**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **Base Chain BMN Balance**: 990 BMN (after creating 10 BMN order)
- **Etherlink BMN Balance**: 0 BMN
- **ETH Balance (Base)**: Sufficient for gas
- **XTZ Balance (Etherlink)**: Sufficient for gas

#### Bob (Resolver)
- **Address**: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- **Base Chain BMN Balance**: 0 BMN
- **Etherlink BMN Balance**: 1000 BMN
- **ETH Balance (Base)**: Sufficient for gas
- **XTZ Balance (Etherlink)**: Sufficient for gas

### Outstanding Orders

#### Order #1 (UNPROCESSED)
- **Amount**: 10 BMN
- **Created**: Recently (within last session)
- **Status**: Created but not yet filled by resolver
- **Issue**: Resolver encountered error during initial processing attempt
- **Recovery**: Can be recovered using `deno task alice:withdraw` after timeout

### Security Configuration
- **Security Deposit**: 0.00002 ETH (20000000000000 wei)
- **Timelock (Source)**: 20 minutes
- **Timelock (Destination)**: 5 minutes
- **Safety Window**: 15 minutes for Bob to claim after Alice reveals secret

### Recent Issues and Resolutions

1. **Token Approval Target**
   - **Issue**: Initial implementation approved tokens to LimitOrderProtocol
   - **Resolution**: Fixed to approve tokens to EscrowFactory (which deploys escrows)
   - **Status**: RESOLVED

2. **@ponder/client Dependency**
   - **Issue**: Dependency not found, breaking resolver startup
   - **Resolution**: Removed from imports as it wasn't being used
   - **Status**: RESOLVED

3. **Environment Configuration**
   - **Issue**: Missing mainnet environment variables
   - **Resolution**: Added comprehensive mainnet configuration to .env
   - **Status**: RESOLVED

4. **Order Processing Error**
   - **Issue**: Resolver failed to process the 10 BMN order
   - **Resolution**: Recovery script created, manual recovery available
   - **Status**: PENDING RECOVERY

### System Health
- **Contracts**: ✅ Deployed and verified
- **Token Balances**: ✅ Adequate for operations
- **Gas Balances**: ✅ Sufficient on both chains
- **Resolver**: ✅ Running and monitoring
- **Order Processing**: ⚠️ One order pending recovery

### Configuration Files
- **Environment**: `.env` configured with mainnet values
- **Chain Config**: `src/config/chains.ts` properly set for mainnet
- **Security**: Private keys secured in environment variables