# End-to-End Test Plan for EIP-712 Signing

## Overview
This test plan validates the complete flow of creating, signing, and filling limit orders with proper EIP-712 signatures.

## Test Environment Setup

### Prerequisites
- [ ] Alice account funded with BMN tokens on Base
- [ ] Bob account funded with BMN tokens on Base and Optimism  
- [ ] Token approvals set for limit order protocol
- [ ] Services configured with correct private keys

### Environment Variables
```bash
ALICE_PRIVATE_KEY=<alice_key>
BOB_PRIVATE_KEY=<bob_key>
RESOLVER_ADDRESS=<bob_address>
```

## Test Cases

### 1. Script-Based Order Creation and Filling

#### Test 1.1: Create and Fill Simple Order
```bash
# Create order with Alice account
deno run --allow-all --env-file=.env scripts/create-simple-order.ts

# Verify signature (should show "valid")
deno run --allow-all --env-file=.env scripts/simulate-fill.ts pending-orders/<hashlock>.json

# Check output for:
# - "Maker <address> is EOA"
# - "function": "fillOrderArgs"
# - "signature: valid"
# - "simulate: success (no revert)"
```

#### Test 1.2: Verify EOA Detection
```bash
# Run simulate-fill and confirm it detects EOA correctly
# Should see: "Maker 0x... is EOA"
# Should use: fillOrderArgs with r,vs split signature
```

### 2. Alice Service Order Creation

#### Test 2.1: Alice Service Creates Valid Order
```bash
# Start Alice service
deno run --allow-all --env-file=.env alice-service-v3.ts

# In another terminal, trigger order creation
# Verify order is saved to pending-orders/

# Test signature validation
deno run --allow-all --env-file=.env scripts/simulate-fill.ts pending-orders/<new_order>.json
```

#### Test 2.2: Verify Alice Uses Correct Domain
- Check logs for EIP-712 domain parameters
- Should use: "Bridge-Me-Not Orders" version "1"
- Should use walletClient.signTypedData()

### 3. Bob Resolver Service Order Filling

#### Test 3.1: Bob Service Processes Orders
```bash
# Start Bob service
deno run --allow-all --env-file=.env bob-resolver-service.ts

# Place test order in pending-orders/
# Monitor logs for:
# - EOA detection
# - Correct function selection (fillOrderArgs vs fillContractOrderArgs)
# - Successful transaction
```

#### Test 3.2: Bob V2 Service
```bash
# Test with fixed bob-resolver-service-v2
deno run --allow-all --env-file=.env bob-resolver-service-v2.ts

# Should process orders without TypeErrors
# Should use correct fillLimitOrder parameters
```

### 4. Cross-Chain Atomic Swap Flow

#### Test 4.1: Complete Atomic Swap
```bash
# 1. Create cross-chain order with extension data
deno run --allow-all --env-file=.env scripts/create-order-fixed.ts

# 2. Verify extension data encoding
# Check for proper hashlock, timelocks, deposits

# 3. Fill order and verify escrow creation
# Monitor for PostInteraction execution
```

### 5. Error Scenarios

#### Test 5.1: Invalid Signature
- Modify signature in pending order JSON
- Run simulate-fill
- Should show "signature: INVALID"

#### Test 5.2: Wrong Domain
- Create order with wrong domain name
- Should get BadSignature() error (0x5cd5d233)

#### Test 5.3: Wrong Function for Account Type
- Force fillContractOrderArgs for EOA
- Should get BadSignature() error

## Verification Checklist

### Signature Verification
- [ ] All scripts report "signature: valid"
- [ ] No BadSignature() errors during filling
- [ ] Correct signer recovery

### EOA Detection
- [ ] EOA accounts use fillOrderArgs
- [ ] Smart contracts use fillContractOrderArgs
- [ ] Signature format conversion works (r,vs split)

### Service Integration
- [ ] Alice service creates valid orders
- [ ] Bob service fills orders successfully
- [ ] No TypeErrors or runtime errors

### On-Chain Verification
- [ ] Orders fill successfully on Base
- [ ] Token transfers complete
- [ ] PostInteraction executes (if applicable)

## Debug Commands

### Check Signature Locally
```typescript
// Verify signature matches expected format
const digest = hashTypedData({
  domain: {
    name: "Bridge-Me-Not Orders",
    version: "1",
    chainId: 8453,
    verifyingContract: protocol
  },
  // ... rest of typed data
});
const recovered = recoverAddress({ hash: digest, signature });
```

### Decode Error Messages
```bash
# If you get a revert, decode the error
cast 4byte-decode 0x5cd5d233  # BadSignature()
```

### Manual Transaction Debug
```bash
# Use cast to manually test the transaction
cast call <protocol> <calldata> --rpc-url <rpc> --from <address>
```

## Success Criteria

1. ✅ All test orders create with valid EIP-712 signatures
2. ✅ Signatures validate correctly in simulate-fill
3. ✅ EOA detection works properly
4. ✅ Orders fill successfully on-chain
5. ✅ No BadSignature() errors
6. ✅ Alice and Bob services work end-to-end
7. ✅ Cross-chain atomic swaps complete successfully

## Known Issues to Watch

1. **Domain Mismatch**: Ensure all components use "Bridge-Me-Not Orders" v1
2. **Signature Format**: EOAs need r,vs split, contracts need full bytes
3. **Account Detection**: Empty bytecode = EOA, any bytecode = contract
4. **Extension Encoding**: Salt must have extension hash in lower 160 bits
5. **TakerTraits**: Must include correct extension length

## Next Steps After Testing

1. Run all tests in sequence
2. Document any failures with error messages
3. Verify fixes resolve the issues
4. Run regression tests
5. Deploy to staging environment
6. Monitor for production readiness