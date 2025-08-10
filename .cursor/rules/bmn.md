# BMN Resolver – Cursor Rules

- Prefer absolute paths when running tools in Cursor terminal.
- Services: `resolver` (8000), `alice` (8001), `bob` (8002). Monitoring stack
  removed.
- Start stack: `docker-compose up -d --build resolver alice bob`.
- Logs:
  - `docker-compose logs --no-color --no-log-prefix --timestamps resolver | tail -n +1`
  - same for `alice`, `bob`.
- Health: `curl localhost:8000/health`, `:8001/health`, `:8002/health`.
- State uses Deno KV; no Redis.
- Always include `--env-file=.env` for all local Deno commands run in Cursor.
  - Example: `deno run --env-file=.env --allow-net --allow-env script.ts`
  - Tasks in `deno.json` already include `--env-file=.env`.
  - Inside Docker Compose, envs are injected via `env_file: .env` (no extra
    flags needed).
- When editing code, keep to TypeScript best practices in `src/**` and avoid
  introducing any `any` types.
- Security: never commit real secrets; `.env` should not be tracked; use
  `.env.example` for placeholders.
- Commit style: conventional commits, e.g., `chore(infra): ...`, `feat: ...`,
  `fix: ...`.
