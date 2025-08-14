// Centralized ABI imports for CLI via wagmi-generated bindings
// This keeps the CLI aligned with generated ABIs and addresses
import {
  simpleLimitOrderProtocolAbi as generatedSimpleLimitOrderProtocolAbi,
  simplifiedEscrowFactoryV2_3Abi as generatedSimplifiedEscrowFactoryAbi,
  escrowDstV2Abi as generatedEscrowDstV2Abi,
  escrowSrcV2Abi as generatedEscrowSrcV2Abi,
  ierc20Abi as generatedErc20Abi,
} from "../src/generated/contracts.ts";

export const simpleLimitOrderProtocolAbi = generatedSimpleLimitOrderProtocolAbi as any;
export const simplifiedEscrowFactoryAbi = generatedSimplifiedEscrowFactoryAbi as any;
export const escrowDstV2Abi = generatedEscrowDstV2Abi as any;
export const escrowSrcV2Abi = generatedEscrowSrcV2Abi as any;
export const erc20Abi = generatedErc20Abi as any;


