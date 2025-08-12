## AGENT-006 — Atomic Swap Execution Handover (Limit Order v2.2)

Timestamp: 2025-08-12 14:46

### Context and Goal

You are picking up a live mainnet atomic swap flow that uses 1inch SimpleLimitOrderProtocol + PostInteraction to create a source escrow, then an explicit destination escrow creation on the other chain, and final withdrawals driven by a revealed secret. The environment is Cursor with Deno tasks and our services (Alice, Bob/Resolver) running. You have a fresh context; this document is your high-signal guide to reproduce, verify, complete, and stabilize the flow.

### What’s already done

- Order building and signing
  - Created pending orders via `scripts/create-order.ts` using Alice code that:
    - Builds maker traits with `hasExtension=true`, `postInteraction=true`, sets `allowMultipleFills=true`, and uses a unique 40-bit `nonceOrEpoch`.
    - Computes and signs the EIP-712 order digest locally with domain name “Bridge-Me-Not Orders”, version “1”, verifying contract = Limit Order Protocol address on the source chain.
    - Encodes the 1inch extension offsets correctly (field 7: PostInteractionData end = `bytes(postInteraction)` length).
    - Encodes PostInteraction extraData (factory address + 5‑tuple):
      - `(bytes32 hashlock, uint256 dstChainId, address dstToken, uint256 deposits, uint256 timelocks)`, with `deposits = (dstSafetyDeposit << 128) | srcSafetyDeposit`, `timelocks = (srcCancelTs << 128) | dstWithdrawTs`.
    - Stores pending order JSON to `pending-orders/<hashlock>.json`.

- Simulation and diagnostics
  - Local simulator `scripts/simulate-fill.ts` verifies:
    - The maker address recovers from the typed digest, signature is valid.
    - `takerTraits` encodes `maker-amount flag`, `argsExtensionLength` == `bytes(extension)`, and threshold equals `takingAmount`.
    - Offsets word and decoded 5‑tuple look correct; prints raw calldata for debug.
  - Tenderly simulator confirmed success for `fillContractOrderArgs(...)` on Optimism with the new protocol address (status “Success”, gas ~37k).
    - Simulator run: [Tenderly session](https://dashboard.tenderly.co/bioharz/bmn/testnet/dda14cf8-cfd2-4fc5-b04b-69817bc882b9/simulator/ad94f83d-a0d4-4d52-b851-8f3878e01b49).

- Resolver (Bob) service
  - `bob-resolver-service.ts` monitors `pending-orders/`, ensures token approvals (protocol + factory), and attempts to fill orders through the Limit Order Protocol.
  - It logs decoded diagnostics and propagates error details. It now reads protocol/factory from `getContractAddresses(chainId)` so env overrides take effect.
  - Indexer `@ponder/client` is integrated to persist and query state.

- Event decoding and log querying
  - `scripts/decode-factory-events.ts` decodes both legacy and SimplifiedEscrowFactory events and serializes BigInts safely.
  - `scripts/find-escrows.ts` queries chain logs by `hashlock` to find `PostInteractionEscrowCreated` and `DstEscrowCreated` events (bounded block window).

- Protocol address update on Optimism
  - Source chain LOP changed to `0xe767105dcfB3034a346578afd2aFD8e583171489`. `.env` and address resolution were updated so both Alice and Resolver use the same source-of-truth.

### Current blockers and root-causes

- Live fill reverts from Resolver
  - Tenderly success occurred with `fillContractOrderArgs(...)` (single `bytes signature`). Our resolver still calls `fillOrderArgs(r, vs)`, which does not match the deployed protocol on Optimism. That ABI mismatch causes “The contract function fillOrderArgs reverted.”

- Destination escrow creation
  - On-chain dst creation attempt reverted due to ABI/signature mismatch. The deployed factory exposes `createDstEscrow(IBaseEscrow.Immutables)` (no extra timestamp arg). Also ensure resolver whitelisting if enforced; incorrect ABI calls to `isWhitelistedResolver()` previously reverted.

### ABI and argument shape — simulator vs live call mismatch

- Root cause of the discrepancy
  - The deployed SimpleLimitOrderProtocol expects `fillContractOrderArgs(order, signature: bytes, amount, takerTraits, args)`.
  - Our resolver currently calls `fillOrderArgs(order, r, vs, amount, takerTraits, args)` and splits the signature (`r`, `vs`). That is a different function selector and argument shape, so it reverts even when all data fields are otherwise correct.
  - Tenderly success was achieved by providing the single `bytes signature` (the exact signature from the pending order JSON) to `fillContractOrderArgs`, not the `(r, vs)` form.

- Args (bytes) must be exactly the 1inch `extensionData`
  - Pass the `extensionData` from the pending order JSON verbatim as `args`.
  - Do not re-encode or mutate it; the offsets word and payload must match the order’s `salt` low 160 bits (extension-hash check).

- `takerTraits` encoding must match the extension bytes length
  - `maker-amount` flag ON (bit 255).
  - `argsExtensionLength` = `bytes(extensionData)` (bits [224..247]).
  - Threshold (low 185 bits) = `takingAmount` for a 1:1 swap in our examples.

- Verifying contract and signatures
  - If the Limit Order Protocol address changes, previously signed orders become invalid because the EIP-712 domain `verifyingContract` changes.
  - Recreate orders after changing the protocol address so Alice signs the correct digest.

- Exact fix to implement
  - Switch resolver write path to call `fillContractOrderArgs(order, signature, amount, takerTraits, args)` using the `signature` bytes from the JSON (no splitting to `r, vs`).
  - Ensure the ABI used by resolver includes `fillContractOrderArgs`.
  - Keep `args = extensionData` verbatim and `takerTraits` consistent with its byte length.
  - Recreate pending orders after protocol address updates to re-sign with the new `verifyingContract`.

### Addresses and environment

- Chains
  - Source: Optimism (10)
  - Destination: Base (8453)

- Contracts (current)
  - SimpleLimitOrderProtocol (Optimism): `0xe767105dcfB3034a346578afd2aFD8e583171489`
  - SimplifiedEscrowFactory: `0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68`
  - BMN token (both chains): `0x8287CD2aC7E227D9D927F998EB600a0683a832A1`

- Env vars
  - `ALICE_PRIVATE_KEY`, `RESOLVER_PRIVATE_KEY` (or `BOB_PRIVATE_KEY`)
  - `ANKR_API_KEY` or Tenderly VRPCs: `LOCAL_OP_RPC`, `LOCAL_BASE_RPC`
  - `INDEXER_URL`
  - `OPTIMISM_LIMIT_ORDER_PROTOCOL=0xe767105dcfB3034a346578afd2aFD8e583171489`
  - Deno tasks use `--env-file=.env` consistently.

### What to do next (plan)

1) Switch Resolver fills to `fillContractOrderArgs`
   - Update `src/utils/limit-order.ts` so the write path calls `fillContractOrderArgs(order, signature, amount, takerTraits, extensionData)` instead of `fillOrderArgs(r, vs, ...)`.
   - Keep diagnostics (`argsExtensionLength`, offsets, extraData decode) intact.
   - Update `scripts/simulate-fill.ts` to exercise the same function.

2) Verify post-fill events and persist to indexer
   - After the change, source escrow should be created by PostInteraction. Confirm via `scripts/find-escrows.ts --fromBlocks=5000` (look for `PostInteractionEscrowCreated` on Optimism for the order hashlock).
   - Optionally re-decode the fill tx with `deno task decode:factory -- --tx <hash> --chain 10`.

3) Implement destination escrow creation (Base) with the correct factory ABI
   - Use `createDstEscrow(IBaseEscrow.Immutables)` from SimplifiedEscrowFactory.
   - Build destination immutables:
     - `orderHash`: EIP-712 order hash (same as source).
     - `hashlock`: from pending order.
     - `maker`: Alice (receiver on destination).
     - `taker`: Resolver.
     - `token`: BMN on Base.
     - `amount`: `order.takingAmount`.
     - `safetyDeposit`: destination safety deposit.
     - `timelocks`: verify required format; if the factory computes offsets internally from absolute times, pass accordingly.
   - Ensure factory approval on Base for `amount` of `dstToken`.
   - If factory enforces resolver whitelist, ensure resolver is whitelisted on Base before sending.

4) Automate Bob’s post-fill steps
   - On `src_created`, Bob calls `createDstEscrow` on Base.
   - On `dst_created`, wait for Alice’s destination withdrawal; when a secret is revealed, Bob withdraws on source (EscrowWithdrawManager has `withdrawFromSource`).
   - Add retries with backoff for transient failures.

5) Ensure Alice auto-withdraws on destination
   - Alice service `monitorAndWithdraw` should detect `dst_created` for the order and call `withdrawFromDestination` using the stored secret (SecretManager).

6) Stabilize nonces and wallet config
   - Use `nonceManager` on all wallet clients that submit transactions.
   - Avoid double-sending (disable manual POST while the monitor loop is processing the same file).

7) Clean up and guardrails
   - Auto-move processed files from `pending-orders/` to `completed-orders/` after a successful fill to avoid reprocessing.
   - Ensure port 8002 is free before starting resolver (handle AddrInUse), or pick an alternate `BOB_HEALTH_PORT`.

### Runbook

- Create order (OP → Base):
```bash
RESOLVER=<resolver_addr> SRC_CHAIN=10 DST_CHAIN=8453 AMOUNT=0.01 deno task order:create
# Produces pending-orders/<hashlock>.json
```

- Local simulation (after switching to fillContractOrderArgs):
```bash
deno run --allow-net --allow-env --allow-read --env-file=.env scripts/simulate-fill.ts pending-orders/<hashlock>.json
```

- Tenderly simulation (validated):
  - Contract: `0xe767105dcfB3034a346578afd2aFD8e583171489` (OP)
  - Function: `fillContractOrderArgs(order, signature, amount, takerTraits, args)`
  - Inputs: from pending order JSON; `amount = makingAmount`, `takerTraits = (1<<255)|(bytes(extension)<<224)|takingAmount`, `args = extensionData`, `from = resolver`.

- Start resolver and Alice:
```bash
deno task bob
deno task alice
```

- Verify source escrow from logs:
```bash
deno run --allow-net --allow-env --allow-read scripts/find-escrows.ts --fromBlocks=5000
```

- Create destination escrow (update ABI to SimplifiedEscrowFactory first):
```bash
deno run --allow-net --allow-env --allow-read --env-file=.env scripts/create-dst-escrow.ts pending-orders/<hashlock>.json
```

- Decode factory events for a tx (OP or Base):
```bash
deno task decode:factory -- --tx <TX_HASH> --chain 10
deno task decode:factory -- --tx <TX_HASH> --chain 8453
```

### Quick inputs (example pending order)

- `order` (tuple JSON): from the pending order file
- `signature` (bytes): from the file
- `amount`: `10000000000000000`
- `takerTraits`: `57896050334166791147721128973751152374796695143894899598330167997921937653760`
- `args`: extensionData from the file
- `from`: `0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5`

### File changes made in this session

- `bob-resolver-service.ts`: now resolves protocol/factory via `getContractAddresses(chainId)`.
- `scripts/decode-factory-events.ts`: supports SimplifiedEscrowFactory events and BigInt-safe JSON.
- `scripts/find-escrows.ts`: chains logs by `hashlock` (PostInteraction/DstEscrow events).
- `scripts/create-dst-escrow.ts`: initial version (needs SimplifiedEscrowFactory ABI correction).
- `scripts/check-resolver-whitelist.ts`: quick whitelist probe (ensure ABI matches deployed factory).

### Known pitfalls and fixes

- Revert on `fillOrderArgs`: switch to `fillContractOrderArgs` (bytes signature) to match the deployed LOP.
- Destination creation reverts: correct the factory ABI, verify resolver whitelist, ensure approvals on Base.
- Indexer 502s: fall back to chain logs (`find-escrows.ts`) to proceed.
- Nonce mismatches: enable `nonceManager` on all transaction-sending wallets.

### Acceptance criteria

- Fill succeeds on Optimism via `fillContractOrderArgs(...)`, creating source escrow (`PostInteractionEscrowCreated`).
- Destination escrow created on Base (`DstEscrowCreated`).
- Alice withdraws on destination (reveals secret), then Bob withdraws on source using that secret.
- Indexer reflects status transitions; resolver `/stats` increments; files moved to `completed-orders/`.


