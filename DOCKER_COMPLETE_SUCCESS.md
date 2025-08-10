# Docker Infrastructure Status

## Current Architecture

The BMN resolver system uses Docker Compose for orchestration with three core
services.

## Service Status

```
SERVICE          STATUS              PORTS                   ENDPOINT
bmn-resolver     Up (healthy)        localhost:8000          /health
bmn-alice        Up (healthy)        localhost:8001          /health
bmn-bob          Up (healthy)        localhost:8002          /health
```

## Services Overview

### Core Services

1. **Resolver** (Port 8000)
   - Acts as the main coordinator service
   - Handles order routing and coordination
   - Container: `bmn-resolver`
   - Health check: `http://localhost:8000/health`

2. **Alice** (Port 8001)
   - Swap initiator service
   - Monitors orders and auto-withdraws when destination escrows are ready
   - Container: `bmn-alice`
   - Health check: `http://localhost:8001/health`

3. **Bob** (Port 8002)
   - Swap acceptor/taker service
   - Separate instance configured for Bob role
   - Container: `bmn-bob`
   - Health check: `http://localhost:8002/health`

### External Dependencies

- **Indexer**: Accessed via `host.docker.internal:42069`
- **Blockchain RPCs**: Configured via environment variables

## Quick Commands

```bash
# Build and start all services
docker-compose up -d --build && docker-compose logs

# Check service status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Test health endpoints
curl http://localhost:8000/health
curl http://localhost:8001/health
curl http://localhost:8002/health

# View logs (without following)
docker-compose logs resolver alice bob

# View logs (with following)
docker-compose logs -f resolver alice bob

# Restart specific service
docker-compose restart resolver

# Stop all services
docker-compose down
```

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Docker Compose Network                 │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Alice     │  │  Resolver   │  │     Bob     │     │
│  │  (8001)     │  │   (8000)    │  │   (8002)    │     │
│  │  initiator  │  │ coordinator │  │  acceptor   │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                 │                 │            │
│         └─────────────────┼─────────────────┘            │
│                           │                              │
│                    Shared Data Volume                    │
│                     /app/data/                          │
│                  ├── kv/      (Deno KV)                 │
│                  ├── cache/   (Deno cache)              │
│                  ├── logs/    (Application logs)        │
│                  └── secrets/ (Encrypted keys)          │
│                                                          │
└───────────────────────────┬──────────────────────────────┘
                           │
                  host.docker.internal
                           │
        ┌──────────────────┴──────────────────┐
        │         Indexer (42069)              │
        │    PostgreSQL Event Database         │
        └──────────────────────────────────────┘
```

## Data Persistence

All services share a named volume `bmn-data` mounted at `/app/data`:

```
/app/data/
├── kv/          # Deno KV databases
│   ├── resolver.db
│   ├── alice.db
│   └── bob.db
├── cache/       # Shared Deno cache
├── logs/        # Application logs
└── secrets/     # Encrypted credentials
```

## Environment Configuration

1. Create `.env` from `.env.example`:

```bash
cp .env.example .env
# Edit .env with your configuration
```

2. Required environment variables:
   - RPC endpoints for each chain
   - Wallet private keys (for testing)
   - Service configuration

3. Environment injection:
   - Docker Compose handles environment variable injection
   - No `--env-file` flags in container entrypoints
   - Each service gets variables from `.env` via `env_file` directive

## Build Optimization

All Dockerfiles use:

- Multi-stage builds for efficient caching
- `BUILDKIT_INLINE_CACHE=1` for layer caching
- Non-root user execution
- Signal handling with `tini`
- Minimal final images

## Health Monitoring

Each service exposes health endpoints:

- **Endpoint**: `/health`
- **Response**: `{"status":"healthy","service":"<service-name>"}`
- **Used by**: Docker health checks

## Recent Updates (2025-08-07)

### Infrastructure Changes

- Removed monitoring stack (Prometheus/Grafana) - use health endpoints instead
- Removed Redis service - not required for current architecture
- Standardized Docker tasks: `resolver:docker`, `alice:docker`, `bob:docker`
- Improved environment variable handling

### Key Improvements

1. **Service Resilience**: All services run continuously with proper error
   handling
2. **Health Monitoring**: Simple HTTP health checks for each service
3. **Graceful Shutdown**: All services handle SIGINT/SIGTERM properly
4. **Configuration Management**: Environment variables injected by Docker
   Compose
5. **Named Volumes**: Persistent data storage across container restarts

## Troubleshooting

```bash
# Check container health
docker-compose ps

# View detailed logs
docker-compose logs --tail=100 resolver

# Access container shell
docker-compose exec resolver sh

# Run tests inside container
docker-compose exec resolver deno task resolver:test:docker

# Reset everything
docker-compose down -v
rm -rf data/
./init-docker.sh

# Rebuild without cache (only if necessary)
docker-compose build --no-cache
```

## Development Workflow

1. **Local Development**: Edit code locally
2. **Rebuild & Start**: `docker-compose up -d --build && docker-compose logs`
3. **Check Service Health**: `curl http://localhost:800{0,1,2}/health`
4. **Monitor Logs**: `docker-compose logs -f [service]`
5. **Run Tests**: `make test` (runs inside container)

## Status Summary

- ✅ All core services operational
- ✅ Health endpoints responding
- ✅ Services running continuously
- ✅ Docker Compose fully operational
- ✅ Persistent data volumes configured
- ✅ Environment variable injection working

---

**Status**: OPERATIONAL **Last Updated**: 2025-08-09 **Services**: 3/3 Healthy
