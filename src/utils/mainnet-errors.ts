/**
 * Mainnet-specific error handling utilities
 */

import { isMainnetMode } from "../config/chain-selector.ts";

// Mainnet-specific error types
export enum MainnetErrorType {
  INSUFFICIENT_GAS = "INSUFFICIENT_GAS",
  NETWORK_CONGESTION = "NETWORK_CONGESTION",
  RPC_TIMEOUT = "RPC_TIMEOUT",
  NONCE_TOO_LOW = "NONCE_TOO_LOW",
  REPLACEMENT_UNDERPRICED = "REPLACEMENT_UNDERPRICED",
  UNPREDICTABLE_GAS_LIMIT = "UNPREDICTABLE_GAS_LIMIT",
}

// Error patterns to detect mainnet issues
const ERROR_PATTERNS = {
  [MainnetErrorType.INSUFFICIENT_GAS]: [
    /insufficient funds/i,
    /gas required exceeds allowance/i,
    /out of gas/i,
  ],
  [MainnetErrorType.NETWORK_CONGESTION]: [
    /transaction underpriced/i,
    /replacement transaction underpriced/i,
    /max fee per gas less than block base fee/i,
  ],
  [MainnetErrorType.RPC_TIMEOUT]: [
    /timeout/i,
    /request timed out/i,
    /connection timeout/i,
  ],
  [MainnetErrorType.NONCE_TOO_LOW]: [
    /nonce too low/i,
    /invalid nonce/i,
    /nonce has already been used/i,
  ],
  [MainnetErrorType.REPLACEMENT_UNDERPRICED]: [
    /replacement transaction underpriced/i,
    /transaction with same nonce/i,
  ],
  [MainnetErrorType.UNPREDICTABLE_GAS_LIMIT]: [
    /cannot estimate gas/i,
    /execution reverted/i,
    /unpredictable gas limit/i,
  ],
};

/**
 * Classify an error into mainnet-specific categories
 */
export function classifyMainnetError(error: any): MainnetErrorType | null {
  const errorMessage = error?.message || error?.toString() || "";
  
  for (const [type, patterns] of Object.entries(ERROR_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(errorMessage))) {
      return type as MainnetErrorType;
    }
  }
  
  return null;
}

/**
 * Get recommended action for a mainnet error
 */
export function getErrorRecommendation(errorType: MainnetErrorType): string {
  switch (errorType) {
    case MainnetErrorType.INSUFFICIENT_GAS:
      return "Check account balance and ensure sufficient ETH for gas fees";
    case MainnetErrorType.NETWORK_CONGESTION:
      return "Increase gas price or wait for network congestion to clear";
    case MainnetErrorType.RPC_TIMEOUT:
      return "Retry with longer timeout or switch to a different RPC endpoint";
    case MainnetErrorType.NONCE_TOO_LOW:
      return "Fetch latest nonce from chain and retry transaction";
    case MainnetErrorType.REPLACEMENT_UNDERPRICED:
      return "Increase gas price by at least 10% for replacement transaction";
    case MainnetErrorType.UNPREDICTABLE_GAS_LIMIT:
      return "Check contract state and ensure transaction will succeed";
    default:
      return "Check logs for more details";
  }
}

/**
 * Determine if error is retryable
 */
export function isRetryableError(error: any): boolean {
  const errorType = classifyMainnetError(error);
  
  if (!errorType) return false;
  
  // These errors are typically retryable
  const retryableTypes = [
    MainnetErrorType.NETWORK_CONGESTION,
    MainnetErrorType.RPC_TIMEOUT,
    MainnetErrorType.NONCE_TOO_LOW,
    MainnetErrorType.REPLACEMENT_UNDERPRICED,
  ];
  
  return retryableTypes.includes(errorType);
}

/**
 * Get retry delay based on error type
 */
export function getRetryDelay(errorType: MainnetErrorType, attempt: number): number {
  const baseDelay = isMainnetMode() ? 5000 : 1000; // 5s for mainnet, 1s for testnet
  
  switch (errorType) {
    case MainnetErrorType.NETWORK_CONGESTION:
      // Exponential backoff for congestion
      return Math.min(baseDelay * Math.pow(2, attempt), 60000); // Max 1 minute
    case MainnetErrorType.RPC_TIMEOUT:
      // Linear increase for timeouts
      return baseDelay * (attempt + 1);
    case MainnetErrorType.NONCE_TOO_LOW:
      // Quick retry for nonce issues
      return 2000;
    case MainnetErrorType.REPLACEMENT_UNDERPRICED:
      // Medium delay for gas price adjustments
      return 5000;
    default:
      return baseDelay;
  }
}

/**
 * Enhanced error logging for mainnet
 */
export function logMainnetError(
  context: string,
  error: any,
  additionalInfo?: Record<string, any>
): void {
  const errorType = classifyMainnetError(error);
  const timestamp = new Date().toISOString();
  
  console.error(`[${timestamp}] ${context} - Error:`, error.message || error);
  
  if (errorType) {
    console.error(`Error Type: ${errorType}`);
    console.error(`Recommendation: ${getErrorRecommendation(errorType)}`);
    console.error(`Retryable: ${isRetryableError(error)}`);
  }
  
  if (additionalInfo) {
    console.error("Additional Info:", additionalInfo);
  }
  
  // Log full error in debug mode
  if (Deno.env.get("DEBUG") === "true") {
    console.error("Full error:", error);
  }
}