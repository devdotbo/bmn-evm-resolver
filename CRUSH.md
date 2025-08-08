BMN EVM Resolver – CRUSH quick reference

Build / run / test
- Init Docker data dirs: ./init-docker.sh
- Start services (standard): docker-compose up -d --build && docker-compose logs
- Stop services: docker-compose down
- Make targets: make up | make down | make status | make logs | make test
- Local run (resolver): deno task resolver
- Local run (alice): deno task alice
- Run resolver test harness locally: deno task resolver:test
- Run tests in container: make test (runs deno task resolver:test:docker)
- Run a single test file: deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv --env-file=.env tests/postinteraction-v2.2.test.ts
- Lint: deno lint
- Format: deno fmt

Project conventions (TypeScript/Deno)
- Modules: ES modules only; import via explicit specifiers configured in deno.json (e.g., import { createPublicClient } from "viem"). Prefer absolute relative paths within repo, keep import groups ordered: std libs, third-party (viem, ponder), internal (src/**).
- Formatting: 2 spaces, run deno fmt before commits. Keep lines concise and avoid trailing whitespace.
- Types: strict typing, avoid any; prefer explicit interfaces/types. Reuse shared types; narrow unknown values early. Use bigint for token amounts; never use JS number for on-chain values.
- Naming: camelCase for vars/functions, PascalCase for types/classes, UPPER_SNAKE for environment constants. File names are hyphenated and descriptive.
- Errors: bubble with meaningful messages; never swallow errors. Wrap external I/O (RPC, FS, network) in try/catch and rethrow with context. Do not log secrets.
- Env/config: use .env (based on .env.example). Never commit real keys. Health endpoints: http://localhost:8000/health, :8001/health, :8002/health.
- Testing: deterministic scripts in tests/ and top-level test-*.ts. Prefer local mocks; gate external RPC with env flags. For one-off scripts, mirror permissions used in deno.json tasks.
- Docker: prefer cached builds; avoid --no-cache. Use make up for rebuild + logs. Data persists under ./data/.
- Security: run ./scripts/security-check.sh before commits. Never print private keys or API tokens. Use SecretManager (src/state/SecretManager.ts) for key access.

Assistant rules to follow
- Cursor rules: see .cursor/rules/bmn.md for service ports, logs, and workflow tips. Respect those conventions when scripting or guiding users.
- Claude notes: see CLAUDE.md for Docker quick start, ABI tool (abi2human), and secret scanning checklist.
