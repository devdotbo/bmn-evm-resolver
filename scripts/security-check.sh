#!/bin/bash
# Security Check Script - Run before EVERY commit
# This script scans for exposed secrets and private keys

set -e

echo "🔒 Running Comprehensive Security Check..."
echo "========================================="

ERRORS=0
WARNINGS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo -e "${RED}❌ Not in a git repository${NC}"
  exit 1
fi

echo "📋 Checking staged files..."

# 1. Check for Ethereum private keys in staged files
if git diff --cached | grep -qE "0x[a-fA-F0-9]{64}"; then
  # Filter out zero addresses and known test keys
  FOUND_KEYS=$(git diff --cached | grep -oE "0x[a-fA-F0-9]{64}" | grep -v "0x0000000000000000000000000000000000000000000000000000000000000000" | grep -v "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" || true)
  if [ ! -z "$FOUND_KEYS" ]; then
    echo -e "${RED}❌ CRITICAL: Private key(s) detected in staged files!${NC}"
    echo "$FOUND_KEYS" | head -5
    ERRORS=$((ERRORS + 1))
  fi
fi

# 2. Check for API keys in staged files
if git diff --cached | grep -qE "(api[_-]?key|apikey|api_secret|access[_-]?token|auth[_-]?token|bearer)[\s]*[=:]\s*['\"]?[a-zA-Z0-9_\-\/\+]{20,}"; then
  # Check if it's not a placeholder
  if ! git diff --cached | grep -E "(api[_-]?key|apikey|api_secret|access[_-]?token|auth[_-]?token|bearer)" | grep -qE "(your_.*_here|YOUR_.*_HERE|<.*>|\{\{.*\}\})"; then
    echo -e "${RED}❌ CRITICAL: API key/token detected in staged files!${NC}"
    git diff --cached | grep -E "(api[_-]?key|apikey|api_secret|access[_-]?token|auth[_-]?token|bearer)[\s]*[=:]\s*['\"]?[a-zA-Z0-9_\-\/\+]{20,}" | head -3
    ERRORS=$((ERRORS + 1))
  fi
fi

# 3. Check for .env file in staging
if git diff --cached --name-only | grep -qE "^\.env$"; then
  echo -e "${RED}❌ CRITICAL: .env file is staged for commit!${NC}"
  echo "Run: git reset HEAD .env"
  ERRORS=$((ERRORS + 1))
fi

# 4. Check for other sensitive file patterns
SENSITIVE_FILES=$(git diff --cached --name-only | grep -E "\.(pem|key|p12|pfx|cert|crt)$|id_rsa|id_dsa|id_ecdsa|id_ed25519" || true)
if [ ! -z "$SENSITIVE_FILES" ]; then
  echo -e "${YELLOW}⚠️  WARNING: Potentially sensitive files detected:${NC}"
  echo "$SENSITIVE_FILES"
  WARNINGS=$((WARNINGS + 1))
fi

# 5. Check .env.example files for real values
ENV_EXAMPLES=$(git diff --cached --name-only | grep -E "\.env\..*example" || true)
if [ ! -z "$ENV_EXAMPLES" ]; then
  for file in $ENV_EXAMPLES; do
    if git show ":$file" 2>/dev/null | grep -qE "=[a-fA-F0-9]{32,}|=0x[a-fA-F0-9]{64}"; then
      # Check if it's not a placeholder or zero address
      if ! git show ":$file" | grep -E "=[a-fA-F0-9]{32,}|=0x[a-fA-F0-9]{64}" | grep -qE "(0x0000000000000000000000000000000000000000|your_.*_here|YOUR_.*_HERE)"; then
        echo -e "${YELLOW}⚠️  WARNING: $file may contain real values instead of placeholders${NC}"
        WARNINGS=$((WARNINGS + 1))
      fi
    fi
  done
fi

# 6. Check for hardcoded secrets in source files
SOURCE_FILES=$(git diff --cached --name-only | grep -E "\.(ts|tsx|js|jsx|py|go|rs|sol)$" || true)
if [ ! -z "$SOURCE_FILES" ]; then
  for file in $SOURCE_FILES; do
    # Check for hardcoded private keys
    if git show ":$file" 2>/dev/null | grep -qE "=\s*['\"]0x[a-fA-F0-9]{64}['\"]"; then
      echo -e "${RED}❌ CRITICAL: Hardcoded private key in $file${NC}"
      ERRORS=$((ERRORS + 1))
    fi
    
    # Check for hardcoded API keys (long alphanumeric strings after key/token/secret)
    if git show ":$file" 2>/dev/null | grep -qE "(apiKey|api_key|token|secret)\s*=\s*['\"][a-zA-Z0-9_\-]{32,}['\"]"; then
      if ! git show ":$file" | grep -E "(apiKey|api_key|token|secret)\s*=\s*['\"]" | grep -qE "(process\.env|Deno\.env|import\.meta\.env|YOUR_|your_|<.*>)"; then
        echo -e "${YELLOW}⚠️  WARNING: Possible hardcoded secret in $file${NC}"
        WARNINGS=$((WARNINGS + 1))
      fi
    fi
  done
fi

# 7. Verify .gitignore includes security patterns
echo ""
echo "📋 Checking .gitignore..."
if [ -f .gitignore ]; then
  MISSING_PATTERNS=()
  
  if ! grep -q "^\.env$" .gitignore; then
    MISSING_PATTERNS+=(".env")
  fi
  
  if ! grep -qE "\*\.key$" .gitignore; then
    MISSING_PATTERNS+=("*.key")
  fi
  
  if ! grep -qE "\*\.pem$" .gitignore; then
    MISSING_PATTERNS+=("*.pem")
  fi
  
  if [ ${#MISSING_PATTERNS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  WARNING: .gitignore missing security patterns:${NC}"
    printf '%s\n' "${MISSING_PATTERNS[@]}"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "${GREEN}✅ .gitignore properly configured${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  WARNING: No .gitignore file found${NC}"
  WARNINGS=$((WARNINGS + 1))
fi

# 8. Quick scan of recent commits (last 5)
echo ""
echo "📋 Scanning recent commits..."
RECENT_SECRETS=$(git log -5 --oneline -p 2>/dev/null | grep -E "0x[a-fA-F0-9]{64}|api[_-]?key.*=.*[a-zA-Z0-9]{32,}" | grep -v "0x0000000000000000000000000000000000000000000000000000000000000000" | head -5 || true)
if [ ! -z "$RECENT_SECRETS" ]; then
  echo -e "${YELLOW}⚠️  WARNING: Potential secrets found in recent commits${NC}"
  echo "Run full history scan: git log --all -p | grep -E '0x[a-fA-F0-9]{64}'"
  WARNINGS=$((WARNINGS + 1))
fi

# Summary
echo ""
echo "========================================="
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}❌ Security check FAILED with $ERRORS critical error(s)${NC}"
  if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Also found $WARNINGS warning(s)${NC}"
  fi
  echo ""
  echo "Fix the critical errors before committing!"
  echo "Run 'git diff --cached' to review your changes"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Security check passed with $WARNINGS warning(s)${NC}"
  echo "Review warnings before proceeding"
  exit 0
else
  echo -e "${GREEN}✅ All security checks PASSED!${NC}"
  echo "Safe to commit"
  exit 0
fi