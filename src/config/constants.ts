// System-wide constants for the Bridge-Me-Not resolver

// Profitability settings
export const MIN_PROFIT_BPS = 0; // Demo mode: Accept zero profit orders
export const MAX_SLIPPAGE_BPS = 50; // Maximum 0.5% slippage allowed

// Order limits
export const MAX_CONCURRENT_ORDERS = 10; // Maximum orders Bob can handle at once
export const MAX_ORDER_AGE_SECONDS = 3600; // Maximum age of orders to consider (1 hour)

// Safety deposit settings
export const DEFAULT_SAFETY_DEPOSIT_BPS = 1000; // 10% safety deposit
export const MIN_SAFETY_DEPOSIT = 0n; // Minimum safety deposit amount

// Gas settings
export const GAS_BUFFER_MULTIPLIER = 1.2; // 20% gas buffer for transactions
export const MAX_GAS_PRICE_GWEI = 1000n; // Maximum gas price in gwei

// Monitoring settings
export const BLOCK_POLLING_INTERVAL_MS = 2000; // Poll for new blocks every 2 seconds
export const EVENT_BATCH_SIZE = 100; // Number of events to fetch per batch
export const RECONNECT_DELAY_MS = 5000; // Delay before reconnecting on error

// Transaction settings
export const TX_CONFIRMATION_BLOCKS = 2; // Number of confirmations required
export const TX_RETRY_ATTEMPTS = 3; // Number of retry attempts for failed transactions
export const TX_RETRY_DELAY_MS = 3000; // Delay between retry attempts

// Token decimals (for display purposes)
export const DEFAULT_TOKEN_DECIMALS = 18;

// Order ID settings
export const ORDER_ID_PREFIX = "BMN"; // Prefix for order IDs

// Price feed settings (mock values for testing)
export const MOCK_TOKEN_PRICES: Record<string, number> = {
  TKA: 1.0,  // $1 per TKA
  TKB: 1.0,  // $1 per TKB
  WETH: 2000.0, // $2000 per WETH
};

// Chain names for display
export const CHAIN_NAMES: Record<number, string> = {
  1337: "Local Chain A",
  1338: "Local Chain B",
  1: "Ethereum Mainnet",
  137: "Polygon",
  42161: "Arbitrum One",
  10: "Optimism",
};

// Default RPC URLs loaded from environment
export const DEFAULT_RPC_URLS: Record<number, string> = {
  1337: Deno.env.get("CHAIN_A_RPC_URL") || "http://localhost:8545",
  1338: Deno.env.get("CHAIN_B_RPC_URL") || "http://localhost:8546",
};

// Test mode settings
export const IS_TEST_MODE = Deno.env.get("TEST_MODE") === "true";
export const USE_PRODUCTION_TIMELOCKS = Deno.env.get("USE_PRODUCTION_TIMELOCKS") === "true";

// Logging settings
export const LOG_LEVEL = Deno.env.get("LOG_LEVEL") || "info";
export const ENABLE_DEBUG_LOGS = LOG_LEVEL === "debug";

// File paths
export const ORDER_STATE_FILE = "./resolver-state.json";
export const SECRET_STORAGE_FILE = "./resolver-secrets.json";
export const ALICE_STATE_FILE = "./alice-state.json";

/**
 * Get the minimum profit amount for a given token amount
 * @param amount The token amount
 * @param profitBps The profit in basis points
 * @returns The minimum profit amount
 */
export function calculateMinProfit(amount: bigint, profitBps = MIN_PROFIT_BPS): bigint {
  return (amount * BigInt(profitBps)) / 10000n;
}

/**
 * Get the safety deposit amount for a given token amount
 * @param amount The token amount
 * @param depositBps The deposit in basis points
 * @returns The safety deposit amount
 */
export function calculateSafetyDeposit(
  amount: bigint, 
  depositBps = DEFAULT_SAFETY_DEPOSIT_BPS
): bigint {
  const deposit = (amount * BigInt(depositBps)) / 10000n;
  return deposit > MIN_SAFETY_DEPOSIT ? deposit : MIN_SAFETY_DEPOSIT;
}

/**
 * Format token amount for display
 * @param amount The raw token amount
 * @param decimals The token decimals
 * @returns Formatted string
 */
export function formatTokenAmount(
  amount: bigint,
  decimals = DEFAULT_TOKEN_DECIMALS
): string {
  const divisor = 10n ** BigInt(decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  if (fractionalPart === 0n) {
    return wholePart.toString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  const trimmed = fractionalStr.replace(/0+$/, "");
  
  return `${wholePart}.${trimmed}`;
}