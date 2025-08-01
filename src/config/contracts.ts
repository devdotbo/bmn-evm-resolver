import type { Address } from "viem";
import type { ContractAddresses } from "../types/contracts.ts";

// Placeholder addresses - will be replaced with actual deployed addresses
// These are valid Ethereum addresses for type safety
export const PLACEHOLDER_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

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
  addresses: Partial<ContractAddresses>
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
  
  return (
    addresses.escrowFactory !== PLACEHOLDER_ADDRESS &&
    addresses.limitOrderProtocol !== PLACEHOLDER_ADDRESS &&
    Object.values(addresses.tokens).some(addr => addr !== PLACEHOLDER_ADDRESS)
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
  
  if (chainAFactory || chainAProtocol || chainATKA || chainATKB) {
    updateContractAddresses(1337, {
      escrowFactory: (chainAFactory as Address) || PLACEHOLDER_ADDRESS,
      limitOrderProtocol: (chainAProtocol as Address) || PLACEHOLDER_ADDRESS,
      tokens: {
        TKA: (chainATKA as Address) || PLACEHOLDER_ADDRESS,
        TKB: (chainATKB as Address) || PLACEHOLDER_ADDRESS,
      },
    });
  }
  
  // Chain B addresses
  const chainBFactory = Deno.env.get("CHAIN_B_ESCROW_FACTORY");
  const chainBProtocol = Deno.env.get("CHAIN_B_LIMIT_ORDER_PROTOCOL");
  const chainBTKA = Deno.env.get("CHAIN_B_TOKEN_TKA");
  const chainBTKB = Deno.env.get("CHAIN_B_TOKEN_TKB");
  
  if (chainBFactory || chainBProtocol || chainBTKA || chainBTKB) {
    updateContractAddresses(1338, {
      escrowFactory: (chainBFactory as Address) || PLACEHOLDER_ADDRESS,
      limitOrderProtocol: (chainBProtocol as Address) || PLACEHOLDER_ADDRESS,
      tokens: {
        TKA: (chainBTKA as Address) || PLACEHOLDER_ADDRESS,
        TKB: (chainBTKB as Address) || PLACEHOLDER_ADDRESS,
      },
    });
  }
}

// Try to load addresses from environment on module load
try {
  loadContractAddressesFromEnv();
} catch (error) {
  console.warn("Failed to load contract addresses from environment:", error);
}