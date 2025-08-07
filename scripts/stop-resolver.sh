#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if PID file exists
if [ -f "logs/resolver.pid" ]; then
    PID=$(cat logs/resolver.pid)
    
    # Check if process is running
    if ps -p $PID > /dev/null 2>&1; then
        echo -e "${YELLOW}🛑 Stopping resolver with PID: $PID${NC}"
        kill $PID
        
        # Wait a moment and check if stopped
        sleep 1
        if ps -p $PID > /dev/null 2>&1; then
            echo -e "${RED}⚠️  Process didn't stop gracefully, force killing...${NC}"
            kill -9 $PID
        fi
        
        echo -e "${GREEN}✅ Resolver stopped${NC}"
    else
        echo -e "${YELLOW}⚠️  No resolver process found with PID: $PID${NC}"
    fi
    
    # Clean up PID file
    rm -f logs/resolver.pid
else
    echo -e "${RED}❌ No resolver PID file found${NC}"
    echo -e "${YELLOW}Attempting to find and kill resolver processes...${NC}"
    
    # Try to find and kill any resolver processes
    pkill -f "deno.*run-resolver.ts" 2>/dev/null && echo -e "${GREEN}✅ Killed resolver processes${NC}" || echo -e "${YELLOW}No resolver processes found${NC}"
fi