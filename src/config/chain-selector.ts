import { defineChain, type Chain } from "viem";
import { chainA, chainB, baseMainnet, optimismMainnet } from "./chains.ts";
import { getMainnetChains as getMainnetChainsConfig, useTestFactory } from "./mainnet.ts";

export type NetworkMode = "testnet" | "mainnet";

/**
 * Get the network mode from environment
 */
export function getNetworkMode(): NetworkMode {
  const mode = Deno.env.get("NETWORK_MODE")?.toLowerCase();
  if (mode === "mainnet") {
    return "mainnet";
  }
  return "testnet"; // Default to testnet
}

/**
 * Check if currently in mainnet mode
 */
export function isMainnetMode(): boolean {
  return getNetworkMode() === "mainnet";
}

/**
 * Get chain configurations based on network mode
 */
export function getChains(): { srcChain: Chain; dstChain: Chain; srcChainId: number; dstChainId: number } {
  const mode = getNetworkMode();
  
  if (mode === "mainnet") {
    const testMode = useTestFactory() ? " (TEST FACTORY)" : "";
    console.log(`🌐 Using MAINNET configuration (Base & Optimism)${testMode}`);
    return getMainnetChainsConfig(false);
  } else {
    console.log("🧪 Using TESTNET configuration (Local Anvil chains)");
    return {
      srcChain: chainA,
      dstChain: chainB,
      srcChainId: 1337,
      dstChainId: 1338,
    };
  }
}

/**
 * Get chain by ID
 */
export function getChainById(chainId: number): Chain {
  switch (chainId) {
    case 1337:
      return chainA;
    case 1338:
      return chainB;
    case 8453:
      return baseMainnet;
    case 10:
      return optimismMainnet;
    default:
      throw new Error(`Unknown chain ID: ${chainId}`);
  }
}

/**
 * Check if a chain ID is a mainnet chain
 */
export function isMainnetChain(chainId: number): boolean {
  return chainId === 8453 || chainId === 10;
}

/**
 * Get chain name by ID
 */
export function getChainName(chainId: number): string {
  switch (chainId) {
    case 1337:
      return "Local Chain A";
    case 1338:
      return "Local Chain B";
    case 8453:
      return "Base";
    case 10:
      return "Optimism";
    default:
      return `Chain ${chainId}`;
  }
}

/**
 * Get chains for reverse direction (Optimism to Base)
 */
export function getReverseChains(): { srcChain: Chain; dstChain: Chain; srcChainId: number; dstChainId: number } {
  const mode = getNetworkMode();
  
  if (mode === "mainnet") {
    const testMode = useTestFactory() ? " (TEST FACTORY)" : "";
    console.log(`🌐 Using MAINNET configuration (Optimism → Base)${testMode}`);
    return getMainnetChainsConfig(true);
  } else {
    console.log("🧪 Using TESTNET configuration (Chain B → Chain A)");
    return {
      srcChain: chainB,
      dstChain: chainA,
      srcChainId: 1338,
      dstChainId: 1337,
    };
  }
}