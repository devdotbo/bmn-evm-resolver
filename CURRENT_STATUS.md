# 🚀 BMN EVM Resolver - Current Status

**Last Updated**: 2025-08-13
**Branch**: `optimism-simplified`
**Version**: v2.3.0
**Status**: ✅ ACTIVE — Core flow unblocked

## 🎯 Project Overview

Cross-chain atomic swap resolver enabling trustless BMN token exchanges between Base and Optimism using 1inch Limit Orders with PostInteraction callbacks and HTLC escrows.

## 🔴 Critical Blockers

None. Previous ABI/signing issues resolved. Remaining prerequisites are operational (balances/allowances).

## 📊 System State

### Services
- Docker Compose: `docker-compose up -d --build`
- Alice (oRPC + OpenAPI): http://localhost:8001/health and /docs
- Bob-Resolver: http://localhost:8002/health
- Indexer: Railway hosted (INDEXER_URL)

### Contracts (v2.3.0)
- **Factory**: `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68`
- **Protocol (Optimism)**: `0xe767105dcfB3034a346578afd2aFD8e583171489`
- **BMN Token**: `0x8287CD2aC7E227D9D927F998EB600a0683a832A1`

### Test Results
- Unit: green
- Integration (oRPC): green per recent fixes (see CHANGELOG)

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

## 🚦 Quick Start

```bash
# 1. Environment setup
cp .env.example .env
# Add: ALICE_PRIVATE_KEY, BOB_PRIVATE_KEY, ANKR_API_KEY

# 2. Start services
docker-compose up -d --build

# 3. Check health
curl http://localhost:8001/health  # Alice
curl http://localhost:8002/health  # Bob-Resolver

# 4. Create order (after fixes)
RESOLVER=0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5 \
AMOUNT=0.01 SRC_CHAIN=10 DST_CHAIN=8453 \
deno task order:create
```

## 📈 Progress Metrics

- Core Functionality: 90%
- Test Coverage: High (unit + integration pass)
- Documentation: Needs pruning/updates
- Production Ready: In progress (ops checks)

## 🔗 Key Resources

- [Latest Agent Handover](docs/agents/2025-08-12-AGENT-006-atomic-swap-execution-handover-1446.md)
- [Architecture Overview](ARCHITECTURE.md)
- [Docker Setup](DOCKER_QUICK_START.md)
- [Issue Tracker](ISSUES/active/)

## 📝 For Next Agent

- Prefer `alice-service-orpc.ts` and `bob-resolver-service-v2.ts` entrypoints
- Use wagmi‑generated `src/generated/contracts.ts` and actions
- Verify allowances and funds on Base/Optimism before e2e

---
*Auto-generated status for agent handover. Update after significant changes.*