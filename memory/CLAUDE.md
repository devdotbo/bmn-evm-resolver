# CLAUDE.md - Bridge-Me-Not EVM Resolver

This file provides comprehensive guidance for AI agents working with the Bridge-Me-Not EVM Resolver codebase.

## Quick Start for New Agents

### What is This?
Bridge-Me-Not is a **trustless cross-chain atomic swap protocol** that enables token swaps between EVM chains without bridges. This repository contains the **resolver implementation** (liquidity provider side) and test client.

### Current State
- **Status**: MAINNET DEPLOYMENT ACTIVE
- **Chains**: Base (8453) ↔ Etherlink (42793)
- **Token**: BMN (0x6225A0055D560d132e7d8167D5b5b26cebD64a0C)
- **Issue**: One 10 BMN order pending recovery

### Key Facts
1. **Two Actors**: Alice (creates orders) and Bob (fills orders as resolver)
2. **Security**: Uses hashlocks and timelocks for atomic swaps
3. **No Bridge**: Direct peer-to-peer swaps without intermediaries
4. **Profitable**: Resolvers earn ~1% profit on each swap

## Critical Information

### ⚠️ IMPORTANT: Token Approvals
**Tokens must be approved to `EscrowFactory`, NOT `LimitOrderProtocol`!**

This was a major bug that was fixed. The correct flow:
```typescript
// CORRECT: Approve to EscrowFactory
await tokenA.write.approve([escrowFactoryA.address, amount]);

// WRONG: Do not approve to LimitOrderProtocol
// await tokenA.write.approve([limitOrderProtocol.address, amount]);
```

### 🔧 Recent Fixes Applied
1. **Token approval target** - Fixed to approve to EscrowFactory
2. **@ponder/client removal** - Removed unused dependency
3. **Mainnet configuration** - Added proper mainnet settings
4. **Recovery scripts** - Created for stuck orders

## Environment Setup

### Required Environment Variables
```bash
# Network Configuration
NETWORK_MODE=mainnet              # or "local" for testing
CHAIN_A_RPC=https://mainnet.base.org
CHAIN_B_RPC=https://node.mainnet.etherlink.com

# Private Keys (NEVER COMMIT!)
ALICE_PRIVATE_KEY=0x...          # Order creator
BOB_PRIVATE_KEY=0x...            # Resolver

# Contract Addresses (Mainnet)
BMN_TOKEN_ADDR=0x6225A0055D560d132e7d8167D5b5b26cebD64a0C
ESCROW_FACTORY_A_ADDR=0xE5dC3215324eE06A7693E5c67D8Be0a811F42288
ESCROW_FACTORY_B_ADDR=0xeb1aAdAC0a10Ac2eDFCbE496C3BCBc1dea4F994b
LIMIT_ORDER_PROTOCOL_ADDR=0xdBB02F45E83A56D6b8e387BB3F08cB39309Cb8fE
```

## Quick Commands

### Most Common Tasks
```bash
# Start resolver (Bob)
deno task resolver:start

# Create order (Alice) 
deno task alice:create-order --amount 10 --token-a BMN --token-b BMN

# Recover stuck order
deno task alice:withdraw --order-id 1

# Check all balances
deno run --allow-all scripts/check-balances.ts
```

## Architecture Summary

### Smart Contract Flow
```
1. Alice creates order → EscrowSrc deployed (holds Alice's tokens)
2. Bob fills order → EscrowDst deployed (holds Bob's tokens)  
3. Alice withdraws → Reveals secret on destination chain
4. Bob claims → Uses revealed secret on source chain
```

### Key Contracts
- **EscrowFactory**: Deploys escrows, needs token approval
- **LimitOrderProtocol**: Order registry, emits events
- **EscrowSrc/Dst**: Hold tokens with hashlock/timelock

### Security Model
- **Hashlock**: Same secret unlocks both escrows
- **Timelock**: Source (20min) > Destination (5min)
- **Safety Deposit**: 0.00002 ETH prevents griefing

## Common Issues & Solutions

### Issue: "Insufficient allowance"
**Solution**: Approve tokens to EscrowFactory, not LimitOrderProtocol
```typescript
await tokenA.write.approve([escrowFactoryA.address, amount]);
```

### Issue: "@ponder/client not found"
**Solution**: Already fixed - this import was removed

### Issue: Order stuck/not processed
**Solution**: Use recovery command after timeout
```bash
deno task alice:withdraw --order-id 1
```

### Issue: "Cannot find module" errors
**Solution**: Ensure proper import paths with .ts extensions
```typescript
// Correct
import { something } from "./module.ts";
// Wrong  
import { something } from "./module";
```

## Project Structure

```
bmn-evm-resolver/
├── src/
│   ├── alice/          # Order creator logic
│   ├── resolver/       # Bob's resolver implementation
│   ├── config/         # Chain and contract config
│   └── utils/          # Shared utilities
├── scripts/
│   ├── recovery/       # Recovery tools for stuck orders
│   └── test-flow.sh    # End-to-end test script
├── abis/              # Contract ABIs from bmn-evm-contracts
└── memory/            # Project state documentation
```

## Testing

### Local Testing
```bash
# Start local chains (in bmn-evm-contracts)
./scripts/multi-chain-setup.sh

# Run test flow
./scripts/test-flow.sh local
```

### Mainnet Testing
```bash
# Use small amounts!
./scripts/test-flow.sh mainnet
```

## Key Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Security Deposit | 0.00002 ETH | Griefing prevention |
| Source Timeout | 20 minutes | Protect Alice |
| Destination Timeout | 5 minutes | Protect Bob |
| Resolver Profit | ~1% | Incentive for Bob |

## Debugging Tips

### Check Order Status
```bash
# Get order details
cast call $ESCROW_FACTORY_A_ADDR "orders(uint256)" 1 --rpc-url $CHAIN_A_RPC

# Check if escrow exists
cast call $ESCROW_FACTORY_A_ADDR "srcEscrows(uint256)" 1 --rpc-url $CHAIN_A_RPC
```

### Monitor Events
```bash
# Watch for new orders
cast events --rpc-url $CHAIN_A_RPC \
  --address $ESCROW_FACTORY_A_ADDR \
  "OrderCreated(uint256,address,address,uint256,bytes32,uint256)"
```

### Check Balances
```bash
# BMN balance on Base
cast call $BMN_TOKEN_ADDR "balanceOf(address)" $ALICE_ADDR --rpc-url $CHAIN_A_RPC
```

## Working with This Codebase

### Do's
- ✅ Always check token approvals go to EscrowFactory
- ✅ Use proper TypeScript imports with .ts extensions
- ✅ Test with small amounts first
- ✅ Monitor gas prices for profitability
- ✅ Handle all error cases

### Don'ts
- ❌ Never approve tokens to LimitOrderProtocol
- ❌ Don't hardcode private keys
- ❌ Don't ignore timelocks
- ❌ Don't reuse secrets between orders
- ❌ Don't skip safety deposits

## Related Repositories

1. **bmn-evm-contracts**: Smart contracts (../bmn-evm-contracts)
2. **bmn-evm-indexer**: Event indexing service (../bmn-evm-indexer)
3. **fusion-resolver-example**: Reference implementation (../1inch/fusion-resolver-example)

## Current TODO

1. **Immediate**: Process/recover the stuck 10 BMN order
2. **Short-term**: Improve error handling in resolver
3. **Medium-term**: Add monitoring dashboard
4. **Long-term**: Multi-token support

## Contact & Support

- **Issues**: Check memory/RECENT_FIXES.md first
- **Architecture**: See memory/ARCHITECTURE_NOTES.md
- **Commands**: See memory/KEY_COMMANDS.md
- **Next Steps**: See memory/NEXT_STEPS.md

## Summary for New Agents

You're working on a cross-chain atomic swap resolver. The main challenge is coordinating trustless swaps between two chains using hashlocks and timelocks. Recent fixes addressed token approval issues and dependency problems. The system is now deployed on mainnet (Base ↔ Etherlink) with BMN token. One order is currently stuck and needs recovery. The resolver monitors events, evaluates profitability, and executes swaps to earn ~1% profit.

**Most important thing to remember**: Always approve tokens to EscrowFactory, never to LimitOrderProtocol!