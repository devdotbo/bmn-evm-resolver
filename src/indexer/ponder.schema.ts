// Schema definitions for Ponder indexer tables
// This file defines the structure but is not used for actual table creation
// The indexer service handles table creation based on its own schema

// Mock function for compatibility - actual tables are created by the indexer
const onchainTable = (name: string, _columns: any) => name;

// Mock column type functions for schema definition
const t = {
  text: () => ({
    primaryKey: () => ({}),
    notNull: () => ({}),
  }),
  hex: () => ({
    notNull: () => ({}),
  }),
  integer: () => ({
    notNull: () => ({}),
  }),
  bigint: () => ({
    notNull: () => ({}),
  }),
  boolean: () => ({
    notNull: () => ({ default: () => ({}) }),
  }),
};

// Factory events tracking
export const srcEscrow = onchainTable("src_escrow", (t: any) => ({}));
export const dstEscrow = onchainTable("dst_escrow", (t: any) => ({}));
export const escrowWithdrawal = onchainTable(
  "escrow_withdrawal",
  (t: any) => ({}),
);
export const escrowCancellation = onchainTable(
  "escrow_cancellation",
  (t: any) => ({}),
);
export const fundsRescued = onchainTable("funds_rescued", (t: any) => ({}));
export const atomicSwap = onchainTable("atomic_swap", (t: any) => ({}));
export const chainStatistics = onchainTable(
  "chain_statistics",
  (t: any) => ({}),
);

// BMN Token Tables
export const bmnTransfer = onchainTable("bmn_transfer", (t: any) => ({}));
export const bmnApproval = onchainTable("bmn_approval", (t: any) => ({}));
export const bmnTokenHolder = onchainTable(
  "bmn_token_holder",
  (t: any) => ({}),
);

// Limit Order Protocol Tables
export const limitOrder = onchainTable("limit_order", (t: any) => ({}));
export const orderFilled = onchainTable("order_filled", (t: any) => ({}));
export const orderCancelled = onchainTable("order_cancelled", (t: any) => ({}));
export const bitInvalidatorUpdated = onchainTable(
  "bit_invalidator_updated",
  (t: any) => ({}),
);
export const epochIncreased = onchainTable("epoch_increased", (t: any) => ({}));
export const limitOrderStatistics = onchainTable(
  "limit_order_statistics",
  (t: any) => ({}),
);

// V2.1.0 Factory Events
export const resolverWhitelist = onchainTable(
  "resolver_whitelist",
  (t: any) => ({}),
);
export const resolverSuspension = onchainTable(
  "resolver_suspension",
  (t: any) => ({}),
);
export const factoryAdmin = onchainTable("factory_admin", (t: any) => ({}));
export const emergencyPause = onchainTable("emergency_pause", (t: any) => ({}));
export const swapMetrics = onchainTable("swap_metrics", (t: any) => ({}));
export const interactionTracking = onchainTable(
  "interaction_tracking",
  (t: any) => ({}),
);
export const factoryMetrics = onchainTable("factory_metrics", (t: any) => ({}));

// V2.2.0 PostInteraction Support
export const postInteractionOrder = onchainTable(
  "post_interaction_order",
  (t: any) => ({}),
);
export const postInteractionResolverWhitelist = onchainTable(
  "post_interaction_resolver_whitelist",
  (t: any) => ({}),
);
export const makerWhitelist = onchainTable("maker_whitelist", (t: any) => ({}));
export const postInteractionEscrow = onchainTable(
  "post_interaction_escrow",
  (t: any) => ({}),
);
