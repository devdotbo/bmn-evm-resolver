/**
 * Timelock utility functions for managing withdrawal windows
 */

/**
 * Parse packed timelocks into separate components
 * @param timelocksPacked - Packed timelocks (srcCancellation<<128 | dstWithdrawal)
 * @returns Object with srcCancellation and dstWithdrawal timestamps
 */
export function parseTimelocks(timelocksPacked: bigint): {
  srcCancellation: bigint;
  dstWithdrawal: bigint;
} {
  const dstWithdrawal = timelocksPacked & ((1n << 128n) - 1n);
  const srcCancellation = timelocksPacked >> 128n;
  return { srcCancellation, dstWithdrawal };
}

/**
 * Check if destination withdrawal window is open
 * @param dstWithdrawal - Destination withdrawal timestamp
 * @returns True if window is open
 */
export function isDstWithdrawWindowOpen(dstWithdrawal: bigint): boolean {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return now >= dstWithdrawal;
}

/**
 * Check if source cancellation window is open
 * @param srcCancellation - Source cancellation timestamp
 * @returns True if window is open
 */
export function isSrcCancellationWindowOpen(srcCancellation: bigint): boolean {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return now >= srcCancellation;
}

/**
 * Calculate time remaining until destination withdrawal window opens
 * @param dstWithdrawal - Destination withdrawal timestamp
 * @returns Seconds until window opens (0 if already open)
 */
export function secondsUntilDstWithdraw(dstWithdrawal: bigint): bigint {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now >= dstWithdrawal) return 0n;
  return dstWithdrawal - now;
}

/**
 * Calculate time remaining until source cancellation window opens
 * @param srcCancellation - Source cancellation timestamp
 * @returns Seconds until window opens (0 if already open)
 */
export function secondsUntilSrcCancellation(srcCancellation: bigint): bigint {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now >= srcCancellation) return 0n;
  return srcCancellation - now;
}

/**
 * Format seconds into human-readable time string
 * @param seconds - Number of seconds
 * @returns Formatted time string (e.g., "5m 30s", "1h 20m")
 */
export function formatTimeRemaining(seconds: bigint): string {
  if (seconds === 0n) return "ready";
  
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
 * Wait until destination withdrawal window opens
 * @param dstWithdrawal - Destination withdrawal timestamp
 * @param checkInterval - Check interval in milliseconds (default: 10000ms = 10s)
 * @param maxWait - Maximum wait time in seconds (default: 3600s = 1 hour)
 * @returns Promise that resolves when window is open
 */
export async function waitUntilDstWithdrawWindow(
  dstWithdrawal: bigint,
  checkInterval = 10000,
  maxWait = 3600
): Promise<void> {
  const startTime = Date.now();
  const maxWaitMs = maxWait * 1000;
  
  while (!isDstWithdrawWindowOpen(dstWithdrawal)) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitMs) {
      throw new Error(`Timeout waiting for destination withdrawal window (waited ${maxWait}s)`);
    }
    
    const remaining = secondsUntilDstWithdraw(dstWithdrawal);
    console.log(`Waiting for dst withdrawal window to open: ${formatTimeRemaining(remaining)} remaining`);
    
    // Sleep for check interval or remaining time, whichever is smaller
    const sleepMs = Math.min(checkInterval, Number(remaining) * 1000);
    await new Promise(resolve => setTimeout(resolve, sleepMs));
  }
}

/**
 * Wait until source cancellation window opens
 * @param srcCancellation - Source cancellation timestamp
 * @param checkInterval - Check interval in milliseconds (default: 10000ms = 10s)
 * @param maxWait - Maximum wait time in seconds (default: 3600s = 1 hour)
 * @returns Promise that resolves when window is open
 */
export async function waitUntilSrcCancellationWindow(
  srcCancellation: bigint,
  checkInterval = 10000,
  maxWait = 3600
): Promise<void> {
  const startTime = Date.now();
  const maxWaitMs = maxWait * 1000;
  
  while (!isSrcCancellationWindowOpen(srcCancellation)) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitMs) {
      throw new Error(`Timeout waiting for source cancellation window (waited ${maxWait}s)`);
    }
    
    const remaining = secondsUntilSrcCancellation(srcCancellation);
    console.log(`Waiting for src cancellation window to open: ${formatTimeRemaining(remaining)} remaining`);
    
    // Sleep for check interval or remaining time, whichever is smaller
    const sleepMs = Math.min(checkInterval, Number(remaining) * 1000);
    await new Promise(resolve => setTimeout(resolve, sleepMs));
  }
}

/**
 * Get detailed timelock status
 * @param timelocksPacked - Packed timelocks
 * @returns Object with detailed status information
 */
export function getTimelockStatus(timelocksPacked: bigint): {
  srcCancellation: {
    timestamp: bigint;
    isOpen: boolean;
    secondsRemaining: bigint;
    formatted: string;
  };
  dstWithdrawal: {
    timestamp: bigint;
    isOpen: boolean;
    secondsRemaining: bigint;
    formatted: string;
  };
} {
  const { srcCancellation, dstWithdrawal } = parseTimelocks(timelocksPacked);
  
  return {
    srcCancellation: {
      timestamp: srcCancellation,
      isOpen: isSrcCancellationWindowOpen(srcCancellation),
      secondsRemaining: secondsUntilSrcCancellation(srcCancellation),
      formatted: formatTimeRemaining(secondsUntilSrcCancellation(srcCancellation)),
    },
    dstWithdrawal: {
      timestamp: dstWithdrawal,
      isOpen: isDstWithdrawWindowOpen(dstWithdrawal),
      secondsRemaining: secondsUntilDstWithdraw(dstWithdrawal),
      formatted: formatTimeRemaining(secondsUntilDstWithdraw(dstWithdrawal)),
    },
  };
}