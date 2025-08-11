### Agent Handover: Fill Debugging & Updates — 2025-08-11

- Scope: bmn-evm-resolver + 1inch SimpleLimitOrderProtocol PostInteraction v2.2

### Changes Applied
- Centralized takerTraits in `src/utils/limit-order.ts`:
  - Maker-amount mode (bit 255), threshold (low 185 bits), argsExtensionLength (bits 224..247).
  - Uses provided `takerTraits` if non-zero; otherwise computes from `extensionData` and order.
- Removed per-call overrides so the utility’s takerTraits logic is used during fills (`bob-resolver-service.ts`).
- RPC fallback when `ANKR_API_KEY` is missing:
  - Base → `https://mainnet.base.org`, Optimism → `https://mainnet.optimism.io` (resolver, alice, balance script).
- Signature correctness: `src/alice/limit-order-alice.ts` now signs the on-chain order hash returned by `hashOrder` (protocol digest), avoiding BadSignature.
- Added `scripts/simulate-fill.ts` to reproduce `fillOrderArgs` with computed takerTraits and print revert details.
- Fill path: explicit gas on simulate + manual-gas fallback for direct send when providers reject simulation.

### What Was Verified
- Resolver balances: BMN on Base and ETH gas on Base present.
- Orders created and signed with new path; resolver attempted fills via `/fill-order`.
- Logs show properly formed args (maker/taker assets, amounts, argsExtensionLength encoded). Still no tx hash; provider reports “Transaction creation failed”. No PostInteraction/escrow events yet.

### Current Status
- Services healthy under Compose; whitelisting done (per 2025-08-10 status).
- Fills are blocked at provider transaction creation/eth_call level (not a decoded 1inch revert yet).

### Next Steps
- Error surfacing: decode/log 1inch error names in fill path and return explicit reason in `/fill-order`.
- Fee controls: send EIP-1559 params (maxFeePerGas, maxPriorityFeePerGas) and conservative gas limit; retry.
- Minimal extension sanity: attempt same-chain tiny PostInteraction payload to isolate extension parsing vs signature issues.
- Local fork reproduction: run an anvil/foundry simulation of `fillOrderArgs` with our extension to get exact revert and gas profile.
- Re-check: offsets array semantics and salt ↔ `keccak256(extension)` lower160 correlation (already validated) and amount direction vs takerTraits mode.

### Reproduce
1) Start services
   - `docker-compose up -d`
2) Create order (funded keys, uses --env-file=.env)
   - `RESOLVER=0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5 \
     deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv --env-file=.env scripts/create-order.ts`
3) Trigger fill
   - `FILE=$(ls -t pending-orders/*.json | head -n 1)`
   - `jq '{order, signature, extensionData, chainId, takerAmount: .order.makingAmount, takerAsset: .order.takerAsset}' "$FILE" \
     | curl -sS -X POST http://localhost:8002/fill-order -H 'Content-Type: application/json' -d @-`
4) Optional: simulate-only
   - `deno run --allow-net --allow-env --allow-read --env-file=.env scripts/simulate-fill.ts`

### Notes
- Keep using PostInteraction v2.2 addresses. Ensure `.env` exports keys and RPC config; Compose already injects env via `env_file`.



