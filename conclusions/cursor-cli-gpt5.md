### Consultation: PostInteraction not firing on 1inch limit order fills

- **Conclusion**: Resolver-side encoding bug in `bmn-evm-resolver` causes the 1inch extension to parse as empty for `PostInteractionData`. Contracts and overall architecture are fine.

### Root cause
- **Wrong offsets encoding** in `encode1inchExtension` (`bmn-evm-resolver/src/utils/postinteraction-v2.ts`).
- The code writes the PostInteraction length into the lowest 4 bytes of the 32‑byte offsets word (bytes [28..31]).
- 1inch-style `OffsetsLib.get()` treats the offsets word as eight 32‑bit big‑endian "end" values where index 7 (PostInteraction) resides in the highest 4 bytes, not the lowest.
- Result: `end7` is zero, `ExtensionLib.postInteractionTargetAndData()` returns empty, so the protocol never calls the factory.

### Evidence (paths)
- Resolver encoding:
  - `bmn-evm-resolver/src/utils/postinteraction-v2.ts::encode1inchExtension`
- Expected semantics:
  - `bmn-evm-contracts-limit-order/contracts/libraries/OffsetsLib.sol`
  - `bmn-evm-contracts-limit-order/contracts/libraries/ExtensionLib.sol`
- Observed behavior and analysis:
  - `bmn-evm-resolver/docs/STATUS_AND_NEXT_STEPS_2025-08-11.md`

### Fix
- Implement proper offsets packing in resolver:
  - Build a 32‑byte word holding 8 big‑endian 32‑bit ends: `end[i]` at byte range [4*(7-i) .. 4*(8-i)-1].
  - For our case: `end[0..6] = 0`, `end[7] = postInteractionLength`.
  - Return `concat([offsetsWord, postInteractionData])`.

### Tests to add
- Unit test ensuring `postInteractionTargetAndData(extension).length == postInteractionData.length`.
- Keep verifying `takerTraits` encodes `argsExtensionLength` bits properly.

### Scope check
- **bmn-evm-resolver**: change `encode1inchExtension` and add tests.
- **bmn-evm-contracts**: no change needed.
- **bmn-evm-contracts-limit-order**: serves as reference for `OffsetsLib`/`ExtensionLib` semantics; no change needed.

### Acceptance criteria
- On Base/Optimism fills: `PostInteractionExecuted` and escrow creation events observed; resolver logs escrows and stores secrets; `/stats` reflects `escrowsCreated > 0`.
