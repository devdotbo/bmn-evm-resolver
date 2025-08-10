# API Boundaries Documentation

## Overview

This document defines the clear API boundaries between the resolver, indexer,
and other system components. Proper API boundaries ensure loose coupling,
maintainability, and independent scalability.

## Core Principle: Separation of Concerns

```
Each component exposes ONLY what others need, nothing more.
Each component owns its data and logic completely.
```

## Component APIs

### 1. Resolver API (Internal State Management)

The resolver exposes NO public API for state management. All state operations
are internal.

```typescript
// ❌ NOT EXPOSED - Internal Only
interface ResolverInternalAPI {
  // Secret Management (Private)
  storeSecret(secret: Secret): Promise<void>;
  getMySecrets(): Promise<Secret[]>;
  confirmSecret(hashlock: string, txHash: string): Promise<void>;

  // Decision Management (Private)
  recordDecision(decision: Decision): Promise<void>;
  getMyDecisions(): Promise<Decision[]>;

  // Swap Monitoring (Private)
  startMonitoring(swap: Swap): Promise<void>;
  getMyMonitoredSwaps(): Promise<Swap[]>;
}
```

### 2. Resolver API (External Operations)

The resolver exposes a minimal API for operational control.

```typescript
// ✅ EXPOSED - Operational Control
interface ResolverPublicAPI {
  // Health & Status
  health(): Promise<HealthStatus>;
  metrics(): Promise<ResolverMetrics>;

  // Control Operations
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;

  // Manual Interventions (Admin Only)
  forceRevealSecret(orderHash: string): Promise<void>;
  cancelMonitoring(orderHash: string): Promise<void>;

  // Configuration
  getConfig(): Promise<ResolverConfig>;
  updateConfig(config: Partial<ResolverConfig>): Promise<void>;
}

// Data structures exposed
interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  lastActivity: Date;
  errors: string[];
}

interface ResolverMetrics {
  secretsRevealed: number;
  swapsMonitored: number;
  successRate: number;
  averageGasUsed: bigint;
  totalProfit: bigint;
}
```

### 3. Indexer API (Read-Only Historical Data)

The indexer provides read-only access to blockchain history.

```typescript
// ✅ EXPOSED - Historical Queries
interface IndexerPublicAPI {
  // Event Queries
  getEvents(filter: EventFilter): Promise<Event[]>;
  getEventByHash(hash: string): Promise<Event | null>;

  // Aggregated Data
  getAtomicSwaps(filter: SwapFilter): Promise<AtomicSwap[]>;
  getChainStatistics(chainId: number): Promise<ChainStats>;
  getProtocolMetrics(): Promise<ProtocolMetrics>;

  // Time-based Queries
  getHistoricalData(
    from: Date,
    to: Date,
    granularity: "hour" | "day" | "week",
  ): Promise<HistoricalData[]>;

  // Live Subscriptions (Server-Sent Events)
  subscribe(
    eventType: EventType,
    callback: (event: Event) => void,
  ): Unsubscribe;
}

// ❌ NOT EXPOSED - Indexer Never Provides
interface IndexerForbiddenAPI {
  // Never expose resolver-specific data
  getResolverSecrets(): never;
  getResolverDecisions(): never;

  // Never allow writes
  storeEvent(): never;
  updateStatistics(): never;

  // Never expose internal state
  getDatabaseConnection(): never;
  getInternalCache(): never;
}
```

### 4. Blockchain API (Via Web3/Viem)

The blockchain provides transaction and state access.

```typescript
// ✅ EXPOSED - Blockchain Interaction
interface BlockchainAPI {
  // Read Operations
  getBlock(number: number): Promise<Block>;
  getTransaction(hash: string): Promise<Transaction>;
  getReceipt(hash: string): Promise<Receipt>;

  // Contract Calls (Read)
  call(contract: Address, method: string, args: any[]): Promise<any>;

  // Contract Calls (Write)
  sendTransaction(tx: Transaction): Promise<TxHash>;

  // Events
  getLogs(filter: LogFilter): Promise<Log[]>;

  // Subscriptions
  watchBlocks(callback: (block: Block) => void): Unsubscribe;
  watchEvents(
    filter: EventFilter,
    callback: (event: Event) => void,
  ): Unsubscribe;
}
```

## Communication Patterns

### Pattern 1: Resolver → Indexer (Historical Context)

```typescript
// ✅ CORRECT - Resolver queries historical data
class Resolver {
  async analyzeMarket() {
    // Get historical data for analysis
    const history = await this.indexer.getHistoricalData(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      new Date(),
      "day",
    );

    // Use for decision making
    const profitability = this.calculateProfitability(history);

    // Store decision locally (not in indexer!)
    await this.decisionRecorder.record({
      action: "analyzed_market",
      data: profitability,
    });
  }
}
```

### Pattern 2: Resolver → Blockchain (Direct Execution)

```typescript
// ✅ CORRECT - Resolver executes on blockchain
class Resolver {
  async revealSecret(escrow: Address, secret: string) {
    // Store locally first
    await this.secretManager.storeSecret(secret);

    // Execute on-chain
    const tx = await this.blockchain.sendTransaction({
      to: escrow,
      data: this.encodeWithdraw(secret),
      gas: 100000,
    });

    // Update local state
    await this.secretManager.confirmSecret(secret, tx.hash);
  }
}
```

### Pattern 3: Application → Multiple Sources (Aggregation)

```typescript
// ✅ CORRECT - Application aggregates from multiple sources
class Dashboard {
  async getSystemStatus() {
    // Get different data from appropriate sources
    const [resolverHealth, indexerStats, chainStatus] = await Promise.all([
      this.resolver.health(), // Operational status
      this.indexer.getProtocolMetrics(), // Historical metrics
      this.blockchain.getBlock("latest"), // Current chain state
    ]);

    // Combine for complete picture
    return {
      resolver: resolverHealth,
      protocol: indexerStats,
      chain: chainStatus,
    };
  }
}
```

## Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Circular Dependencies

```typescript
// WRONG - Resolver depends on indexer for its own state
class Resolver {
  async getMySecrets() {
    // Should not query indexer for own data
    return await this.indexer.getSecretsRevealedBy(this.address);
  }
}
```

### ❌ Anti-Pattern 2: Exposing Internal State

```typescript
// WRONG - Resolver exposes internal database
class Resolver {
  getDatabase() {
    return this.db; // Never expose internal storage
  }
}
```

### ❌ Anti-Pattern 3: Cross-Boundary Writes

```typescript
// WRONG - Indexer modifying resolver state
class Indexer {
  async updateResolverState(resolverId: string, state: any) {
    // Indexer should never write to resolver
    await this.resolverDb.update(resolverId, state);
  }
}
```

## API Versioning Strategy

### Version Format

```
/api/v{major}/resource
```

### Compatibility Rules

1. **Major Version**: Breaking changes
2. **Minor Version**: New features (backward compatible)
3. **Patch Version**: Bug fixes only

### Example Implementation

```typescript
// v1 API (Current)
app.get("/api/v1/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
  });
});

// v2 API (Future - Breaking Change)
app.get("/api/v2/health", (req, res) => {
  res.json({
    status: {
      overall: "healthy",
      components: {
        database: "healthy",
        cache: "healthy",
      },
    },
    metrics: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
  });
});
```

## Authentication & Authorization

### Resolver API Authentication

```typescript
interface AuthConfig {
  // Public endpoints (no auth)
  public: ["/health", "/metrics"];

  // Admin endpoints (require API key)
  admin: ["/config", "/force-reveal", "/cancel"];

  // Internal only (not exposed externally)
  internal: ["/state", "/secrets", "/decisions"];
}

// Middleware
async function authenticate(req: Request, res: Response, next: Next) {
  const endpoint = req.path;

  if (isPublic(endpoint)) {
    return next();
  }

  if (isAdmin(endpoint)) {
    const apiKey = req.headers["x-api-key"];
    if (!isValidApiKey(apiKey)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  if (isInternal(endpoint)) {
    return res.status(404).json({ error: "Not Found" });
  }

  next();
}
```

### Indexer API (Public Read-Only)

```typescript
// No authentication for reads
app.get("/api/v1/swaps", (req, res) => {
  // Rate limiting only
  if (rateLimiter.exceeded(req.ip)) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const swaps = await indexer.getSwaps(req.query);
  res.json(swaps);
});
```

## Rate Limiting

### Per-Component Limits

```typescript
const rateLimits = {
  resolver: {
    public: {
      requests: 100,
      window: "1m",
    },
    admin: {
      requests: 10,
      window: "1m",
    },
  },
  indexer: {
    queries: {
      requests: 1000,
      window: "1m",
    },
    subscriptions: {
      connections: 10,
      perIP: true,
    },
  },
};
```

## Error Handling

### Standard Error Format

```typescript
interface APIError {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: number;
    requestId: string;
  };
}

// Example
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Swap with order hash 0xabc not found",
    "timestamp": 1699564800000,
    "requestId": "req_1234567890"
  }
}
```

### Error Codes

```typescript
enum ErrorCode {
  // Client errors (4xx)
  BAD_REQUEST = "BAD_REQUEST",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  RATE_LIMITED = "RATE_LIMITED",

  // Server errors (5xx)
  INTERNAL_ERROR = "INTERNAL_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  BLOCKCHAIN_ERROR = "BLOCKCHAIN_ERROR",
  TIMEOUT = "TIMEOUT",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
}
```

## Monitoring & Observability

### API Metrics

```typescript
interface APIMetrics {
  // Request metrics
  requestCount: Counter;
  requestDuration: Histogram;
  requestSize: Histogram;
  responseSize: Histogram;

  // Error metrics
  errorCount: Counter;
  errorRate: Gauge;

  // Business metrics
  apiCallsByEndpoint: Counter;
  apiCallsByClient: Counter;

  // Performance metrics
  p50Latency: Gauge;
  p95Latency: Gauge;
  p99Latency: Gauge;
}
```

### Tracing

```typescript
// OpenTelemetry integration
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("resolver-api");

async function handleRequest(req: Request, res: Response) {
  const span = tracer.startSpan("api.request", {
    attributes: {
      "http.method": req.method,
      "http.url": req.url,
      "http.target": req.path,
      "user.id": req.userId,
    },
  });

  try {
    const result = await processRequest(req);
    span.setStatus({ code: SpanStatusCode.OK });
    res.json(result);
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    res.status(500).json({ error: error.message });
  } finally {
    span.end();
  }
}
```

## API Documentation

### OpenAPI Specification

```yaml
openapi: 3.0.0
info:
  title: BMN Resolver API
  version: 1.0.0
  description: Bridge-Me-Not Resolver Operational API

paths:
  /api/v1/health:
    get:
      summary: Get resolver health status
      responses:
        200:
          description: Resolver is healthy
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthStatus"

  /api/v1/metrics:
    get:
      summary: Get resolver metrics
      responses:
        200:
          description: Current metrics
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ResolverMetrics"

components:
  schemas:
    HealthStatus:
      type: object
      properties:
        status:
          type: string
          enum: [healthy, degraded, unhealthy]
        uptime:
          type: number
        lastActivity:
          type: string
          format: date-time
```

## Service Level Agreements (SLAs)

### Resolver API SLAs

```yaml
slas:
  availability: 99.9% # 43 minutes downtime/month
  latency:
    p50: 50ms
    p95: 200ms
    p99: 500ms
  error_rate: < 0.1%
```

### Indexer API SLAs

```yaml
slas:
  availability: 99.95% # 22 minutes downtime/month
  latency:
    p50: 100ms
    p95: 500ms
    p99: 1000ms
  error_rate: < 0.01%
  data_freshness: < 30 seconds
```

## Integration Examples

### Example 1: Monitoring Dashboard

```typescript
class MonitoringDashboard {
  constructor(
    private resolver: ResolverAPI,
    private indexer: IndexerAPI,
  ) {}

  async getFullStatus() {
    // Parallel queries to different APIs
    const [health, metrics, history] = await Promise.all([
      this.resolver.health(),
      this.resolver.metrics(),
      this.indexer.getHistoricalData(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
        "hour",
      ),
    ]);

    return {
      current: {
        health,
        metrics,
      },
      historical: history,
    };
  }
}
```

### Example 2: Automated Reporting

```typescript
class ReportGenerator {
  async generateDailyReport() {
    // Query indexer for protocol data
    const swaps = await this.indexer.getAtomicSwaps({
      from: startOfDay,
      to: endOfDay,
    });

    // Query resolver for operational metrics
    const metrics = await this.resolver.metrics();

    // Combine for report
    return {
      date: new Date(),
      protocol: {
        totalSwaps: swaps.length,
        totalVolume: sumVolume(swaps),
      },
      resolver: {
        secretsRevealed: metrics.secretsRevealed,
        successRate: metrics.successRate,
      },
    };
  }
}
```

## Future Considerations

### GraphQL Migration

Consider migrating to GraphQL for more flexible queries:

```graphql
type Query {
  # Resolver queries
  resolverHealth: HealthStatus!
  resolverMetrics: ResolverMetrics!
  
  # Indexer queries  
  atomicSwaps(filter: SwapFilter): [AtomicSwap!]!
  chainStatistics(chainId: Int!): ChainStats
}

type Mutation {
  # Admin operations only
  updateResolverConfig(config: ConfigInput!): Config!
  forceRevealSecret(orderHash: String!): Boolean!
}

type Subscription {
  # Real-time updates
  newSwaps: AtomicSwap!
  resolverEvents: ResolverEvent!
}
```

### gRPC for Internal Communication

For high-performance internal communication:

```protobuf
service ResolverService {
  rpc GetHealth(Empty) returns (HealthStatus);
  rpc GetMetrics(Empty) returns (Metrics);
  rpc ForceReveal(OrderHash) returns (Result);
}

service IndexerService {
  rpc GetSwaps(SwapFilter) returns (stream AtomicSwap);
  rpc GetStatistics(ChainId) returns (ChainStatistics);
}
```

## Conclusion

Clear API boundaries are essential for maintainable, scalable systems. By
following these guidelines:

1. **Components remain independent**: Each can be developed, tested, and
   deployed separately
2. **Interfaces are stable**: Changes don't cascade through the system
3. **Responsibilities are clear**: No confusion about which component handles
   what
4. **Performance is optimized**: Each API designed for its specific use case
5. **Security is enforced**: Clear boundaries make security easier to implement
