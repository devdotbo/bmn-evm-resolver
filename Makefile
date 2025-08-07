# BMN Resolver Docker Infrastructure Makefile
.PHONY: help init build up down restart logs clean status shell test security-check

# Default target
help:
	@echo "BMN Resolver Docker Infrastructure Commands"
	@echo "==========================================="
	@echo ""
	@echo "Setup & Build:"
	@echo "  make init          - Initialize infrastructure (first-time setup)"
	@echo "  make build         - Build all Docker images (with cache)"
	@echo "  make rebuild       - Rebuild specific service (SERVICE=resolver)"
	@echo ""
	@echo "Operations:"
	@echo "  make up            - Build and start all services (standard command)"
	@echo "  make down          - Stop all services"
	@echo "  make restart       - Restart all services"
	@echo "  make status        - Show service status"
	@echo "  make logs          - Show logs for all services (no follow)"
	@echo "  make logs-service  - Show logs for specific service (SERVICE=resolver)"
	@echo ""
	@echo "Development:"
	@echo "  make shell         - Access container shell (SERVICE=resolver)"
	@echo "  make test          - Run tests in container"
	@echo "  make dev           - Start services with live reload"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean         - Stop services and remove volumes"
	@echo "  make prune         - Remove unused Docker resources"
	@echo "  make backup        - Backup data directory"
	@echo "  make restore       - Restore data from backup"
	@echo ""
	@echo "Security:"
	@echo "  make security-check - Run security scan"
	@echo "  make update-deps   - Update Deno dependencies"
	@echo ""
	@echo "Production:"
	@echo "  make prod          - Start services in production mode"
	@echo "  make prod-build    - Build production images"
	@echo ""

# Initialize infrastructure
init:
	@echo "Initializing BMN Resolver infrastructure..."
	@chmod +x ./init-docker.sh
	@./init-docker.sh

# Build all images (with cache)
build:
	@echo "Building Docker images..."
	@docker-compose build

# Rebuild specific service
rebuild:
	@if [ -z "$(SERVICE)" ]; then \
		echo "Error: SERVICE not specified. Usage: make rebuild SERVICE=resolver"; \
		exit 1; \
	fi
	@echo "Rebuilding $(SERVICE)..."
	@docker-compose build $(SERVICE)
	@docker-compose restart $(SERVICE)

# Start all services (STANDARD COMMAND - always rebuild and show logs)
up:
	@echo "Building and starting all services..."
	@docker-compose up -d --build && docker-compose logs
	@echo ""
	@echo "Services started successfully!"
	@echo "Resolver: http://localhost:8000"
	@echo "Alice:    http://localhost:8001"
	@echo "Bob:      http://localhost:8002"
	@echo "Grafana:  http://localhost:3000"

# Stop all services
down:
	@echo "Stopping all services..."
	@docker-compose down

# Restart all services
restart:
	@echo "Restarting all services..."
	@docker-compose restart

# Show logs for all services (no follow)
logs:
	@docker-compose logs

# Show logs for specific service (no follow)
logs-service:
	@if [ -z "$(SERVICE)" ]; then \
		echo "Error: SERVICE not specified. Usage: make logs-service SERVICE=resolver"; \
		exit 1; \
	fi
	@docker-compose logs $(SERVICE)

# Show service status
status:
	@echo "Service Status:"
	@echo "==============="
	@docker-compose ps

# Access container shell
shell:
	@if [ -z "$(SERVICE)" ]; then \
		SERVICE=resolver; \
	fi
	@echo "Accessing $(SERVICE) shell..."
	@docker-compose exec $(SERVICE) sh

# Run tests
test:
	@echo "Running tests..."
	@docker-compose exec resolver deno task resolver:test:docker
	@echo "Tests completed!"

# Start in development mode
dev:
	@echo "Starting in development mode..."
	@docker-compose up

# Clean everything
clean:
	@echo "WARNING: This will remove all data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo ""; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		rm -rf data/; \
		echo "Cleaned all data and volumes"; \
	else \
		echo "Cancelled"; \
	fi

# Prune Docker resources
prune:
	@echo "Pruning unused Docker resources..."
	@docker system prune -f
	@docker volume prune -f
	@echo "Docker cleanup completed"

# Backup data directory
backup:
	@echo "Creating backup..."
	@BACKUP_NAME="backup-$$(date +%Y%m%d-%H%M%S).tar.gz"; \
	tar -czf "$$BACKUP_NAME" data/; \
	echo "Backup created: $$BACKUP_NAME"

# Restore from backup
restore:
	@if [ -z "$(BACKUP)" ]; then \
		echo "Error: BACKUP not specified. Usage: make restore BACKUP=backup-20240101-120000.tar.gz"; \
		exit 1; \
	fi
	@echo "Restoring from $(BACKUP)..."
	@docker-compose down
	@rm -rf data/
	@tar -xzf "$(BACKUP)"
	@echo "Restore completed. Run 'make up' to start services"

# Security check
security-check:
	@echo "Running security check..."
	@./scripts/security-check.sh || true
	@echo ""
	@echo "Checking Docker images for vulnerabilities..."
	@docker-compose config --services | while read service; do \
		echo "Scanning $$service..."; \
		docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
			aquasec/trivy image bmn-resolver_$$service:latest --quiet --severity HIGH,CRITICAL || true; \
	done

# Update dependencies
update-deps:
	@echo "Updating Deno dependencies..."
	@docker-compose exec resolver deno cache --reload resolver.ts
	@docker-compose exec alice deno cache --reload alice.ts
	@echo "Dependencies updated"

# Production build
prod-build:
	@echo "Building production images..."
	@docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start in production mode
prod:
	@echo "Starting in production mode..."
	@docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
	@echo "Production services started"

# Quick start (alias for common workflow)
start: up logs

# Quick stop
stop: down

# Health check
health:
	@echo "Checking service health..."
	@curl -s http://localhost:8000/health > /dev/null && echo "✓ Resolver: Healthy" || echo "✗ Resolver: Unhealthy"
	@curl -s http://localhost:8001/health > /dev/null && echo "✓ Alice: Healthy" || echo "✗ Alice: Unhealthy"
	@curl -s http://localhost:8002/health > /dev/null && echo "✓ Bob: Healthy" || echo "✗ Bob: Unhealthy"
	@curl -s http://localhost:9090/-/healthy > /dev/null && echo "✓ Prometheus: Healthy" || echo "✗ Prometheus: Unhealthy"
	@curl -s http://localhost:3000/api/health > /dev/null && echo "✓ Grafana: Healthy" || echo "✗ Grafana: Unhealthy"

# View resource usage
stats:
	@docker stats --no-stream

# Tail specific log pattern
grep-logs:
	@if [ -z "$(PATTERN)" ]; then \
		echo "Error: PATTERN not specified. Usage: make grep-logs PATTERN=error"; \
		exit 1; \
	fi
	@docker-compose logs | grep -i "$(PATTERN)"

# Quick rebuild and restart
refresh: rebuild restart logs-service

# Show environment
env:
	@docker-compose exec resolver env | sort

# Export compose config
export-config:
	@docker-compose config > docker-compose.exported.yml
	@echo "Configuration exported to docker-compose.exported.yml"
