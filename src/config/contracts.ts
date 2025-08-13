import type { Address } from "viem";
import type { ContractAddresses } from "../types/contracts.ts";
import { parseUnits } from "viem";

// Placeholder addresses - will be replaced with actual deployed addresses
// These are valid Ethereum addresses for type safety
export const PLACEHOLDER_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000";

// CREATE3-deployed contract addresses (deterministic across all chains)
export const CREATE3_ADDRESSES = {
  // UPDATED: Factory v2.3.0 address (EIP-712 resolver-signed actions)
  ESCROW_FACTORY_V2: (Deno.env.get("MAINNET_ESCROW_FACTORY_V2") ||
    "0xdebE6F4bC7BaAD2266603Ba7AfEB3BB6dDA9FE0A") as Address, // SimplifiedEscrowFactory v2.3.0

  // Legacy factory addresses (INSECURE - TO BE DEPRECATED)
  ESCROW_FACTORY_V1_BASE:
    "0x2B2d52Cf0080a01f457A4f64F41cbca500f787b1" as Address, // v1.1.0 Base (INSECURE)
  ESCROW_FACTORY_V1_OPTIMISM:
    "0xB916C3edbFe574fFCBa688A6B92F72106479bD6c" as Address, // v1.1.0 Optimism (INSECURE)

  BMN_TOKEN: (Deno.env.get("MAINNET_BMN_TOKEN") ||
    "0x8287CD2aC7E227D9D927F998EB600a0683a832A1") as Address, // BMN Token
  RESOLVER_FACTORY: (Deno.env.get("MAINNET_RESOLVER_FACTORY") ||
    "0xe767202fD26104267CFD8bD8cfBd1A44450DC343") as Address, // Resolver Factory

  // Limit Order Protocol addresses (from bmn-evm-contracts-limit-order)
  LIMIT_ORDER_PROTOCOL_OPTIMISM:
    (Deno.env.get("OPTIMISM_LIMIT_ORDER_PROTOCOL") ||
      "0xe767105dcfB3034a346578afd2aFD8e583171489") as Address,
  LIMIT_ORDER_PROTOCOL_BASE:
    "0xe767105dcfB3034a346578afd2aFD8e583171489" as Address, // Same address on both chains

  // Implementation addresses (for reference)
  ESCROW_SRC_IMPL: (Deno.env.get("MAINNET_ESCROW_SRC_IMPL") ||
    "0x77CC1A51dC5855bcF0d9f1c1FceaeE7fb855a535") as Address,
  ESCROW_DST_IMPL: (Deno.env.get("MAINNET_ESCROW_DST_IMPL") ||
    "0x36938b7899A17362520AA741C0E0dA0c8EfE5e3b") as Address,

  // Old v1 factory (deprecated)
  FACTORY_V1: (Deno.env.get("OLD_FACTORY_V1") ||
    "0x75ee15F6BfDd06Aee499ed95e8D92a114659f4d1") as Address, // v1 factory (deprecated)
} as const;

// BMN Token configuration
export const BMN_TOKEN_CONFIG = {
  address: CREATE3_ADDRESSES.BMN_TOKEN,
  decimals: 18,
  symbol: "BMN",
  name: "Bridge-Me-Not",
  totalSupply: parseUnits("20000000", 18), // 20 million BMN tokens
} as const;

// Export for convenience
export const CONTRACT_ADDRESSES_EXPORTS = {
  ESCROW_FACTORY: CREATE3_ADDRESSES.ESCROW_FACTORY_V2, // v2.3.0
  BMN_TOKEN: CREATE3_ADDRESSES.BMN_TOKEN,
  RESOLVER_FACTORY: CREATE3_ADDRESSES.RESOLVER_FACTORY,
  // Limit Order Protocol addresses
  LIMIT_ORDER_PROTOCOL_OPTIMISM:
    CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_OPTIMISM,
  LIMIT_ORDER_PROTOCOL_BASE: CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_BASE,
} as const;

// Contract addresses for each chain
export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  // Local Chain A (Anvil on port 8545)
  1337: {
    escrowFactory: PLACEHOLDER_ADDRESS,
    limitOrderProtocol: PLACEHOLDER_ADDRESS,
    tokens: {
      TKA: PLACEHOLDER_ADDRESS, // Token A (source chain token)
      TKB: PLACEHOLDER_ADDRESS, // Token B (for swaps)
      WETH: PLACEHOLDER_ADDRESS, // Wrapped ETH
    },
  },

  // Local Chain B (Anvil on port 8546)
  1338: {
    escrowFactory: PLACEHOLDER_ADDRESS,
    limitOrderProtocol: PLACEHOLDER_ADDRESS,
    tokens: {
      TKA: PLACEHOLDER_ADDRESS, // Token A (for swaps)
      TKB: PLACEHOLDER_ADDRESS, // Token B (destination chain token)
      WETH: PLACEHOLDER_ADDRESS, // Wrapped ETH
    },
  },

  // Base Mainnet
  8453: {
    escrowFactory: (Deno.env.get("BASE_ESCROW_FACTORY") ||
      CREATE3_ADDRESSES.ESCROW_FACTORY_V2) as Address, // SimplifiedEscrowFactory v2.3.0
    limitOrderProtocol: (Deno.env.get("BASE_LIMIT_ORDER_PROTOCOL") ||
      CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_BASE) as Address, // SimpleLimitOrderProtocol (deployed)
    tokens: {
      BMN: (Deno.env.get("BASE_TOKEN_BMN") ||
        CREATE3_ADDRESSES.BMN_TOKEN) as Address, // BMN Token - CREATE3 deterministic address, 18 decimals, 20M supply
      // Add other tokens as needed
    },
  },

  // Optimism Mainnet
  10: {
    escrowFactory: (Deno.env.get("OPTIMISM_ESCROW_FACTORY") ||
      CREATE3_ADDRESSES.ESCROW_FACTORY_V2) as Address, // SimplifiedEscrowFactory v2.3.0
    limitOrderProtocol: (Deno.env.get("OPTIMISM_LIMIT_ORDER_PROTOCOL") ||
      CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_OPTIMISM) as Address, // SimpleLimitOrderProtocol (deployed)
    tokens: {
      BMN: (Deno.env.get("OPTIMISM_TOKEN_BMN") ||
        CREATE3_ADDRESSES.BMN_TOKEN) as Address, // BMN Token - CREATE3 deterministic address, 18 decimals, 20M supply
      // Add other tokens as needed
    },
  },
};

/**
 * Get contract addresses for a specific chain
 * @param chainId The chain ID
 * @returns Contract addresses for the chain
 */
export function getContractAddresses(chainId: number): ContractAddresses {
  const addresses = CONTRACT_ADDRESSES[chainId];
  if (!addresses) {
    throw new Error(`No contract addresses configured for chain ${chainId}`);
  }
  return addresses;
}

/**
 * Update contract addresses for a chain
 * This is useful for dynamic configuration after deployment
 * @param chainId The chain ID
 * @param addresses The new addresses
 */
export function updateContractAddresses(
  chainId: number,
  addresses: Partial<ContractAddresses>,
): void {
  if (!CONTRACT_ADDRESSES[chainId]) {
    CONTRACT_ADDRESSES[chainId] = {
      escrowFactory: PLACEHOLDER_ADDRESS,
      limitOrderProtocol: PLACEHOLDER_ADDRESS,
      tokens: {},
    };
  }

  CONTRACT_ADDRESSES[chainId] = {
    ...CONTRACT_ADDRESSES[chainId],
    ...addresses,
    tokens: {
      ...CONTRACT_ADDRESSES[chainId].tokens,
      ...(addresses.tokens || {}),
    },
  };
}

/**
 * Check if contract addresses are configured (not placeholders)
 * @param chainId The chain ID
 * @returns True if configured
 */
export function areContractsConfigured(chainId: number): boolean {
  const addresses = CONTRACT_ADDRESSES[chainId];
  if (!addresses) return false;

  // For mainnet chains, we only need escrowFactory and tokens
  const isMainnet = chainId === 8453 || chainId === 10;

  if (isMainnet) {
    return (
      addresses.escrowFactory !== PLACEHOLDER_ADDRESS &&
      Object.values(addresses.tokens).some((addr) =>
        addr !== PLACEHOLDER_ADDRESS
      )
    );
  }

  // For local chains, we need all addresses
  return (
    addresses.escrowFactory !== PLACEHOLDER_ADDRESS &&
    addresses.limitOrderProtocol !== PLACEHOLDER_ADDRESS &&
    Object.values(addresses.tokens).some((addr) => addr !== PLACEHOLDER_ADDRESS)
  );
}

/**
 * Load contract addresses from environment variables
 * This allows configuration without code changes
 */
export function loadContractAddressesFromEnv(): void {
  // Chain A addresses
  const chainAFactory = Deno.env.get("CHAIN_A_ESCROW_FACTORY");
  const chainAProtocol = Deno.env.get("CHAIN_A_LIMIT_ORDER_PROTOCOL");
  const chainATKA = Deno.env.get("CHAIN_A_TOKEN_TKA");
  const chainATKB = Deno.env.get("CHAIN_A_TOKEN_TKB");
  const chainABMN = Deno.env.get("CHAIN_A_TOKEN_BMN");

  if (chainAFactory || chainAProtocol || chainATKA || chainATKB || chainABMN) {
    updateContractAddresses(1337, {
      escrowFactory: (chainAFactory as Address) || PLACEHOLDER_ADDRESS,
      limitOrderProtocol: (chainAProtocol as Address) || PLACEHOLDER_ADDRESS,
      tokens: {
        TKA: (chainATKA as Address) || PLACEHOLDER_ADDRESS,
        TKB: (chainATKB as Address) || PLACEHOLDER_ADDRESS,
        BMN: (chainABMN as Address) || PLACEHOLDER_ADDRESS,
      },
    });
  }

  // Chain B addresses
  const chainBFactory = Deno.env.get("CHAIN_B_ESCROW_FACTORY");
  const chainBProtocol = Deno.env.get("CHAIN_B_LIMIT_ORDER_PROTOCOL");
  const chainBTKA = Deno.env.get("CHAIN_B_TOKEN_TKA");
  const chainBTKB = Deno.env.get("CHAIN_B_TOKEN_TKB");
  const chainBBMN = Deno.env.get("CHAIN_B_TOKEN_BMN");

  if (chainBFactory || chainBProtocol || chainBTKA || chainBTKB || chainBBMN) {
    updateContractAddresses(1338, {
      escrowFactory: (chainBFactory as Address) || PLACEHOLDER_ADDRESS,
      limitOrderProtocol: (chainBProtocol as Address) || PLACEHOLDER_ADDRESS,
      tokens: {
        TKA: (chainBTKA as Address) || PLACEHOLDER_ADDRESS,
        TKB: (chainBTKB as Address) || PLACEHOLDER_ADDRESS,
        BMN: (chainBBMN as Address) || PLACEHOLDER_ADDRESS,
      },
    });
  }

  // Base Mainnet addresses
  const baseFactory = Deno.env.get("BASE_ESCROW_FACTORY");
  const baseProtocol = Deno.env.get("BASE_LIMIT_ORDER_PROTOCOL");
  const baseBMN = Deno.env.get("BASE_TOKEN_BMN");

  if (baseFactory || baseProtocol || baseBMN) {
    updateContractAddresses(8453, {
      escrowFactory: (baseFactory as Address) ||
        CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
      limitOrderProtocol: (baseProtocol as Address) ||
        CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_BASE,
      tokens: {
        BMN: (baseBMN as Address) || CREATE3_ADDRESSES.BMN_TOKEN,
      },
    });
  }

  // Optimism Mainnet addresses
  const optimismFactory = Deno.env.get("OPTIMISM_ESCROW_FACTORY");
  const optimismProtocol = Deno.env.get("OPTIMISM_LIMIT_ORDER_PROTOCOL");
  const optimismBMN = Deno.env.get("OPTIMISM_TOKEN_BMN");

  if (optimismFactory || optimismProtocol || optimismBMN) {
    updateContractAddresses(10, {
      escrowFactory: (optimismFactory as Address) ||
        CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
      limitOrderProtocol: (optimismProtocol as Address) ||
        CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_OPTIMISM,
      tokens: {
        BMN: (optimismBMN as Address) || CREATE3_ADDRESSES.BMN_TOKEN,
      },
    });
  }
}

/**
 * Load contract addresses from deployment JSON files
 * This provides a fallback when environment variables are not set
 */
export function loadContractAddressesFromDeployments(): void {
  try {
    // Load Chain A deployment
    const chainAPath =
      new URL("../../deployments/chainA.json", import.meta.url).pathname;
    const chainADeployment = JSON.parse(Deno.readTextFileSync(chainAPath));

    if (chainADeployment.chainId === 1337 && chainADeployment.contracts) {
      updateContractAddresses(1337, {
        escrowFactory: chainADeployment.contracts.factory as Address,
        limitOrderProtocol: chainADeployment.contracts
          .limitOrderProtocol as Address,
        tokens: {
          TKA: chainADeployment.contracts.tokenA as Address,
          TKB: chainADeployment.contracts.tokenB as Address,
        },
      });
    }

    // Load Chain B deployment
    const chainBPath =
      new URL("../../deployments/chainB.json", import.meta.url).pathname;
    const chainBDeployment = JSON.parse(Deno.readTextFileSync(chainBPath));

    if (chainBDeployment.chainId === 1338 && chainBDeployment.contracts) {
      updateContractAddresses(1338, {
        escrowFactory: chainBDeployment.contracts.factory as Address,
        limitOrderProtocol: chainBDeployment.contracts
          .limitOrderProtocol as Address,
        tokens: {
          TKA: chainBDeployment.contracts.tokenA as Address,
          TKB: chainBDeployment.contracts.tokenB as Address,
        },
      });
    }
  } catch (error) {
    console.warn("Failed to load contract addresses from deployments:", error);
  }
}

// Try to load addresses in order of priority:
// 1. First try deployment files (most reliable for local dev)
try {
  loadContractAddressesFromDeployments();
} catch (error) {
  console.warn("Failed to load from deployments:", error);
}

// 2. Then override with environment variables if set
try {
  loadContractAddressesFromEnv();
} catch (error) {
  console.warn("Failed to load from environment:", error);
}
