import type { Immutables, OrderParams } from "../types/index.ts";
import { 
  MIN_PROFIT_BPS, 
  MAX_SLIPPAGE_BPS,
  MOCK_TOKEN_PRICES,
  DEFAULT_TOKEN_DECIMALS 
} from "../config/constants.ts";
import { BMN_TOKEN_CONFIG } from "../config/contracts.ts";

/**
 * Profitability calculator for cross-chain orders
 */
export class ProfitabilityCalculator {
  private tokenPrices: Map<string, number>;
  private minProfitBps: number;
  private maxSlippageBps: number;

  constructor(
    minProfitBps = MIN_PROFIT_BPS,
    maxSlippageBps = MAX_SLIPPAGE_BPS,
    tokenPrices?: Record<string, number>
  ) {
    this.minProfitBps = minProfitBps;
    this.maxSlippageBps = maxSlippageBps;
    this.tokenPrices = new Map(Object.entries({
      ...MOCK_TOKEN_PRICES,
      BMN: 0.1, // Default BMN price
      ...tokenPrices, // Override with custom prices
    }));
  }

  /**
   * Update token price
   * @param token Token symbol
   * @param price Price in USD
   */
  updateTokenPrice(token: string, price: number): void {
    this.tokenPrices.set(token, price);
  }

  /**
   * Get token price
   * @param token Token symbol
   * @returns Price in USD or undefined
   */
  getTokenPrice(token: string): number | undefined {
    return this.tokenPrices.get(token);
  }

  /**
   * Check if an order is profitable for the resolver
   * @param srcToken Source token symbol
   * @param srcAmount Amount to receive on source chain
   * @param dstToken Destination token symbol
   * @param dstAmount Amount to provide on destination chain
   * @param safetyDeposit Safety deposit amount (in token or ETH)
   * @param isEthDeposit Whether safety deposit is in ETH
   * @returns Profitability analysis
   */
  analyzeOrder(
    srcToken: string,
    srcAmount: bigint,
    dstToken: string,
    dstAmount: bigint,
    safetyDeposit: bigint,
    isEthDeposit = false
  ): ProfitabilityAnalysis {
    const srcPrice = this.tokenPrices.get(srcToken) || 0;
    const dstPrice = this.tokenPrices.get(dstToken) || 0;

    if (srcPrice === 0 || dstPrice === 0) {
      return {
        isProfitable: false,
        profitUsd: 0,
        profitBps: 0,
        srcValueUsd: 0,
        dstValueUsd: 0,
        reason: "Missing token price data",
      };
    }

    // Calculate values in USD
    const srcValueUsd = this.calculateUsdValue(srcAmount, srcPrice);
    const dstValueUsd = this.calculateUsdValue(dstAmount, dstPrice);
    
    // Handle safety deposit (can be in ETH or token)
    const safetyDepositUsd = isEthDeposit
      ? this.calculateUsdValue(safetyDeposit, this.tokenPrices.get("WETH") || 2000, 18)
      : this.calculateUsdValue(safetyDeposit, dstPrice);

    // Calculate profit
    const grossProfitUsd = srcValueUsd - dstValueUsd;
    const netProfitUsd = grossProfitUsd - safetyDepositUsd;
    const profitBps = dstValueUsd > 0 
      ? Math.floor((netProfitUsd / dstValueUsd) * 10000)
      : 0;

    // Check profitability
    const isProfitable = profitBps >= this.minProfitBps;
    
    return {
      isProfitable,
      profitUsd: netProfitUsd,
      profitBps,
      srcValueUsd,
      dstValueUsd,
      safetyDepositUsd,
      grossProfitUsd,
      netProfitUsd,
      reason: isProfitable 
        ? "Order is profitable" 
        : `Insufficient profit: ${profitBps} bps < ${this.minProfitBps} bps required`,
    };
  }

  /**
   * Check if an order is within acceptable slippage
   * @param expectedAmount Expected amount
   * @param actualAmount Actual amount
   * @returns True if within slippage tolerance
   */
  checkSlippage(expectedAmount: bigint, actualAmount: bigint): boolean {
    if (expectedAmount === 0n) return false;
    
    const slippageBps = Number(
      ((expectedAmount - actualAmount) * 10000n) / expectedAmount
    );
    
    return Math.abs(slippageBps) <= this.maxSlippageBps;
  }

  /**
   * Calculate optimal order size based on available liquidity
   * @param availableLiquidity Available liquidity in tokens
   * @param requestedAmount Requested amount
   * @param reservePercent Percentage to keep in reserve (0-100)
   * @returns Optimal order size
   */
  calculateOptimalOrderSize(
    availableLiquidity: bigint,
    requestedAmount: bigint,
    reservePercent = 10
  ): bigint {
    const maxAmount = (availableLiquidity * BigInt(100 - reservePercent)) / 100n;
    return requestedAmount > maxAmount ? maxAmount : requestedAmount;
  }

  /**
   * Estimate gas costs for the order
   * @param srcChainGasPrice Gas price on source chain (in gwei)
   * @param dstChainGasPrice Gas price on destination chain (in gwei)
   * @returns Estimated gas costs in USD
   */
  estimateGasCosts(
    srcChainGasPrice: bigint,
    dstChainGasPrice: bigint
  ): GasCostEstimate {
    // Estimated gas usage (these are approximations)
    const DST_DEPLOY_GAS = 300000n;  // Deploy escrow dst
    const DST_LOCK_GAS = 100000n;    // Lock tokens
    const SRC_WITHDRAW_GAS = 150000n; // Withdraw from src
    
    const ethPrice = this.tokenPrices.get("WETH") || 2000;
    
    // Calculate costs in ETH
    const dstCostWei = (DST_DEPLOY_GAS + DST_LOCK_GAS) * dstChainGasPrice * 1000000000n; // gwei to wei
    const srcCostWei = SRC_WITHDRAW_GAS * srcChainGasPrice * 1000000000n;
    
    // Convert to USD
    const dstCostUsd = Number(dstCostWei) / 1e18 * ethPrice;
    const srcCostUsd = Number(srcCostWei) / 1e18 * ethPrice;
    const totalCostUsd = dstCostUsd + srcCostUsd;
    
    return {
      dstChainCostUsd: dstCostUsd,
      srcChainCostUsd: srcCostUsd,
      totalCostUsd,
      dstChainGasUsed: DST_DEPLOY_GAS + DST_LOCK_GAS,
      srcChainGasUsed: SRC_WITHDRAW_GAS,
    };
  }

  /**
   * Calculate USD value from token amount
   * @param amount Token amount (with decimals)
   * @param priceUsd Price per token in USD
   * @param decimals Token decimals
   * @returns USD value
   */
  private calculateUsdValue(
    amount: bigint,
    priceUsd: number,
    decimals = DEFAULT_TOKEN_DECIMALS
  ): number {
    return Number(amount) / Math.pow(10, decimals) * priceUsd;
  }

  /**
   * Get minimum required profit amount
   * @param investmentAmount Amount being invested
   * @returns Minimum profit required
   */
  getMinimumProfit(investmentAmount: bigint): bigint {
    return (investmentAmount * BigInt(this.minProfitBps)) / 10000n;
  }

  /**
   * Format profitability analysis for display
   * @param analysis The analysis to format
   * @returns Formatted string
   */
  formatAnalysis(analysis: ProfitabilityAnalysis): string {
    const lines = [
      `Profitable: ${analysis.isProfitable ? "Yes" : "No"}`,
      `Source Value: $${analysis.srcValueUsd.toFixed(2)}`,
      `Destination Value: $${analysis.dstValueUsd.toFixed(2)}`,
      `Net Profit: $${analysis.netProfitUsd?.toFixed(2) || analysis.profitUsd.toFixed(2)}`,
      `Profit Margin: ${(analysis.profitBps / 100).toFixed(2)}%`,
      `Reason: ${analysis.reason}`,
    ];
    
    if (analysis.safetyDepositUsd) {
      lines.splice(3, 0, `Safety Deposit: $${analysis.safetyDepositUsd.toFixed(2)}`);
    }
    
    return lines.join("\n");
  }
}

// Type definitions
export interface ProfitabilityAnalysis {
  isProfitable: boolean;
  profitUsd: number;
  profitBps: number;
  srcValueUsd: number;
  dstValueUsd: number;
  safetyDepositUsd?: number;
  grossProfitUsd?: number;
  netProfitUsd?: number;
  reason: string;
}

export interface GasCostEstimate {
  dstChainCostUsd: number;
  srcChainCostUsd: number;
  totalCostUsd: number;
  dstChainGasUsed: bigint;
  srcChainGasUsed: bigint;
}