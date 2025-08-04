import type { Chain } from "viem";
import { baseMainnet, etherlinkMainnet } from "./chains.ts";
import { CREATE3_ADDRESSES } from "./contracts.ts";
import { SAFETY_DEPOSIT_ETH } from "./constants.ts";

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
  
  // Contract addresses (same on both chains via CREATE3)
  CONTRACTS: {
    // Production deployment - CREATE3 deterministic addresses
    crossChainEscrowFactory: CREATE3_ADDRESSES.ESCROW_FACTORY,
    
    // Test deployment for development
    testEscrowFactory: CREATE3_ADDRESSES.ESCROW_FACTORY, // Same as production for now
    
    // BMN Token (same on both chains via CREATE3)
    bmnToken: CREATE3_ADDRESSES.BMN_TOKEN,
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
  SAFETY_DEPOSIT: SAFETY_DEPOSIT_ETH.toString(), // 0.00002 ETH (~$0.03-0.04 at $2000/ETH)
  
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