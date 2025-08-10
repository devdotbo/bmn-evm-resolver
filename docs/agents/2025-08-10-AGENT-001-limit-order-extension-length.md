### Agent Handover: Limit Order Fill Revert (MissingOrderExtension) — Fix Applied, Next Steps

- Date: 2025-08-10
- Agent Order: AGENT-001
- Scope: bmn-evm-resolver + limit-order protocol integration (PostInteraction v2.2)

### Summary
- Filling 1inch SimpleLimitOrderProtocol orders with PostInteraction reverted with selector `0xb2d25e49`.
- Decoded via `cast 4byte`: `MissingOrderExtension()` — thrown by OrderLib when makerTraits.HAS_EXTENSION is set but extension is empty.
- Root cause: we passed `takerTraits = 0`, so protocol parsed `args` with zero extension length, treating the extension as empty.
- Fix: resolver now auto-encodes `takerTraits.argsExtensionLength` to the byte length of the provided `extensionData` when `takerTraits` is not explicitly set.
- Contracts are OK; no on-chain changes required.

### Affected Repositories & Files
- Repo: `bmn-evm-resolver`
  - `src/utils/limit-order.ts` — computes `takerTraits` with `argsExtensionLength` from `extensionData` when not provided.
  - `src/resolver/resolver.ts` — stops forcing `takerTraits: 0n` at call site so the utility’s auto-encoding takes effect.
- Repo: `bmn-evm-contracts-limit-order` (reference only)
  - `contracts/OrderLib.sol` — source of `MissingOrderExtension` condition (no changes needed).

### Root Cause Analysis
- Protocol function `fillOrderArgs(order, r, vs, amount, takerTraits, args)` expects `args` to contain the extension. The byte length of the extension is encoded in `takerTraits` (bits [224..247]).
- With `takerTraits = 0`, the extension length is 0, so `OrderLib.isValidExtension()` reverts with `MissingOrderExtension()` if makerTraits.HAS_EXTENSION is set.
- Our orders correctly set makerTraits for PostInteraction (bits 249 and 251), and salt lower 160 bits matched `keccak256(extension)`.

### Changes Implemented
- `src/utils/limit-order.ts`
  - If `params.takerTraits` is falsy or `0n`:
    - Compute `argsExtensionLength = (extensionDataHex.length - 2) / 2` (bytes), set it into `takerTraits` at bits [224..247].
    - Leave custom `takerTraits` untouched if caller provides a non-zero value.
- `src/resolver/resolver.ts`
  - Removed `takerTraits: 0n` from `fillLocalOrder` so default behavior computes the extension length correctly.

### Why This Fix Is Correct
- 1inch `TakerTraitsLib` encodes extension length in bits [224..247].
- 1inch `OrderLib` validates maker extension presence and the salt/extension hash correlation. With a non-zero extension length, the protocol parses and validates our extension, enabling `postInteraction` to call the factory.

### How to Verify
1) Decode previous error selector (for reference)
   - `cast 4byte 0xb2d25e49` → `MissingOrderExtension()`

2) Re-run a simulation or resolver fill
   - Simulation (custom script):
     - `deno run --allow-read --allow-net --allow-env --env-file=.env simulate-fill.ts`
     - Expected: no `MissingOrderExtension()`; transaction simulates successfully or hits later checks (e.g., approvals/whitelist).
   - Resolver path (local payload):
     - Ensure `.env` is loaded for RPCs and keys.
     - `deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv --env-file=.env src/resolver/resolver.ts`
     - Resolver will load `./pending-orders/<hashlock>.json` and attempt fill; watch logs for successful `postInteraction` events.

3) Quick on-chain checks (if needed)
   - Confirm resolver is whitelisted on factory and factory is not paused.
   - Ensure approvals exist:
     - Resolver to protocol (taking asset allowance)
     - Resolver to factory (maker asset for `postInteraction` transfer into escrow)

### Acceptance Criteria
- Calling `fillOrderArgs` no longer reverts with `MissingOrderExtension()`.
- `PostInteraction` is invoked on the factory; you see events indicating escrow creation (source escrow at minimum).
- Resolver proceeds to store secret and/or follow-up flows without protocol-level extension errors.

### If It Still Reverts
- Decode the new selector: `cast 4byte <selector>` and triage:
  - `InvalidExtensionHash()` → check lower 160 bits of `keccak256(extension)` equals lower 160 bits of order.salt.
  - `PrivateOrder()` / epoch/expiry → makerTraits low 200 bits (allowed sender, expiration, nonce/epoch, series).
  - Factory custom errors → e.g., resolver not whitelisted, paused, or insufficient approvals. Re-check approvals and whitelist.

### Observability
- The resolver parses `PostInteraction` and escrow creation events via `PostInteractionEventMonitor`. Review logs for:
  - PostInteraction executed
  - SrcEscrowCreated / DstEscrowCreated

### Rollback Plan
- If undesired behavior appears, you can temporarily reinstate explicit `takerTraits` by passing a non-zero value that includes the correct `argsExtensionLength` bits. Prefer to leave auto-compute enabled.

### Notes
- Contracts are not changed. The integration fix is entirely in the resolver.
- Keep using v2.2 addresses as configured. Ensure `.env` variables are loaded for all tasks.

### Appendix: Relevant Code Pointers (FYI)
- `bmn-evm-contracts-limit-order/contracts/OrderLib.sol` → `isValidExtension` and errors
- `bmn-evm-contracts-limit-order/contracts/libraries/TakerTraitsLib.sol` → encoding of args lengths
- `bmn-evm-resolver/src/utils/limit-order.ts` → takerTraits auto-compute (extension length)
- `bmn-evm-resolver/src/resolver/resolver.ts` → fills local orders (now omits explicit takerTraits)


