import { defineChain } from "viem";
import type { Address } from "viem";

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

// Test account addresses loaded from environment
export const ALICE_ADDRESS = (Deno.env.get("ALICE_ADDRESS") || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8") as Address;
export const BOB_ADDRESS = (Deno.env.get("BOB_ADDRESS") || "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC") as Address;