import type { Chain } from "viem";
import { baseMainnet, etherlinkMainnet } from "./chains.ts";

/**
 * Mainnet configuration for Bridge-Me-Not resolver
 */
export const MAINNET_CONFIG = {
  // Base Mainnet (source chain for normal flow)
  BASE: {
    chainId: 8453,
    chain: baseMainnet,
    rpcUrl: Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org",
    wsUrl: Deno.env.get("BASE_WS_URL") || "wss://base-mainnet.g.alchemy.com/v2/{your-api-key}",
    explorer: "https://basescan.org",
  },
  
  // Etherlink Mainnet (destination chain for normal flow)
  ETHERLINK: {
    chainId: 42793,
    chain: etherlinkMainnet,
    rpcUrl: Deno.env.get("ETHERLINK_RPC_URL") || "https://node.mainnet.etherlink.com",
    wsUrl: Deno.env.get("ETHERLINK_WS_URL") || "wss://node.mainnet.etherlink.com",
    explorer: "https://explorer.etherlink.com",
  },
  
  // Contract addresses (same on both chains via CREATE2)
  CONTRACTS: {
    // Production deployment
    crossChainEscrowFactory: "0xc72ed1E8a0649e51Cd046a0FfccC8f8c0bf385Fa",
    
    // Test deployment for development
    testEscrowFactory: "0xc72ed1E8a0649e51Cd046a0FfccC8f8c0bf385Fa", // Will be updated after deployment
    
    // BMN Token (same on both chains)
    bmnToken: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1",
  },
  
  // Timelock configuration (in seconds)
  TIMELOCKS: {
    // Source chain timelocks
    srcWithdrawal: 300,         // 0-5 min (Taker only)
    srcPublicWithdrawal: 600,   // 5-10 min (Anyone)
    srcCancellation: 900,       // 10-15 min (Maker only)
    srcPublicCancellation: 900, // 15+ min (Anyone)
    
    // Destination chain timelocks (with offsets)
    dstWithdrawal: 600,         // 10 min
    dstCancellation: 1200,      // 20 min
  },
  
  // Safety deposit amount (in wei)
  SAFETY_DEPOSIT: "10000000000000", // 0.00001 ETH
  
  // Token decimals
  BMN_DECIMALS: 18,
};

/**
 * Get mainnet chain configuration
 * @param reverse If true, swap source and destination chains
 * @returns Chain configuration
 */
export function getMainnetChains(reverse = false): {
  srcChainId: number;
  dstChainId: number;
  srcChain: Chain;
  dstChain: Chain;
} {
  if (reverse) {
    return {
      srcChainId: MAINNET_CONFIG.ETHERLINK.chainId,
      dstChainId: MAINNET_CONFIG.BASE.chainId,
      srcChain: etherlinkMainnet,
      dstChain: baseMainnet,
    };
  }
  
  return {
    srcChainId: MAINNET_CONFIG.BASE.chainId,
    dstChainId: MAINNET_CONFIG.ETHERLINK.chainId,
    srcChain: baseMainnet,
    dstChain: etherlinkMainnet,
  };
}

/**
 * Check if running in mainnet mode
 * @returns True if mainnet mode is enabled
 */
export function isMainnetMode(): boolean {
  const network = Deno.env.get("NETWORK_MODE");
  return network === "mainnet" || network === "production";
}

/**
 * Check if using test factory (for development)
 * @returns True if test factory mode is enabled
 */
export function useTestFactory(): boolean {
  return Deno.env.get("USE_TEST_FACTORY") === "true";
}

/**
 * Get the appropriate factory address
 * @returns Factory address based on configuration
 */
export function getFactoryAddress(): string {
  if (useTestFactory()) {
    return MAINNET_CONFIG.CONTRACTS.testEscrowFactory;
  }
  return MAINNET_CONFIG.CONTRACTS.crossChainEscrowFactory;
}