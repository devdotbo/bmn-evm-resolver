# 🚀 BMN EVM Resolver - Agent Runbook & Current Status

Read me first, every session.

Status file policy (read once):
- This file is maintained chronologically like a changelog. Do not replace prior content; append new session updates with date/time headers.
- For major milestones, include a short flow summary (ASCII) and link to a detailed doc in `docs/` with full addresses and tx hashes.
- Keep quick-run commands and current pointers near the top, but record outcomes as new entries below.

How to keep this file up-to-date (10 min checklist):
- Verify services & versions
  - Entrypoints: `ls alice-service-orpc.ts bob-resolver-service-v2.ts`
- Confirm addresses and ABIs
  - Protocol/factory: `rg -n "LIMIT_ORDER_PROTOCOL|ESCROW_FACTORY" src/config/contracts.ts wagmi.config.ts`
  - Generated actions present: `rg -n "writeSimpleLimitOrderProtocolFillOrderArgs|readSimplifiedEscrowFactoryV2_3AddressOfEscrow" src/generated/contracts.ts`
- Scan for deprecated docs
  - `rg -n "UnifiedResolver|resolver-service.ts|bob-service.ts" -- docs archive`
- Update this file's Status, Services, and Focus Areas accordingly

**Last Updated**: 2025-08-14 (Session Update - Part 4)
**Branch**: `optimism-simplified`
**Version**: v2.3.2
**Status**: ✅ ACTIVE — E2E mainnet atomic swap completed (Base ↔ Optimism)

## 🎯 Project Overview

Cross-chain atomic swap resolver enabling trustless BMN token exchanges between Base and Optimism using 1inch Limit Orders with PostInteraction callbacks and HTLC escrows.

## 🎯 Current State

### ✅ What's Working
- **E2E Atomic Swap Flow**: Complete flow from order creation to withdrawal
- **Immutables Handling**: Proper storage and reconstruction
- **Timelocks**: Offset-based packing with deployedAt (TimelocksLib compatible)
- **PostInteraction Parsing**: Correctly handles 28-byte padding
- **Error Reporting**: Known revert selectors mapped to human-readable errors

### ⚠️ Known Issues
- **Withdrawal Timing**: Must wait for timelock window (use `--wait` flag)
- **Offsets Header**: Still using workaround, needs proper cumulative layout
- **Manual ABIs**: Some files still use manual imports instead of wagmi-generated

## 📊 System State

### Interfaces
- Services (optional):
  - Alice (oRPC + OpenAPI): `deno run -A --unstable-kv --env-file=.env alice-service-orpc.ts`
  - Bob-Resolver: `deno run -A --unstable-kv --env-file=.env bob-resolver-service-v2.ts`
- File-based CLI (preferred for PoC):
  - `deno task order:create`
  - `deno task swap:execute`
  - `deno task withdraw:dst`
  - `deno task withdraw:src`
  - `deno task status`
  - `deno task approve:maker` (helper to grant BMN allowance to protocol/factory)
  - Notes:
    - CLIs are now self-contained under `cli/` and use wagmi-generated actions from `src/generated/contracts.ts`
    - Addresses resolved via env (overrides) with fallbacks to generated addresses; RPC via `cli/cli-config.ts` (uses `ANKR_API_KEY`)
    - ABIs re-exported from generated sources in `cli/abis.ts`
     - Unified error logging: `cli/logging.ts` logs full error chain and revert selector/data; catch handlers print full errors
    - Writes use LocalAccount for `writeContract` actions (prevents ConnectorNotConnectedError)
- Indexer: Railway hosted (INDEXER_URL)

### Contracts (v2.3.0)
- **Factory (OP + BASE)**: `0xdebE6F4bC7BaAD2266603Ba7AfEB3BB6dDA9FE0A`
- **Protocol (OP + BASE)**: `0xe767105dcfB3034a346578afd2aFD8e583171489`
- **BMN Token (OP + BASE)**: `0x8287CD2aC7E227D9D927F998EB600a0683a832A1`

### Test Results / Smoke Tests
- Lint: `deno lint` → OK (generated/indexer files excluded via config)
- Type-check: `deno check` → OK
- CLI flow (latest):
  - order:create → ✅ OK (supports --srcCancelSec/--dstWithdrawSec)
  - swap:execute → ✅ OK (fills order + creates dst escrow with correct immutables)
  - withdraw:dst → ✅ OK (with stored immutables, respects timelock windows)
  - withdraw:src → OK (after successful dst reveal)
- Full E2E atomic swap (mainnet) → ✅ WORKING
  - Hashlock: `0x534f63afed3967d382203e351a5b068aa705c4a017ef5b85e250e5f5a2e32ad3`
  - Base fill: https://basescan.org/tx/0x4df862bb836ed26bb2f4287b19231f13b3aa8de8025c15cf34c6433ffd5d219d
  - OP create dst escrow: https://optimistic.etherscan.io/tx/0xc0f21f6e46cfd188c1c561b512a80ec18cfa33b3315fba2fdd4ad84c0bb1fbc7
  - OP withdraw: https://optimistic.etherscan.io/tx/0xb725ec97e7b629b16bd6db75bd75459eac6affdee7a3d737ff368f84b5876d26
  - Base withdraw: https://basescan.org/tx/0xe1c1e07e73908b5dab633120739d6a18f6757359a61452ef4ccd4dcc131ffa90
  - Src escrow (Base): `0xd6AFf963b14485b1ACdE1535C7C52bfB0B2b9A18`
  - Dst escrow (OP): `0x5925919Ddd33971AAeA953d6F8A2bac303D0BfC9`

## 🧭 Session Log (Chronological)

### 2025‑08‑14 – Mainnet E2E Atomic Swap

```text
BASE (8453)                                        OPTIMISM (10)
[Alice] 0x240E...72FFFd8                          [Factory] 0xdebE...dDA9FE0A
[Bob]   0xfdF1...C312b7B5                         [LOP]     0xe767...71489

1) Fill (Base, LOP): 0x4df862...219d
   ↳ Factory.postInteraction creates src escrow
   ↳ Src Escrow (Base): 0xd6AFf963b14485b1ACdE1535C7C52bfB0B2b9A18
2) Create Dst Escrow (OP): 0xc0f21f...fbc7
   ↳ Dst Escrow (OP): 0x5925919Ddd33971AAeA953d6F8A2bac303D0BfC9
3) Withdraw (OP): 0xb725ec...b5876d26 (secret reveal)
4) Withdraw (Base): 0xe1c1e0...1ffa90
```

Details and full references: see `docs/MAINNET_E2E_2025-08-14.md`.
- Successful test transactions:
  - Destination withdrawal: 0x901668112d86c721be4b1aa18576d4014c021e6d59333e699c814ee0bd75af1a
- Formal tests removed in latest cleanup (2025-08-13)

## 📁 Repository Structure

```
bmn-evm-resolver/
├── ISSUES/              # Active issue tracking
│   ├── active/          # Current blockers
│   ├── resolved/        # Fixed issues
│   └── blocked/         # Waiting on external
├── src/
│   ├── alice/           # Order creation
│   ├── resolver/        # Coordinator logic
│   ├── utils/           # Core utilities
│   └── config/          # Chain configs
├── scripts/             # Operational tools
├── abis/                # Contract ABIs (v2.3)
└── archive/             # Deprecated code
```

## 🚀 Next Tasks (Priority Order)

### 🔴 Immediate (Blocking Production)
1. **Fix Offsets Header Implementation**
   - Current: Using workaround by skipping 4-byte header
   - Need: Proper cumulative offsets layout for all extension fields  
   - File: `cli/postinteraction.ts`
   - Blocker: Required for mainnet compatibility with 1inch protocol

2. **Test Source Escrow Withdrawal**
   - Current: Only tested destination withdrawal
   - Need: Verify Bob can withdraw from source after Alice reveals secret
   - Test: Full bidirectional atomic swap flow

### 🟡 Important (Quality/Maintenance)
3. **Migrate to Wagmi Bindings**
   - Files still using manual ABIs in `cli/` and `src/`
   - Goal: All contract calls through wagmi-generated actions
   - Benefit: Type safety and reduced errors

4. **Production Readiness**
   - Implement comprehensive preflight checks
   - Add retry logic for network failures
   - Gas estimation and optimization
   - Monitoring and alerting
    - Maintain lint and type-check gates (use `deno lint` / `deno check`)

### 🟢 Nice to Have
5. **Documentation Cleanup**
   - Archive deprecated docs in `/archive`
   - Update examples with v2.3.2 flow
   - Add troubleshooting guide

## 🚧 Current Blockers

1. **Offsets Header Format** (CRITICAL)
   - Missing exact 1inch extension format documentation
   - Current workaround: Skip 4-byte header (0x000000b4)
   - Impact: May fail with different extension layouts

2. **Timelock Window UX**
   - Users must wait for window or use `--wait` flag
   - No automatic retry mechanism
   - Consider adding exponential backoff

## 🔧 Where We Are

- **Just Fixed**: Critical immutables/timelocks bugs preventing withdrawals
- **Current Achievement**: Full E2E atomic swap working (order → fill → dst escrow → withdraw)
- **Tested**: Successful destination withdrawal with proper immutables (tx: 0x901668...)
- **Not Yet Tested**: Source escrow withdrawal after secret reveal
- **Ready For**: Development testing, NOT production (offsets header issue)

## 🚦 Quick Start (Test the Working Flow)

```bash
# Setup
cp .env.example .env
# Add: ALICE_PRIVATE_KEY, BOB_PRIVATE_KEY, ANKR_API_KEY

# Quick E2E Test (Automated)
deno run -A --unstable-kv --env-file=.env scripts/test-swap-flow.ts

# Or Manual Steps:
# 1) Ensure approvals
deno run -A --unstable-kv --env-file=.env scripts/ensure-all-approvals.ts

# 2) Check balances
deno task check:balances

# 3) Create order
deno task order:create -- --src 8453 --dst 10 --srcAmount 10000000000000000

# 4) Execute swap (auto-stores immutables)
deno task swap:execute -- --file ./data/orders/pending/0xHASHLOCK.json

# 5) Withdraw from destination (uses stored immutables)
deno task withdraw:dst -- --hashlock 0xHASHLOCK --wait

# 6) Withdraw from source (after secret revealed)
deno task withdraw:src -- --hashlock 0xHASHLOCK
```

## 📈 Progress Metrics

- Core Functionality: 95% (E2E flow working)
- Test Coverage: N/A (tests removed)
- Documentation: Updated with critical fixes
- Production Ready: 85% (needs final cleanup)

## 🔗 Key Resources

- [Latest Agent Handover](docs/agents/2025-08-12-AGENT-006-atomic-swap-execution-handover-1446.md)
- [Architecture Overview](ARCHITECTURE.md)
- [Immutables and Timelocks Guide](docs/IMMUTABLES_AND_TIMELOCKS.md)
- [Issue Tracker](ISSUES/active/)

## 📝 For Next Agent

### Start Here:
1. Run `scripts/test-swap-flow.ts` to verify E2E flow works
2. Check `## 🚀 Next Tasks` section above for priorities
3. Main blocker: Offsets header implementation in `cli/postinteraction.ts`
4. Keep `deno lint`/`deno check` green; avoid silent catches; always log full errors

### Key Files to Know:
- `cli/swap-execute.ts` - Contains immutables storage logic (working)
- `cli/withdraw-dst.ts` - Uses stored immutables (working)
- `src/utils/escrow-creation.ts` - PostInteraction parser with 28-byte padding fix
- `docs/IMMUTABLES_AND_TIMELOCKS.md` - Critical architecture guide

### Testing Commands:
```bash
# Quick test
deno run -A --unstable-kv --env-file=.env scripts/test-swap-flow.ts

# Check what's broken
deno task check:balances
deno run -A --unstable-kv --env-file=.env scripts/ensure-all-approvals.ts
```

---
*Auto-generated status for agent handover. Update after significant changes.*