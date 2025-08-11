### Project status — 2025-08-11

- **Scope**: `bmn-evm-resolver` + 1inch `SimpleLimitOrderProtocol` with PostInteraction v2.2 [[v2_2]]

### What’s working
- **Services up**: Resolver (port 8002) healthy; Alice service runs.
- **Order creation**: Alice creates, signs, and stores orders in `pending-orders/`. Amount display fixed (uses `formatUnits`).
- **Filling path**:
  - Centralized `fillLimitOrder` uses `fillOrderArgs(order, r, vs, amount, takerTraits, extension)`.
  - `takerTraits` auto-computed when not provided: maker-amount mode (bit 255), `argsExtensionLength` in bits 224..247, threshold from `takingAmount` low 185 bits.
  - EIP-1559 fee params added with 10% headroom; gas fallback to `gasPrice`.
  - Error surfacing: decode 1inch reverts and return explicit error from `/fill-order`.
- **Diagnostics**:
  - `scripts/simulate-fill.ts` reproduces simulate and decodes revert names/args.
  - `scripts/decode-factory-events.ts` decodes factory events by tx hash.
  - Deno task `order:create` for one-line order creation.

### Observed behavior (mainnet Base/Optimism)
- **Order fills succeed on-chain**: txs mined with gas ~2.5M.
- **But no PostInteraction events**: Resolver logs “No PostInteraction events found”; decoder shows “no factory events found” for the fill txs.
- **Implication**: Factory `postInteraction` was not invoked by the protocol → likely extension parsing didn’t pass through, not merely a logging/ABI issue.

### Likely root cause
- **Extension offsets encoding**: Our `encode1inchExtension` sets only bytes [28..31] to the length of `PostInteractionData` and concatenates offsets + data. 1inch `ExtensionLib`/`OffsetsLib` appear to expect a full offsets encoding (begin/end pairs per dynamic field segment). With incomplete offsets packing, `extension.postInteractionTargetAndData()` likely returns empty, so PostInteraction never runs.
- **Maker/Taker traits**: Maker has `HAS_EXTENSION` and `POST_INTERACTION` flags; taker encodes `argsExtensionLength`. Those look correct. The missing piece is offsets packing semantics.

### Next steps (priority)
- **1) Fix 1inch extension offsets packing**
  - Implement a proper `packOffsets` to encode begin/end for all fields per `OffsetsLib.get()` semantics.
  - Update `encode1inchExtension` to use `packOffsets` and place `PostInteractionData` at index 7 with the right begin/end values; set index 8 (CustomData) end accordingly.
  - Add a unit test to assert `extension.postInteractionTargetAndData().length == postInteractionData.length` via a quick viem `simulate` helper.

- **2) Verify end-to-end again on Base**
  - Create order (`deno task order:create`) and fill via resolver.
  - Decode events with `deno task decode:factory --tx <hash>` and expect `PostInteractionExecuted` plus `SrcEscrowCreated`/`DstEscrowCreated`.
  - Resolver should log `postInteractionExecuted` and store escrows.

- **3) Enhance resolver event parsing**
  - Add listeners for `SrcEscrowCreated`/`DstEscrowCreated` names in `PostInteractionEventMonitor` to reflect escrows in stats even if `PostInteractionExecuted` is absent.

- **4) Hardening & Ops**
  - Add `/fill-order` response fields for gas params used and `takerTraits` computed.
  - Add a “minimal same-chain” postInteraction smoke test to isolate offsets vs signature issues.

### Quick commands
- **Run services**: `deno task bob` (resolver), `deno task alice` (alice)
- **Create order**: `deno task order:create` (requires `RESOLVER=` in `.env`)
- **Manual fill (optional)**:
  - `FILE=$(ls -t pending-orders/*.json | head -n 1)`
  - `jq '{order, signature, extensionData, chainId, takerAmount: .order.makingAmount, takerAsset: .order.takerAsset}' "$FILE" | curl -sS -X POST http://localhost:8002/fill-order -H 'Content-Type: application/json' -d @-`
- **Simulate-only**: `deno run --allow-net --allow-env --allow-read --env-file=.env scripts/simulate-fill.ts`
- **Decode factory events**: `deno task decode:factory --tx <0xHASH> [--chain 8453|10]`

### Required env (Deno)
- Keep using `--env-file=.env` with Deno runs/tasks.
- `.env`: `ALICE_PRIVATE_KEY`, `RESOLVER_PRIVATE_KEY` (or `BOB_PRIVATE_KEY`), `RESOLVER=<resolver_address>`, optional `ANKR_API_KEY`.

### Acceptance criteria for PostInteraction v2.2
- A fill tx on Base/Optimism emits `PostInteractionExecuted` and both `SrcEscrowCreated` and `DstEscrowCreated`.
- Resolver logs escrows and stores secret mapping; `/stats` shows `escrowsCreated > 0`.
- Manual `/withdraw` using the stored secret succeeds on source escrow.

—
Refs: 1inch `ExtensionLib`/`OffsetsLib` offsets semantics; v2.2 maker/taker traits; current fill path and diagnostics.


