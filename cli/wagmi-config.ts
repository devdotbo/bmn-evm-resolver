import { createConfig, http } from "@wagmi/core";
import { base, optimism } from "viem/chains";
import { getRpcUrl, type SupportedChainId } from "./cli-config.ts";

export const wagmiConfig: any = createConfig({
  chains: [base as any, optimism as any],
  transports: {
    [base.id]: http(getRpcUrl(8453 as SupportedChainId)),
    [optimism.id]: http(getRpcUrl(10 as SupportedChainId)),
  },
  ssr: true,
} as any);

export function createWagmiConfig() {
  return wagmiConfig as any;
}


