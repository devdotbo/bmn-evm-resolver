### EVM immediate steps to fulfill atomic swap (1inch LOP, v2.2)

- Scope: EVM only. 1inch Limit Order Protocol (LOP) compatibility, PostInteraction v2.2, Base/Optimism.
- Goal: A fill tx emits PostInteractionExecuted and both SrcEscrowCreated/DstEscrowCreated; resolver stores escrows; withdraw succeeds.

## 1) Ground-truth the extension on-chain (LOP fork)

- Add a tiny view in our LOP fork (contracts-limit-order) to validate resolver-produced bytes via eth_call:
  - Input: `bytes args`
  - Output: `(uint32[8] ends, uint32 begin7, uint32 end7, address target, bytes postData)` where `postData` is `ExtensionLib.postInteractionTargetAndData(args).data`.
- Use Foundry to assert for our vectors:
  - `end7 == postInteractionPayloadLength`
  - `begin7 == 0` (since fields 0–6 are empty)
  - `target == factory` and `postData.length == payloadLength - 20`

Deliverables:
- New Solidity view (e.g., `OffsetsInspector.sol`) + Foundry test that feeds exact hex from the resolver.

## 2) Reproduce and fix the Panic locally (Foundry)

- Minimal Foundry test that calls `fillOrderArgs` with:
  - Our `order` struct (makerTraits includes HAS_EXTENSION + POST_INTERACTION)
  - `amount = makingAmount` (maker-amount mode)
  - `takerTraits` with maker-amount flag, `argsExtensionLength = bytes(args).length`, threshold = `takingAmount`
  - `args = extension` from resolver
- If it reverts (overflow/underflow): binary-search the mismatch:
  - Confirm offsets lane: `end7` lives in the highest 4 bytes of the header (bits [224..255])
  - Vary `argsExtensionLength` by ±1 to prove parsing is wired to that field
  - Validate `threshold` bits equal the order’s `takingAmount`
  - Confirm resolver passes `makingAmount` in maker-amount mode

Deliverables:
- Green Foundry test for `fillOrderArgs` using our real bytes.

## 3) Instrument resolver for actionable simulate logs

- Before simulate/send, log for the selected order:
  - Extension byte length and the first 32 bytes (offsets word) as hex
  - `takerTraits` summary: maker-amount flag, `argsExtensionLength` (bits [224..247]), threshold (low 185 bits)
  - `amount` passed to `fillOrderArgs`
- Ensure `/scripts/simulate-fill.ts` prints the same, and surfaces named reverts when available.

Deliverables:
- Enhanced logs in `fillLimitOrder` and simulate script; consistent with Foundry vectors.

## 4) Mainnet simulate, then small live fill (Base/OP)

- After step 2 is green:
  - Run simulate on Base/Optimism for a small order; expect success
  - Send a tiny live fill; decode receipt events
- Expected receipt events:
  - `PostInteractionExecuted`
  - `SrcEscrowCreated`
  - `DstEscrowCreated`
- Resolver should persist escrows and `/stats` should increment.

Deliverables:
- One successful tx per chain with the three events; resolver logs + persisted escrows.

## 5) Hardening & guardrails (EVM)

- Add a small CLI/endpoint to self-check an extension: print offsets lanes, computed `argsExtensionLength`, and `keccak256(extension)` → lower160 bits for salt.
- Enforce pre-flight checks: if `argsExtensionLength != bytes(args).length`, refuse to send.
- Keep the LOP fork view/tests to catch regressions.

Deliverables:
- Self-check tooling + pre-flight validation; stable tests.

## Commands (reference)

- Resolver
  - Run resolver: `deno task bob` (uses `--env-file=.env`)
  - Create order: `deno task order:create`
  - Simulate: `deno run --allow-net --allow-env --allow-read --env-file=.env scripts/simulate-fill.ts`
  - Decode factory events: `deno task decode:factory --tx <0xHASH> [--chain 8453|10]`

- Contracts (contracts-limit-order)
  - Test: `forge test -vv`
  - Add the inspector + tests under `test/` and run until green

## Acceptance criteria (EVM, v2.2)

- Foundry: `fillOrderArgs` test passes with resolver-produced bytes (no revert); inspector view confirms `end7 == payloadLength` and correct target/data.
- Base/Optimism: receipt shows `PostInteractionExecuted`, `SrcEscrowCreated`, `DstEscrowCreated`.
- Resolver `/stats`: `escrowsCreated > 0`; manual `/withdraw` succeeds on source escrow.

## Timeline guidance

- Best case: 2–3 days (inspector + Foundry green + one live tx per chain)
- Likely: 4–6 days (extra edges in traits/threshold/amount semantics)


