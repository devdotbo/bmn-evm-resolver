import { defineChain } from "viem";
import type { Address } from "viem";
import { CONTRACT_ADDRESSES_EXPORTS } from "./contracts.ts";

// Re-export CREATE3-deployed contract addresses for convenience
export const ESCROW_FACTORY_ADDRESS = CONTRACT_ADDRESSES_EXPORTS.ESCROW_FACTORY;
export const BMN_TOKEN_ADDRESS = CONTRACT_ADDRESSES_EXPORTS.BMN_TOKEN;

// Get Ankr API key for mainnet
const ANKR_API_KEY = Deno.env.get("ANKR_API_KEY") || "";

export const chainA = defineChain({
  id: 1337,
  name: "Local Chain A",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [Deno.env.get("CHAIN_A_RPC_URL") || "http://localhost:8545"],
      webSocket: [Deno.env.get("CHAIN_A_WS_URL") || "ws://localhost:8545"],
    },
  },
  testnet: true,
});

export const chainB = defineChain({
  id: 1338,
  name: "Local Chain B",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [Deno.env.get("CHAIN_B_RPC_URL") || "http://localhost:8546"],
      webSocket: [Deno.env.get("CHAIN_B_WS_URL") || "ws://localhost:8546"],
    },
  },
  testnet: true,
});

// Base Mainnet
export const baseMainnet = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [
        Deno.env.get("BASE_RPC_URL") ||
        `https://rpc.ankr.com/base/${ANKR_API_KEY}`,
      ],
      webSocket: [
        Deno.env.get("BASE_WS_URL") ||
        `wss://rpc.ankr.com/base/ws/${ANKR_API_KEY}`,
      ],
    },
  },
  testnet: false,
  blockExplorers: {
    default: { name: "BaseScan", url: "https://basescan.org" },
  },
});

// Optimism Mainnet
export const optimismMainnet = defineChain({
  id: 10,
  name: "Optimism",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [
        Deno.env.get("OPTIMISM_RPC_URL") ||
        `https://rpc.ankr.com/optimism/${ANKR_API_KEY}`,
      ],
      webSocket: [
        Deno.env.get("OPTIMISM_WS_URL") ||
        `wss://rpc.ankr.com/optimism/ws/${ANKR_API_KEY}`,
      ],
    },
  },
  testnet: false,
  blockExplorers: {
    default: {
      name: "Optimistic Etherscan",
      url: "https://optimistic.etherscan.io",
    },
  },
});

// Test account addresses loaded from environment
export const ALICE_ADDRESS = (Deno.env.get("ALICE_ADDRESS") ||
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8") as Address;
export const BOB_ADDRESS = (Deno.env.get("BOB_ADDRESS") ||
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC") as Address;
