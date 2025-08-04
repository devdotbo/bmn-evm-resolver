# Indexer Integration

This directory contains the IndexerClient implementation for querying the Ponder indexer via SQL over HTTP.

## Local Development Setup

1. **Start the local Ponder indexer** (in the bmn-evm-indexer directory):
   ```bash
   pnpm dev
   ```
   The indexer will run on `http://localhost:42069`

2. **Configure the resolver** to use the local indexer:
   ```bash
   # Copy the example env file if you haven't already
   cp .env.example .env
   
   # The default INDEXER_URL is already set for local development:
   # INDEXER_URL=http://localhost:42069/sql
   ```

3. **Test the connection**:
   ```bash
   deno run --allow-net --allow-read --allow-env scripts/test-local-indexer.ts
   ```

## Usage Examples

### Basic Usage

```typescript
import { createLocalIndexerClient } from "./src/indexer/local-setup.ts";

// Create a client with local defaults
const indexer = createLocalIndexerClient();

// Connect to the indexer
await indexer.connect();

// Query pending orders
const pendingOrders = await indexer.getPendingOrders(resolverAddress);

// Subscribe to new orders
const unsubscribe = await indexer.subscribeToNewOrders((order) => {
  console.log("New order:", order);
});

// Clean up when done
await indexer.disconnect();
```

### Advanced Configuration

```typescript
import { IndexerClient } from "./src/indexer/client.ts";
import { getIndexerConfig } from "./src/config/indexer.ts";

// Use environment configuration
const config = getIndexerConfig();
const indexer = new IndexerClient(config);

// Or provide custom configuration
const customIndexer = new IndexerClient({
  sqlUrl: "http://localhost:42069/sql",
  tablePrefix: "", // No prefix for local dev
  retryAttempts: 5,
  retryDelay: 2000,
  timeout: 30000
});
```

### Integration with Resolver

```typescript
import { createLocalIndexerClient } from "./src/indexer/local-setup.ts";

export class BridgeResolver {
  private indexer: IndexerClient;

  async initialize() {
    // Use indexer for order discovery instead of chain polling
    this.indexer = createLocalIndexerClient();
    await this.indexer.connect();
    
    // Subscribe to new orders
    await this.indexer.subscribeToNewOrders(
      async (order) => {
        await this.handleNewOrder(order);
      },
      this.config.resolverAddress
    );
  }

  async findProfitableOrders() {
    // Query profitable orders from indexer
    const orders = await this.indexer.getProfitableOrders(
      this.config.resolverAddress,
      this.config.minProfitMargin,
      this.config.supportedTokens
    );
    
    return orders;
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INDEXER_URL` | `http://localhost:42069/sql` | SQL endpoint for the Ponder indexer |
| `INDEXER_TABLE_PREFIX` | (empty) | Table prefix for multi-tenant deployments |
| `INDEXER_RETRY_ATTEMPTS` | `3` | Number of retry attempts for failed queries |
| `INDEXER_RETRY_DELAY` | `1000` | Delay between retries in milliseconds |
| `INDEXER_TIMEOUT` | `30000` | Query timeout in milliseconds |

## Switching Between Local and Production

The indexer client automatically detects whether you're using a local or production indexer based on the URL:

- **Local**: URLs containing `localhost` or `127.0.0.1`
- **Production**: All other URLs

For production deployments:

1. Set the production indexer URL:
   ```bash
   INDEXER_URL=https://indexer.bridge-me-not.com/sql
   ```

2. If using a multi-tenant Ponder deployment, set the table prefix:
   ```bash
   INDEXER_TABLE_PREFIX=bmn
   ```

3. Adjust timeout and retry settings as needed for your infrastructure.

## Troubleshooting

If the indexer connection fails:

1. **Check if Ponder is running**: 
   ```bash
   curl http://localhost:42069/health
   ```

2. **Verify the SQL endpoint**:
   ```bash
   curl -X POST http://localhost:42069/sql \
     -H "Content-Type: application/json" \
     -d '{"statement": "SELECT 1 as test", "params": []}'
   ```

3. **Check your .env file** has the correct INDEXER_URL

4. **Ensure chains are running** and the indexer has synced some data

5. **Check Ponder logs** for any errors or sync issues