import { 
  keccak256, 
  encodePacked, 
  getCreate2Address,
  type Address,
  encodeAbiParameters,
  parseAbiParameters
} from "viem";
import type { Immutables } from "../types/index.ts";

/**
 * Compute the deterministic address for an EscrowSrc contract
 * @param factoryAddress The EscrowFactory address
 * @param immutables The order immutables
 * @param proxyBytecodeHash The proxy bytecode hash from the factory
 * @returns The computed EscrowSrc address
 */
export function computeEscrowSrcAddress(
  factoryAddress: Address,
  immutables: Immutables,
  proxyBytecodeHash: `0x${string}`
): Address {
  const salt = computeSalt(immutables);
  return getCreate2Address({
    from: factoryAddress,
    salt,
    bytecodeHash: proxyBytecodeHash,
  });
}

/**
 * Compute the deterministic address for an EscrowDst contract
 * @param factoryAddress The EscrowFactory address
 * @param immutables The order immutables
 * @param srcChainId The source chain ID
 * @param proxyBytecodeHash The proxy bytecode hash from the factory
 * @returns The computed EscrowDst address
 */
export function computeEscrowDstAddress(
  factoryAddress: Address,
  immutables: Immutables,
  srcChainId: bigint,
  proxyBytecodeHash: `0x${string}`
): Address {
  const salt = computeSaltWithChainId(immutables, srcChainId);
  return getCreate2Address({
    from: factoryAddress,
    salt,
    bytecodeHash: proxyBytecodeHash,
  });
}

/**
 * Compute the salt for CREATE2 deployment
 * @param immutables The order immutables
 * @returns The computed salt
 */
export function computeSalt(immutables: Immutables): `0x${string}` {
  return keccak256(encodeImmutables(immutables));
}

/**
 * Compute the salt for CREATE2 deployment with chain ID
 * @param immutables The order immutables
 * @param chainId The chain ID
 * @returns The computed salt
 */
export function computeSaltWithChainId(
  immutables: Immutables,
  chainId: bigint
): `0x${string}` {
  const immutablesEncoded = encodeImmutables(immutables);
  return keccak256(
    encodePacked(
      ["bytes", "uint256"],
      [immutablesEncoded, chainId]
    )
  );
}

/**
 * Encode immutables for hashing
 * @param immutables The immutables to encode
 * @returns The encoded immutables
 */
function encodeImmutables(immutables: Immutables): `0x${string}` {
  // Define the immutables struct type
  const immutablesType = parseAbiParameters(
    "bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, (uint256 srcWithdrawal, uint256 srcPublicWithdrawal, uint256 srcCancellation, uint256 srcPublicCancellation, uint256 dstWithdrawal, uint256 dstCancellation) timelocks"
  );

  return encodeAbiParameters(immutablesType, [
    immutables.orderHash,
    immutables.hashlock,
    immutables.maker,
    immutables.taker,
    immutables.token,
    immutables.amount,
    immutables.safetyDeposit,
    {
      srcWithdrawal: immutables.timelocks.srcWithdrawal,
      srcPublicWithdrawal: immutables.timelocks.srcPublicWithdrawal,
      srcCancellation: immutables.timelocks.srcCancellation,
      srcPublicCancellation: immutables.timelocks.srcPublicCancellation,
      dstWithdrawal: immutables.timelocks.dstWithdrawal,
      dstCancellation: immutables.timelocks.dstCancellation,
    }
  ]);
}

/**
 * Verify that a computed address matches an actual address
 * @param computed The computed address
 * @param actual The actual address
 * @returns True if they match
 */
export function verifyAddress(
  computed: Address,
  actual: Address
): boolean {
  return computed.toLowerCase() === actual.toLowerCase();
}

/**
 * Generate a unique order ID from chain and order hash
 * @param chainId The chain ID
 * @param orderHash The order hash
 * @returns Unique order ID
 */
export function generateOrderId(
  chainId: number,
  orderHash: `0x${string}`
): string {
  return `${chainId}-${orderHash}`;
}

/**
 * Parse an order ID to extract chain and order hash
 * @param orderId The order ID
 * @returns Object with chainId and orderHash
 */
export function parseOrderId(orderId: string): {
  chainId: number;
  orderHash: `0x${string}`;
} {
  const [chainIdStr, orderHash] = orderId.split("-");
  return {
    chainId: parseInt(chainIdStr),
    orderHash: orderHash as `0x${string}`,
  };
}

/**
 * Check if an address is the zero address
 * @param address The address to check
 * @returns True if zero address
 */
export function isZeroAddress(address: Address): boolean {
  return address === "0x0000000000000000000000000000000000000000";
}

/**
 * Get the proxy bytecode hash for a given chain
 * This would normally be fetched from the factory contract
 * @param chainId The chain ID
 * @returns The proxy bytecode hash (placeholder for now)
 */
export function getProxyBytecodeHash(chainId: number): `0x${string}` {
  // In production, this would be fetched from the factory contract
  // For now, return a placeholder that would be replaced with actual value
  return "0x0000000000000000000000000000000000000000000000000000000000000000";
}