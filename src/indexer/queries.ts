/**
 * SQL queries for indexer operations
 * Using PostgreSQL database schema from the Ponder indexer
 * 
 * Note: Table names are quoted to ensure compatibility with Ponder's
 * automatic table prefixing (e.g., ponderAppName.tableName)
 */

import type { Address, Hex } from "viem";

// SQL queries for direct database access
export const SQL_QUERIES = {
  // Get pending orders for a specific resolver
  GET_PENDING_ORDERS: `
    SELECT 
      a.*,
      s.escrow_address as src_escrow_address,
      s.chain_id as src_chain_id,
      s.timelocks,
      s.block_number as src_block_number,
      s.transaction_hash as src_transaction_hash,
      s.status as src_status
    FROM "atomicSwap" a
    JOIN "srcEscrow" s ON a.order_hash = s.order_hash
    LEFT JOIN "dstEscrow" d ON a.order_hash = d.order_hash
    WHERE 
      d.order_hash IS NULL
      AND a.dst_maker = $1
      AND a.status IN ('src_created', 'pending')
    ORDER BY a.src_created_at DESC
    LIMIT $2 OFFSET $3
  `,

  // Get active orders (both escrows created)
  GET_ACTIVE_ORDERS: `
    SELECT 
      a.*,
      s.escrow_address as src_escrow_address,
      d.escrow_address as dst_escrow_address
    FROM "atomicSwap" a
    JOIN "srcEscrow" s ON a.order_hash = s.order_hash
    JOIN "dstEscrow" d ON a.order_hash = d.order_hash
    WHERE 
      a.dst_maker = $1
      AND a.status = 'both_created'
    ORDER BY a.dst_created_at DESC
    LIMIT $2
  `,

  // Get revealed secret for an order
  GET_REVEALED_SECRET: `
    SELECT 
      COALESCE(a.secret, w.secret) as secret
    FROM "atomicSwap" a
    LEFT JOIN "dstEscrow" d ON a.order_hash = d.order_hash
    LEFT JOIN "escrowWithdrawal" w ON d.escrow_address = w.escrow_address
    WHERE a.order_hash = $1
    LIMIT 1
  `,

  // Get order details with escrow information
  GET_ORDER_DETAILS: `
    SELECT 
      a.*,
      s.escrow_address as src_escrow_address,
      s.chain_id as src_chain_id,
      s.block_number as src_block_number,
      s.transaction_hash as src_transaction_hash,
      s.status as src_status,
      d.escrow_address as dst_escrow_address,
      d.chain_id as dst_chain_id,
      d.src_cancellation_timestamp,
      d.block_number as dst_block_number,
      d.transaction_hash as dst_transaction_hash,
      d.status as dst_status
    FROM "atomicSwap" a
    LEFT JOIN "srcEscrow" s ON a.order_hash = s.order_hash
    LEFT JOIN "dstEscrow" d ON a.order_hash = d.order_hash
    WHERE a.order_hash = $1
  `,

  // Get profitable orders with profitability calculation
  PROFITABLE_ORDERS: `
    SELECT 
      a.*,
      s.escrow_address as src_escrow_address,
      s.chain_id as src_chain_id,
      s.timelocks,
      (a.dst_amount::decimal / a.src_amount::decimal - 1) * 100 as profit_margin
    FROM "atomicSwap" a
    JOIN "srcEscrow" s ON a.order_hash = s.order_hash
    LEFT JOIN "dstEscrow" d ON a.order_hash = d.order_hash
    WHERE 
      d.order_hash IS NULL
      AND a.status = 'src_created'
      AND a.dst_maker = $1
      AND a.dst_token = ANY($2)
    ORDER BY profit_margin DESC
    LIMIT $3
  `,

  // Get source escrows by hashlock
  GET_SRC_ESCROWS_BY_HASHLOCK: `
    SELECT * FROM "srcEscrow"
    WHERE hashlock = $1
  `,

  // Get destination escrows by hashlock
  GET_DST_ESCROWS_BY_HASHLOCK: `
    SELECT * FROM "dstEscrow"
    WHERE hashlock = $1
  `,

  // Get recent withdrawals
  GET_RECENT_WITHDRAWALS: `
    SELECT * FROM "escrowWithdrawal"
    WHERE withdrawn_at >= $1
    ORDER BY withdrawn_at DESC
    LIMIT $2
  `,

  // Get chain statistics
  GET_CHAIN_STATISTICS: `
    SELECT * FROM "chainStatistics"
    WHERE chain_id = $1
    LIMIT 1
  `,

  // Get orders approaching timelock expiry
  TIMELOCK_WARNING: `
    SELECT 
      a.*,
      s.timelocks,
      s.escrow_address,
      EXTRACT(EPOCH FROM (to_timestamp(s.timelocks) - NOW())) as seconds_until_expiry
    FROM "atomicSwap" a
    JOIN "srcEscrow" s ON a.order_hash = s.order_hash
    WHERE 
      a.status IN ('src_created', 'both_created')
      AND to_timestamp(s.timelocks) < NOW() + INTERVAL '5 minutes'
      AND to_timestamp(s.timelocks) > NOW()
    ORDER BY seconds_until_expiry ASC
  `,

  // Get orders by maker
  GET_ORDERS_BY_MAKER: `
    SELECT * FROM "atomicSwap"
    WHERE src_maker = $1
      AND status = ANY($2)
    ORDER BY src_created_at DESC
    LIMIT $3
  `,

  // Health check query
  HEALTH_CHECK: `
    SELECT chain_id, last_updated_block
    FROM "chainStatistics"
    ORDER BY last_updated_block DESC
  `,

  // Batch query orders
  BATCH_QUERY_ORDERS: `
    SELECT * FROM "atomicSwap"
    WHERE order_hash = ANY($1)
  `,

  // Get revealed secrets from withdrawals
  REVEALED_SECRETS: `
    SELECT DISTINCT ON (de.order_hash)
      de.order_hash,
      w.secret,
      w.withdrawn_at,
      w.transaction_hash
    FROM "escrowWithdrawal" w
    JOIN "dstEscrow" de ON w.escrow_address = de.escrow_address
    WHERE 
      de.order_hash = ANY($1)
      AND w.secret IS NOT NULL
    ORDER BY de.order_hash, w.withdrawn_at DESC
  `,

  // Analytics query for volume over time
  VOLUME_ANALYTICS: `
    SELECT 
      date_trunc('day', to_timestamp(src_created_at)) as day,
      COUNT(*) as swap_count,
      SUM(src_amount) as total_volume,
      COUNT(DISTINCT src_maker) as unique_makers,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_swaps
    FROM "atomicSwap"
    WHERE src_created_at >= $1
    GROUP BY day
    ORDER BY day DESC
  `,

  // Polling queries for subscription emulation
  POLL_NEW_ORDERS: `
    SELECT * FROM "atomicSwap"
    WHERE src_created_at > $1
      AND ($2::text IS NULL OR dst_maker = $2)
    ORDER BY src_created_at DESC
  `,

  POLL_SECRET_REVEALS: `
    SELECT 
      w.*,
      de.order_hash,
      de.hashlock
    FROM "escrowWithdrawal" w
    JOIN "dstEscrow" de ON w.escrow_address = de.escrow_address
    WHERE w.withdrawn_at > $1
      AND w.secret IS NOT NULL
    ORDER BY w.withdrawn_at DESC
  `,

  POLL_ORDER_UPDATES: `
    SELECT 
      order_hash,
      status,
      secret,
      completed_at,
      cancelled_at,
      dst_escrow_address
    FROM "atomicSwap"
    WHERE order_hash = $1
      AND (
        status != $2
        OR secret != $3
        OR completed_at != $4
        OR cancelled_at != $5
        OR dst_escrow_address != $6
      )
  `
};

// Helper function to build dynamic SQL queries
export function buildSqlQuery(
  table: string,
  fields: string[],
  conditions: Record<string, any>,
  options?: {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: "ASC" | "DESC";
    tablePrefix?: string;
  }
): { sql: string; params: any[] } {
  const params: any[] = [];
  let paramIndex = 1;

  // Build SELECT clause
  const selectClause = fields.length > 0 
    ? fields.join(", ")
    : "*";

  // Build WHERE clause
  const whereConditions: string[] = [];
  for (const [key, value] of Object.entries(conditions)) {
    if (Array.isArray(value)) {
      whereConditions.push(`${key} = ANY($${paramIndex})`);
      params.push(value);
      paramIndex++;
    } else if (value !== null && value !== undefined) {
      whereConditions.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  // Build ORDER BY clause
  const orderByClause = options?.orderBy
    ? `ORDER BY ${options.orderBy} ${options.orderDirection || "ASC"}`
    : "";

  // Build LIMIT/OFFSET clause
  let limitClause = "";
  if (options?.limit) {
    limitClause = `LIMIT $${paramIndex}`;
    params.push(options.limit);
    paramIndex++;
  }
  if (options?.offset) {
    limitClause += ` OFFSET $${paramIndex}`;
    params.push(options.offset);
  }

  // Apply table prefix if provided
  const tableName = options?.tablePrefix 
    ? `"${options.tablePrefix}.${table}"`
    : `"${table}"`;

  const sql = `
    SELECT ${selectClause}
    FROM ${tableName}
    ${whereClause}
    ${orderByClause}
    ${limitClause}
  `.trim();

  return { sql, params };
}