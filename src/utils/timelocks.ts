import type { Timelocks } from "../types/index.ts";

// Default timelock durations in seconds (for demo/testing)
export const DEFAULT_TIMELOCK_DURATIONS = {
  srcWithdrawal: 5n * 60n,           // 5 minutes
  srcPublicWithdrawal: 10n * 60n,    // 10 minutes
  srcCancellation: 15n * 60n,        // 15 minutes
  srcPublicCancellation: 20n * 60n,  // 20 minutes
  dstWithdrawal: 5n * 60n,           // 5 minutes
  dstCancellation: 15n * 60n,        // 15 minutes
} as const;

// Production timelock durations (longer for security)
export const PRODUCTION_TIMELOCK_DURATIONS = {
  srcWithdrawal: 24n * 60n * 60n,           // 24 hours
  srcPublicWithdrawal: 48n * 60n * 60n,     // 48 hours
  srcCancellation: 72n * 60n * 60n,          // 72 hours
  srcPublicCancellation: 96n * 60n * 60n,    // 96 hours
  dstWithdrawal: 24n * 60n * 60n,           // 24 hours
  dstCancellation: 72n * 60n * 60n,          // 72 hours
} as const;

/**
 * Create timelocks from the current timestamp
 * @param useProduction Whether to use production timelock durations
 * @returns Timelocks object with absolute timestamps
 */
export function createTimelocks(useProduction = false): Timelocks {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const durations = useProduction 
    ? PRODUCTION_TIMELOCK_DURATIONS 
    : DEFAULT_TIMELOCK_DURATIONS;

  return {
    srcWithdrawal: now + durations.srcWithdrawal,
    srcPublicWithdrawal: now + durations.srcPublicWithdrawal,
    srcCancellation: now + durations.srcCancellation,
    srcPublicCancellation: now + durations.srcPublicCancellation,
    dstWithdrawal: now + durations.dstWithdrawal,
    dstCancellation: now + durations.dstCancellation,
  };
}

/**
 * Create timelocks from a specific timestamp
 * @param timestamp The base timestamp in seconds
 * @param useProduction Whether to use production timelock durations
 * @returns Timelocks object
 */
export function createTimelocksFromTimestamp(
  timestamp: bigint,
  useProduction = false
): Timelocks {
  const durations = useProduction 
    ? PRODUCTION_TIMELOCK_DURATIONS 
    : DEFAULT_TIMELOCK_DURATIONS;

  return {
    srcWithdrawal: timestamp + durations.srcWithdrawal,
    srcPublicWithdrawal: timestamp + durations.srcPublicWithdrawal,
    srcCancellation: timestamp + durations.srcCancellation,
    srcPublicCancellation: timestamp + durations.srcPublicCancellation,
    dstWithdrawal: timestamp + durations.dstWithdrawal,
    dstCancellation: timestamp + durations.dstCancellation,
  };
}

/**
 * Validate that timelocks follow the correct ordering
 * @param timelocks The timelocks to validate
 * @returns True if valid, throws otherwise
 */
export function validateTimelocks(timelocks: Timelocks): boolean {
  // Source chain validations
  if (timelocks.srcWithdrawal >= timelocks.srcPublicWithdrawal) {
    throw new Error("srcWithdrawal must be before srcPublicWithdrawal");
  }
  if (timelocks.srcPublicWithdrawal >= timelocks.srcCancellation) {
    throw new Error("srcPublicWithdrawal must be before srcCancellation");
  }
  if (timelocks.srcCancellation >= timelocks.srcPublicCancellation) {
    throw new Error("srcCancellation must be before srcPublicCancellation");
  }

  // Destination chain validations
  if (timelocks.dstWithdrawal >= timelocks.dstCancellation) {
    throw new Error("dstWithdrawal must be before dstCancellation");
  }

  // Cross-chain validations
  if (timelocks.srcWithdrawal <= timelocks.dstWithdrawal) {
    throw new Error("srcWithdrawal must be after dstWithdrawal to prevent race conditions");
  }

  return true;
}

/**
 * Check if a specific timelock has passed
 * @param timelockTimestamp The timelock timestamp to check
 * @returns True if the timelock has passed
 */
export function hasTimelockPassed(timelockTimestamp: bigint): boolean {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return now >= timelockTimestamp;
}

/**
 * Get the time remaining until a timelock
 * @param timelockTimestamp The timelock timestamp
 * @returns Time remaining in seconds, or 0 if already passed
 */
export function getTimeUntilTimelock(timelockTimestamp: bigint): bigint {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const remaining = timelockTimestamp - now;
  return remaining > 0n ? remaining : 0n;
}

/**
 * Format timelock duration for display
 * @param seconds The duration in seconds
 * @returns Human-readable duration string
 */
export function formatDuration(seconds: bigint): string {
  const totalSeconds = Number(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

/**
 * Get the current timelock phase for an order
 * @param timelocks The order timelocks
 * @returns The current phase
 */
export function getCurrentPhase(timelocks: Timelocks): string {
  const now = BigInt(Math.floor(Date.now() / 1000));

  // Check destination chain phases first (they expire first)
  if (now < timelocks.dstWithdrawal) {
    return "DST_WITHDRAWAL_PENDING";
  }
  if (now < timelocks.dstCancellation) {
    return "DST_WITHDRAWAL_ACTIVE";
  }

  // Check source chain phases
  if (now < timelocks.srcWithdrawal) {
    return "SRC_WITHDRAWAL_PENDING";
  }
  if (now < timelocks.srcPublicWithdrawal) {
    return "SRC_WITHDRAWAL_ACTIVE";
  }
  if (now < timelocks.srcCancellation) {
    return "SRC_PUBLIC_WITHDRAWAL_ACTIVE";
  }
  if (now < timelocks.srcPublicCancellation) {
    return "SRC_CANCELLATION_ACTIVE";
  }

  return "EXPIRED";
}