### Atomic Swap Implementation Status

Last updated: 2025-08-07

#### Scope

- Project: `bmn-evm-resolver`
- Protocol: Bridge-Me-Not cross-chain atomic swaps (Base ↔ Optimism)

### Current capability

- **Services**: Docker Compose services `resolver`, `alice`, `bob` are running
  and healthy (ports 8000/8001/8002).
- **Alice (maker)**:
  - Creates EIP-712 signed limit orders with PostInteraction v2.2 extension
    data.
  - Persists order+signature locally for resolver consumption
    (`pending-orders/…json`).
  - Auto-monitors and withdraws from destination escrows when ready.
- **Resolver / Bob (taker)**:
  - Reads local orders, ensures approvals, fills via 1inch
    SimpleLimitOrderProtocol, parses Factory PostInteraction events.
  - Stores secrets and withdraws from source escrows after secret reveal.
- **Indexer**:
  - Ponder schema includes `atomic_swap`, `srcEscrow`, `dstEscrow`,
    `escrowWithdrawal` and is queried via `@ponder/client` over SQL.
- **Tests**:
  - Comprehensive PostInteraction v2.2 encoding/util tests in
    `tests/postinteraction-v2.2.test.ts`.
  - A console demo simulates the full flow in `demo-complete-flow.ts`.

### What works end-to-end (today)

- Local-order flow: Alice creates order → Resolver picks it up from
  `pending-orders` → PostInteraction mints escrows → Alice withdraws on
  destination → Resolver withdraws on source.

### Gaps and blockers

- **Indexer-driven fills: partially implemented**
  - `fillLimitOrder` now attempts to load a signed order payload by `hashlock`
    from `pending-orders/<hashlock>.json` and fills via 1inch if present. Remote
    retrieval (from indexer/IPFS/DB) is still pending.
  - File: `src/resolver/resolver.ts`
- ~~Factory address constant mismatch~~: Fixed.
  `CREATE3_ADDRESSES.ESCROW_FACTORY_V2` is defined and used consistently.
  - Files: `src/resolver/resolver.ts`, `src/config/contracts.ts`
- ~~Missing Optimism (chain 10) mapping~~: Fixed. `CONTRACT_ADDRESSES[10]`
  exists; env overrides supported.
  - File: `src/config/contracts.ts`
- **Withdrawal correlation**: Implemented in client by joining withdrawals to
  source escrows to derive `hashlock`/`orderHash`.
  - File: `src/indexer/ponder-client.ts`

### Recommended fixes (priority order)

1. Implement indexer-driven fills (remote payloads):
   - Extend indexer to expose signed order payload + PostInteraction extension
     data, or provide retrievable storage (e.g., IPFS/database) keyed by
     `orderHash`/`hashlock`.
   - Wire resolver to fetch and fill when local payload is absent.
2. N/A (factory constants aligned).
3. N/A (Optimism chain config added).
4. Done: Client now joins withdrawals to derive `hashlock`/`orderHash`.

### How to run (current path)

- Resolver (Bob/LPer):
  - `deno task resolver`
- Alice CLI:
  - Create order (defaults Optimism→Base 1 BMN):
    - `deno task alice --action create --resolver 0xYourResolverAddress`
  - Monitor and auto-withdraw:
    - `deno task alice --action monitor`

Ensure env:

- `RESOLVER_PRIVATE_KEY`, `ALICE_PRIVATE_KEY`, `ANKR_API_KEY`, `INDEXER_URL`.

### Key references

- CLI defaults and commands:
  - `alice.ts`
- Alice implementation:
  - `src/alice/limit-order-alice.ts`
- Resolver core and fill logic:
  - `src/resolver/resolver.ts`
- Indexer client and schema:
  - `src/indexer/ponder-client.ts`
  - `src/indexer/ponder.schema.ts`
- PostInteraction utilities and tests:
  - `src/utils/postinteraction-v2.ts`
  - `tests/postinteraction-v2.2.test.ts`
- Demo flow:
  - `demo-complete-flow.ts`

### Notes

- Docker services (`resolver`, `alice`, `bob`) are healthy under Compose; use
  `make status` or `docker-compose ps` to verify runtime.
- For mainnet/Base↔Optimism, confirm addresses via env before running, or expand
  `contracts.ts` for chain 10.
