## AGENT-005 — Atomic Swap Fix Plan (Limit Order v2.2)

Timestamp: 2025-08-11

### Context (fresh)

- OP fork simulation was reverting due to BitInvalidatedOrder in `OrderMixin` when the bit invalidator slot/bit had already been set by a prior attempt.
- We now compute and sign the on-chain order digest consistently with the protocol:
  - Local `hashTypedData` on the Order type with domain `{ name: "Bridge-Me-Not Orders", version: "1", chainId, verifyingContract }`.
  - This matches `order.hash(_domainSeparatorV4())` and the Solidity check `ECDSA.recover(orderHash, r, vs)`.
- 1inch extension offsets and postInteraction payload are correct for v2.2:
  - Offsets word at bytes 0..31.
  - Field 7 (PostInteractionData) end set to `bytes(postInteraction)` length.
  - PostInteraction payload layout: 20‑byte factory target + abi-encoded 5‑tuple `(bytes32 hashlock, uint256 dstChainId, address dstToken, uint256 deposits, uint256 timelocks)` where `deposits = (dstSafetyDeposit << 128) | srcSafetyDeposit`, `timelocks = (srcCancelTs << 128) | dstWithdrawTs)`.
- Simulator improvements:
  - Verifies signature locally by recovering maker from the typed digest.
  - Auto-approves BMN for the protocol and factory using keys from env.
  - Prints offsets, takerTraits summary, decoded 5‑tuple, and raw calldata.
  - Prefers Tenderly VRPC via `LOCAL_OP_RPC` / `LOCAL_BASE_RPC`.
- Result: With a fresh makerTraits.nonce and approvals in place, OP fork simulation succeeds (no revert).

### Root causes we fixed

- MakerTraits default allowed `useBitInvalidator()` (no `allowMultipleFills` and `nonceOrEpoch = 0`). If the same bit is reused (same slot/bit), `checkAndInvalidate` reverts with `BitInvalidatedOrder`.
- Intermittent timeouts on public RPCs when calling `hashOrder` were removed by computing the digest locally and using Tenderly VRPC for reads.

### Code changes to keep

- Alice (`src/alice/limit-order-alice.ts`)
  - Sign the on-chain digest (local `hashTypedData`) and pack `(r, vs)` the same way as filler.
  - Prefer `LOCAL_OP_RPC` / `LOCAL_BASE_RPC`; keep Ankr/mainnet as fallback.
  - Add `SIMULATE_ONLY` to skip real approvals when only generating a pending order JSON.
  - Build maker traits via a builder that sets a unique nonce:
    - `allowMultipleFills = true` so bit invalidator path is off.
    - `nonceOrEpoch = unique 40‑bit` per order to avoid slot/bit reuse regardless.
    - Optionally set `allowedSender` to the resolver for private orders.

- PostInteraction utils (`src/utils/postinteraction-v2.ts`)
  - Keep offsets encoding and 5‑tuple payload.
  - MakerTraits builder (`MAKER_TRAITS.build`) to explicitly set flags and low‑200 bits (allowedSender, expiration, nonceOrEpoch, series).

- Simulator (`scripts/simulate-fill.ts`)
  - Keep local signature recovery check, decoded diagnostics, and approvals for protocol + factory.
  - Ensure takerTraits.argsExtensionLength equals `bytes(extension)`.

### What remains to make atomic swap production‑ready

- Alice
  - Use the maker traits builder everywhere we construct orders.
  - Store per-order nonce to avoid accidental reuse across restarts (optional but recommended).
  - Parameterize `allowedSender` with RESOLVER when we want private orders.

- Bob/Resolver (`bob-resolver-service.ts`)
  - Before fill, call `ensureLimitOrderApprovals` (token -> protocol, token -> factory).
  - Use `fillLimitOrder` with computed takerTraits and extension from pending order JSON.
  - Prefer VRPC if set; otherwise mainnet RPC.
  - Confirm `PostInteractionExecuted`, `SrcEscrowCreated`, `DstEscrowCreated` from receipt and persist to state.

- Contracts/config
  - Verify LOP and Factory addresses per chain in `src/config/contracts.ts`.
  - Ensure resolver is whitelisted where required by factory/extension policy.

- Operational
  - `.env` must have `ALICE_PRIVATE_KEY`, `RESOLVER_PRIVATE_KEY` (or `BOB_PRIVATE_KEY`), optional `ANKR_API_KEY`, `LOCAL_OP_RPC`, `LOCAL_BASE_RPC`, `INDEXER_URL`.
  - For Deno tasks, pass `--env-file=.env` (docker-compose already uses env_file).

### Runbook (forks first, then mainnet dry run)

1) Create order (OP → Base example)
   - `RESOLVER=<addr> SRC_CHAIN=10 DST_CHAIN=8453 SIMULATE_ONLY=1 deno task order:create`
   - Produces `pending-orders/<hashlock>.json`

2) Simulate on OP fork
   - `LOCAL_OP_RPC=<tenderly_op_vrpc> deno run --allow-net --allow-env --allow-read --env-file=.env scripts/simulate-fill.ts`
   - Expect: signature valid, offsets ok, decoded 5‑tuple printed, simulate success.

3) Resolver end‑to‑end on forks
   - Start resolver: `deno task bob`
   - Ensure approvals and fill succeed on Base and OP forks; parse and persist factory events; `/stats` should increment.

4) Mainnet dry run (call simulate via public RPC or private provider)
   - Same simulate script with `ANKR_API_KEY` or private RPC; ensure success.

5) Tiny live fill
   - Send a minimal order; decode events: `deno task decode:factory --tx <hash> --chain 8453|10`.
   - Verify `PostInteractionExecuted`, `SrcEscrowCreated`, `DstEscrowCreated`; resolver persisted escrows.

### Risks and mitigations

- Bit invalidator reuse: mitigated by `allowMultipleFills = true` and fresh `nonceOrEpoch` per order; optionally persist last used nonce.
- Domain mismatch: eliminated by signing the same digest the contract recovers (`hashTypedData` domain matches `_domainSeparatorV4`).
- RPC fragility: prefer VRPC; avoid on‑chain `hashOrder` reads in hot paths.
- Approvals: ensure both protocol and factory approvals; simulator and resolver handle this.

### Acceptance criteria

- OP and Base forks: simulate success for newly created orders; no BitInvalidatedOrder.
- Resolver fill (forks): emits `PostInteractionExecuted`, `SrcEscrowCreated`, `DstEscrowCreated`; resolver stores records and `/stats` increments.
- Mainnet simulate: success on both chains.
- One tiny live fill on each chain meets the same event and persistence expectations.

### Pointers (files)

- `src/alice/limit-order-alice.ts` — chain‑aware signing; maker traits builder; VRPC support; SIMULATE_ONLY.
- `src/utils/postinteraction-v2.ts` — offsets, payload encoding, MakerTraits builder.
- `scripts/simulate-fill.ts` — diagnostics, digest verification, auto‑approvals, VRPC.
- `src/utils/limit-order.ts` — `fillLimitOrder`, error decode, approvals helper.
- `bob-resolver-service.ts` — unify resolver flow and persistence.


