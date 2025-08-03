/**
 * Gas estimation and management utilities for mainnet
 */

import type { PublicClient } from "viem";
import { isMainnetMode } from "../config/chain-selector.ts";

// Gas multipliers for different operations
const GAS_MULTIPLIERS = {
  // Testnet multipliers (more generous)
  testnet: {
    default: 1.2,          // 20% buffer
    approval: 1.1,         // 10% buffer for approvals
    escrowDeploy: 1.5,     // 50% buffer for deployment
    withdrawal: 1.3,       // 30% buffer for withdrawals
  },
  // Mainnet multipliers (more conservative)
  mainnet: {
    default: 1.5,          // 50% buffer
    approval: 1.3,         // 30% buffer for approvals
    escrowDeploy: 2.0,     // 100% buffer for deployment
    withdrawal: 1.6,       // 60% buffer for withdrawals
  },
};

// Gas price strategies
export enum GasPriceStrategy {
  FAST = "fast",       // High priority
  STANDARD = "standard", // Normal priority
  SLOW = "slow",       // Low priority
}

/**
 * Get gas multiplier for an operation type
 */
export function getGasMultiplier(operationType: keyof typeof GAS_MULTIPLIERS.testnet): number {
  const multipliers = isMainnetMode() ? GAS_MULTIPLIERS.mainnet : GAS_MULTIPLIERS.testnet;
  return multipliers[operationType] || multipliers.default;
}

/**
 * Estimate gas with appropriate buffer
 */
export async function estimateGasWithBuffer(
  publicClient: PublicClient,
  transaction: any,
  operationType: keyof typeof GAS_MULTIPLIERS.testnet = "default"
): Promise<bigint> {
  try {
    // Get base estimate
    const baseEstimate = await publicClient.estimateGas(transaction);
    
    // Apply multiplier
    const multiplier = getGasMultiplier(operationType);
    const bufferedEstimate = BigInt(Math.ceil(Number(baseEstimate) * multiplier));
    
    // Apply minimum gas limits for mainnet
    if (isMainnetMode()) {
      const minGasLimits: Record<string, bigint> = {
        approval: 60000n,
        escrowDeploy: 500000n,
        withdrawal: 200000n,
        default: 100000n,
      };
      
      const minLimit = minGasLimits[operationType] || minGasLimits.default;
      return bufferedEstimate > minLimit ? bufferedEstimate : minLimit;
    }
    
    return bufferedEstimate;
  } catch (error) {
    console.error("Gas estimation failed:", error);
    
    // Fallback gas limits
    const fallbackLimits: Record<string, bigint> = {
      approval: isMainnetMode() ? 100000n : 50000n,
      escrowDeploy: isMainnetMode() ? 1000000n : 500000n,
      withdrawal: isMainnetMode() ? 300000n : 150000n,
      default: isMainnetMode() ? 200000n : 100000n,
    };
    
    return fallbackLimits[operationType] || fallbackLimits.default;
  }
}

/**
 * Get recommended gas price based on strategy
 */
export async function getGasPrice(
  publicClient: PublicClient,
  strategy: GasPriceStrategy = GasPriceStrategy.STANDARD
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  try {
    // Get current fee data
    const feeData = await publicClient.estimateFeesPerGas();
    
    if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
      throw new Error("Unable to fetch fee data");
    }
    
    let multiplier = 1.0;
    
    // Apply strategy multipliers
    if (isMainnetMode()) {
      switch (strategy) {
        case GasPriceStrategy.FAST:
          multiplier = 1.5; // 50% higher for fast
          break;
        case GasPriceStrategy.STANDARD:
          multiplier = 1.2; // 20% higher for standard
          break;
        case GasPriceStrategy.SLOW:
          multiplier = 1.0; // Base price for slow
          break;
      }
    } else {
      // Testnet can use lower multipliers
      switch (strategy) {
        case GasPriceStrategy.FAST:
          multiplier = 1.2;
          break;
        case GasPriceStrategy.STANDARD:
          multiplier = 1.1;
          break;
        case GasPriceStrategy.SLOW:
          multiplier = 1.0;
          break;
      }
    }
    
    return {
      maxFeePerGas: BigInt(Math.ceil(Number(feeData.maxFeePerGas) * multiplier)),
      maxPriorityFeePerGas: BigInt(Math.ceil(Number(feeData.maxPriorityFeePerGas) * multiplier)),
    };
  } catch (error) {
    console.error("Failed to get gas price:", error);
    
    // Fallback gas prices (in gwei)
    if (isMainnetMode()) {
      return {
        maxFeePerGas: BigInt(50 * 1e9), // 50 gwei
        maxPriorityFeePerGas: BigInt(2 * 1e9), // 2 gwei
      };
    } else {
      return {
        maxFeePerGas: BigInt(10 * 1e9), // 10 gwei
        maxPriorityFeePerGas: BigInt(1 * 1e9), // 1 gwei
      };
    }
  }
}

/**
 * Check if account has sufficient gas
 */
export async function checkSufficientGas(
  publicClient: PublicClient,
  account: string,
  estimatedGas: bigint,
  gasPrice: { maxFeePerGas: bigint }
): Promise<{ sufficient: boolean; required: bigint; balance: bigint }> {
  const balance = await publicClient.getBalance({ address: account as `0x${string}` });
  const required = estimatedGas * gasPrice.maxFeePerGas;
  
  return {
    sufficient: balance >= required,
    required,
    balance,
  };
}

/**
 * Format gas amount for display
 */
export function formatGas(gasAmount: bigint): string {
  const gwei = Number(gasAmount) / 1e9;
  if (gwei < 1) {
    return `${gasAmount} wei`;
  } else if (gwei < 1000) {
    return `${gwei.toFixed(2)} gwei`;
  } else {
    const eth = gwei / 1e9;
    return `${eth.toFixed(6)} ETH`;
  }
}