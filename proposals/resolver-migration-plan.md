# Bridge-Me-Not Resolver Migration Plan: From File-Based to Indexer-Based Monitoring

## Executive Summary

This document outlines a comprehensive migration plan for transitioning the Bridge-Me-Not resolver from its current file-based state management and polling architecture to a modern, indexer-based system using Ponder. The migration will significantly improve performance, reliability, and scalability while maintaining backward compatibility during the transition period.

### Key Benefits of Migration
- **Real-time event monitoring** via WebSocket connections instead of periodic polling
- **Reduced RPC load** by 90%+ through efficient database queries
- **Historical data access** for analytics and debugging
- **Multi-chain synchronization** with proper event ordering
- **Improved reliability** with automatic recovery and state persistence

### Migration Timeline
- **Phase 1 (Week 1-2)**: Parallel operation with existing system
- **Phase 2 (Week 3-4)**: Read operations migration
- **Phase 3 (Week 5-6)**: Full migration and deprecation of file-based system
- **Phase 4 (Week 7-8)**: Production deployment and monitoring

## Current State Analysis

### Architecture Overview
The current resolver implementation uses:

1. **File-based state management** (`OrderStateManager`)
   - Orders stored in memory with periodic file persistence
   - State saved to `./data/resolver-state.json`
   - Manual cleanup of old orders

2. **Multiple monitoring approaches**:
   - **OrderMonitor**: WebSocket-based monitoring for on-chain events
   - **FileMonitor**: Polling `./data/orders/` directory for Alice's orders
   - **DestinationChainMonitor**: Monitoring destination chain for secret reveals

3. **Event processing flow**:
   ```
   Alice creates order → Saved to file → FileMonitor detects → Resolver processes
                     ↓
   Source escrow created → OrderMonitor detects → Resolver deploys dst escrow
                     ↓
   Alice withdraws → DestinationChainMonitor detects → Resolver claims funds
   ```

### Current Pain Points
1. **State synchronization**: File-based state can become out of sync with blockchain
2. **Polling inefficiency**: FileMonitor polls every second, consuming resources
3. **Limited querying**: No efficient way to query historical orders or filter by criteria
4. **Single instance limitation**: File-based state prevents horizontal scaling
5. **Recovery challenges**: Difficult to recover from crashes or missed events

## Target Architecture

### Indexer-Based Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                     Bridge-Me-Not Protocol                       │
├─────────────────────────┬───────────────────────────────────────┤
│    Chain A (Source)     │        Chain B (Destination)          │
│  • LimitOrderProtocol   │      • CrossChainEscrowFactory        │
│  • CrossChainEscrowFactory     • EscrowDst contracts           │
│  • EscrowSrc contracts  │                                       │
└───────────┬─────────────┴────────────────┬─────────────────────┘
            │                              │
            │      WebSocket/RPC Events    │
            └──────────────┬───────────────┘
                           │
                    ┌──────┴────────┐
                    │ Ponder Indexer │
                    │               │
                    │ • Event Parser│
                    │ • SQL Database│
                    │ • GraphQL API │
                    └──────┬────────┘
                           │
                 ┌─────────┴──────────┐
                 │                    │
          ┌──────┴────────┐    ┌─────┴──────┐
          │   Resolver     │    │   Alice    │
          │ @ponder/client │    │  Scripts   │
          └───────────────┘    └────────────┘
```

### Key Components

1. **Ponder Indexer** (localhost:42069)
   - Indexes all Bridge-Me-Not protocol events
   - Maintains PostgreSQL database with full order history
   - Provides GraphQL and SQL APIs for querying

2. **Enhanced Resolver**
   - Uses `@ponder/client` for type-safe queries
   - Subscribes to real-time updates via WebSocket
   - Maintains minimal in-memory cache
   - Stateless design enables horizontal scaling

3. **Database Schema**
   - `atomicSwap`: Master record for cross-chain swaps
   - `srcEscrow`: Source chain escrow details
   - `dstEscrow`: Destination chain escrow details
   - `escrowWithdrawal`: Secret reveal events
   - `chainStatistics`: Real-time metrics

## Migration Phases

### Phase 1: Parallel Operation (Week 1-2)

#### Objectives
- Deploy Ponder indexer alongside existing resolver
- Validate data consistency between systems
- Build confidence in indexer reliability

#### Implementation Steps

1. **Deploy Ponder Indexer**
   ```bash
   cd bmn-evm-indexer
   # Update configuration for Bridge-Me-Not contracts
   cp .env.example .env
   # Add contract addresses and RPC URLs
   docker-compose up -d
   ```

2. **Configure Indexer for BMN Contracts**
   ```typescript
   // ponder.config.ts
   export default createConfig({
     contracts: {
       limitOrderProtocol: {
         abi: limitOrderProtocolAbi,
         address: process.env.LIMIT_ORDER_PROTOCOL_ADDRESS,
         startBlock: 0,
       },
       escrowFactory: {
         abi: crossChainEscrowFactoryAbi,
         address: process.env.ESCROW_FACTORY_ADDRESS,
         startBlock: 0,
       }
     }
   });
   ```

3. **Add Comparison Logic to Resolver**
   ```typescript
   // src/resolver/indexer-validator.ts
   export class IndexerValidator {
     async compareStates(fileState: OrderState[], indexerState: any[]) {
       // Log discrepancies between file-based and indexer states
       // Track metrics on consistency
     }
   }
   ```

4. **Monitoring and Metrics**
   - Set up dashboards to compare file vs indexer data
   - Monitor indexer lag and performance
   - Track query response times

#### Deliverables
- [ ] Ponder indexer deployed and syncing
- [ ] Validation metrics dashboard
- [ ] Documentation for indexer operations
- [ ] Runbook for troubleshooting

### Phase 2: Read Operations Migration (Week 3-4)

#### Objectives
- Migrate all read operations to use indexer
- Maintain write operations through existing system
- Implement fallback mechanisms

#### Implementation Steps

1. **Create IndexerClient Module**
   ```typescript
   // src/resolver/indexer-client.ts
   import { createClient } from "@ponder/client";
   
   export class IndexerClient {
     private client: ReturnType<typeof createClient>;
     
     constructor(url = "http://localhost:42069/sql") {
       this.client = createClient(url);
     }
     
     async getPendingOrders(resolverAddress: string) {
       return this.client.query(`
         SELECT a.*, s.escrowAddress, s.chainId
         FROM atomicSwaps a
         JOIN srcEscrows s ON a.orderHash = s.orderHash
         WHERE a.status = 'src_created'
           AND NOT EXISTS (
             SELECT 1 FROM dstEscrows d 
             WHERE d.orderHash = a.orderHash
           )
       `);
     }
   }
   ```

2. **Update OrderMonitor**
   ```typescript
   // src/resolver/monitor.ts
   export class OrderMonitor {
     private indexerClient: IndexerClient;
     
     async start() {
       // Subscribe to new orders via indexer
       const subscription = await this.indexerClient.subscribeToNewOrders(
         (order) => this.handleNewOrder(order)
       );
     }
   }
   ```

3. **Implement Fallback Logic**
   ```typescript
   // src/resolver/hybrid-monitor.ts
   export class HybridMonitor {
     async getOrders() {
       try {
         return await this.indexerClient.getPendingOrders();
       } catch (error) {
         console.warn("Indexer unavailable, falling back to file-based");
         return this.fileBasedMonitor.getOrders();
       }
     }
   }
   ```

4. **Update Alice Scripts**
   - Modify order creation to emit events instead of just saving files
   - Add indexer queries for order status checking

#### Testing Strategy
- **Unit tests**: Mock indexer responses
- **Integration tests**: Test with local indexer
- **Load tests**: Verify performance improvements
- **Chaos tests**: Test fallback mechanisms

#### Deliverables
- [ ] IndexerClient implementation
- [ ] Updated monitoring logic
- [ ] Fallback mechanisms
- [ ] Performance benchmarks

### Phase 3: Full Migration (Week 5-6)

#### Objectives
- Complete transition to indexer-based architecture
- Deprecate file-based monitoring
- Implement production-ready features

#### Implementation Steps

1. **Remove File-Based Components**
   ```typescript
   // Remove or deprecate:
   // - FileMonitor class
   // - File-based state persistence in OrderStateManager
   // - ORDER_STATE_FILE constant
   ```

2. **Implement Event-Driven Architecture**
   ```typescript
   // src/resolver/event-driven-resolver.ts
   export class EventDrivenResolver {
     async start() {
       // Subscribe to multiple event streams
       await Promise.all([
         this.indexer.subscribe('SrcEscrowCreated', this.handleSrcEscrow),
         this.indexer.subscribe('DstEscrowCreated', this.handleDstEscrow),
         this.indexer.subscribe('SecretRevealed', this.handleSecret),
       ]);
     }
   }
   ```

3. **Add Advanced Features**
   - **Auto-recovery**: Resume from last processed event on restart
   - **Rate limiting**: Prevent overwhelming destination chain
   - **Priority ordering**: Process high-value orders first
   - **Multi-resolver coordination**: Prevent duplicate processing

4. **Production Hardening**
   ```typescript
   // src/resolver/production-resolver.ts
   export class ProductionResolver {
     private readonly healthCheck = new HealthChecker();
     private readonly metrics = new MetricsCollector();
     
     async start() {
       // Health checks
       this.healthCheck.addCheck('indexer', () => this.indexer.ping());
       this.healthCheck.addCheck('chains', () => this.checkChainConnections());
       
       // Metrics collection
       this.metrics.trackOrderProcessing();
       this.metrics.trackIndexerLag();
     }
   }
   ```

#### Migration Checklist
- [ ] Backup existing state files
- [ ] Deploy new resolver version
- [ ] Verify all orders are indexed
- [ ] Monitor for 24 hours
- [ ] Remove old code paths
- [ ] Update documentation

### Phase 4: Production Deployment (Week 7-8)

#### Objectives
- Deploy to mainnet environment
- Implement monitoring and alerting
- Optimize performance

#### Deployment Strategy

1. **Infrastructure Setup**
   ```yaml
   # docker-compose.production.yml
   services:
     postgres:
       image: postgres:15
       environment:
         POSTGRES_MEMORY: 4GB
       volumes:
         - postgres-data:/var/lib/postgresql/data
     
     indexer:
       image: bmn-indexer:latest
       depends_on:
         - postgres
       environment:
         DATABASE_URL: postgresql://...
         PONDER_RPC_URL_8453: ${BASE_RPC_URL}
         PONDER_RPC_URL_42793: ${ETHERLINK_RPC_URL}
       
     resolver:
       image: bmn-resolver:latest
       depends_on:
         - indexer
       environment:
         INDEXER_URL: http://indexer:42069
   ```

2. **Monitoring Setup**
   - **Prometheus metrics**: Order processing, latency, errors
   - **Grafana dashboards**: Real-time visualization
   - **Alerting rules**: Indexer lag, failed orders, low balance

3. **Security Measures**
   - API authentication for indexer access
   - Rate limiting on public endpoints
   - Encrypted connections between services
   - Regular security audits

## Technical Implementation Details

### 1. Order Discovery Flow
```typescript
// Before: File-based polling
const fileMonitor = new FileMonitor();
fileMonitor.pollForOrders(); // Polls every second

// After: Event-driven with indexer
const indexer = new IndexerClient();
await indexer.subscribeToNewOrders((order) => {
  // Instant notification of new orders
  processOrder(order);
});
```

### 2. Secret Reveal Detection
```typescript
// Before: Monitoring specific escrow addresses
monitor.watchEscrowWithdrawals(escrowAddress, handleSecret);

// After: Query all withdrawals efficiently
const secrets = await indexer.query(`
  SELECT w.secret, w.escrowAddress, a.orderHash
  FROM escrowWithdrawal w
  JOIN dstEscrow d ON w.escrowAddress = d.escrowAddress
  JOIN atomicSwap a ON d.orderHash = a.orderHash
  WHERE a.dstMaker = $1 AND w.secret IS NOT NULL
`, [resolverAddress]);
```

### 3. State Management
```typescript
// Before: In-memory with file persistence
class OrderStateManager {
  private orders: Map<string, OrderState>;
  async saveToFile() { /* ... */ }
}

// After: Stateless with database backend
class StatelessResolver {
  async getActiveOrders() {
    return this.indexer.query(`
      SELECT * FROM atomicSwap 
      WHERE status IN ('src_created', 'both_created')
        AND dstMaker = $1
    `, [this.address]);
  }
}
```

### 4. Performance Optimizations

#### Database Indexes
```sql
-- Critical indexes for resolver queries
CREATE INDEX idx_atomic_swap_status ON atomicSwap(status);
CREATE INDEX idx_atomic_swap_dst_maker ON atomicSwap(dstMaker);
CREATE INDEX idx_src_escrow_hashlock ON srcEscrow(hashlock);
CREATE INDEX idx_withdrawal_secret ON escrowWithdrawal(secret) WHERE secret IS NOT NULL;
```

#### Query Optimization
```typescript
// Batch queries for efficiency
const pendingOrders = await indexer.query(`
  WITH pending AS (
    SELECT a.* FROM atomicSwap a
    WHERE a.status = 'src_created'
      AND a.srcChainId = $1
      AND a.dstChainId = $2
      AND NOT EXISTS (
        SELECT 1 FROM dstEscrow d 
        WHERE d.orderHash = a.orderHash
      )
  )
  SELECT p.*, s.timelocks, s.escrowAddress
  FROM pending p
  JOIN srcEscrow s ON p.orderHash = s.orderHash
  ORDER BY p.srcAmount DESC
  LIMIT 10
`, [srcChainId, dstChainId]);
```

## Testing Strategy

### 1. Unit Tests
```typescript
// test/indexer-client.test.ts
describe('IndexerClient', () => {
  it('should query pending orders', async () => {
    const mockClient = createMockClient();
    const indexer = new IndexerClient(mockClient);
    
    const orders = await indexer.getPendingOrders(BOB_ADDRESS);
    expect(orders).toHaveLength(2);
  });
});
```

### 2. Integration Tests
```typescript
// test/integration/resolver.test.ts
describe('Resolver Integration', () => {
  let indexer: TestIndexer;
  let resolver: Resolver;
  
  beforeEach(async () => {
    indexer = await TestIndexer.start();
    resolver = new Resolver({ indexerUrl: indexer.url });
  });
  
  it('should process orders from indexer', async () => {
    // Create test order
    await createTestOrder();
    
    // Verify resolver processes it
    await eventually(() => {
      const processed = resolver.getProcessedOrders();
      expect(processed).toContain(orderHash);
    });
  });
});
```

### 3. Alice Integration Testing
- Test with small security deposits (0.01 BMN)
- Verify order creation triggers indexer events
- Confirm withdrawal flow works end-to-end
- Test failure scenarios and recovery

### 4. Load Testing
```bash
# Generate load with multiple concurrent orders
deno run test/load/create-orders.ts --concurrent 50 --duration 60s

# Monitor metrics
curl http://localhost:9090/metrics | grep resolver_
```

## Risk Assessment

### Technical Risks

1. **Indexer Downtime**
   - **Impact**: Resolver cannot discover new orders
   - **Mitigation**: Implement fallback to RPC polling, add health checks
   - **Severity**: High
   - **Probability**: Low

2. **Database Performance**
   - **Impact**: Slow queries affect order processing
   - **Mitigation**: Proper indexing, query optimization, caching
   - **Severity**: Medium
   - **Probability**: Medium

3. **WebSocket Disconnections**
   - **Impact**: Missed real-time events
   - **Mitigation**: Automatic reconnection, catch-up queries
   - **Severity**: Medium
   - **Probability**: High

4. **Data Inconsistency**
   - **Impact**: Orders processed incorrectly
   - **Mitigation**: Validation logic, reconciliation jobs
   - **Severity**: High
   - **Probability**: Low

### Operational Risks

1. **Migration Data Loss**
   - **Impact**: Historical orders not available
   - **Mitigation**: Backup before migration, parallel operation
   - **Severity**: High
   - **Probability**: Low

2. **Team Knowledge Gap**
   - **Impact**: Difficulty maintaining new system
   - **Mitigation**: Documentation, training, runbooks
   - **Severity**: Medium
   - **Probability**: Medium

### Rollback Procedures

1. **Phase 1 Rollback**: Simply stop indexer, no impact
2. **Phase 2 Rollback**: Revert to file-based monitoring
3. **Phase 3 Rollback**: Restore from backup, redeploy old version
4. **Phase 4 Rollback**: Full reversion with data export/import

## Performance Improvements Expected

### Metrics Comparison

| Metric | Current (File-based) | Target (Indexer-based) | Improvement |
|--------|---------------------|------------------------|-------------|
| Order Discovery Latency | 0-1000ms (poll interval) | <50ms | 95%+ |
| RPC Calls/hour | ~3,600 | ~360 | 90% reduction |
| State Query Time | O(n) file read | O(1) indexed | 100x+ |
| Recovery Time | Minutes | Seconds | 99% |
| Concurrent Orders | Limited by memory | Unlimited | ∞ |
| Historical Queries | Not possible | Instant | New capability |

### Resource Usage

- **CPU**: Reduced by ~50% (no constant polling)
- **Memory**: Reduced by ~80% (no full state in memory)
- **Network**: Reduced RPC bandwidth by 90%
- **Storage**: Moved to centralized database

## Timeline Estimates

### Development Timeline
- Week 1-2: Indexer setup and configuration
- Week 3-4: Client implementation and testing
- Week 5-6: Full migration and cleanup
- Week 7-8: Production deployment

### Milestones
1. **M1 (Week 2)**: Indexer operational with BMN contracts
2. **M2 (Week 4)**: Resolver reading from indexer
3. **M3 (Week 6)**: File-based system deprecated
4. **M4 (Week 8)**: Production deployment complete

### Resource Requirements
- 1 Senior Developer (full-time)
- 1 DevOps Engineer (part-time)
- 1 QA Engineer (part-time)
- Infrastructure costs: ~$500/month

## Success Criteria

1. **Functional Requirements**
   - [ ] All orders discovered within 100ms
   - [ ] Secret reveals detected in real-time
   - [ ] Zero missed orders during migration
   - [ ] Historical data preserved

2. **Performance Requirements**
   - [ ] 90% reduction in RPC calls
   - [ ] <50ms query response time
   - [ ] 99.9% uptime
   - [ ] Support for 1000+ concurrent orders

3. **Operational Requirements**
   - [ ] Automated deployment pipeline
   - [ ] Comprehensive monitoring
   - [ ] Disaster recovery plan
   - [ ] Team trained on new system

## Conclusion

The migration from file-based to indexer-based monitoring represents a significant architectural improvement for the Bridge-Me-Not resolver. By leveraging Ponder's powerful indexing capabilities and real-time event streaming, the resolver will become more efficient, scalable, and reliable.

The phased approach ensures minimal risk during migration, with parallel operation allowing for validation and rollback if needed. The investment in this migration will pay dividends through reduced operational costs, improved performance, and new capabilities for analytics and monitoring.

With proper execution of this plan, the Bridge-Me-Not resolver will be positioned for growth and ready to handle enterprise-scale cross-chain atomic swap volumes.