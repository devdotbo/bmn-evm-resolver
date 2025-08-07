#!/bin/bash

# PostInteraction v2.2.0 Test Runner
# Runs comprehensive tests for the BMN resolver PostInteraction integration

set -e

echo "======================================"
echo "PostInteraction v2.2.0 Test Suite"
echo "======================================"
echo ""

# Change to project root
cd "$(dirname "$0")/.."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found. Some tests may fail."
    echo "   Create .env with required environment variables."
    echo ""
fi

# Run tests with proper permissions
echo "🧪 Running PostInteraction v2.2.0 tests..."
echo ""

# Main test suite
deno test \
    --allow-net \
    --allow-env \
    --allow-read \
    --allow-write \
    --unstable-kv \
    tests/postinteraction-v2.2.test.ts

echo ""
echo "======================================"
echo "✅ All PostInteraction tests completed"
echo "======================================"