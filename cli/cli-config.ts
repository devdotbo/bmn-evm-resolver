import type { Address } from "viem";

export type SupportedChainId = 10 | 8453;

const FALLBACKS = {
  ESCROW_FACTORY: "0xdebE6F4bC7BaAD2266603Ba7AfEB3BB6dDA9FE0A" as Address,
  BMN_TOKEN: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address,
  LIMIT_ORDER_PROTOCOL: "0xe767105dcfB3034a346578afd2aFD8e583171489" as Address,
};

export function getRpcUrl(chainId: SupportedChainId): string {
  const ANKR = Deno.env.get("ANKR_API_KEY") || "";
  if (chainId === 8453) {
    return ANKR ? `https://rpc.ankr.com/base/${ANKR}` : "https://mainnet.base.org";
  }
  return ANKR ? `https://rpc.ankr.com/optimism/${ANKR}` : "https://mainnet.optimism.io";
}

export function getPrivateKey(name: "ALICE_PRIVATE_KEY" | "BOB_PRIVATE_KEY" | "RESOLVER_PRIVATE_KEY"): `0x${string}` | null {
  const v = Deno.env.get(name) as `0x${string}` | undefined;
  return v || null;
}

export function getFactoryAddress(chainId: SupportedChainId): Address {
  if (chainId === 8453) {
    return (Deno.env.get("BASE_ESCROW_FACTORY") as Address) || (Deno.env.get("MAINNET_ESCROW_FACTORY_V2") as Address) || FALLBACKS.ESCROW_FACTORY;
  }
  return (Deno.env.get("OPTIMISM_ESCROW_FACTORY") as Address) || (Deno.env.get("MAINNET_ESCROW_FACTORY_V2") as Address) || FALLBACKS.ESCROW_FACTORY;
}

export function getBMNToken(chainId: SupportedChainId): Address {
  if (chainId === 8453) {
    return (Deno.env.get("BASE_TOKEN_BMN") as Address) || (Deno.env.get("MAINNET_BMN_TOKEN") as Address) || FALLBACKS.BMN_TOKEN;
  }
  return (Deno.env.get("OPTIMISM_TOKEN_BMN") as Address) || (Deno.env.get("MAINNET_BMN_TOKEN") as Address) || FALLBACKS.BMN_TOKEN;
}

export function getLimitOrderProtocol(chainId: SupportedChainId): Address {
  if (chainId === 8453) {
    return (Deno.env.get("BASE_LIMIT_ORDER_PROTOCOL") as Address) || FALLBACKS.LIMIT_ORDER_PROTOCOL;
  }
  return (Deno.env.get("OPTIMISM_LIMIT_ORDER_PROTOCOL") as Address) || FALLBACKS.LIMIT_ORDER_PROTOCOL;
}

export function getCliAddresses(chainId: SupportedChainId): {
  escrowFactory: Address;
  limitOrderProtocol: Address;
  tokens: { BMN: Address };
} {
  return {
    escrowFactory: getFactoryAddress(chainId),
    limitOrderProtocol: getLimitOrderProtocol(chainId),
    tokens: { BMN: getBMNToken(chainId) },
  };
}


