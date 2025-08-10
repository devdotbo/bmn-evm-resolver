# Cursor Work Plan

Goal: Fix Deno test failures and clean up import map usage while keeping Docker
vs local behavior consistent.

Scope

- Encoder: add robust address validation/normalization.
- Nonce generation: ensure collision safety in tight loops.
- Tests: avoid invalid addresses and flaky uniqueness checks.
- Tooling: use a dedicated `import_map.json` to remove warnings.

Proposed Steps

1. Add address validation to encoder
   - In `src/utils/postinteraction-v2.ts`, validate addresses with `viem`.
   - Use `getAddress` to checksum-normalize; throw on invalid factory address.
   - Continue to accept valid hex addresses regardless of input casing.

2. Make nonce generation collision-safe
   - Update `generateNonce()` to combine time (micro/nano) + crypto randomness +
     a monotonic counter.
   - Keep return type `bigint`; maintain deterministic format for tests.

3. Update tests to checksummed addresses where required
   - Replace placeholders like `0xAaAa...`/`0xBbBb...` with valid checksummed
     addresses or call `getAddress` before use.
   - Keep the error test that passes `"invalid"` to ensure validation throws.

4. Add separate import map
   - Create `import_map.json` with only `imports`/`scopes`.
   - Update Deno tasks to pass `--import-map=import_map.json` to remove the
     diagnostic about `tasks`.

5. Run tests locally and in Docker
   - Local:
     `deno test -A --import-map=import_map.json tests/postinteraction-v2.2.test.ts`.
   - Docker:
     `docker-compose exec resolver deno test -A --import-map=import_map.json tests/...`.

Acceptance Criteria

- All tests in `tests/postinteraction-v2.2.test.ts` pass locally.
- No checksum/invalid address errors during encoding.
- No nonce-collision failure in the 10k-iteration benchmark.
- No "Invalid top-level key 'tasks'" import map warning.

Notes

- Docker vs local env handling was already fixed: Dockerfiles no longer pass
  `--env-file=.env`, and Docker tasks use env injected by Compose.
- If desired, make Compose env file configurable via `ENV_FILE` (e.g.,
  `env_file: ${ENV_FILE:-.env}`).
