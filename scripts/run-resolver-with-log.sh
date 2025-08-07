#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log file location
LOG_FILE="logs/resolver.log"

# Create logs directory if it doesn't exist
mkdir -p logs

# Clean the log file (always start fresh)
> "$LOG_FILE"

echo -e "${GREEN}📝 Starting resolver with logging to: $LOG_FILE${NC}"
echo -e "${YELLOW}📋 Log file cleared and ready${NC}"
echo -e "${GREEN}🚀 Starting resolver...${NC}\n"

# Run the resolver and redirect all output to log file
deno task resolver >> "$LOG_FILE" 2>&1 &

# Get the PID
PID=$!
echo -e "${GREEN}✅ Resolver started with PID: $PID${NC}"
echo -e "${YELLOW}📖 View logs with: tail -f $LOG_FILE${NC}"
echo -e "${YELLOW}🛑 Stop with: kill $PID${NC}"

# Save PID to file for easy stopping
echo $PID > logs/resolver.pid

# Optional: tail the log file
tail -f "$LOG_FILE"