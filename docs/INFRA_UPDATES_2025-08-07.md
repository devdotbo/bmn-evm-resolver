# Infrastructure updates (2025-08-07)

## Scope
- Remove `--env-file=.env` from Docker entrypoints; rely on Docker Compose environment injection
- Add dedicated in-container Deno tasks: `resolver:docker`, `resolver:test:docker`, `alice:docker`
- Update `Makefile` test target to use `resolver:test:docker`
- Ignore local `.crush/` directory
- Add `src/types/contracts.ts` to provide typed contract address mapping

## Rationale
- Prevent accidental dependency on `.env` files inside containers
- Standardize local vs in-container execution flows
- Improve type safety around contract addresses

## Validation
- `docker-compose ps`: all core services healthy (`resolver`, `alice`, `bob`)
- `make test`: runs inside `resolver` container via `resolver:test:docker` — success
- Health endpoints reachable:
  - Resolver: http://localhost:8000/health
  - Alice: http://localhost:8001/health
  - Bob: http://localhost:8002/health

## Security
- Pre-commit security scan executed; no secrets found in staged changes

## Notes
- Monitoring stack removed in this line of work; rely on service health endpoints
- See `CHANGELOG.md` under Unreleased for summary
