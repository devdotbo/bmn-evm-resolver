import type { Address, PublicClient } from "viem";
import type { OrderParams, Immutables, OrderState } from "../types/index.ts";
import { validateTimelocks } from "./timelocks.ts";
import { createERC20Token } from "./contracts.ts";

/**
 * Validate order parameters before creation
 * @param params The order parameters to validate
 * @throws Error if validation fails
 */
export function validateOrderParams(params: OrderParams): void {
  // Validate amounts
  if (params.srcAmount <= 0n) {
    throw new Error("Source amount must be greater than 0");
  }
  if (params.dstAmount <= 0n) {
    throw new Error("Destination amount must be greater than 0");
  }
  if (params.safetyDeposit < 0n) {
    throw new Error("Safety deposit cannot be negative");
  }

  // Validate addresses
  if (!isValidAddress(params.srcToken)) {
    throw new Error("Invalid source token address");
  }
  if (!isValidAddress(params.dstToken)) {
    throw new Error("Invalid destination token address");
  }

  // Validate chains
  if (params.srcChainId === params.dstChainId) {
    throw new Error("Source and destination chains must be different");
  }

  // Validate secret
  if (params.secret.length !== 66) { // 0x + 64 hex chars
    throw new Error("Secret must be 32 bytes");
  }
}

/**
 * Validate order immutables
 * @param immutables The immutables to validate
 * @throws Error if validation fails
 */
export function validateImmutables(immutables: Immutables): void {
  // Validate addresses
  if (!isValidAddress(immutables.maker)) {
    throw new Error("Invalid maker address");
  }
  if (!isValidAddress(immutables.token)) {
    throw new Error("Invalid token address");
  }
  if (immutables.taker !== "0x0000000000000000000000000000000000000000" && 
      !isValidAddress(immutables.taker)) {
    throw new Error("Invalid taker address");
  }

  // Validate amounts
  if (immutables.amount <= 0n) {
    throw new Error("Amount must be greater than 0");
  }
  if (immutables.safetyDeposit < 0n) {
    throw new Error("Safety deposit cannot be negative");
  }

  // Validate hashes
  if (immutables.orderHash.length !== 66) {
    throw new Error("Invalid order hash");
  }
  if (immutables.hashlock.length !== 66) {
    throw new Error("Invalid hashlock");
  }

  // Validate timelocks
  validateTimelocks(immutables.timelocks);
}

/**
 * Check if an address is valid
 * @param address The address to check
 * @returns True if valid
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate that a user has sufficient token balance
 * @param tokenAddress The token address
 * @param userAddress The user address
 * @param requiredAmount The required amount
 * @param publicClient The public client
 * @returns True if sufficient balance, throws otherwise
 */
export async function validateTokenBalance(
  tokenAddress: Address,
  userAddress: Address,
  requiredAmount: bigint,
  publicClient: PublicClient
): Promise<boolean> {
  const token = createERC20Token(tokenAddress, publicClient);
  const balance = await token.read.balanceOf([userAddress]);
  
  if (balance < requiredAmount) {
    throw new Error(
      `Insufficient token balance. Required: ${requiredAmount}, Available: ${balance}`
    );
  }
  
  return true;
}

/**
 * Validate that a user has approved sufficient token allowance
 * @param tokenAddress The token address
 * @param ownerAddress The token owner address
 * @param spenderAddress The spender address
 * @param requiredAmount The required allowance
 * @param publicClient The public client
 * @returns True if sufficient allowance, throws otherwise
 */
export async function validateTokenAllowance(
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address,
  requiredAmount: bigint,
  publicClient: PublicClient
): Promise<boolean> {
  const token = createERC20Token(tokenAddress, publicClient);
  const allowance = await token.read.allowance([ownerAddress, spenderAddress]);
  
  if (allowance < requiredAmount) {
    throw new Error(
      `Insufficient token allowance. Required: ${requiredAmount}, Approved: ${allowance}`
    );
  }
  
  return true;
}

/**
 * Validate order state for withdrawal
 * @param orderState The order state
 * @throws Error if not ready for withdrawal
 */
export function validateForWithdrawal(orderState: OrderState): void {
  if (!orderState.actualDstEscrowAddress && !orderState.dstEscrowAddress) {
    throw new Error("Destination escrow not deployed");
  }
  
  if (orderState.secretRevealed) {
    throw new Error("Secret already revealed");
  }
  
  if (orderState.status === "CANCELLED" || orderState.status === "FAILED") {
    throw new Error(`Order is ${orderState.status.toLowerCase()}`);
  }
}

/**
 * Validate order profitability for resolver
 * @param srcAmount Source amount to receive
 * @param dstAmount Destination amount to provide
 * @param minProfitBps Minimum profit in basis points
 * @param srcTokenPrice Source token price in USD
 * @param dstTokenPrice Destination token price in USD
 * @returns True if profitable
 */
export function validateProfitability(
  srcAmount: bigint,
  dstAmount: bigint,
  minProfitBps: number,
  srcTokenPrice: number,
  dstTokenPrice: number
): boolean {
  // Calculate values in USD
  const srcValueUsd = Number(srcAmount) * srcTokenPrice;
  const dstValueUsd = Number(dstAmount) * dstTokenPrice;
  
  // Calculate profit in basis points (1 bp = 0.01%)
  const profitBps = ((srcValueUsd - dstValueUsd) / dstValueUsd) * 10000;
  
  return profitBps >= minProfitBps;
}

/**
 * Validate chain ID is supported
 * @param chainId The chain ID to validate
 * @param supportedChainIds List of supported chain IDs
 * @throws Error if not supported
 */
export function validateChainId(
  chainId: number,
  supportedChainIds: number[]
): void {
  if (!supportedChainIds.includes(chainId)) {
    throw new Error(
      `Chain ID ${chainId} not supported. Supported chains: ${supportedChainIds.join(", ")}`
    );
  }
}