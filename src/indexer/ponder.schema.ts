// Ponder schema shim used by the resolver to document/index expected tables & columns.
// The production Ponder instance owns the real schema and table creation.

type ColumnBuilder = {
  primaryKey: () => ColumnBuilder;
  notNull: () => ColumnBuilder;
  default?: (value?: unknown) => ColumnBuilder;
};

const noop: ColumnBuilder = {
  primaryKey: () => noop,
  notNull: () => noop,
  default: () => noop,
};

const t = {
  text: () => noop,
  hex: () => noop,
  integer: () => noop,
  bigint: () => noop,
  boolean: () => noop,
  timestamp: () => noop,
};

const onchainTable = (name: string, _columns: (t: typeof t) => Record<string, ColumnBuilder>) => name;

// ========== Core Escrow Tables ==========
export const srcEscrow = onchainTable("src_escrow", (t) => ({
  id: t.text().primaryKey(),
  order_hash: t.hex().notNull(),
  hashlock: t.hex().notNull(),
  chain_id: t.integer().notNull(),
  escrow_address: t.hex().notNull(),
  maker: t.hex().notNull(),
  taker: t.hex().notNull(),
  token: t.hex().notNull(),
  amount: t.bigint().notNull(),
  safety_deposit: t.bigint().notNull(),
  timelocks: t.bigint().notNull(),
  status: t.text().notNull(),
  created_at: t.timestamp().notNull(),
  fill_tx_hash: t.hex(),
  reveal_tx_hash: t.hex(),
}));

export const dstEscrow = onchainTable("dst_escrow", (t) => ({
  id: t.text().primaryKey(),
  order_hash: t.hex().notNull(),
  hashlock: t.hex().notNull(),
  chain_id: t.integer().notNull(),
  escrow_address: t.hex().notNull(),
  maker: t.hex().notNull(),
  taker: t.hex().notNull(),
  token: t.hex().notNull(),
  amount: t.bigint().notNull(),
  safety_deposit: t.bigint().notNull(),
  timelocks: t.bigint().notNull(),
  status: t.text().notNull(),
  created_at: t.timestamp().notNull(),
  fill_tx_hash: t.hex(),
  reveal_tx_hash: t.hex(),
}));

export const escrowWithdrawal = onchainTable("escrow_withdrawal", (t) => ({
  id: t.text().primaryKey(),
  escrow_address: t.hex().notNull(),
  chain_id: t.integer().notNull(),
  order_hash: t.hex(),
  secret: t.hex(),
  tx_hash: t.hex().notNull(),
  withdrawn_at: t.timestamp().notNull(),
}));

export const escrowCancellation = onchainTable("escrow_cancellation", (t) => ({
  id: t.text().primaryKey(),
  escrow_address: t.hex().notNull(),
  chain_id: t.integer().notNull(),
  order_hash: t.hex(),
  tx_hash: t.hex().notNull(),
  cancelled_at: t.timestamp().notNull(),
}));

export const fundsRescued = onchainTable("funds_rescued", (t) => ({
  id: t.text().primaryKey(),
  escrow_address: t.hex().notNull(),
  chain_id: t.integer().notNull(),
  token: t.hex().notNull(),
  amount: t.bigint().notNull(),
  tx_hash: t.hex().notNull(),
  rescued_at: t.timestamp().notNull(),
}));

export const atomicSwap = onchainTable("atomic_swap", (t) => ({
  id: t.text().primaryKey(),
  order_hash: t.hex().notNull(),
  hashlock: t.hex().notNull(),
  src_chain_id: t.integer().notNull(),
  dst_chain_id: t.integer().notNull(),
  src_escrow_address: t.hex(),
  dst_escrow_address: t.hex(),
  src_maker: t.hex(),
  src_taker: t.hex(),
  dst_maker: t.hex(),
  dst_taker: t.hex(),
  src_token: t.hex(),
  dst_token: t.hex(),
  src_amount: t.bigint(),
  dst_amount: t.bigint(),
  status: t.text().notNull(),
  secret: t.hex(),
  created_at: t.timestamp().notNull(),
  src_fill_tx_hash: t.hex(),
  dst_fill_tx_hash: t.hex(),
  src_reveal_tx_hash: t.hex(),
  dst_reveal_tx_hash: t.hex(),
  post_interaction: t.text(),
}));

export const chainStatistics = onchainTable("chain_statistics", (t) => ({
  chain_id: t.integer().primaryKey(),
  total_src_escrows: t.bigint().notNull(),
  total_dst_escrows: t.bigint().notNull(),
  total_withdrawals: t.bigint().notNull(),
  total_cancellations: t.bigint().notNull(),
  updated_at: t.timestamp().notNull(),
}));

// ========== BMN Token ==========
export const bmnTransfer = onchainTable("bmn_transfer", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  token: t.hex().notNull(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  value: t.bigint().notNull(),
  tx_hash: t.hex().notNull(),
  block_number: t.bigint().notNull(),
  log_index: t.integer().notNull(),
  timestamp: t.timestamp().notNull(),
}));

export const bmnApproval = onchainTable("bmn_approval", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  token: t.hex().notNull(),
  owner: t.hex().notNull(),
  spender: t.hex().notNull(),
  value: t.bigint().notNull(),
  tx_hash: t.hex().notNull(),
  timestamp: t.timestamp().notNull(),
}));

export const bmnTokenHolder = onchainTable("bmn_token_holder", (t) => ({
  holder: t.hex().primaryKey(),
  balance: t.bigint().notNull(),
  updated_at: t.timestamp().notNull(),
}));

// ========== Limit Order Protocol ==========
export const limitOrder = onchainTable("limit_order", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  order_hash: t.hex(),
  maker: t.hex(),
  receiver: t.hex(),
  maker_asset: t.hex(),
  taker_asset: t.hex(),
  making_amount: t.bigint(),
  taking_amount: t.bigint(),
  maker_traits: t.hex(),
  salt: t.bigint(),
  status: t.text().notNull(),
  created_at: t.timestamp().notNull(),
}));

export const orderFilled = onchainTable("order_filled", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  order_hash: t.hex().notNull(),
  taker: t.hex().notNull(),
  making_amount: t.bigint().notNull(),
  taking_amount: t.bigint().notNull(),
  tx_hash: t.hex().notNull(),
  timestamp: t.timestamp().notNull(),
}));

export const orderCancelled = onchainTable("order_cancelled", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  order_hash: t.hex().notNull(),
  tx_hash: t.hex().notNull(),
  timestamp: t.timestamp().notNull(),
}));

export const bitInvalidatorUpdated = onchainTable("bit_invalidator_updated", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  maker: t.hex().notNull(),
  slot: t.bigint().notNull(),
  bit: t.integer().notNull(),
  status: t.text().notNull(),
  tx_hash: t.hex().notNull(),
  timestamp: t.timestamp().notNull(),
}));

export const epochIncreased = onchainTable("epoch_increased", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  maker: t.hex().notNull(),
  series: t.integer().notNull(),
  epoch: t.bigint().notNull(),
  tx_hash: t.hex().notNull(),
  timestamp: t.timestamp().notNull(),
}));

export const limitOrderStatistics = onchainTable("limit_order_statistics", (t) => ({
  chain_id: t.integer().primaryKey(),
  filled_count: t.bigint().notNull(),
  cancelled_count: t.bigint().notNull(),
  active_count: t.bigint().notNull(),
  updated_at: t.timestamp().notNull(),
}));

// ========== Factory (v2.x) ==========
export const resolverWhitelist = onchainTable("resolver_whitelist", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  resolver: t.hex().notNull(),
  is_whitelisted: t.boolean().notNull(),
  updated_at: t.timestamp().notNull(),
}));

export const resolverSuspension = onchainTable("resolver_suspension", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  resolver: t.hex().notNull(),
  is_suspended: t.boolean().notNull(),
  updated_at: t.timestamp().notNull(),
}));

export const factoryAdmin = onchainTable("factory_admin", (t) => ({
  chain_id: t.integer().primaryKey(),
  owner: t.hex().notNull(),
  updated_at: t.timestamp().notNull(),
}));

export const emergencyPause = onchainTable("emergency_pause", (t) => ({
  chain_id: t.integer().primaryKey(),
  is_paused: t.boolean().notNull(),
  updated_at: t.timestamp().notNull(),
}));

export const swapMetrics = onchainTable("swap_metrics", (t) => ({
  chain_id: t.integer().primaryKey(),
  total_swaps: t.bigint().notNull(),
  total_volume_src: t.bigint().notNull(),
  total_volume_dst: t.bigint().notNull(),
  updated_at: t.timestamp().notNull(),
}));

export const interactionTracking = onchainTable("interaction_tracking", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  resolver: t.hex().notNull(),
  protocol: t.hex().notNull(),
  payload: t.text().notNull(),
  created_at: t.timestamp().notNull(),
}));

export const factoryMetrics = onchainTable("factory_metrics", (t) => ({
  chain_id: t.integer().primaryKey(),
  deployments: t.bigint().notNull(),
  total_interactions: t.bigint().notNull(),
  updated_at: t.timestamp().notNull(),
}));

// ========== PostInteraction (v2.2+) ==========
export const postInteractionOrder = onchainTable("post_interaction_order", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  order_hash: t.hex().notNull(),
  resolver: t.hex().notNull(),
  payload: t.text().notNull(),
  created_at: t.timestamp().notNull(),
}));

export const postInteractionResolverWhitelist = onchainTable(
  "post_interaction_resolver_whitelist",
  (t) => ({
    id: t.text().primaryKey(),
    chain_id: t.integer().notNull(),
    resolver: t.hex().notNull(),
    is_whitelisted: t.boolean().notNull(),
    updated_at: t.timestamp().notNull(),
  }),
);

export const makerWhitelist = onchainTable("maker_whitelist", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  maker: t.hex().notNull(),
  is_whitelisted: t.boolean().notNull(),
  updated_at: t.timestamp().notNull(),
}));

export const postInteractionEscrow = onchainTable("post_interaction_escrow", (t) => ({
  id: t.text().primaryKey(),
  chain_id: t.integer().notNull(),
  order_hash: t.hex().notNull(),
  src_escrow_address: t.hex(),
  dst_escrow_address: t.hex(),
  created_at: t.timestamp().notNull(),
}));
