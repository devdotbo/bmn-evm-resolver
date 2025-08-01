import { defineChain } from "viem/chains";

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
      http: ["http://localhost:8545"],
      webSocket: ["ws://localhost:8545"],
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
      http: ["http://localhost:8546"],
      webSocket: ["ws://localhost:8546"],
    },
  },
  testnet: true,
});

// Test account addresses (Anvil defaults)
export const ALICE_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
export const BOB_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;

// Private keys (Anvil defaults - NEVER use in production!)
export const ALICE_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
export const BOB_PRIVATE_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as const;