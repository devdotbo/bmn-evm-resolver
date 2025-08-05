#!/bin/bash

# Bridge-Me-Not Resolver CLI with proper logging

# Default values
NETWORK="mainnet"
MIN_PROFIT="50"
LOG_DIR="./logs"
NO_LOGS=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --network)
      NETWORK="$2"
      shift 2
      ;;
    --min-profit)
      MIN_PROFIT="$2"
      shift 2
      ;;
    --log-dir)
      LOG_DIR="$2"
      shift 2
      ;;
    --no-logs)
      NO_LOGS=true
      shift
      ;;
    --help)
      cat << EOF
Bridge-Me-Not Resolver CLI

Usage:
  ./resolver-cli.sh [options]

Options:
  --network <name>      Network: mainnet, testnet, local (default: mainnet)
  --min-profit <bps>    Minimum profit in basis points (default: 50)
  --log-dir <dir>       Log directory (default: ./logs)
  --no-logs             Disable file logging
  --help                Show this help

Examples:
  # Run with 0% profit
  ./resolver-cli.sh --min-profit 0
  
  # Run on testnet
  ./resolver-cli.sh --network testnet
  
  # Run without logs
  ./resolver-cli.sh --no-logs
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Set environment variables
export NETWORK_MODE="${NETWORK}"
export MIN_PROFIT_BPS="${MIN_PROFIT}"

# Create logs directory
mkdir -p "${LOG_DIR}"

# Generate timestamp for log file
TIMESTAMP=$(date +"%Y-%m-%d-%H-%M-%S")
LOG_FILE="${LOG_DIR}/resolver-${TIMESTAMP}.log"

# Print startup info
echo "🚀 Starting Bridge-Me-Not Resolver"
echo "📍 Network: ${NETWORK}"
echo "💰 Min Profit: ${MIN_PROFIT} bps"

if [ "$NO_LOGS" = false ]; then
  echo "📁 Log file: ${LOG_FILE}"
  echo ""
  # Run with logging - capture ALL output including errors
  exec deno run --allow-all --env-file src/resolver/index.ts 2>&1 | tee "${LOG_FILE}"
else
  echo "📁 Logging: Disabled"
  echo ""
  # Run without logging
  exec deno run --allow-all --env-file src/resolver/index.ts
fi