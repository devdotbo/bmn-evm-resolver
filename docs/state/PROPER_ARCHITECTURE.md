# Proper State Management Architecture

## Design Principles

### 1. Single Responsibility Principle
Each component owns and manages its own state:
- **Blockchain**: Immutable transaction history
- **Indexer**: Read-only historical queries
- **Resolver**: Operational state and business logic
- **Application**: User interface state

### 2. Data Ownership
```
Component       Owns                          Does NOT Own
---------       ----                          ------------
Blockchain      Transactions, Events          Business logic
Indexer         Indexed events, Statistics    Resolver decisions
Resolver        Secrets, Decisions, Actions   Historical events
Application     UI state, User preferences    Protocol state
```

## Correct Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         BLOCKCHAIN                              │
│                    (Immutable Source of Truth)                  │
│                                                                  │
│  • Smart Contracts (CrossChainEscrowFactory, Escrows)          │
│  • Events (SrcEscrowCreated, DstEscrowCreated, Withdrawn)      │
│  • Transaction History                                          │
└────────────────┬─────────────────────────┬──────────────────────┘
                 │                         │
                 │ Events                  │ Transactions
                 ↓                         ↓
┌──────────────────────────┐  ┌──────────────────────────────────┐
│       INDEXER            │  │           RESOLVER                │
│   (Historical Queries)   │  │    (Operational Intelligence)     │
│                          │  │                                   │
│ Purpose:                 │  │ Purpose:                          │
│ • Index all events       │  │ • Execute atomic swaps            │
│ • Aggregate statistics   │  │ • Manage secrets                  │
│ • Provide GraphQL/SQL    │  │ • Make profitability decisions    │
│                          │  │                                   │
│ Database:                │  │ Database:                         │
│ ┌──────────────────────┐ │  │ ┌───────────────────────────────┐ │
│ │ • atomic_swap        │ │  │ │ • revealed_secrets           │ │
│ │ • src_escrow         │ │  │ │ • monitored_swaps            │ │
│ │ • dst_escrow         │ │  │ │ • resolver_decisions         │ │
│ │ • escrow_withdrawal  │ │  │ │ • profit_calculations        │ │
│ │ • chain_statistics   │ │  │ │ • gas_optimizations          │ │
│ └──────────────────────┘ │  │ └───────────────────────────────┘ │
│                          │  │                                   │
│ API:                     │  │ API:                              │
│ • SQL over HTTP          │  │ • Internal State Management       │
│ • GraphQL                │  │ • Decision Engine                 │
│ • Live Subscriptions     │  │ • Secret Vault                    │
└──────────────────────────┘  └──────────────────────────────────┘
                 │                         │
                 │ Historical Data         │ Current State
                 ↓                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                     MONITORING & ANALYTICS                       │
│                                                                  │
│  • Combine indexer history with resolver operations             │
│  • Track system health and performance                          │
│  • Generate reports and alerts                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Patterns

### Pattern 1: Secret Revelation (Correct)
```
1. Resolver calculates optimal timing
2. Resolver stores secret in its database
3. Resolver submits withdrawal transaction
4. Blockchain emits Withdrawn event
5. Indexer records the event
6. Resolver updates its record with confirmation
```

### Pattern 2: Monitoring New Escrows (Correct)
```
1. Indexer detects SrcEscrowCreated event
2. Resolver queries indexer for new escrows
3. Resolver evaluates profitability
4. Resolver stores decision in its database
5. Resolver begins monitoring if profitable
```

### Pattern 3: Historical Analysis (Correct)
```
1. Resolver queries indexer for historical swaps
2. Resolver queries its own database for its participation
3. Resolver combines data for analysis
4. Resolver stores insights in its database
```

## Component Boundaries

### Indexer Boundary
```typescript
interface IndexerAPI {
  // Read-only queries
  getAtomicSwaps(filter: SwapFilter): Promise<AtomicSwap[]>;
  getChainStatistics(chainId: number): Promise<ChainStats>;
  getEscrowEvents(address: string): Promise<EscrowEvent[]>;
  
  // Live subscriptions
  subscribeToNewEscrows(callback: (escrow: Escrow) => void): void;
  
  // NOT provided
  // ❌ getResolverSecrets()
  // ❌ storeResolverDecision()
  // ❌ updateResolverState()
}
```

### Resolver Boundary
```typescript
interface ResolverAPI {
  // Internal state management
  storeSecret(secret: Secret): Promise<void>;
  getMySecrets(): Promise<Secret[]>;
  recordDecision(decision: Decision): Promise<void>;
  
  // Business logic
  evaluateSwap(swap: AtomicSwap): Promise<boolean>;
  calculateOptimalGas(): Promise<GasStrategy>;
  
  // NOT provided
  // ❌ getGlobalStatistics()
  // ❌ indexBlockchainEvents()
  // ❌ provideHistoricalData()
}
```

## State Segregation

### Indexer State (Immutable Historical Record)
```typescript
interface IndexerState {
  // Blockchain events exactly as emitted
  events: {
    srcEscrowCreated: SrcEscrowCreatedEvent[];
    dstEscrowCreated: DstEscrowCreatedEvent[];
    withdrawn: WithdrawnEvent[];
    cancelled: CancelledEvent[];
  };
  
  // Aggregated statistics
  statistics: {
    totalSwaps: number;
    totalVolume: bigint;
    averageSwapTime: number;
    successRate: number;
  };
}
```

### Resolver State (Mutable Operational Data)
```typescript
interface ResolverState {
  // Secrets we manage
  secrets: Map<string, {
    hashlock: string;
    secret: string;
    revealedAt: Date;
    confirmedAt?: Date;
    txHash?: string;
  }>;
  
  // Swaps we're monitoring
  monitoredSwaps: Map<string, {
    orderHash: string;
    profitability: bigint;
    gasEstimate: bigint;
    deadline: Date;
    status: 'monitoring' | 'executing' | 'completed';
  }>;
  
  // Our decisions
  decisions: Array<{
    timestamp: Date;
    action: 'reveal' | 'skip' | 'cancel';
    reason: string;
    gasPrice: bigint;
    competitorCount: number;
  }>;
}
```

## Communication Rules

### ✅ Allowed Communications

1. **Resolver → Blockchain**: Submit transactions
2. **Blockchain → Indexer**: Emit events
3. **Resolver → Indexer**: Query historical data
4. **Application → Indexer**: Query statistics
5. **Application → Resolver**: Query operational state

### ❌ Forbidden Communications

1. **Resolver → Indexer → Resolver**: Circular dependency
2. **Indexer → Resolver State**: Indexer modifying resolver
3. **Resolver → Indexer State**: Resolver modifying indexer
4. **Application → Blockchain**: Direct contract calls (use resolver)

## Database Design

### Indexer Database (PostgreSQL)
Optimized for complex queries and aggregations:
```sql
-- Read-heavy, optimized for JOINs
CREATE TABLE atomic_swap (
  id VARCHAR PRIMARY KEY,
  order_hash VARCHAR NOT NULL,
  src_chain_id INTEGER,
  dst_chain_id INTEGER,
  -- ... other fields
  INDEX idx_created_at,
  INDEX idx_status,
  INDEX idx_chains
);
```

### Resolver Database (SQLite)
Optimized for fast local access:
```sql
-- Write-heavy, optimized for speed
CREATE TABLE revealed_secrets (
  hashlock TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  revealed_at INTEGER NOT NULL,
  -- ... other fields
);
CREATE INDEX idx_revealed_at ON revealed_secrets(revealed_at);
```

## Deployment Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Blockchain    │     │   Blockchain    │     │   Blockchain    │
│   (Base)        │     │   (Optimism)    │     │   (Arbitrum)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      INDEXER             │
                    │   (Single Instance)      │
                    │   - All chains           │
                    │   - PostgreSQL           │
                    │   - Port 42069           │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
    ┌─────────▼────────┐ ┌──────▼─────────┐ ┌─────▼──────────┐
    │   RESOLVER #1    │ │  RESOLVER #2   │ │  RESOLVER #3   │
    │   - SQLite       │ │   - SQLite     │ │   - SQLite     │
    │   - Independent  │ │   - Independent│ │   - Independent│
    └──────────────────┘ └────────────────┘ └────────────────┘
```

## Benefits of Proper Architecture

### 1. Independence
- Resolver can operate without indexer
- Indexer can be upgraded without affecting resolver
- Multiple resolvers can run independently

### 2. Performance
- Local database queries: ~10ms vs ~500ms
- No network latency for state access
- Efficient caching possible

### 3. Scalability
- Horizontal scaling of resolvers
- Sharding possible per chain or per address range
- No shared state bottleneck

### 4. Reliability
- No single point of failure
- Resolver continues operating if indexer is down
- State recovery from local backups

### 5. Maintainability
- Clear boundaries reduce complexity
- Independent testing possible
- Schema changes don't cascade

## Migration Path

See [MIGRATION_STRATEGY.md](./MIGRATION_STRATEGY.md) for detailed steps to migrate from current architecture to this proper design.