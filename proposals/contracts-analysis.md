# Bridge-Me-Not EVM Contracts Analysis

## Executive Summary

The Bridge-Me-Not (BMN) EVM contracts have been updated with significant improvements to support deterministic cross-chain deployments using CREATE3. The core atomic swap protocol remains unchanged, but the deployment infrastructure has been enhanced for better cross-chain consistency. Key changes include:

1. **CREATE3 Factory Implementation**: Enables deterministic addresses across all chains regardless of bytecode differences
2. **CrossChainEscrowFactory**: New factory contract accepting pre-deployed implementations for consistency
3. **Timestamp Tolerance**: Added 5-minute tolerance for cross-chain timestamp drift
4. **Deployment Standardization**: All contracts now deployed at same addresses on Base and Etherlink
5. **Security Enhancements**: Access token requirements and improved validation

## CREATE3 Implementation Details

### Why CREATE3?

CREATE3 provides bytecode-independent deterministic addresses, crucial for cross-chain protocols:

- **CREATE2 Limitation**: Address depends on bytecode hash, making cross-chain consistency difficult
- **CREATE3 Solution**: Two-step deployment process where final address only depends on deployer + salt
- **Benefits**: Same contract addresses across all chains, even with different compiler versions or constructor args

### CREATE3 Factory Contract

**Address**: `0x7B9e9BE124C5A0E239E04fDC93b66ead4e8C669d` (shared across chains)

```solidity
contract Create3Factory is Ownable {
    // Key features:
    - Authorization system for deployment control
    - Deploy with/without ETH value support
    - Deployment tracking and address prediction
    - Salt uniqueness per deployer
}
```

### CREATE3 Library Implementation

The library uses a proxy pattern:
1. Deploy a proxy contract via CREATE2
2. Proxy uses CREATE to deploy the actual contract
3. Final address only depends on proxy address, not bytecode

```solidity
library Create3 {
    // Proxy bytecode is constant across all deployments
    bytes internal constant PROXY_CHILD_BYTECODE = hex"67_36_3d_3d_37_36_3d_34_f0_3d_52_60_08_60_18_f3";
    
    // Two-step deployment ensures deterministic addresses
    function create3(bytes32 salt, bytes memory creationCode) internal returns (address) {
        // Step 1: Deploy proxy via CREATE2
        // Step 2: Proxy deploys actual contract via CREATE
    }
}
```

## Updated Contract Architecture

### CrossChainEscrowFactory

New factory contract that accepts pre-deployed implementations:

```solidity
contract CrossChainEscrowFactory is BaseEscrowFactory {
    constructor(
        address limitOrderProtocol,
        IERC20 feeToken,
        IERC20 accessToken,
        address owner,
        address srcImplementation,  // Pre-deployed via CREATE3
        address dstImplementation   // Pre-deployed via CREATE3
    )
}
```

**Key Changes**:
- Accepts implementation addresses instead of deploying them
- Enables consistent escrow addresses across chains
- Maintains all atomic swap security properties

### BaseEscrowFactory Updates

**Timestamp Tolerance**: Added 5-minute tolerance for cross-chain operations

```solidity
uint256 private constant TIMESTAMP_TOLERANCE = 300; // 5 minutes

// In createDstEscrow:
if (immutables.timelocks.get(TimelocksLib.Stage.DstCancellation) > 
    srcCancellationTimestamp + TIMESTAMP_TOLERANCE) {
    revert InvalidCreationTime();
}
```

This prevents failures due to minor timestamp differences between chains while maintaining security.

### Escrow Contracts (EscrowSrc & EscrowDst)

Core escrow logic remains unchanged:
- Same hashlock-based atomic swap mechanism
- Same timelock stages for withdrawals and cancellations
- Same safety deposit requirements

**Constructor Update**: Both now accept `accessToken` parameter for consistency

```solidity
constructor(uint32 rescueDelay, IERC20 accessToken) BaseEscrow(rescueDelay, accessToken) {}
```

## Deployment Process

### Current Deployments

**Main Protocol Contracts** (Deployer: 0x5f29827e25dc174a6A51C99e6811Bbd7581285b0):
- EscrowSrc: `0x77CC1A51dC5855bcF0d9f1c1FceaeE7fb855a535`
- EscrowDst: `0x36938b7899A17362520AA741C0E0dA0c8EfE5e3b`
- CrossChainEscrowFactory: `0x75ee15F6BfDd06Aee499ed95e8D92a114659f4d1`

**Resolver Infrastructure** (Bob: 0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5):
- Resolver Factory: `0xe767202fD26104267CFD8bD8cfBd1A44450DC343`

### Deployment Scripts

Two main deployment scripts using CREATE3:

1. **DeployWithCREATE3.s.sol**: Main protocol deployment
   - Deploys EscrowSrc and EscrowDst implementations
   - Deploys CrossChainEscrowFactory
   - Uses deterministic salts for cross-chain consistency

2. **DeployResolverCREATE3.s.sol**: Resolver infrastructure
   - Deploys resolver-specific contracts
   - Maintains separate namespace for resolver deployments

### Deployment Commands

```bash
# Deploy main contracts
source .env && forge script script/DeployWithCREATE3.s.sol \
    --rpc-url $BASE_RPC_URL --broadcast

# Same addresses achieved on Etherlink
source .env && forge script script/DeployWithCREATE3.s.sol \
    --rpc-url $ETHERLINK_RPC_URL --broadcast
```

## Contract Interfaces and ABI Changes

### New Events

No new events added. Existing events remain:
- `SrcEscrowCreated`
- `DstEscrowCreated`
- `EscrowWithdrawal`
- `EscrowCancelled`

### Interface Updates

1. **IEscrowFactory**: Now includes `createDstEscrow` with `srcCancellationTimestamp` parameter
2. **Constructor Changes**: Escrow implementations now require `accessToken` parameter

### Constants Library

New constants file for shared addresses:

```solidity
library Constants {
    address constant BMN_TOKEN = 0x8287CD2aC7E227D9D927F998EB600a0683a832A1;
    address constant BMN_DEPLOYER = 0x5f29827e25dc174a6A51C99e6811Bbd7581285b0;
    address constant ALICE = 0x240E2588e35FB9D3D60B283B45108a49972FFFd8;
    address constant BOB_RESOLVER = 0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5;
}
```

## Security Improvements

### Access Control
- CREATE3 factory has authorization system
- Only authorized deployers can use CREATE3 factory
- Access token requirements on escrow operations

### Timestamp Tolerance
- 5-minute tolerance prevents griefing via timestamp manipulation
- Maintains security while handling real-world chain differences
- Applied only to destination escrow creation

### Deployment Security
- Deterministic addresses prevent front-running deployment attacks
- Pre-computed addresses can be verified before deployment
- Salt includes deployer address for uniqueness

## Breaking Changes Requiring Resolver Updates

### 1. Factory Address Changes
Old factory contracts are replaced with CrossChainEscrowFactory at new addresses.

**Action Required**: Update factory address in resolver configuration:
```typescript
const FACTORY_ADDRESS = "0x75ee15F6BfDd06Aee499ed95e8D92a114659f4d1";
```

### 2. Access Token Requirements
Escrow contracts now require access token for certain operations.

**Action Required**: Ensure resolver holds BMN tokens for:
- Public withdrawal operations
- Public cancellation operations

### 3. Timestamp Validation
New timestamp tolerance in destination escrow creation.

**Action Required**: When creating destination escrows, pass source cancellation timestamp:
```typescript
await factory.createDstEscrow(dstImmutables, srcCancellationTimestamp, {
    value: requiredEth
});
```

### 4. ABI Updates
Factory ABI has changed with new createDstEscrow signature.

**Action Required**: Update ABIs from compiled contracts:
```bash
cp out/CrossChainEscrowFactory.sol/CrossChainEscrowFactory.json ../bmn-evm-resolver/abis/
```

## Migration Guide for Resolver

### Step 1: Update Contract Addresses

```typescript
// config/chains.ts
export const CONTRACT_ADDRESSES = {
    ESCROW_FACTORY: "0x75ee15F6BfDd06Aee499ed95e8D92a114659f4d1",
    // Implementation addresses (for reference only)
    ESCROW_SRC_IMPL: "0x77CC1A51dC5855bcF0d9f1c1FceaeE7fb855a535",
    ESCROW_DST_IMPL: "0x36938b7899A17362520AA741C0E0dA0c8EfE5e3b",
};
```

### Step 2: Update Destination Escrow Creation

```typescript
// Old approach
await factory.createDstEscrow(dstImmutables, { value });

// New approach - include source cancellation timestamp
const srcEscrow = await factory.addressOfEscrowSrc(srcImmutables);
const srcContract = new Contract(srcEscrow, EscrowSrcABI, provider);
const srcTimelocks = await srcContract.timelocks();
const srcCancellationTimestamp = extractCancellationTimestamp(srcTimelocks);

await factory.createDstEscrow(
    dstImmutables, 
    srcCancellationTimestamp,
    { value }
);
```

### Step 3: Handle Access Token Requirements

```typescript
// Ensure resolver has BMN tokens
const BMN_TOKEN = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1";
const bmnToken = new Contract(BMN_TOKEN, ERC20_ABI, signer);
const balance = await bmnToken.balanceOf(resolverAddress);

if (balance.isZero()) {
    console.warn("Resolver needs BMN tokens for public operations");
}
```

### Step 4: Update ABIs

Copy the latest compiled ABIs:
```bash
# From bmn-evm-contracts directory
forge build
cp out/CrossChainEscrowFactory.sol/CrossChainEscrowFactory.json ../bmn-evm-resolver/abis/
cp out/EscrowSrc.sol/EscrowSrc.json ../bmn-evm-resolver/abis/
cp out/EscrowDst.sol/EscrowDst.json ../bmn-evm-resolver/abis/
```

## Recommendations for Alice Test Scripts

### Small Security Deposits

For testing, use minimal safety deposits to reduce capital requirements:

```typescript
// Recommended test values
const SAFETY_DEPOSIT_SRC = ethers.parseEther("0.001"); // 0.001 ETH
const SAFETY_DEPOSIT_DST = ethers.parseEther("0.001"); // 0.001 ETH

// Pack deposits for order creation
const deposits = (SAFETY_DEPOSIT_DST << 128n) | SAFETY_DEPOSIT_SRC;
```

### Test Order Creation

```typescript
async function createTestOrder() {
    const order = {
        maker: aliceAddress,
        receiver: ethers.ZeroAddress,
        makerAsset: TKA_ADDRESS,
        takerAsset: ethers.ZeroAddress,
        makingAmount: ethers.parseEther("10"), // 10 TKA
        takingAmount: ethers.parseEther("10"), // 10 TKB expected
        makerTraits: buildMakerTraits({
            allowMultipleFills: false,
            usePermit2: false,
        }),
    };
    
    const extraData = {
        timelocks: packTimelocks({
            srcWithdrawal: 300,      // 5 minutes
            srcPublicWithdrawal: 600, // 10 minutes  
            srcCancellation: 900,     // 15 minutes
            dstWithdrawal: 300,      // 5 minutes
            dstCancellation: 1200,    // 20 minutes
        }),
        hashlockInfo: ethers.keccak256(secret),
        dstChainId: CHAIN_B_ID,
        dstToken: TKB_ADDRESS,
        deposits: deposits,
    };
    
    return { order, extraData };
}
```

### Pre-fund Escrow Address

Before order creation, pre-fund the deterministic escrow address:

```typescript
const escrowAddress = await factory.addressOfEscrowSrc(immutables);
await signer.sendTransaction({
    to: escrowAddress,
    value: SAFETY_DEPOSIT_SRC
});
```

## Code Examples

### Interacting with CREATE3 Factory

```typescript
// Get deployment address
const create3Factory = new Contract(
    "0x7B9e9BE124C5A0E239E04fDC93b66ead4e8C669d",
    CREATE3_FACTORY_ABI,
    signer
);

const salt = ethers.keccak256(ethers.toUtf8Bytes("MyContract-v1"));
const predictedAddress = await create3Factory.getDeploymentAddress(
    deployerAddress,
    salt
);

// Deploy contract
const bytecode = MyContract.bytecode + 
    ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256"], 
        [arg1, arg2]
    ).slice(2);

const tx = await create3Factory.deploy(salt, bytecode);
const receipt = await tx.wait();
```

### Working with CrossChainEscrowFactory

```typescript
const factory = new Contract(
    "0x75ee15F6BfDd06Aee499ed95e8D92a114659f4d1",
    CROSS_CHAIN_ESCROW_FACTORY_ABI,
    signer
);

// Get escrow addresses
const srcAddress = await factory.addressOfEscrowSrc(srcImmutables);
const dstAddress = await factory.addressOfEscrowDst(dstImmutables);

// Create destination escrow with timestamp
await factory.createDstEscrow(
    dstImmutables,
    srcCancellationTimestamp,
    { value: totalEthRequired }
);
```

### Updated Order Creation Process

```typescript
// 1. Build order with 1inch OrderLib
const order = new OrderLib.Order({
    maker: aliceAddress,
    receiver: Address.ZERO,
    makerAsset: new Address(TKA_ADDRESS),
    takerAsset: Address.ZERO,
    makingAmount: parseEther("100"),
    takingAmount: parseEther("100"),
    makerTraits: MakerTraits.default()
        .withAllowedSender(factory.address)
        .build(),
});

// 2. Create extension with factory call
const extension = factory.interface.encodeFunctionData(
    "postInteraction",
    [
        order,
        "0x", // extension
        orderHash,
        taker,
        makingAmount,
        takingAmount,
        remainingMakingAmount,
        extraData
    ]
);

// 3. Submit to limit order protocol
await limitOrderProtocol.fillOrder(
    order,
    signature,
    makingAmount,
    takingAmount,
    extension
);
```

## Security Considerations

### CREATE3 Security
- Factory is permissioned to prevent spam deployments
- Salts include deployer address for uniqueness
- Deployment can only happen once per salt
- No way to predict contract code from address alone

### Timestamp Tolerance Trade-offs
- 5 minutes allows for reasonable chain differences
- Too short: legitimate transactions fail
- Too long: reduces atomic swap security
- Current value balances usability and security

### Access Token Requirements
- Prevents unauthorized public operations
- Requires resolvers to hold BMN tokens
- Creates economic alignment with protocol

### Front-running Protection
- Deterministic addresses prevent deployment front-running
- Pre-funding escrows before creation prevents race conditions
- Salt uniqueness prevents address squatting

## Conclusion

The CREATE3 implementation significantly improves the Bridge-Me-Not protocol's cross-chain capabilities while maintaining its security properties. The main changes center around deployment infrastructure rather than core protocol logic, making migration straightforward for existing integrations.

Key benefits:
- Consistent addresses across all chains
- Improved deployment security
- Better timestamp handling for cross-chain operations
- Maintained atomic swap guarantees

The resolver implementation requires updates primarily in configuration and destination escrow creation logic. The core monitoring and execution patterns remain unchanged, ensuring a smooth transition to the new contract infrastructure.