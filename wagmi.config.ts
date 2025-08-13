import { defineConfig } from "@wagmi/cli";
import { actions } from "@wagmi/cli/plugins";

/**
 * Wagmi CLI configuration for contract type generation
 * 
 * This generates TypeScript bindings for:
 * 1. SimpleLimitOrderProtocol - Main order protocol
 * 2. SimplifiedEscrowFactory - Factory for creating escrows
 * 3. Escrow contracts - Source and destination escrows
 * 4. ERC20 token interface
 */

// Load ABIs using Deno's APIs
const loadAbi = (path: string) => {
  const content = Deno.readTextFileSync(path);
  return JSON.parse(content).abi;
};

export default defineConfig({
  out: "src/generated/contracts.ts",
  contracts: [
    // Add the abis directly from JSON files
    {
      name: "SimpleLimitOrderProtocol",
      abi: loadAbi("./abis/SimpleLimitOrderProtocol.json"),
      address: {
        10: "0xe767105dcfB3034a346578afd2aFD8e583171489", // Optimism
        8453: "0xe767105dcfB3034a346578afd2aFD8e583171489", // Base
      },
    },
    {
      name: "SimplifiedEscrowFactoryV2_3",
      abi: loadAbi("./abis/SimplifiedEscrowFactoryV2_3.json"),
      address: {
        10: "0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31", // Optimism
        8453: "0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31", // Base
      },
    },
    {
      name: "SimplifiedEscrowFactory",
      abi: loadAbi("./abis/SimplifiedEscrowFactory.json"),
    },
    {
      name: "EscrowSrcV2",
      abi: loadAbi("./abis/EscrowSrcV2.json"),
    },
    {
      name: "EscrowDstV2",
      abi: loadAbi("./abis/EscrowDstV2.json"),
    },
    {
      name: "EscrowDst",
      abi: loadAbi("./abis/EscrowDst.json"),
    },
    {
      name: "IERC20",
      abi: loadAbi("./abis/IERC20.json"),
    },
  ],
  plugins: [
    actions({
      // Use @wagmi/core since we're not using React
      overridePackageName: "@wagmi/core",
    }),
  ],
});