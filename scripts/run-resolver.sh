#!/bin/bash

# Bridge-Me-Not Resolver Runner with Logging

# Create logs directory if it doesn't exist
mkdir -p logs

# Generate timestamp for log file
TIMESTAMP=$(date +"%Y-%m-%d-%H-%M-%S")
LOG_FILE="logs/resolver-${TIMESTAMP}.log"

# Parse command line arguments
ARGS="$@"

# Print startup info
echo "🚀 Starting Bridge-Me-Not Resolver"
echo "📁 Log file: ${LOG_FILE}"
echo "📝 Arguments: ${ARGS}"
echo ""

# Run the resolver with tee to output to both console and log file
# 2>&1 redirects stderr to stdout so we capture ALL output including errors
exec deno run --allow-all --env-file src/resolver/index.ts ${ARGS} 2>&1 | tee "${LOG_FILE}"