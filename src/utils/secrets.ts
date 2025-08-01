import { keccak256, encodePacked } from "viem";

/**
 * Generate a random 32-byte secret
 * @returns A hex-encoded 32-byte secret
 */
export function generateSecret(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Compute the keccak256 hashlock from a secret
 * @param secret The secret to hash
 * @returns The keccak256 hash of the secret
 */
export function computeHashlock(secret: `0x${string}`): `0x${string}` {
  return keccak256(secret);
}

/**
 * Validate a secret against a hashlock
 * @param secret The secret to validate
 * @param hashlock The expected hashlock
 * @returns True if the secret matches the hashlock
 */
export function validateSecret(
  secret: `0x${string}`,
  hashlock: `0x${string}`
): boolean {
  return computeHashlock(secret) === hashlock;
}

/**
 * Extract secret from withdrawal transaction data
 * @param data The transaction input data
 * @returns The extracted secret or undefined
 */
export function extractSecretFromTxData(
  data: `0x${string}`
): `0x${string}` | undefined {
  // The withdraw function selector is 0x2e1a7d4d
  // The secret is the first parameter (32 bytes after the selector)
  if (data.length < 74) return undefined; // 0x + 8 (selector) + 64 (secret)
  
  const selector = data.slice(0, 10);
  // Check if it's a withdraw function
  if (selector === "0x2e1a7d4d" || selector === "0x3ccfd60b") {
    return `0x${data.slice(10, 74)}` as `0x${string}`;
  }
  
  return undefined;
}

/**
 * Generate order hash from order parameters
 * @param params Order parameters
 * @returns The order hash
 */
export function generateOrderHash(params: {
  srcToken: `0x${string}`;
  dstToken: `0x${string}`;
  srcAmount: bigint;
  dstAmount: bigint;
  nonce: bigint;
  srcChainId: number;
  dstChainId: number;
}): `0x${string}` {
  return keccak256(
    encodePacked(
      ["address", "address", "uint256", "uint256", "uint256", "uint256", "uint256"],
      [
        params.srcToken,
        params.dstToken,
        params.srcAmount,
        params.dstAmount,
        params.nonce,
        BigInt(params.srcChainId),
        BigInt(params.dstChainId)
      ]
    )
  );
}

/**
 * Secret storage for testing (in production, use secure storage)
 */
export class SecretStore {
  private secrets: Map<string, `0x${string}`> = new Map();

  /**
   * Store a secret for an order
   * @param orderId The order ID
   * @param secret The secret to store
   */
  store(orderId: string, secret: `0x${string}`): void {
    this.secrets.set(orderId, secret);
  }

  /**
   * Retrieve a secret for an order
   * @param orderId The order ID
   * @returns The secret or undefined
   */
  get(orderId: string): `0x${string}` | undefined {
    return this.secrets.get(orderId);
  }

  /**
   * Remove a secret for an order
   * @param orderId The order ID
   */
  remove(orderId: string): void {
    this.secrets.delete(orderId);
  }

  /**
   * Clear all secrets
   */
  clear(): void {
    this.secrets.clear();
  }
}