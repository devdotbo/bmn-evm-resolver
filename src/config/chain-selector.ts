import { defineChain, type Chain } from "viem";
import { chainA, chainB, baseMainnet, etherlinkMainnet } from "./chains.ts";

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
 * Get chain configurations based on network mode
 */
export function getChains(): { srcChain: Chain; dstChain: Chain; srcChainId: number; dstChainId: number } {
  const mode = getNetworkMode();
  
  if (mode === "mainnet") {
    console.log("🌐 Using MAINNET configuration (Base & Etherlink)");
    return {
      srcChain: baseMainnet,
      dstChain: etherlinkMainnet,
      srcChainId: 8453,
      dstChainId: 42793,
    };
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
    case 42793:
      return etherlinkMainnet;
    default:
      throw new Error(`Unknown chain ID: ${chainId}`);
  }
}

/**
 * Check if a chain ID is a mainnet chain
 */
export function isMainnetChain(chainId: number): boolean {
  return chainId === 8453 || chainId === 42793;
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
    case 42793:
      return "Etherlink";
    default:
      return `Chain ${chainId}`;
  }
}