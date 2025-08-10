# Docker Quick Start Guide

## Quick Start
```bash
# 1. Start the indexer first
cd ../bmn-evm-contracts-indexer
docker-compose up -d

# 2. Start resolver services
cd ../bmn-evm-resolver
docker compose up -d --build

# 3. Check everything is running
docker ps
```

## Service URLs
- Alice API: http://localhost:8001
- Bob-Resolver API: http://localhost:8002
- Indexer: http://localhost:42069

## Common Commands
```bash
# View logs
docker compose logs -f bob

# Restart a service
docker compose restart bob

# Stop everything
docker compose down

# Clean restart
docker compose down -v
docker compose up -d --build
```

## Troubleshooting
- **Services can't connect to indexer**: Check indexer is running on port 42069
- **Build fails**: Check Deno version matches (should be 2.4.3)
- **Volumes fail**: Ensure Docker Desktop has file sharing enabled
- **Alice keeps restarting**: This is expected - it needs to be fixed to run as a service

## What Works
✅ Docker builds successfully  
✅ Services connect to indexer  
✅ Basic infrastructure operational  

## What Needs Fixing
✅ Health check endpoints (implemented)  

## Environment Setup
```bash
# Copy example env if not exists
cp .env.example .env

# Edit with your keys
nano .env
```

## Service Architecture
```
bmn-evm-contracts-indexer/
├── PostgreSQL (events database)
└── API (port 42069)

bmn-evm-resolver/
├── bob (port 8002) - Unified Bob-Resolver (coordinator + taker)
├── alice (port 8001) - Order initiator
├── redis (port 6379) - Cache/pub-sub
└── monitoring (Grafana/Prometheus)
```

## Debug Tips
```bash
# Check indexer events
make -C ../bmn-evm-contracts-indexer check-events

# Enter container shell
docker-compose exec bob sh

# Check service health
curl http://localhost:8002/health

# View Redis data
docker-compose exec redis redis-cli
```

## Next Steps for Development
1. Fix Alice service to run continuously
2. Implement health check endpoints
3. Configure Prometheus metrics
4. Add proper logging to all services
5. Document API endpoints