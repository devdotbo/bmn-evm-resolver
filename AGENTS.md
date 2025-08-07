# Repository Guidelines

## Project Structure & Module Organization
- Code: TypeScript in repo root and `src/` (e.g., `resolver-service.ts`, `alice.ts`, `bob-service.ts`).
- Tests: `tests/` and top-level helper scripts like `test-*.ts` and `test-*.md` demos.
- Docker: `docker-compose.yml`, `Dockerfile.*`, `init-docker.sh`, `Makefile` for orchestration.
- Data/Logs: `data/` (created by Docker) with subdirs for cache, kv, redis, prometheus, grafana.
- Config: `.env` (local), `.env.example` (template), `deno.json` (tasks), `prometheus.yml`, Grafana provisioning.

## Build, Test, and Development Commands
- Initialize: `./init-docker.sh` — create data dirs and baseline config.
- Start all (standard): `make up` or `docker-compose up -d --build && docker-compose logs`.
- Stop: `make down`.
- Status/Logs: `make status`, `make logs` or `docker-compose ps|logs [service]`.
- Local run: `deno task resolver` (Bob/resolver), `deno task alice --action list`.
- Tests (in container): `make test` (runs `deno task resolver:test`).

## Coding Style & Naming Conventions
- Language: TypeScript (Deno). Use ES modules and explicit imports in `deno.json`.
- Formatting: `deno fmt` before commits; lint with `deno lint`.
- Indentation: 2 spaces; prefer descriptive names (`camelCase` for vars/functions, `PascalCase` for types).
- Files: hyphenated or descriptive (e.g., `resolver-service.ts`, `alice-service.ts`).

## Testing Guidelines
- Write deterministic test scripts in `tests/` (e.g., `postinteraction-v2.2.test.ts`).
- Run targeted scripts with Deno permissions as needed, or via `make test` inside resolver container.
- Name tests with `.test.ts` suffix; keep external RPC/state behind mocks or `.env` flags.

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.). Example: `feat: add resolver health probe`.
- Scope small, message imperative, include rationale if non-obvious.
- PRs: clear description, linked issues, reproduction steps, screenshots/logs when relevant, and CHANGELOG.md updates for notable changes.

## Security & Configuration Tips
- Never commit secrets. Use `.env` from `.env.example`; verify `.gitignore` blocks secrets.
- Use health endpoints for checks: `http://localhost:8000/health`, `:8001/health`, `:8002/health`.
- Prefer `make up` to rebuild with cache; avoid `--no-cache` unless necessary.
