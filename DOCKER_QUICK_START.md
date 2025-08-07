# Docker Quick Start Guide

## Quick Start
```bash
# 1. Start the indexer first
cd ../bmn-evm-contracts-indexer
docker-compose up -d

# 2. Start resolver services
cd ../bmn-evm-resolver
docker-compose up -d --build

# 3. Check everything is running
docker ps
```

## Service URLs
- Resolver API: http://localhost:8000
- Bob API: http://localhost:8002
- Indexer: http://localhost:42069
- Grafana: http://localhost:3000 (admin/admin)
- Redis: localhost:6379

## Common Commands
```bash
# View logs
docker-compose logs -f resolver

# Restart a service
docker-compose restart resolver

# Stop everything
docker-compose down

# Clean restart
docker-compose down -v
docker-compose up -d --build
```

## Troubleshooting
- **Services can't connect to indexer**: Check indexer is running on port 42069
- **Build fails**: Check Deno version matches (should be 2.4.3)
- **Volumes fail**: Ensure Docker Desktop has file sharing enabled
- **Alice keeps restarting**: This is expected - it needs to be fixed to run as a service

## What Works
✅ Docker builds successfully  
✅ Services connect to indexer  
✅ Redis and PostgreSQL running  
✅ Basic infrastructure operational  

## What Needs Fixing
❌ Alice service (exits immediately)  
❌ Health check endpoints (not implemented)  
❌ Prometheus configuration  
⚠️ Resolver/Bob marked unhealthy (but working)  

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
├── resolver (port 8000) - Main coordinator
├── bob (port 8002) - Order taker
├── alice (port 8001) - Order initiator [BROKEN]
├── redis (port 6379) - Cache/pub-sub
└── monitoring (Grafana/Prometheus)
```

## Debug Tips
```bash
# Check indexer events
make -C ../bmn-evm-contracts-indexer check-events

# Enter container shell
docker-compose exec resolver sh

# Check service health
curl http://localhost:8000/health  # Not implemented yet

# View Redis data
docker-compose exec redis redis-cli
```

## Next Steps for Development
1. Fix Alice service to run continuously
2. Implement health check endpoints
3. Configure Prometheus metrics
4. Add proper logging to all services
5. Document API endpoints