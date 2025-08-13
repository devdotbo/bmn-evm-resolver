/**
 * Example of using generated Wagmi contract types with @wagmi/core
 * 
 * This demonstrates how to use the generated contract types for type-safe
 * contract interactions using @wagmi/core instead of direct viem calls.
 */

import { createConfig, http, readContract, writeContract, waitForTransactionReceipt } from "@wagmi/core";
import { base, optimism } from "viem/chains";
import type { Address, Hex } from "viem";
import {
  simpleLimitOrderProtocolAbi,
  simpleLimitOrderProtocolAddress,
  simplifiedEscrowFactoryV2_3Abi,
  simplifiedEscrowFactoryV2_3Address,
  escrowSrcV2Abi,
  escrowDstV2Abi,
  ierc20Abi,
} from "../generated/contracts.ts";

// Create wagmi config for Deno
export const wagmiConfig = createConfig({
  chains: [base, optimism],
  transports: {
    [base.id]: http("https://erpc.up.railway.app/main/evm/8453"),
    [optimism.id]: http("https://erpc.up.railway.app/main/evm/10"),
  },
});

/**
 * Read order hash from SimpleLimitOrderProtocol using wagmi/core
 */
export async function getOrderHashWagmi(
  chainId: 8453 | 10,
  order: readonly [bigint, Address, Address, Address, Address, bigint, bigint, bigint],
): Promise<string> {
  const result = await readContract(wagmiConfig, {
    chainId,
    address: simpleLimitOrderProtocolAddress[chainId],
    abi: simpleLimitOrderProtocolAbi,
    functionName: "hashOrder",
    args: [order],
  });
  
  return result as string;
}

/**
 * Fill a limit order using wagmi/core
 */
export async function fillOrderWagmi(
  chainId: 8453 | 10,
  account: Address,
  order: readonly [bigint, Address, Address, Address, Address, bigint, bigint, bigint],
  r: Hex,
  vs: Hex,
  amount: bigint,
  takerTraits: bigint,
  args: Hex,
): Promise<Hex> {
  const hash = await writeContract(wagmiConfig, {
    chainId,
    account,
    address: simpleLimitOrderProtocolAddress[chainId],
    abi: simpleLimitOrderProtocolAbi,
    functionName: "fillOrderArgs",
    args: [order, r, vs, amount, takerTraits, args],
  });
  
  // Wait for confirmation
  const receipt = await waitForTransactionReceipt(wagmiConfig, {
    chainId,
    hash,
  });
  
  console.log(`Order filled in tx: ${receipt.transactionHash}`);
  return receipt.transactionHash;
}

/**
 * Read escrow details from factory using wagmi/core
 */
export async function getEscrowDetailsWagmi(
  chainId: 8453 | 10,
  srcEscrow: Address,
): Promise<{
  immutableState: readonly [bigint, bigint, Address, Address];
  mutableState: readonly [Address, Address];
}> {
  const [immutableState, mutableState] = await Promise.all([
    readContract(wagmiConfig, {
      chainId,
      address: simplifiedEscrowFactoryV2_3Address[chainId],
      abi: simplifiedEscrowFactoryV2_3Abi,
      functionName: "srcEscrowImmutables",
      args: [srcEscrow],
    }),
    readContract(wagmiConfig, {
      chainId,
      address: simplifiedEscrowFactoryV2_3Address[chainId],
      abi: simplifiedEscrowFactoryV2_3Abi,
      functionName: "srcEscrowMutables",
      args: [srcEscrow],
    }),
  ]);
  
  return { immutableState, mutableState };
}

/**
 * Check token balance using wagmi/core
 */
export async function getTokenBalanceWagmi(
  chainId: 8453 | 10,
  tokenAddress: Address,
  account: Address,
): Promise<bigint> {
  const balance = await readContract(wagmiConfig, {
    chainId,
    address: tokenAddress,
    abi: ierc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
  
  return balance;
}

/**
 * Approve token spending using wagmi/core
 */
export async function approveTokenWagmi(
  chainId: 8453 | 10,
  account: Address,
  tokenAddress: Address,
  spender: Address,
  amount: bigint,
): Promise<Hex> {
  const hash = await writeContract(wagmiConfig, {
    chainId,
    account,
    address: tokenAddress,
    abi: ierc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
  
  // Wait for confirmation
  const receipt = await waitForTransactionReceipt(wagmiConfig, {
    chainId,
    hash,
  });
  
  console.log(`Token approved in tx: ${receipt.transactionHash}`);
  return receipt.transactionHash;
}

/**
 * Withdraw from source escrow using wagmi/core
 */
export async function withdrawFromSrcEscrowWagmi(
  chainId: 8453 | 10,
  account: Address,
  escrowAddress: Address,
  secret: Hex,
): Promise<Hex> {
  const hash = await writeContract(wagmiConfig, {
    chainId,
    account,
    address: escrowAddress,
    abi: escrowSrcV2Abi,
    functionName: "withdrawTo",
    args: [account, secret],
  });
  
  // Wait for confirmation
  const receipt = await waitForTransactionReceipt(wagmiConfig, {
    chainId,
    hash,
  });
  
  console.log(`Withdrawn from source escrow in tx: ${receipt.transactionHash}`);
  return receipt.transactionHash;
}

/**
 * Withdraw from destination escrow using wagmi/core
 */
export async function withdrawFromDstEscrowWagmi(
  chainId: 8453 | 10,
  account: Address,
  escrowAddress: Address,
  secret: Hex,
): Promise<Hex> {
  const hash = await writeContract(wagmiConfig, {
    chainId,
    account,
    address: escrowAddress,
    abi: escrowDstV2Abi,
    functionName: "withdrawTo",
    args: [account, secret],
  });
  
  // Wait for confirmation
  const receipt = await waitForTransactionReceipt(wagmiConfig, {
    chainId,
    hash,
  });
  
  console.log(`Withdrawn from destination escrow in tx: ${receipt.transactionHash}`);
  return receipt.transactionHash;
}

/**
 * Create destination escrow using wagmi/core
 */
export async function createDstEscrowWagmi(
  chainId: 8453 | 10,
  account: Address,
  immutables: readonly [bigint, bigint, bigint, Address, Address, Address, Address, bigint, bigint],
): Promise<{
  escrowAddress: Address;
  txHash: Hex;
}> {
  const hash = await writeContract(wagmiConfig, {
    chainId,
    account,
    address: simplifiedEscrowFactoryV2_3Address[chainId],
    abi: simplifiedEscrowFactoryV2_3Abi,
    functionName: "createDstEscrow",
    args: [immutables],
  });
  
  // Wait for confirmation and parse events
  const receipt = await waitForTransactionReceipt(wagmiConfig, {
    chainId,
    hash,
  });
  
  // Parse the DstEscrowCreated event from logs
  const escrowCreatedEvent = receipt.logs.find(
    log => log.topics[0] === "0x..." // Add actual event signature
  );
  
  if (!escrowCreatedEvent) {
    throw new Error("DstEscrowCreated event not found");
  }
  
  // Decode the event to get escrow address
  // This would need proper event decoding
  const escrowAddress = "0x..." as Address; // Parse from event
  
  console.log(`Destination escrow created at ${escrowAddress} in tx: ${receipt.transactionHash}`);
  
  return {
    escrowAddress,
    txHash: receipt.transactionHash,
  };
}