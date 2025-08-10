#!/bin/bash

# BMN Resolver Docker Infrastructure Initialization Script
# This script sets up the data directory structure and initializes the Docker environment

set -e

echo "================================================"
echo "BMN Resolver Docker Infrastructure Setup"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create data directory structure
print_info "Creating data directory structure..."

directories=(
    "data"
    "data/secrets"
    "data/orders"
    "data/logs"
    "data/cache"
    "data/kv"
)

for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        print_success "Created directory: $dir"
    else
        print_info "Directory already exists: $dir"
    fi
done

# Set appropriate permissions
print_info "Setting directory permissions..."
chmod -R 755 data/
print_success "Permissions set for data directory"

# Check for .env file
if [ ! -f ".env" ]; then
    print_warning ".env file not found!"
    
    # Check if .env.example exists
    if [ -f ".env.example" ]; then
        print_info "Copying .env.example to .env..."
        cp .env.example .env
        print_success "Created .env from .env.example"
        print_warning "Please edit .env and add your configuration values"
    else
        print_error ".env.example not found. Please create a .env file with your configuration."
        echo ""
        echo "Required environment variables:"
        echo "  - PRIVATE_KEY_ALICE"
        echo "  - PRIVATE_KEY_BOB"
        echo "  - RPC_URL_CHAIN_A"
        echo "  - RPC_URL_CHAIN_B"
        echo "  - ANKR_API_KEY"
        echo "  - INDEXER_URL"
        echo "  - LOG_LEVEL"
        # Optional extras removed (Grafana/Prometheus/Redis)
        exit 1
    fi
else
    print_success ".env file found"
fi

# Create .env.example if it doesn't exist
if [ ! -f ".env.example" ]; then
    print_info "Creating .env.example template..."
    cat > .env.example << 'EOF'
# BMN Resolver Environment Configuration

# Private keys (NEVER commit real keys!)
PRIVATE_KEY_ALICE=your_alice_private_key_here
PRIVATE_KEY_BOB=your_bob_private_key_here

# RPC URLs
RPC_URL_CHAIN_A=https://your-chain-a-rpc-url
RPC_URL_CHAIN_B=https://your-chain-b-rpc-url

# API Keys
ANKR_API_KEY=your_ankr_api_key_here

# Indexer Configuration
INDEXER_URL=http://localhost:42069

# Logging
LOG_LEVEL=info

# Monitoring
GRAFANA_PASSWORD=admin

# Chain IDs
CHAIN_ID_A=1
CHAIN_ID_B=10

# Contract Addresses (update with your deployments)
ESCROW_FACTORY_ADDRESS_CHAIN_A=0x...
ESCROW_FACTORY_ADDRESS_CHAIN_B=0x...
BMN_TOKEN_ADDRESS_CHAIN_A=0x...
BMN_TOKEN_ADDRESS_CHAIN_B=0x...

# Optional: Redis Configuration
REDIS_URL=redis://redis:6379

# Optional: Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/bmn_resolver
EOF
    print_success "Created .env.example template"
fi

## Monitoring stack (Prometheus/Grafana/Redis) intentionally not provisioned

# Create a docker-compose override file for development
if [ ! -f "docker-compose.override.yml" ]; then
    print_info "Creating docker-compose.override.yml for development..."
    cat > docker-compose.override.yml << 'EOF'
# Development overrides - not committed to git
version: '3.8'

services:
  alice:
    build:
      args:
        - BUILDKIT_INLINE_CACHE=1
    environment:
      - LOG_LEVEL=debug
      
  bob:
    build:
      args:
        - BUILDKIT_INLINE_CACHE=1
    environment:
      - LOG_LEVEL=debug
EOF
    print_success "Created docker-compose.override.yml"
fi

# Add docker-compose.override.yml to .gitignore if not already there
if ! grep -q "docker-compose.override.yml" .gitignore 2>/dev/null; then
    echo "docker-compose.override.yml" >> .gitignore
    print_success "Added docker-compose.override.yml to .gitignore"
fi

# Build Docker images
print_info "Building Docker images (using cache)..."
if docker compose version &> /dev/null; then
    docker compose build
else
    docker-compose build
fi
print_success "Docker images built successfully"

echo ""
echo "================================================"
echo "Setup Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration values"
echo "2. Start the services:"
echo "   docker-compose up -d && docker-compose logs -f"
echo ""
echo "Useful commands:"
echo "  Start all services:    docker-compose up -d"
echo "  View logs:            docker-compose logs -f"
echo "  Stop all services:    docker-compose down"
echo "  Restart a service:    docker-compose restart <service-name>"
echo "  View service status:  docker-compose ps"
echo "  Clean everything:     docker-compose down -v && rm -rf data/"
echo ""
echo "Service URLs (when running):"
echo "  Alice API:        http://localhost:8001"
echo "  Bob-Resolver API: http://localhost:8002"
echo ""