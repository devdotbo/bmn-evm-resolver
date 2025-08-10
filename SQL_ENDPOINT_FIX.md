# SQL Endpoint Fix Summary

## Problem Statement
The PonderClient implementation was using an incorrect API format for querying the indexer, causing 500 errors and missing functionality.

## Issues Fixed

### 1. Incorrect SQL Endpoint Format
**Problem**: PonderClient was using `/sql/db` endpoint with query parameters
**Solution**: Changed to POST `/sql` with JSON body `{ sql: query }`

### 2. Docker Networking
**Problem**: Services were using `host.docker.internal:42069` which doesn't work reliably
**Solution**: Changed to `bmn-indexer:42069` using Docker container networking

### 3. Missing Methods
**Problem**: `getActiveSwaps()` and `getWithdrawableEscrows()` methods were not implemented
**Solution**: 
- Added `getActiveSwaps()` to PonderClient for finding swap opportunities
- Added `getWithdrawableEscrows()` and `withdraw()` to EscrowWithdrawManager

### 4. Directory Handling
**Problem**: bob-resolver-service.ts failed when pending-orders directory didn't exist
**Solution**: Added proper directory creation and error handling

## Implementation Details

### Correct SQL Query Format
```typescript
// Before (incorrect)
const url = new URL(`${this.sqlUrl}/db`);
url.searchParams.set("sql", SimpleSerializer.stringify(sqlQuery));
const response = await fetch(url.toString(), { method: "POST" });

// After (correct)
const response = await fetch(this.sqlUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sql: finalQuery }),
});
```

### Response Handling
```typescript
// Handle both 'data' and 'rows' fields in response
const rows = result.data || result.rows || [];
```

### Docker Network Configuration
```yaml
# docker-compose.yml
environment:
  - INDEXER_URL=http://bmn-indexer:42069  # Use container name, not host.docker.internal
```

## Testing

Run the test script to verify the SQL endpoint works:
```bash
deno run --allow-net --allow-env test-ponder-sql.ts
```

Or with Docker:
```bash
docker-compose up -d --build
docker-compose logs -f bob
```

## Files Modified
1. `/src/indexer/ponder-client.ts` - Fixed SQL execution and added getActiveSwaps()
2. `/src/utils/escrow-withdraw.ts` - Added getWithdrawableEscrows() and withdraw()
3. `/docker-compose.yml` - Updated INDEXER_URL for both services
4. `/bob-resolver-service.ts` - Added directory creation and error handling
5. `/test-ponder-sql.ts` - Created test script for verification
6. `/CHANGELOG.md` - Documented all changes

## Next Steps
1. Test the implementation with the actual indexer running
2. Verify swap detection and withdrawal functionality
3. Monitor for any remaining SQL query issues
4. Consider implementing proper chain client selection in withdraw() method