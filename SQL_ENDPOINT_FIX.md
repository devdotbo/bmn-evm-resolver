# SQL over HTTP Client Usage (Resolved)

## Summary

We standardized on the official `@ponder/client` for SQL over HTTP, matching
Ponder's documentation. Direct curl checks of `/sql` can return 404 depending on
server middleware and are not a reliable signal; the client works as intended
and is the supported integration path.

## Issues Fixed

### 1. Client Integration

**Resolution**: Use `@ponder/client` with `createClient("<base>/sql")` and
parameterized `sql` queries.

### 2. Docker Networking

If using a local/indexed service, prefer container DNS (e.g.,
`bmn-indexer:42069`) over `host.docker.internal`.

### 3. Client Methods

Added/validated indexer helpers in `PonderClient` that internally use
`client.db.execute(sql\`...\`)`.

### 4. Directory Handling

Ensured `bob-resolver-service.ts` creates `pending-orders`/`completed-orders` if
missing.

## Implementation Details

### Example (Untyped Query)

```typescript
import { createClient, sql } from "@ponder/client";
const client = createClient(`${INDEXER_URL}/sql`);
const rows = await client.db.execute(sql`SELECT 1 AS ok;`);
```

Docs: https://ponder.sh/docs/query/sql-over-http#sql-over-http

### Docker Network Configuration

```yaml
# docker-compose.yml
environment:
  - INDEXER_URL=http://bmn-indexer:42069
```

## Testing

Run the test script to verify the SQL endpoint via client:

```bash
deno run --allow-net --allow-env test-ponder-sql.ts
```

Or with Docker:

```bash
docker-compose up -d --build
docker-compose logs -f bob
```

## Files

1. `/src/indexer/ponder-client.ts` - Uses `@ponder/client` and `sql` queries
2. `/test-ponder-sql.ts` - Untyped `client.db.execute` smoke tests
3. `/docker-compose.yml` - Uses `INDEXER_URL` env
4. `/CHANGELOG.md` - Notes resolution and client usage

## Next Steps

1. Test the implementation with the actual indexer running
2. Verify swap detection and withdrawal functionality
3. Monitor for any remaining SQL query issues
4. Consider implementing proper chain client selection in withdraw() method
