# 🧭 Agent Runbook (BMN Resolver)

Read this first each session. Humans use `README.md`. Agents use this and `STATUS.md`.

## Sources of truth
- STATUS: `STATUS.md` (live status, checklist, grep commands)
- Changelog: `CHANGELOG.md`
- Human docs: `README.md`
- Extended docs: `docs/`

## Quick health
```bash
curl -s localhost:8001/health | jq .status
curl -s localhost:8002/health | jq .status
```

## Contracts sanity
```bash
rg -n "LIMIT_ORDER_PROTOCOL|ESCROW_FACTORY" src/config/contracts.ts wagmi.config.ts
rg -n "fillContractOrderArgs|fillOrderArgs" abis/SimpleLimitOrderProtocol.json
```

## Tests
```bash
# Tests removed in cleanup (2025-08-13)
```

## Entrypoints
- Alice: `alice-service-orpc.ts`
- Bob-Resolver: `bob-resolver-service-v2.ts`

## Common actions
```bash
deno task wagmi:generate
deno run -A --unstable-kv --env-file=.env alice-service-orpc.ts &
deno run -A --unstable-kv --env-file=.env bob-resolver-service-v2.ts &
deno run -A --unstable-kv --env-file=.env scripts/create-test-order.ts
```

## Edit policy
- Keep `STATUS.md` current (runbook header + status sections)
- Prefer wagmi-generated bindings over manual ABIs
- Update addresses/ABIs → regenerate types and update `STATUS.md`
- Keep `deno lint` / `deno check` green; do not use silent catches. Always log full errors.

## Links
- STATUS: ./STATUS.md
- README: ./README.md
- CHANGELOG: ./CHANGELOG.md
- Docs: ./docs/

## Quick Start

```bash
# First-time setup
cp .env.example .env
# Edit .env with your keys

# Start all services
deno run -A --unstable-kv --env-file=.env alice-service-orpc.ts &
deno run -A --unstable-kv --env-file=.env bob-resolver-service-v2.ts &
```

## Architecture

The BMN resolver system uses a two-party architecture:

### Core Services

- **alice**: Swap initiator service (port 8001)
- **bob**: Unified Bob-Resolver service - acts as both coordinator and
  counterparty (port 8002)

## Data Persistence

All services share a `./data` directory for persistent storage:

```
data/
├── secrets/      # Secret storage (encrypted keys, credentials)
├── orders/       # Pending order storage
├── logs/         # Application logs
├── cache/        # Deno cache directory
└── kv/           # Deno KV databases
```


## Environment Configuration

Create `.env` from `.env.example`:

```bash
cp .env.example .env
# Edit .env with your configuration
```

## Development Workflow

1. **Local Development**: Edit code locally
2. **Restart Services**: Kill and restart the affected service
3. **Check Service Logs**: View console output directly
4. Run `deno lint` and `deno check` locally before committing

## Monitoring

- **Service Health**:
  - Alice: http://localhost:8001/health
  - Bob-Resolver: http://localhost:8002/health

---

# 📝 CHANGELOG MAINTENANCE

**IMPORTANT**: Always update CHANGELOG.md when making significant changes to the
codebase. Follow the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
format. Document all notable changes under the [Unreleased] section including:

- Added (new features)
- Changed (changes in existing functionality)
- Deprecated (soon-to-be removed features)
- Removed (removed features)
- Fixed (bug fixes)
- Security (vulnerability fixes)

# 🔧 ABI INSPECTION TOOL

**Use `abi2human` to efficiently read Ethereum ABIs without consuming excessive
tokens:**

```bash
# Quick ABI inspection (human-readable)
abi2human contract.json -o

# Ultra-compact format (minimal tokens)
abi2human contract.json -oc

# Raw text format (most readable)
abi2human contract.json -or

# Check function signatures in an ABI
abi2human abis/CrossChainEscrowFactoryV2.json -oc

# Batch convert all ABIs for inspection
abi2human ./abis/ -d ./readable/
```

This tool is essential when you need to:

- Verify ABI functions match what you're calling
- Check if specific functions exist (like whitelist, pause, etc.)
- Compare different ABI versions
- Understand contract interfaces quickly

# 📊 BMN INDEXER EVENT MONITORING

**Check indexed blockchain events and system status:**

```bash
# Check all indexed events from bmn-evm-contracts-indexer
make -C ../bmn-evm-contracts-indexer check-events

# This command displays:
# - Event counts by table (BMN transfers, holders, approvals, limit orders, etc.)
# - Recent BMN token transfers with chain, addresses, amounts, and blocks
# - Top BMN token holders across chains
# - Limit order details and status
# - System status including active chains, total event tables, and database size
```

This command is useful for:

- Monitoring BMN token activity across chains
- Tracking limit order status
- Verifying indexer is capturing events correctly
- Getting a quick overview of system metrics

# 🔄 POSTINTERACTION INTEGRATION STATUS

**Critical Issue**: SimplifiedEscrowFactory on mainnet lacks IPostInteraction
interface **Solution**: Contract has been updated in bmn-evm-contracts
repository with postInteraction method **Status**: Ready for deployment

Key changes made:

1. SimplifiedEscrowFactory now implements IPostInteraction interface
2. postInteraction method added to handle escrow creation after order fills
3. Token flow fixed: transfers from resolver to escrow after protocol execution

See `LIMIT_ORDER_POSTINTERACTION_ISSUE.md` for technical details. See
`../bmn-evm-contracts/POSTINTERACTION_INTEGRATION_PLAN.md` for implementation
guide.

# 🔒 CRITICAL SECURITY GUIDELINES - PREVENT SECRET EXPOSURE

## ⚠️ MANDATORY PRE-COMMIT SECURITY SCAN

**ALWAYS run these commands BEFORE any commit or code changes:**

```bash
# Quick security scan - RUN THIS FIRST!
./scripts/security-check.sh 2>/dev/null || (
  echo "=== Running manual security scan ==="
  
  # 1. Check for private keys in staged files
  git diff --cached | grep -E "0x[a-fA-F0-9]{64}" | grep -v "0x0000000000000000000000000000000000000000" && echo "❌ PRIVATE KEY DETECTED!" || echo "✅ No private keys in staged files"
  
  # 2. Check for API keys
  git diff --cached | grep -E "(api[_-]?key|apikey|api_secret|access[_-]?token|auth[_-]?token|bearer|secret)[\s]*[=:]\s*['\"]?[a-zA-Z0-9_\-\/\+]{20,}" && echo "❌ API KEY DETECTED!" || echo "✅ No API keys in staged files"
  
  # 3. Check environment files
  git diff --cached --name-only | grep -E "\.env" && echo "⚠️ WARNING: .env file in commit! Verify it's an example file only"
  
  # 4. Final verification
  echo "=== Checking all staged files for secrets ==="
  git diff --cached --name-only | while read f; do 
    git show ":$f" 2>/dev/null | grep -E "[a-fA-F0-9]{32,64}|0x[a-fA-F0-9]{64}" | grep -v "0x0000000000000000000000000000000000000000\|your_.*_here\|YOUR_.*_HERE" && echo "⚠️ Potential secret in $f"
  done
)
```

## 🚨 SECRET PATTERNS TO DETECT

### High Priority Patterns (NEVER commit these):

```regex
# Ethereum Private Keys
0x[a-fA-F0-9]{64}

# API Keys (generic)
[a-zA-Z0-9_\-]{32,}  # When preceded by "key", "token", "secret"

# Ankr API Keys
[a-fA-F0-9]{64}  # When after ankr.com/

# AWS Keys
AKIA[0-9A-Z]{16}

# GitHub Tokens
gh[psr]_[0-9a-zA-Z]{36,}

# Mnemonic Phrases
\b(abandon|ability|able|about|above|absent|absorb|abstract|absurd|abuse|access|accident|account|accuse|achieve|acid|acoustic|acquire|across|act|action|actor|actress|actual|adapt|add|addict|address|adjust|admit|adult|advance|advice|aerobic|affair|afford|afraid|again|age|agent|agree|ahead|aim|air|airport|aisle|alarm|album|alcohol|alert|alien|all|alley|allow|almost|alone|alpha|already|also|alter|always|amateur|amazing|among|amount|amused|analyst|anchor|ancient|anger|angle|angry|animal|ankle|announce|annual|another|answer|antenna|antique|anxiety|any|apart|apology|appear|apple|approve|april|arch|arctic|area|arena|argue|arm|armed|armor|army|around|arrange|arrest|arrive|arrow|art|artefact|artist|artwork|ask|aspect|assault|asset|assist|assume|asthma|athlete|atom|attack|attend|attitude|attract|auction|audit|august|aunt|author|auto|autumn|average|avocado|avoid|awake|aware)\s+){11,24}
```

### Safe Patterns (OK to commit):

- Anvil/Hardhat test keys:
  `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- Zero addresses: `0x0000000000000000000000000000000000000000`
- Contract addresses (40 hex chars): `0x[a-fA-F0-9]{40}`
- Placeholders: `your_*_here`, `YOUR_*_HERE`, empty strings

## 📋 PRE-COMMIT CHECKLIST

Before EVERY commit, verify:

1. **Run security scan** (command above)
2. **Check files being committed:**
   ```bash
   git status
   git diff --cached --name-only
   ```

3. **Verify .env files:**
   ```bash
   # Ensure .env is NOT being committed
   git diff --cached --name-only | grep "^\.env$" && echo "❌ STOP! .env file staged!" || echo "✅ .env not staged"

   # Check .env.example only has placeholders
   git diff --cached -- .env.example | grep -E "=[a-fA-F0-9]{32,}" && echo "⚠️ Check .env.example for real values"
   ```

4. **Scan TypeScript/JavaScript files:**
   ```bash
   git diff --cached --name-only | grep -E "\.(ts|js|tsx|jsx)$" | while read f; do
     git show ":$f" | grep -E "=\s*['\"]0x[a-fA-F0-9]{64}['\"]" && echo "⚠️ Hardcoded key in $f"
   done
   ```

5. **Check configuration files:**
   ```bash
   git diff --cached --name-only | grep -E "\.(json|yaml|yml|toml)$" | while read f; do
     git show ":$f" | grep -E "\"(key|token|secret|password)\":\s*\"[^\"]{20,}\"" && echo "⚠️ Check $f for secrets"
   done
   ```

## 🔍 REGULAR SECURITY AUDITS

Run these commands weekly or before major commits:

### Full Repository Scan

```bash
# Complete security audit
echo "=== Starting Full Security Audit ==="

# 1. Check git history for secrets
echo "Scanning git history..."
git log --all -p | grep -E "(api[_-]?key|secret|token|password|private[_-]?key).*=.*['\"]?[a-zA-Z0-9_\-]{20,}" | head -10

# 2. Check for private keys in history
git log --all -p | grep -E "0x[a-fA-F0-9]{64}" | grep -v "0x0000000000000000000000000000000000000000" | head -10

# 3. Scan current files
find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.env*" \) -not -path "./node_modules/*" -not -path "./.git/*" -exec grep -l "[a-fA-F0-9]{32,64}" {} \;

# 4. Check .gitignore
grep -E "\.env|\.key|\.pem|secret|private" .gitignore || echo "⚠️ Update .gitignore!"
```

## 🛡️ PREVENTIVE MEASURES

### 1. Environment Variable Best Practices

```typescript
// ❌ NEVER DO THIS
const apiKey =
  "c24c691d7aaa31977e3454a97a599f261ad7e9b0a4fd750503167ab6db1293e9";

// ✅ ALWAYS DO THIS
const apiKey = Deno.env.get("ANKR_API_KEY");
if (!apiKey) throw new Error("ANKR_API_KEY not set");
```

### 2. Required .gitignore Entries

```gitignore
# Environment files
.env
.env.*
!.env.example
!.env.*.example

# Private keys
*.key
*.pem
*.p12
*.pfx
*_rsa
*_dsa
*_ecdsa
*_ed25519

# Secrets
secrets/
.secrets/
credentials/
**/secrets.json
**/credentials.json
```

### 3. Pre-commit Hook Installation

```bash
# Install pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
echo "🔒 Running security scan..."

# Check for private keys
if git diff --cached | grep -qE "0x[a-fA-F0-9]{64}" | grep -v "0x0000000000000000000000000000000000000000"; then
  echo "❌ ERROR: Private key detected in staged files!"
  echo "Run: git diff --cached | grep -E '0x[a-fA-F0-9]{64}'"
  exit 1
fi

# Check for API keys
if git diff --cached | grep -qE "api[_-]?key.*=.*[a-zA-Z0-9]{32,}"; then
  echo "❌ ERROR: API key detected in staged files!"
  exit 1
fi

echo "✅ Security scan passed"
EOF
chmod +x .git/hooks/pre-commit
```

## 🚨 EMERGENCY: IF SECRETS ARE EXPOSED

If you accidentally commit secrets:

### 1. Immediate Actions

```bash
# DO NOT PUSH! If already pushed, consider the key compromised

# Reset the commit (if not pushed)
git reset --soft HEAD~1

# Remove the file from staging
git reset HEAD <file-with-secret>
```

### 2. Clean Git History (if pushed)

```bash
# Install BFG Repo-Cleaner
brew install bfg

# Create secrets.txt with the exposed secrets
echo "YOUR_EXPOSED_SECRET" > secrets.txt

# Clean the repository
bfg --replace-text secrets.txt
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (coordinate with team!)
git push --force
```

### 3. Rotate All Exposed Credentials

- Generate new API keys immediately
- Update all services using the old keys
- Monitor for unauthorized usage

## 📊 AUTOMATED SCANNING SCRIPT

Create `scripts/security-check.sh`:

```bash
#!/bin/bash
set -e

echo "🔒 Security Check Starting..."

ERRORS=0

# Check staged files for secrets
if git diff --cached | grep -qE "0x[a-fA-F0-9]{64}|api[_-]?key.*=.*[a-zA-Z0-9]{32,}"; then
  echo "❌ Secrets detected in staged files!"
  ERRORS=$((ERRORS + 1))
fi

# Check for .env in staging
if git diff --cached --name-only | grep -q "^\.env$"; then
  echo "❌ .env file is staged!"
  ERRORS=$((ERRORS + 1))
fi

# Verify .gitignore
if ! grep -q "^\.env$" .gitignore; then
  echo "⚠️ .env not in .gitignore!"
  ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -eq 0 ]; then
  echo "✅ All security checks passed!"
  exit 0
else
  echo "❌ Security check failed with $ERRORS errors"
  exit 1
fi
```

## 🎯 QUICK COMMANDS

```bash
# Before ANY commit
git diff --cached | grep -E "0x[a-fA-F0-9]{64}|[a-zA-Z0-9_\-]{32,64}"

# Check specific file
grep -E "private|secret|key|token|password" <filename>

# Scan entire repo
find . -type f -exec grep -l "0x[a-fA-F0-9]{64}" {} \; 2>/dev/null

# Check git history
git log --all -p | grep -E "secret|private|token|key|password"
```

## ⚡ REMEMBER

1. **NEVER** commit real private keys or API keys
2. **ALWAYS** use environment variables for sensitive data
3. **RUN** security scan before EVERY commit
4. **CHECK** .env.example contains only placeholders
5. **VERIFY** .gitignore includes all sensitive file patterns
6. **ROTATE** any accidentally exposed credentials immediately

---

Last Security Audit: 2025-01-06 Next Scheduled Audit: Weekly
