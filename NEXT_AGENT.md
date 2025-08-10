# Next Agent Handover

This document provides a minimal, high-signal handover for the next agent to
continue work seamlessly.

## Current Runtime Status

- Bob-Resolver: Docker `bmn-bob-resolver`, healthy at
  `http://localhost:8002/health`.
- Alice (local): Deno service running on port 18002 and healthy (`/health`). A
  Docker `bmn-alice` may also be running but idle.
- Indexer: Using hosted `https://index-bmn.up.railway.app` (SQL over HTTP at
  `/sql`).
- ANKR_API_KEY: Loaded from `.env` for both local and container contexts.

## Latest Actions

- Created a Base → Optimism limit order for 0.01 BMN via
  `scripts/create-order.ts`.
  - Order hash:
    `0xa69907eeb28f98f85ae35e92435ccc88f906514325c24183bdd25f189147a2d5`
  - Hashlock file:
    `pending-orders/0xf759119bee651fd4aab04b3df70f80a3c3c187b4e2ea461d4bc0c449ae6694e1.json`
  - Copied into Bob container: `/app/pending-orders/…6694e1.json`
- Bob detects the order repeatedly, but filling did not complete (`/fill-order`
  returned `result: false`).
- Verified resolver wallet on Base has 2,000,000 BMN.

## Known Issues / Next Steps

1. Fill not executing
   - Logs show simulate/fill inputs printed but no success line; result=false
     from API.
   - Action: call `/fill-order` with full payload exactly as `UnifiedResolver`
     expects. If still false, inspect approvals and error handler output.
     - Endpoint: `POST http://localhost:8002/fill-order`
     - Body: contents of the hashlock file plus top-level `takerAmount` and
       `takerAsset` (already attempted). Consider adding `takerTraits: 0` and
       ensuring numeric strings are converted to numbers where required.
   - If needed, restart `bmn-bob-resolver` to reset internal processed state.

2. Approvals
   - `ensureLimitOrderApprovals` should auto-approve protocol and factory. If
     PostInteraction failures occur, error handler may request re-approval.
   - Action: watch Bob logs for approval calls or errors.

3. Alice auto-withdraw
   - Alice is healthy and will auto-withdraw after destination escrow creation
     (`dst_created`). Nothing to do until fill succeeds.

## Commands (always use --env-file=.env for local Deno)

- Create order (example):
  ```bash
  RESOLVER=0x<resolver> AMOUNT=0.01 SRC_CHAIN=8453 DST_CHAIN=10 \
  deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv --env-file=.env scripts/create-order.ts
  ```
- Trigger fill:
  ```bash
  curl -sS -X POST http://localhost:8002/fill-order \
    -H 'Content-Type: application/json' \
    -d "$(jq '. + {takerAmount: .order.takingAmount, takerAsset: .order.takerAsset, takerTraits: "0"}' pending-orders/<hashlock>.json)"
  ```
- Check health:
  ```bash
  curl -sS http://localhost:8002/health
  curl -sS http://localhost:18002/health
  ```

## Repo Conventions

- Always run local Deno commands with `--env-file=.env` (documented in
  `.cursor/rules/bmn.md` and `AGENTS.md`).
- Docker Compose injects `.env` via `env_file:`.
- Key entry points:
  - `alice-service.ts`
  - `bob-resolver-service.ts`
  - `src/resolver/resolver.ts`
  - `src/utils/limit-order.ts`

## Artifacts Added

- `scripts/create-order.ts`: helper to create signed orders.
- `scripts/read-bmn-balance.ts`: helper to read BMN balance on Base for an
  address.
- Docs updated to enforce `--env-file=.env` usage locally.
