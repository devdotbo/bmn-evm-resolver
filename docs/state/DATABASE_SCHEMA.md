# Resolver Database Schema

## Overview

The resolver uses SQLite for local state management, chosen for its simplicity, performance, and zero-configuration deployment. This document defines the complete database schema for the resolver's operational state.

## Database Selection Rationale

### Why SQLite?
- **Embedded**: No separate database process required
- **Performance**: Sub-millisecond queries for local data
- **Reliability**: ACID compliant with full transaction support
- **Portability**: Single file database, easy backup/restore
- **Size**: Handles up to 281TB of data (more than enough)

### Why NOT PostgreSQL/MySQL?
- Resolver needs local, fast access to its own state
- No need for multi-user concurrent access
- Deployment simplicity is paramount
- Network latency would hurt performance

## Complete Schema Definition

### 1. Core Tables

#### revealed_secrets
Stores all secrets revealed by this resolver instance.

```sql
CREATE TABLE revealed_secrets (
  -- Primary Key
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Secret Identity
  hashlock TEXT UNIQUE NOT NULL,  -- keccak256(secret)
  secret TEXT NOT NULL,            -- The actual secret (encrypted at rest)
  
  -- Context
  order_hash TEXT NOT NULL,        -- Associated atomic swap order
  escrow_address TEXT NOT NULL,    -- Contract address where revealed
  chain_id INTEGER NOT NULL,       -- Blockchain ID (8453 for Base, etc)
  
  -- Revelation Details
  revealed_at INTEGER NOT NULL,    -- Unix timestamp when decided to reveal
  revealed_by TEXT NOT NULL,       -- 'resolver', 'manual', 'recovery'
  reveal_reason TEXT,               -- Why we revealed (profitable, deadline, etc)
  
  -- Transaction Details
  tx_hash TEXT,                     -- Blockchain transaction hash
  block_number INTEGER,             -- Block number of confirmation
  gas_used INTEGER,                 -- Actual gas consumed
  gas_price_wei TEXT,               -- Gas price in wei (stored as string for bigint)
  priority_fee_wei TEXT,            -- EIP-1559 priority fee
  
  -- Status Tracking
  status TEXT NOT NULL CHECK(status IN (
    'pending',      -- Stored but not submitted
    'submitted',    -- Transaction sent to mempool
    'confirmed',    -- On-chain confirmation
    'failed',       -- Transaction reverted
    'expired'       -- Deadline passed
  )),
  error_message TEXT,               -- Error details if failed
  retry_count INTEGER DEFAULT 0,    -- Number of retry attempts
  
  -- Competition Tracking
  competitor_count INTEGER,         -- How many others revealed same secret
  front_run_detected BOOLEAN DEFAULT FALSE,
  mev_protection_used BOOLEAN DEFAULT FALSE,
  
  -- Profitability
  expected_profit_wei TEXT,         -- Estimated profit when decided
  actual_profit_wei TEXT,           -- Actual profit after gas
  
  -- Timestamps
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  confirmed_at INTEGER,
  
  -- Indexes
  CHECK (hashlock = lower(hashlock)),
  CHECK (order_hash = lower(order_hash)),
  CHECK (escrow_address = lower(escrow_address))
);

CREATE INDEX idx_revealed_secrets_hashlock ON revealed_secrets(hashlock);
CREATE INDEX idx_revealed_secrets_order_hash ON revealed_secrets(order_hash);
CREATE INDEX idx_revealed_secrets_status ON revealed_secrets(status);
CREATE INDEX idx_revealed_secrets_chain_revealed ON revealed_secrets(chain_id, revealed_at);
CREATE INDEX idx_revealed_secrets_pending ON revealed_secrets(status) 
  WHERE status IN ('pending', 'submitted');
```

#### monitored_swaps
Tracks all atomic swaps we're actively monitoring.

```sql
CREATE TABLE monitored_swaps (
  -- Primary Key
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Swap Identity
  order_hash TEXT UNIQUE NOT NULL,
  hashlock TEXT NOT NULL,
  
  -- Escrow Addresses
  src_escrow_address TEXT,
  dst_escrow_address TEXT,
  src_chain_id INTEGER NOT NULL,
  dst_chain_id INTEGER NOT NULL,
  
  -- Participants
  src_maker TEXT NOT NULL,
  src_taker TEXT NOT NULL,
  dst_maker TEXT,
  dst_taker TEXT,
  
  -- Token Details
  src_token TEXT NOT NULL,
  src_amount TEXT NOT NULL,        -- Wei amount as string
  dst_token TEXT NOT NULL,
  dst_amount TEXT NOT NULL,        -- Wei amount as string
  
  -- Timing
  deadline INTEGER NOT NULL,        -- Unix timestamp
  monitoring_started_at INTEGER NOT NULL,
  execution_started_at INTEGER,
  completed_at INTEGER,
  
  -- Our Role
  our_role TEXT CHECK(our_role IN ('maker', 'taker', 'observer')),
  
  -- Profitability Analysis
  expected_profit_wei TEXT,
  gas_estimate_wei TEXT,
  priority_score REAL,              -- 0.0 to 1.0
  
  -- Execution
  actual_profit_wei TEXT,
  total_gas_used TEXT,
  
  -- Status
  status TEXT NOT NULL CHECK(status IN (
    'evaluating',    -- Analyzing profitability
    'monitoring',    -- Waiting for opportunity
    'executing',     -- Actively executing
    'completed',     -- Successfully completed
    'cancelled',     -- We decided not to proceed
    'failed',        -- Execution failed
    'expired'        -- Deadline passed
  )),
  
  -- Outcome
  completion_reason TEXT,
  failure_reason TEXT,
  
  -- Metadata
  notes TEXT,                       -- Human readable notes
  tags TEXT,                        -- JSON array of tags
  
  -- Timestamps
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  
  CHECK (order_hash = lower(order_hash)),
  CHECK (hashlock = lower(hashlock))
);

CREATE INDEX idx_monitored_swaps_status ON monitored_swaps(status);
CREATE INDEX idx_monitored_swaps_deadline ON monitored_swaps(deadline);
CREATE INDEX idx_monitored_swaps_active ON monitored_swaps(status) 
  WHERE status IN ('monitoring', 'executing');
CREATE INDEX idx_monitored_swaps_chains ON monitored_swaps(src_chain_id, dst_chain_id);
```

#### resolver_decisions
Audit log of all decisions made by the resolver.

```sql
CREATE TABLE resolver_decisions (
  -- Primary Key
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Context
  order_hash TEXT NOT NULL,
  swap_id INTEGER REFERENCES monitored_swaps(id),
  
  -- Decision
  action_type TEXT NOT NULL CHECK(action_type IN (
    'monitor',       -- Decided to monitor swap
    'skip',          -- Decided not to participate
    'reveal',        -- Decided to reveal secret
    'withdraw',      -- Decided to withdraw funds
    'cancel',        -- Decided to cancel participation
    'retry'          -- Decided to retry failed action
  )),
  
  -- Location
  chain_id INTEGER NOT NULL,
  escrow_address TEXT,
  
  -- Reasoning
  decision_reason TEXT NOT NULL,    -- Human readable reason
  decision_factors TEXT,             -- JSON object with factors
  
  -- Economic Factors
  gas_estimate TEXT,
  gas_price_wei TEXT,
  priority_fee_wei TEXT,
  estimated_profit_wei TEXT,
  competitor_count INTEGER,
  market_conditions TEXT,            -- JSON with market data
  
  -- Execution
  executed BOOLEAN DEFAULT FALSE,
  execution_time INTEGER,
  success BOOLEAN,
  error_message TEXT,
  tx_hash TEXT,
  
  -- Timestamps
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  
  CHECK (order_hash = lower(order_hash))
);

CREATE INDEX idx_resolver_decisions_order ON resolver_decisions(order_hash);
CREATE INDEX idx_resolver_decisions_action ON resolver_decisions(action_type);
CREATE INDEX idx_resolver_decisions_time ON resolver_decisions(created_at);
```

### 2. Analytics Tables

#### gas_estimates
Historical gas usage for better estimation.

```sql
CREATE TABLE gas_estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Operation
  operation_type TEXT NOT NULL,     -- 'reveal', 'withdraw', 'cancel'
  chain_id INTEGER NOT NULL,
  contract_address TEXT,
  
  -- Gas Data
  estimated_gas INTEGER NOT NULL,
  actual_gas INTEGER,
  gas_price_wei TEXT NOT NULL,
  priority_fee_wei TEXT,
  base_fee_wei TEXT,
  
  -- Context
  network_congestion TEXT,           -- 'low', 'medium', 'high'
  time_of_day INTEGER,               -- Hour (0-23)
  day_of_week INTEGER,               -- Day (0-6)
  
  -- Accuracy
  estimation_error REAL,             -- Percentage error
  
  -- Timestamps
  estimated_at INTEGER NOT NULL,
  executed_at INTEGER,
  
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_gas_estimates_operation ON gas_estimates(operation_type, chain_id);
CREATE INDEX idx_gas_estimates_time ON gas_estimates(estimated_at);
```

#### profit_tracking
Track profitability over time.

```sql
CREATE TABLE profit_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Period
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  period_type TEXT NOT NULL,        -- 'hour', 'day', 'week', 'month'
  
  -- Metrics
  swaps_completed INTEGER DEFAULT 0,
  swaps_failed INTEGER DEFAULT 0,
  swaps_skipped INTEGER DEFAULT 0,
  
  -- Profitability
  gross_profit_wei TEXT,
  gas_costs_wei TEXT,
  net_profit_wei TEXT,
  profit_margin REAL,                -- Percentage
  
  -- Performance
  average_execution_time INTEGER,    -- Milliseconds
  success_rate REAL,
  
  -- Competition
  front_run_count INTEGER DEFAULT 0,
  races_won INTEGER DEFAULT 0,
  races_lost INTEGER DEFAULT 0,
  
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_profit_tracking_period ON profit_tracking(period_type, period_start);
```

### 3. Configuration Tables

#### resolver_config
Runtime configuration that can be updated without restart.

```sql
CREATE TABLE resolver_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK(value_type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by TEXT
);

-- Default configuration
INSERT INTO resolver_config (key, value, value_type, description) VALUES
  ('min_profit_wei', '1000000000000000', 'number', 'Minimum profit in wei (0.001 ETH)'),
  ('max_gas_price_gwei', '100', 'number', 'Maximum gas price in gwei'),
  ('enable_mev_protection', 'true', 'boolean', 'Use Flashbots for front-running protection'),
  ('retry_failed_reveals', 'true', 'boolean', 'Automatically retry failed secret reveals'),
  ('max_retry_attempts', '3', 'number', 'Maximum number of retry attempts'),
  ('cache_size_mb', '100', 'number', 'Maximum memory cache size in MB');
```

#### chain_config
Per-chain configuration.

```sql
CREATE TABLE chain_config (
  chain_id INTEGER PRIMARY KEY,
  chain_name TEXT NOT NULL,
  rpc_url TEXT NOT NULL,
  backup_rpc_urls TEXT,              -- JSON array of backup URLs
  block_time_seconds INTEGER,
  confirmation_blocks INTEGER,
  max_gas_price_wei TEXT,
  priority_fee_wei TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Default chains
INSERT INTO chain_config (chain_id, chain_name, rpc_url, block_time_seconds, confirmation_blocks) VALUES
  (8453, 'Base', 'https://mainnet.base.org', 2, 3),
  (10, 'Optimism', 'https://mainnet.optimism.io', 2, 3),
  (42161, 'Arbitrum', 'https://arb1.arbitrum.io/rpc', 1, 3);
```

### 4. Audit & Security Tables

#### audit_log
Complete audit trail of all operations.

```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Event
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,      -- 'secret', 'decision', 'config', 'error'
  
  -- Context
  entity_type TEXT,                   -- 'secret', 'swap', 'config'
  entity_id TEXT,
  
  -- Details
  action TEXT NOT NULL,
  actor TEXT,                         -- Who/what triggered this
  ip_address TEXT,
  user_agent TEXT,
  
  -- Data
  old_value TEXT,                     -- JSON of previous state
  new_value TEXT,                     -- JSON of new state
  metadata TEXT,                      -- Additional JSON data
  
  -- Result
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  
  -- Timestamp
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_audit_log_event ON audit_log(event_type, created_at);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_time ON audit_log(created_at);
```

#### access_log
Track all data access for security.

```sql
CREATE TABLE access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Resource
  resource_type TEXT NOT NULL,        -- 'secret', 'config', 'swap'
  resource_id TEXT,
  operation TEXT NOT NULL,            -- 'read', 'write', 'delete'
  
  -- Accessor
  accessor_type TEXT NOT NULL,        -- 'internal', 'api', 'cli'
  accessor_id TEXT,
  
  -- Result
  granted BOOLEAN NOT NULL,
  denial_reason TEXT,
  
  -- Metadata
  request_metadata TEXT,               -- JSON with request details
  
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_access_log_resource ON access_log(resource_type, resource_id);
CREATE INDEX idx_access_log_time ON access_log(created_at);
```

### 5. Maintenance Tables

#### schema_migrations
Track database schema versions.

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

#### health_checks
System health monitoring.

```sql
CREATE TABLE health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Component
  component TEXT NOT NULL,            -- 'database', 'cache', 'network'
  
  -- Status
  status TEXT NOT NULL,                -- 'healthy', 'degraded', 'unhealthy'
  latency_ms INTEGER,
  
  -- Details
  checks_passed INTEGER,
  checks_failed INTEGER,
  error_messages TEXT,                 -- JSON array
  
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_health_checks_component ON health_checks(component, created_at);
```

## Data Retention Policies

### Retention Rules
```sql
-- Delete old audit logs after 90 days
DELETE FROM audit_log WHERE created_at < unixepoch() - (90 * 24 * 60 * 60);

-- Delete old access logs after 30 days
DELETE FROM access_log WHERE created_at < unixepoch() - (30 * 24 * 60 * 60);

-- Archive completed swaps after 30 days
INSERT INTO archived_swaps SELECT * FROM monitored_swaps 
  WHERE status = 'completed' AND completed_at < unixepoch() - (30 * 24 * 60 * 60);

-- Vacuum database monthly
VACUUM;
ANALYZE;
```

## Performance Optimizations

### Write-Ahead Logging
```sql
PRAGMA journal_mode = WAL;           -- Better concurrent access
PRAGMA synchronous = NORMAL;         -- Balance safety/speed
PRAGMA cache_size = -64000;          -- 64MB cache
PRAGMA temp_store = MEMORY;          -- Temp tables in RAM
```

### Query Optimization
```sql
-- Analyze tables regularly
ANALYZE revealed_secrets;
ANALYZE monitored_swaps;

-- Example optimized query
EXPLAIN QUERY PLAN
SELECT * FROM revealed_secrets
WHERE status IN ('pending', 'submitted')
  AND chain_id = 8453
  AND revealed_at > unixepoch() - 3600
ORDER BY revealed_at DESC;
```

## Backup Strategy

### Continuous Backup
```bash
#!/bin/bash
# backup.sh - Run every hour

DB_PATH="/var/lib/resolver/resolver.db"
BACKUP_DIR="/backups/resolver"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Online backup (doesn't lock database)
sqlite3 $DB_PATH ".backup '$BACKUP_DIR/resolver_$TIMESTAMP.db'"

# Keep only last 7 days
find $BACKUP_DIR -name "resolver_*.db" -mtime +7 -delete
```

### Point-in-Time Recovery
```sql
-- Enable point-in-time recovery
PRAGMA wal_checkpoint(TRUNCATE);

-- Export as SQL for portability
.output /backups/resolver_dump.sql
.dump
.output stdout
```

## Migration Scripts

### Initial Setup
```sql
-- migrations/001_initial_schema.sql
BEGIN TRANSACTION;

-- Create all tables
CREATE TABLE revealed_secrets (...);
CREATE TABLE monitored_swaps (...);
-- ... all other tables

-- Create indexes
CREATE INDEX ...;

-- Insert default configuration
INSERT INTO resolver_config ...;

-- Record migration
INSERT INTO schema_migrations (version, name) 
VALUES (1, '001_initial_schema');

COMMIT;
```

### Adding New Column
```sql
-- migrations/002_add_mev_protection.sql
BEGIN TRANSACTION;

ALTER TABLE revealed_secrets 
ADD COLUMN mev_protection_used BOOLEAN DEFAULT FALSE;

UPDATE schema_migrations 
SET version = 2, name = '002_add_mev_protection'
WHERE version = 1;

COMMIT;
```

## Monitoring Queries

### Key Metrics
```sql
-- Pending secrets count
SELECT COUNT(*) as pending_count
FROM revealed_secrets
WHERE status IN ('pending', 'submitted');

-- Success rate (last 24h)
SELECT 
  COUNT(CASE WHEN status = 'confirmed' THEN 1 END) * 100.0 / COUNT(*) as success_rate
FROM revealed_secrets
WHERE revealed_at > unixepoch() - 86400;

-- Average gas usage by chain
SELECT 
  chain_id,
  AVG(CAST(gas_used AS REAL)) as avg_gas,
  COUNT(*) as tx_count
FROM revealed_secrets
WHERE status = 'confirmed'
GROUP BY chain_id;

-- Profitability by hour
SELECT 
  strftime('%H', datetime(created_at, 'unixepoch')) as hour,
  SUM(CAST(net_profit_wei AS REAL)) as total_profit
FROM profit_tracking
WHERE period_type = 'hour'
  AND period_start > unixepoch() - 86400
GROUP BY hour
ORDER BY hour;
```

## Security Considerations

### Encryption
```sql
-- Secrets should be encrypted before storage
-- Use SQLCipher for transparent encryption
PRAGMA key = 'your-encryption-key';
```

### Access Control
```sql
-- Create read-only view for monitoring
CREATE VIEW monitoring_stats AS
SELECT 
  COUNT(*) as total_secrets,
  SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
  AVG(retry_count) as avg_retries
FROM revealed_secrets;

-- Grant only necessary permissions
-- In application code, use different connections for read/write
```

## Disaster Recovery

### Corruption Detection
```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

### Recovery Procedure
1. Stop resolver immediately
2. Restore from most recent backup
3. Replay transactions from WAL if available
4. Verify data integrity
5. Resume operations

## Future Considerations

### Sharding Strategy
When the resolver scales to multiple instances:
- Shard by order_hash prefix
- Use distributed SQLite (rqlite)
- Or migrate to PostgreSQL with partitioning

### Archive Strategy
For long-term storage:
- Move old records to archive tables
- Compress and store in object storage
- Keep only active data in main tables