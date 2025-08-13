# BMN Resolver – Cursor Rules

- Prefer absolute paths when running tools in Cursor terminal.
- Services: `alice` (8001), `bob-resolver` (8002). No separate `resolver` service. Monitoring stack removed.
- Start stack: `docker compose up -d --build`.
- Logs:
  - `docker compose logs --no-color --no-log-prefix --timestamps alice | tail -n +1`
  - `docker compose logs --no-color --no-log-prefix --timestamps bob | tail -n +1`
- Health: `curl localhost:8001/health`, `curl localhost:8002/health`.
- State uses Deno KV; no Redis.
- Always include `--env-file=.env` for all local Deno commands run in Cursor.
  - Example: `deno run --env-file=.env --allow-net --allow-env script.ts`
  - Tasks in `deno.json` already include `--env-file=.env`.
  - Inside Docker Compose, envs are injected via `env_file: .env` (no extra flags).
- When editing code, keep to TypeScript best practices in `src/**` and avoid
  introducing any `any` types.
- Security: never commit real secrets; `.env` should not be tracked; use
  `.env.example` for placeholders.
- Commit style: conventional commits, e.g., `chore(infra): ...`, `feat: ...`,
  `fix: ...`.
