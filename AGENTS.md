# Repository Guidelines

## Project Structure & Module Organization (Deprecated)

- Code: TypeScript in repo root and `src/`.
- Tests: `tests/` and top-level helper scripts like `test-*.ts` and `test-*.md`
  demos.
- Docker: `docker-compose.yml`, `Dockerfile.*`, `init-docker.sh`, `Makefile` for
  orchestration.
- Data/Logs: `data/` (created by Docker) with subdirs for cache, kv, redis,
  prometheus, grafana.
- Config: `.env` (local), `.env.example` (template), `deno.json` (tasks),
  `prometheus.yml`, Grafana provisioning.

## Build, Test, and Development Commands

- Initialize: `./init-docker.sh` — create data dirs and baseline config.
- Start all (standard): `make up` or
  `docker-compose up -d --build && docker-compose logs`.
- Stop: `make down`.
- Status/Logs: `make status`, `make logs` or `docker-compose ps|logs [service]`.
- Local run: `deno task resolver` (Bob/resolver),
  `deno task alice --action list`.
- Tests (in container): `make test` (runs `deno task resolver:test`).

## Coding Style & Naming Conventions

- Language: TypeScript (Deno). Use ES modules and explicit imports in
  `deno.json`.
- Formatting: `deno fmt` before commits; lint with `deno lint`.
- Indentation: 2 spaces; prefer descriptive names (`camelCase` for
  vars/functions, `PascalCase` for types).
- Entrypoints: prefer `alice-service-orpc.ts` and `bob-resolver-service-v2.ts`.

## Testing Guidelines

- Write deterministic test scripts in `tests/` (e.g.,
  `postinteraction-v2.2.test.ts`).
- Run targeted scripts with Deno permissions as needed, or via `make test`
  inside resolver container.
- Name tests with `.test.ts` suffix; keep external RPC/state behind mocks or
  `.env` flags.

## Commit & Pull Request Guidelines

- Commits: follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).
  Example: `feat: add resolver health probe`.
- Scope small, message imperative, include rationale if non-obvious.
- PRs: clear description, linked issues, reproduction steps, screenshots/logs
  when relevant, and CHANGELOG.md updates for notable changes.

## Security & Configuration Tips

- Never commit secrets. Use `.env` from `.env.example`; verify `.gitignore`
  blocks secrets.
- Use health endpoints for checks: `http://localhost:8000/health`,
  `:8001/health`, `:8002/health`.
- Prefer `make up` to rebuild with cache; avoid `--no-cache` unless necessary.

## Environment Usage Rules (MANDATORY)

- Always run local Deno commands with `--env-file=.env`.
  - Examples:
    - `deno run --env-file=.env ...`
    - `deno task alice` (tasks in `deno.json` already include `--env-file=.env`)
- Do not run local Deno scripts without `--env-file=.env`. The only exception is
  inside Docker containers where Compose injects env via `env_file: .env`.
- Keep `.env.example` up to date with required variables. Copy to `.env` before
  running anything.
- CI/dev scripts and docs must include `--env-file=.env` for any local Deno
  invocation.

---

## Agent Update — 2025-08-11

### What I changed today

- Centralized takerTraits handling in `src/utils/limit-order.ts`:
  - Set maker-amount mode (bit 255), threshold (low 185 bits), and argsExtensionLength (bits 224..247).
  - Keeps custom takerTraits if provided; otherwise computes from `extensionData` and `order`.
- Stopped per-call overrides so centralized logic is used during fills.
  - `bob-resolver-service.ts` now defers takerTraits to the utility.
- RPC fallbacks when `ANKR_API_KEY` is not set:
  - Base: `https://mainnet.base.org`; Optimism: `https://mainnet.optimism.io` in `bob-resolver-service.ts`, `src/alice/limit-order-alice.ts`, and `scripts/read-bmn-balance.ts`.
- Signature correctness:
  - `src/alice/limit-order-alice.ts` now signs the on-chain order hash returned by `hashOrder` (protocol EIP-712 digest), avoiding BadSignature issues.
- Added `scripts/simulate-fill.ts`:
  - Reproduces `fillOrderArgs` call with computed takerTraits and displays revert details.
- Gas handling during fill:
  - Added explicit gas on simulation and a manual-gas fallback path for direct `writeContract` when providers reject simulation.

### What I verified

- Resolver BMN balance on Base: confirmed large balance via `scripts/read-bmn-balance.ts`.
- Resolver ETH on Base: confirmed non-zero via `eth_getBalance`.
- Created new orders with the new signature path; resolver attempted fill through `/fill-order`.
- Logs show properly formed args; still no successful tx (provider reports “Transaction creation failed”). No PostInteraction/escrow events yet.

### Current result

- Services healthy (`docker-compose up -d`).
- Orders are created and signed; resolver attempts fills with correct takerTraits and extension length.
- Fills are blocked at provider/creation level (no revert decoded from protocol), so no escrows yet.

### Next steps (planned)

- Improve error surfacing:
  - Decode and log 1inch errors in fill path; return explicit reason from `/fill-order`.
- Fee and gas controls:
  - Send EIP-1559 params and set conservative gas limit to avoid provider eth_call quirks; retry.
- Minimal extension check:
  - Attempt a minimal PostInteraction payload (same-chain, tiny amounts) to isolate extension parsing vs signature issues.
- Local reproduction:
  - Run a local fork/anvil test of `fillOrderArgs` with our extension to get exact revert reason and gas profile.
- Validate offsets and salt correlation (already passing) and re-check amount direction against `TakerTraits` mode.

### Repro commands

1) Start services
   - `docker-compose up -d`
2) Create order (uses funded keys)
   - `RESOLVER=0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5 deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv --env-file=.env scripts/create-order.ts`
3) Trigger fill
   - `FILE=$(ls -t pending-orders/*.json | head -n 1)`
   - `jq '{order, signature, extensionData, chainId, takerAmount: .order.makingAmount, takerAsset: .order.takerAsset}' "$FILE" | curl -sS -X POST http://localhost:8002/fill-order -H 'Content-Type: application/json' -d @-`
4) Optional simulation
   - `deno run --allow-net --allow-env --allow-read --env-file=.env scripts/simulate-fill.ts`

