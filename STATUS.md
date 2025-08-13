# 🚀 BMN EVM Resolver - Agent Runbook & Current Status

Read me first, every session.

How to keep this file up-to-date (10 min checklist):
- Verify services & versions
  - Entrypoints: `ls alice-service-orpc.ts bob-resolver-service-v2.ts`
- Confirm addresses and ABIs
  - Protocol/factory: `rg -n "LIMIT_ORDER_PROTOCOL|ESCROW_FACTORY" src/config/contracts.ts wagmi.config.ts`
  - Generated actions present: `rg -n "writeSimpleLimitOrderProtocolFillOrderArgs|readSimplifiedEscrowFactoryV2_3AddressOfEscrow" src/generated/contracts.ts`
- Scan for deprecated docs
  - `rg -n "UnifiedResolver|resolver-service.ts|bob-service.ts" -- docs archive`
- Update this file's Status, Services, and Focus Areas accordingly

**Last Updated**: 2025-08-13
**Branch**: `optimism-simplified`
**Version**: v2.3.0
**Status**: ✅ ACTIVE — Core flow unblocked

## 🎯 Project Overview

Cross-chain atomic swap resolver enabling trustless BMN token exchanges between Base and Optimism using 1inch Limit Orders with PostInteraction callbacks and HTLC escrows.

## 🔴 Critical Blockers

None. Previous ABI/signing issues resolved. Remaining prerequisites are operational (balances/allowances). File‑based CLI implemented per plan.md.

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
  - Notes:
    - CLIs are now self-contained under `cli/` and use wagmi-generated actions from `src/generated/contracts.ts`
    - Addresses resolved via env (overrides) with fallbacks to generated addresses; RPC via `cli/cli-config.ts`
    - ABIs re-exported from generated sources in `cli/abis.ts`
    - Unified error logging: `cli/logging.ts` logs full error chain and revert selector/data
- Indexer: Railway hosted (INDEXER_URL)

### Contracts (v2.3.0)
- **Factory (OP + BASE)**: `0xdebE6F4bC7BaAD2266603Ba7AfEB3BB6dDA9FE0A`
- **Protocol (OP + BASE)**: `0xe767105dcfB3034a346578afd2aFD8e583171489`
- **BMN Token (OP + BASE)**: `0x8287CD2aC7E227D9D927F998EB600a0683a832A1`

### Test Results / Smoke Tests
- Type-check: `deno check cli/*` → OK
- CLI smoke tests:
  - order:create → writes order, secret JSON, and status under `data/`
  - swap:execute → uses wagmi actions; on failure logs revert selector/data and full chain
  - withdraw:dst / withdraw:src → use generated actions, with full-trace error logging
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

## 🔧 Focus Areas

1. Migrate remaining manual ABI call sites to wagmi‑generated bindings/actions
2. Ensure prod readiness: balances, allowances, health checks, logging
3. Keep docs lean; mark archived docs as deprecated

## 🚦 Quick Start (CLI, Fresh Context)

```bash
# 1) Environment
cp .env.example .env
# Add: ALICE_PRIVATE_KEY, BOB_PRIVATE_KEY, ANKR_API_KEY

# 2) Generate wagmi types (required by CLIs)
deno task wagmi:generate

# 3) Create order (Base→OP example)
deno task order:create -- --src 8453 --dst 10 --srcAmount 10000000000000000 --dstAmount 10000000000000000 --resolver 0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5

# 4) Execute swap (fill + create dst escrow)
deno task swap:execute -- --file ./data/orders/pending/0xHASHLOCK.json

# 5) Withdrawals
deno task withdraw:dst -- --hashlock 0xHASHLOCK
deno task withdraw:src -- --hashlock 0xHASHLOCK

# 6) Status
deno task status -- --hashlock 0xHASHLOCK
```

## 📈 Progress Metrics

- Core Functionality: 90%
- Test Coverage: N/A (tests removed)
- Documentation: Needs pruning/updates
- Production Ready: In progress (ops checks)

## 🔗 Key Resources

- [Latest Agent Handover](docs/agents/2025-08-12-AGENT-006-atomic-swap-execution-handover-1446.md)
- [Architecture Overview](ARCHITECTURE.md)
- [Issue Tracker](ISSUES/active/)

## 📝 For Next Agent

- Prefer file-based CLI for PoC runs. Services remain available.
- Use wagmi‑generated actions from `src/generated/contracts.ts`.
- Ensure funded keys and allowances for mainnet execution.
- Secrets are persisted to `data/secrets/{hashlock}.json` (PoC).

---
*Auto-generated status for agent handover. Update after significant changes.*