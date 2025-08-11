### Cursor GPT-5 consultation — Limit Order PostInteraction v2.2

Date: 2025-08-11

### TL;DR
- **Diagnosis**: Resolver-side bug in 1inch extension offsets packing. Not a contracts or architecture issue.
- **Root cause**: `encode1inchExtension` writes the PostInteraction end-offset into the lowest 4 bytes of the 32‑byte offsets word, but 1inch expects it in the highest 4 bytes (bits [224..255]). As a result, `postInteractionTargetAndData()` resolves to empty and PostInteraction never runs.
- **Fix**: Pack `end_7` (PostInteractionData) at bits [224..255] of the first 32 bytes; keep `end_0..end_6 = 0`. Then concatenate the actual `postInteractionData` bytes.
- **Next**: Add a quick simulate/viem assertion and re-run Base/Optimism E2E; monitor events.

### Detailed assessment
- **Observed**: Fills succeed on-chain (~2.5M gas) but no factory `PostInteractionExecuted` nor `Escrow*Created` logs.
- **Working assumptions (v2_2)**: Maker traits include `HAS_EXTENSION` and `POST_INTERACTION`; taker traits compute `argsExtensionLength`; resolver approval path is correct.
- **Where it breaks**: Extension decoding depends on the offsets header. 1inch uses a 32‑byte word where each 32‑bit lane stores the cumulative end offset for a dynamic field (begin = previous end). Field index i lives at bit range [i*32 .. i*32+31]. For `PostInteractionData` (field 7), its end must be at bits [224..255] (the topmost 4 bytes of the offsets word). The current encoder writes the length into bytes [28..31] (lowest 4 bytes = field 0), so index 7 reads 0 and returns empty.

### Evidence (key semantics)
- Offsets layout (per 1inch OffsetsLib):
  - `begin_i = end_{i-1}`, `end_i` read from the 32‑bit lane at `[i*32 .. i*32+31]` inside the first 32 bytes.
  - `customData()` reads `end_7` using `offsets >> 224` to slice the remainder, confirming `end_7` sits in the highest 4 bytes.
- Current encoder behavior:
  - Writes the length to the lowest 4 bytes (end_0), leaving `end_7 = 0` → `postInteractionTargetAndData()` returns empty.

### Impact
- PostInteraction never executes, so no source/destination escrow creation and no related events; resolver sees “No PostInteraction events found.”

### Action plan
1) Fix offsets packing in resolver
   - In `bmn-evm-resolver/src/utils/postinteraction-v2.ts`, update `encode1inchExtension`:
     - Compute `postInteractionLength` in bytes.
     - Build the 32‑byte offsets header such that `end_7 = postInteractionLength` occupies bits [224..255] (highest 4 bytes). All prior ends remain 0 since fields 0–6 are empty; `CustomData` (field 8) may be absent and doesn’t need an explicit end in the header.
   - Prefer constructing a 256‑bit BigInt: `offsets = postInteractionLength << 224` and serialize to 32 bytes big‑endian.

2) Add a quick correctness check
   - viem simulate or a tiny Solidity helper to assert:
     - `ExtensionLib.postInteractionTargetAndData(extension).length == postInteractionData.length`
     - First 20 bytes equal the factory address.

3) Re-run E2E on Base/Optimism
   - Create an order (`deno task order:create`).
   - Fill via resolver; expect `PostInteractionExecuted` and `SrcEscrowCreated`/`DstEscrowCreated` decoded from the receipt.
   - Resolver should store secret mapping and `/stats` should show `escrowsCreated > 0`.

4) Monitoring enhancements (optional hardening)
   - In `PostInteractionEventMonitor`, continue to parse and count `SrcEscrowCreated`/`DstEscrowCreated` to surface progress even if `PostInteractionExecuted` is missing.
   - Include `/fill-order` response fields for computed `takerTraits` and used gas params for easier diagnostics.

### Acceptance criteria
- A successful fill on Base/Optimism emits `PostInteractionExecuted` and both `SrcEscrowCreated` and `DstEscrowCreated` in the same receipt.
- Resolver logs escrows and stores the secret mapping; `/stats` reflects created escrows.
- Manual `/withdraw` on source escrow using stored secret succeeds.

### Risk/rollback
- Low risk: purely client-side encoding fix. If any regression, revert to previous encoder and continue fills (without PostInteraction) while iterating on the header packing.

### Notes
- Contracts (factory and LOP fork) align with v2_2 expectations; architecture is sound. The issue is isolated to resolver extension encoding.


