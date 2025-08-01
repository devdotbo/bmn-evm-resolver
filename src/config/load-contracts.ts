import type { Address } from "viem";
import type { ContractAddresses } from "../types/contracts.ts";

export async function loadContractAddresses(chainId: number): Promise<ContractAddresses> {
  try {
    // Determine which deployment file to load based on chain ID
    const fileName = chainId === 1337 ? "chainA.json" : "chainB.json";
    const deploymentPath = new URL(`../../deployments/${fileName}`, import.meta.url).pathname;
    
    // Read and parse deployment file
    const content = await Deno.readTextFile(deploymentPath);
    const deployment = JSON.parse(content);
    
    if (deployment.chainId !== chainId) {
      throw new Error(`Chain ID mismatch: expected ${chainId}, got ${deployment.chainId}`);
    }
    
    // Map deployment format to ContractAddresses format
    const addresses: ContractAddresses = {
      escrowFactory: deployment.contracts.factory as Address,
      limitOrderProtocol: deployment.contracts.limitOrderProtocol as Address,
      tokens: {
        TKA: deployment.contracts.tokenA as Address,
        TKB: deployment.contracts.tokenB as Address,
        ACCESS: deployment.contracts.accessToken as Address,
        FEE: deployment.contracts.feeToken as Address,
      },
    };
    
    return addresses;
  } catch (error) {
    console.error(`Failed to load contract addresses for chain ${chainId}:`, error);
    throw error;
  }
}