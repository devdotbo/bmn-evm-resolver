## BMN Resolver CLI Plan (File-Based, Wagmi Actions)

### Goals
- Provide a handful of small CLI tools to run the full atomic swap flow end-to-end using SimpleLimitOrderProtocol + SimplifiedEscrowFactory v2.3.
- Use only file-based coordination (plain JSON files) between steps; no servers or APIs.
- Use wagmi-generated actions and @wagmi/core for all on-chain interactions.
- Be deterministic, idempotent, and debuggable; every step writes structured artifacts and status.

### Assumptions
- Chains: Base (8453) and Optimism (10).
- Contracts (read from env; fallbacks baked in config already):
  - Factory v2.3: `MAINNET_ESCROW_FACTORY_V2`, `BASE_ESCROW_FACTORY`, `OPTIMISM_ESCROW_FACTORY` → 0xdebE6F4bC7BaAD2266603Ba7AfEB3BB6dDA9FE0A
  - BMN token: `MAINNET_BMN_TOKEN`, `BASE_TOKEN_BMN`, `OPTIMISM_TOKEN_BMN` → 0x8287CD2aC7E227D9D927F998EB600a0683a832A1
  - Limit Order Protocol: `BASE_LIMIT_ORDER_PROTOCOL`, `OPTIMISM_LIMIT_ORDER_PROTOCOL` → 0xe767105dcfB3034a346578afd2aFD8e583171489
- RPC: Only `ANKR_API_KEY` is set; code resolves RPCs to `https://rpc.ankr.com/{base|optimism}/$ANKR_API_KEY` (and ws variants if needed).
- Keys: `ALICE_PRIVATE_KEY`, `BOB_PRIVATE_KEY` (or `RESOLVER_PRIVATE_KEY`). Balances/approvals are already good per env, but CLIs will preflight.
- Indexer is optional; plan does not depend on it (pure on-chain + file IO).

### Directories and File Conventions
- Root data directory: `./data`
  - Orders: `./data/orders/pending/{hashlock}.json`, `./data/orders/filled/{hashlock}.json`
  - Swaps: `./data/swaps/{hashlock}/status.json` (single source of truth progress)
  - Fills: `./data/fills/{hashlock}.json` (result of limit order fill step)
  - Escrows:
    - Source: `./data/escrows/src/{hashlock}.json`
    - Destination: `./data/escrows/dst/{hashlock}.json`
  - Secrets: `./data/secrets/{hashlock}.json` (created only after Alice reveals)
  - Receipts: `./data/receipts/{txHash}.json` (raw tx receipts if useful)
  - Logs: `./data/logs/*.log` (optional)

Notes:
- Use `hashlock` as the primary identifier to correlate across files. Include `orderHash` redundantly in artifacts for traceability.
- All writes should be atomic (write temp then rename) to avoid partial files. Use a `.{hashlock}.lock` file within `./data/swaps/{hashlock}/` to guard concurrent runs.
- Ensure `.gitignore` excludes `data/secrets/`, `data/orders/`, `data/swaps/`, `data/receipts/`, and `data/logs/`.

### JSON Schemas (informal)

1) Order file: `./data/orders/pending/{hashlock}.json`
```json
{
  "version": 1,
  "chainId": 8453,
  "order": {
    "salt": "<stringified bigint>",
    "maker": "0x...",
    "receiver": "0x...",
    "makerAsset": "0x...",
    "takerAsset": "0x...",
    "makingAmount": "<stringified bigint>",
    "takingAmount": "<stringified bigint>",
    "makerTraits": "<stringified bigint>"
  },
  "signature": {
    "r": "0x...",
    "vs": "0x..."
  },
  "extensionData": "0x...",           
  "orderHash": "0x...",
  "hashlock": "0x...",                 
  "srcChainId": 8453,
  "dstChainId": 10,
  "createdAt": 1730000000000
}
```

2) Fill result: `./data/fills/{hashlock}.json`
```json
{
  "hashlock": "0x...",
  "orderHash": "0x...",
  "srcChainId": 8453,
  "taker": "0x...",                     
  "fillTxHash": "0x...",
  "gasUsed": "<stringified bigint>",
  "postInteraction": {
    "executed": true,
    "srcEscrow": "0x..."                 
  },
  "immutablesForDst": {
    "timelocks": "<bigint>",            
    "hashlock": "0x...",
    "dstChainId": 10,
    "srcMaker": "0x...",
    "srcTaker": "0x...",
    "srcToken": "0x...",
    "srcAmount": "<bigint>",
    "srcSafetyDeposit": "<bigint>",
    "dstReceiver": "0x...",
    "dstToken": "0x...",
    "dstAmount": "<bigint>",
    "dstSafetyDeposit": "<bigint>",
    "nonce": "<bigint>"
  },
  "writtenAt": 1730000000001
}
```

3) Destination escrow creation: `./data/escrows/dst/{hashlock}.json`
```json
{
  "hashlock": "0x...",
  "dstChainId": 10,
  "escrowAddress": "0x...",
  "createTxHash": "0x...",
  "srcCancellationTs": "<bigint>",
  "dstWithdrawalTs": "<bigint>",
  "writtenAt": 1730000000002
}
```

4) Secret reveal (Alice) and destination withdrawal: `./data/secrets/{hashlock}.json` and `./data/escrows/dst/{hashlock}.withdraw.json`
```json
// secrets/{hashlock}.json (written after successful destination withdrawal)
{
  "hashlock": "0x...",
  "secret": "0x...",
  "revealedAt": 1730000001000
}

// escrows/dst/{hashlock}.withdraw.json
{
  "hashlock": "0x...",
  "dstChainId": 10,
  "escrowAddress": "0x...",
  "withdrawTxHash": "0x...",
  "gasUsed": "<bigint>",
  "withdrawnAt": 1730000001000
}
```

5) Source withdrawal (Bob): `./data/escrows/src/{hashlock}.withdraw.json`
```json
{
  "hashlock": "0x...",
  "srcChainId": 8453,
  "escrowAddress": "0x...",
  "withdrawTxHash": "0x...",
  "gasUsed": "<bigint>",
  "withdrawnAt": 1730000002000
}
```

6) Swap status: `./data/swaps/{hashlock}/status.json`
```json
{
  "hashlock": "0x...",
  "orderHash": "0x...",
  "state": "ORDER_CREATED|FILLED|DST_CREATED|DST_WITHDRAWN|SRC_WITHDRAWN|COMPLETED|FAILED",
  "updatedAt": 1730000002000,
  "refs": {
    "orderFile": "../..../orders/pending/{hashlock}.json",
    "fillFile": "../..../fills/{hashlock}.json",
    "dstEscrowFile": "../..../escrows/dst/{hashlock}.json",
    "dstWithdrawFile": "../..../escrows/dst/{hashlock}.withdraw.json",
    "srcWithdrawFile": "../..../escrows/src/{hashlock}.withdraw.json"
  },
  "error": null
}
```

### CLI Tools (5)

All CLIs are Deno scripts under `./cli/` (or `./scripts/cli/`), implemented with wagmi-generated actions.

1) `bmn order:create`
- Purpose: Alice creates an order with postInteraction extension; writes pending order JSON.
- Inputs (flags/env):
  - `--src 8453|10`, `--dst 10|8453`, `--srcAmount <wei>`, `--dstAmount <wei>`
  - `--resolver 0x...` (defaults to env RESOLVER_ADDRESS or BOB address)
  - optional `--srcDeposit <wei>`, `--dstDeposit <wei>`
- Steps:
  1) Resolve addresses (BMN, LOP, Factory) per chain from env/config
  2) pack timelocks (e.g., 3600s cancel, 300s dst withdraw)
  3) generate secret and `hashlock = keccak256(secret)`
  4) build postInteraction payload (factory + packed tuple)
  5) compute `orderHash` with `readSimpleLimitOrderProtocolHashOrder`
  6) sign EIP-712 (EOA) and convert to r,vs
  7) write `./data/orders/pending/{hashlock}.json`
  8) initialize `./data/swaps/{hashlock}/status.json` with state `ORDER_CREATED`
- Security: do NOT store secret in the order file; keep it only in memory until destination withdrawal. For local dev, also persist to `./data/swaps/{hashlock}/manifest.json` encrypted in future; initial version: in-memory only.

2) `bmn swap:execute`
- Purpose: Bob executes the order: ensures approvals, fills the order, then creates/funds destination escrow.
- Inputs: `--file ./data/orders/pending/{hashlock}.json` or `--hashlock 0x...`
- Steps:
  1) Load order JSON; infer source/destination chains
  2) Ensure token approvals for LOP and Factory (using wagmi ERC20 actions)
  3) Fill order via LOP using EOA flow (fillOrderArgs with r,vs)
  4) On receipt, decode extension; compute immutables and timestamps
  5) Create destination escrow via Factory v2.3 (use wagmi write action)
  6) Write `fills/{hashlock}.json`, `escrows/dst/{hashlock}.json`; update `status.json` to `DST_CREATED`
- Idempotency:
  - If fill already recorded → skip re-fill
  - If destination escrow exists (by event or addressOfEscrow) → skip recreate

3) `bmn withdraw:dst`
- Purpose: Alice reveals the secret and withdraws from destination escrow.
- Inputs: `--hashlock 0x...`
- Steps:
  1) Determine destination escrow (from `escrows/dst/{hashlock}.json`)
  2) Use Alice key to call `EscrowDst.withdraw(secret, immutables)` (or equivalent function per ABI window)
  3) On success, write `escrows/dst/{hashlock}.withdraw.json`
  4) Persist secret to `./data/secrets/{hashlock}.json` (enables Bob’s source withdrawal)
  5) Update `status.json` to `DST_WITHDRAWN`

4) `bmn withdraw:src`
- Purpose: Bob withdraws from source escrow using the revealed secret.
- Inputs: `--hashlock 0x...`
- Steps:
  1) Read `./data/secrets/{hashlock}.json` to get the secret
  2) Determine source escrow address (prefer recorded `fills/{hashlock}.json:postInteraction.srcEscrow`; otherwise compute using `readSimplifiedEscrowFactoryV2_3AddressOfEscrow` from immutables)
  3) Call source escrow `withdraw(secret, immutables)` with Bob key
  4) Write `escrows/src/{hashlock}.withdraw.json`; update `status.json` to `SRC_WITHDRAWN`

5) `bmn status`
- Purpose: Show aggregated status for one or all swaps (file-based).
- Inputs: `--hashlock 0x...` (optional), `--json` (optional)
- Output: Aggregate state transitions and file references. If both withdrawals done → set `COMPLETED`.

### Implementation Details
- Use wagmi-generated ABIs and actions from `src/generated/contracts.ts` exclusively.
- Avoid hardcoded addresses in CLIs; always read from `src/config/contracts.ts` which respects env overrides.
- Transport: prefer ANKR via `ANKR_API_KEY`; if absent, exit with clear error.
- Atomic writes: write to `file.tmp` then `renameSync(file.tmp, file)`.
- Locking: create `./data/swaps/{hashlock}/{action}.lock` while executing a step; remove on completion.
- Idempotency: each CLI should check for presence of its expected output file before doing work; verify on-chain state if needed.
- Error capture: on failure, write `./data/swaps/{hashlock}/error-{action}.json` with `{ message, stack, context }` and set `state` to `FAILED` (only if terminal for that step). Non-terminal errors should update `status.json` with `lastError` but keep previous state.

### Testing Workflow (Manual)
1) `bmn order:create --src 8453 --dst 10 --srcAmount 10000000000000000 --dstAmount 10000000000000000 --resolver 0x...`
   - Inspect `data/orders/pending/{hashlock}.json`, `swaps/{hashlock}/status.json`
2) `bmn swap:execute --file data/orders/pending/{hashlock}.json`
   - Inspect `data/fills/{hashlock}.json`, `data/escrows/dst/{hashlock}.json`, status
3) `bmn withdraw:dst --hashlock 0x...`
   - Inspect `data/secrets/{hashlock}.json`, `data/escrows/dst/{hashlock}.withdraw.json`, status
4) `bmn withdraw:src --hashlock 0x...`
   - Inspect `data/escrows/src/{hashlock}.withdraw.json`, status (should be COMPLETED when both withdrawals exist)
5) `bmn status --hashlock 0x...`

### Security Notes
- Do not commit `./data/**` to git; ensure it’s ignored.
- The secret must not appear in the order file. It is only persisted after destination withdrawal.
- Keys must live in `.env` and never be written to any artifact.

### Future Enhancements
- Optional watcher that auto-runs steps based on file events (still file-based, no network API).
- Add EIP-712 `publicWithdrawSigned` path for destination if private window elapsed.
- Add on-chain verifications (balances, allowances) to `bmn status` for richer diagnostics.

### Implementation Order
1) Implement `bmn order:create` using wagmi actions.
2) Implement `bmn swap:execute` (includes approvals → fill → dst escrow create).
3) Implement `bmn withdraw:dst` and `bmn withdraw:src` (use wagmi actions for escrows).
4) Implement `bmn status` (aggregate file state + minimal on-chain checks).
5) Add locking/atomic write helpers shared across CLIs.


