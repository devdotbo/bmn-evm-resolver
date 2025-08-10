# Smart Contract Specifications

## Overview

The atomic swap requires minimal smart contracts focused on security and
simplicity. We need Hash Time-Locked Contracts (HTLCs) on each chain that can
lock, unlock with a secret, or refund tokens.

## Core Contracts

### 1. HTLC (Hash Time-Locked Contract)

The main contract that handles the atomic swap logic.

#### Contract Interface

```solidity
interface IHTLC {
    // Events
    event HTLCCreated(
        bytes32 indexed contractId,
        address indexed sender,
        address indexed receiver,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timeout
    );
    
    event HTLCWithdrawn(bytes32 indexed contractId, bytes32 secret);
    event HTLCRefunded(bytes32 indexed contractId);
    
    // Core functions
    function createHTLC(
        address receiver,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timeout
    ) external returns (bytes32 contractId);
    
    function withdraw(bytes32 contractId, bytes32 secret) external;
    function refund(bytes32 contractId) external;
    
    // View functions
    function getContract(bytes32 contractId) external view returns (
        address sender,
        address receiver,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timeout,
        bool withdrawn,
        bool refunded
    );
}
```

#### Implementation Details

```solidity
contract HTLC is IHTLC {
    struct LockContract {
        address sender;
        address receiver;
        address token;
        uint256 amount;
        bytes32 hashlock;
        uint256 timeout;
        bool withdrawn;
        bool refunded;
    }
    
    mapping(bytes32 => LockContract) public contracts;
    
    modifier contractExists(bytes32 contractId) {
        require(contracts[contractId].sender != address(0), "Contract not found");
        _;
    }
    
    modifier hashlockMatches(bytes32 contractId, bytes32 secret) {
        require(
            keccak256(abi.encodePacked(secret)) == contracts[contractId].hashlock,
            "Invalid secret"
        );
        _;
    }
    
    modifier withdrawable(bytes32 contractId) {
        require(!contracts[contractId].withdrawn, "Already withdrawn");
        require(!contracts[contractId].refunded, "Already refunded");
        require(block.timestamp < contracts[contractId].timeout, "Timeout reached");
        _;
    }
    
    modifier refundable(bytes32 contractId) {
        require(!contracts[contractId].withdrawn, "Already withdrawn");
        require(!contracts[contractId].refunded, "Already refunded");
        require(block.timestamp >= contracts[contractId].timeout, "Timeout not reached");
        _;
    }
}
```

### 2. Factory Contract (Optional but Recommended)

Deploys HTLCs with deterministic addresses using CREATE2.

```solidity
contract HTLCFactory {
    event HTLCDeployed(address htlc, bytes32 salt);
    
    function deployHTLC(bytes32 salt) external returns (address) {
        bytes memory bytecode = type(HTLC).creationCode;
        address htlc;
        
        assembly {
            htlc := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(htlc)) { revert(0, 0) }
        }
        
        emit HTLCDeployed(htlc, salt);
        return htlc;
    }
    
    function computeAddress(bytes32 salt) external view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(type(HTLC).creationCode)
            )
        );
        return address(uint160(uint256(hash)));
    }
}
```

## Contract Requirements

### Security Requirements

1. **Reentrancy Protection**
   ```solidity
   contract HTLC is ReentrancyGuard {
       function withdraw(bytes32 contractId, bytes32 secret) 
           external 
           nonReentrant 
       {
           // Implementation
       }
   }
   ```

2. **Safe Token Transfers**
   ```solidity
   using SafeERC20 for IERC20;

   function createHTLC(...) external {
       IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
   }
   ```

3. **Time Validation**
   ```solidity
   require(timeout > block.timestamp + 1 hours, "Timeout too soon");
   require(timeout < block.timestamp + 7 days, "Timeout too far");
   ```

### Gas Optimization

1. **Packed Storage**
   ```solidity
   struct LockContract {
       address sender;      // 20 bytes
       uint32 timeout;      // 4 bytes
       bool withdrawn;      // 1 byte
       bool refunded;       // 1 byte
       // Packs into 1 storage slot (32 bytes)
       
       address receiver;    // 20 bytes
       address token;       // 20 bytes
       uint256 amount;      // 32 bytes
       bytes32 hashlock;    // 32 bytes
   }
   ```

2. **Minimal Storage Writes**
   - Use events for logging instead of storage
   - Delete storage when refunding/withdrawing to get gas refund

3. **Efficient ID Generation**
   ```solidity
   function generateId(
       address sender,
       address receiver,
       address token,
       uint256 amount,
       bytes32 hashlock,
       uint256 timeout
   ) public pure returns (bytes32) {
       return keccak256(abi.encodePacked(
           sender, receiver, token, amount, hashlock, timeout
       ));
   }
   ```

## Deployment Strategy

### 1. Same Address Across Chains

Use CREATE2 with same salt and deployer:

```javascript
const salt = ethers.utils.id("HTLC_V1");
const factoryAddress = "0x..."; // Same on all chains

// Deploy on Base
const htlcBase = await factory.deployHTLC(salt);

// Deploy on Optimism
const htlcOptimism = await factory.deployHTLC(salt);

// Both will have the same address
```

### 2. Initialization Pattern

```solidity
contract HTLC {
    address public owner;
    bool public initialized;
    
    function initialize(address _owner) external {
        require(!initialized, "Already initialized");
        owner = _owner;
        initialized = true;
    }
}
```

## Testing Requirements

### Unit Tests

1. **Happy Path**
   - Create HTLC
   - Bob creates matching HTLC
   - Alice withdraws with secret
   - Bob withdraws with same secret

2. **Timeout Scenarios**
   - Alice refunds after timeout
   - Bob cannot withdraw after timeout
   - Cannot refund before timeout

3. **Security Tests**
   - Reentrancy attacks
   - Wrong secret rejection
   - Unauthorized access attempts

### Integration Tests

1. **Cross-chain Flow**
   - Deploy on testnets
   - Execute full swap
   - Verify state consistency

2. **Gas Measurements**
   - Measure deployment cost
   - Measure operation costs
   - Optimize if needed

## Upgrade Strategy

### Using Proxy Pattern (Optional)

```solidity
contract HTLCProxy is TransparentUpgradeableProxy {
    constructor(
        address logic,
        address admin,
        bytes memory data
    ) TransparentUpgradeableProxy(logic, admin, data) {}
}
```

### Direct Deployment (Recommended for Simplicity)

- Deploy new version with new salt
- Migrate active swaps if needed
- Keep old version running for completion

## Contract Verification

### Etherscan Verification

```bash
# Verify on Base
npx hardhat verify --network base \
  --contract contracts/HTLC.sol:HTLC \
  HTLC_ADDRESS

# Verify on Optimism
npx hardhat verify --network optimism \
  --contract contracts/HTLC.sol:HTLC \
  HTLC_ADDRESS
```

### Security Audit Checklist

- [ ] No reentrancy vulnerabilities
- [ ] Proper access control
- [ ] Safe math operations (Solidity 0.8+)
- [ ] No front-running vulnerabilities
- [ ] Proper event emission
- [ ] Gas optimization implemented
- [ ] Emergency pause mechanism (optional)
- [ ] Time manipulation resistance

## Example Deployment Script

```javascript
async function deployHTLC() {
  const HTLC = await ethers.getContractFactory("HTLC");

  // Deploy on multiple chains
  const chains = ["base", "optimism", "arbitrum"];
  const deployments = {};

  for (const chain of chains) {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URLS[chain]);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const htlc = await HTLC.connect(wallet).deploy();
    await htlc.deployed();

    deployments[chain] = htlc.address;
    console.log(`HTLC deployed on ${chain}: ${htlc.address}`);
  }

  return deployments;
}
```

## Gas Costs Estimation

| Operation   | Estimated Gas | Cost (at 30 gwei) |
| ----------- | ------------- | ----------------- |
| Deploy HTLC | ~800,000      | ~0.024 ETH        |
| Create HTLC | ~120,000      | ~0.0036 ETH       |
| Withdraw    | ~80,000       | ~0.0024 ETH       |
| Refund      | ~60,000       | ~0.0018 ETH       |

## Next Steps

- Implement contracts in Solidity
- Write comprehensive tests
- Deploy to testnets
- Get security audit
- Deploy to mainnet
