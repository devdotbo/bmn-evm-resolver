import {
  encodeAbiParameters,
  parseAbiParameters,
  concat,
  type Address,
  type Hex,
} from "viem";

/**
 * PostInteraction v2.2.0 Extension Data Encoder
 * 
 * Encodes escrow parameters for the SimplifiedEscrowFactory's postInteraction method
 * as specified in the v2.2.0 integration guide.
 */

export interface EscrowParams {
  srcImplementation: Address;
  dstImplementation: Address;
  timelocks: bigint;
  hashlock: Hex;
  srcMaker: Address;
  srcTaker: Address;
  srcToken: Address;
  srcAmount: bigint;
  srcSafetyDeposit: bigint;
  dstReceiver: Address;
  dstToken: Address;
  dstAmount: bigint;
  dstSafetyDeposit: bigint;
  nonce: bigint;
}

/**
 * Encodes extension data for PostInteraction v2.2.0
 * @param factoryAddress The SimplifiedEscrowFactory address
 * @param params Escrow creation parameters
 * @returns Encoded extension data to be passed to the 1inch protocol
 */
export function encodePostInteractionData(
  factoryAddress: Address,
  params: EscrowParams
): Hex {
  // Encode all escrow parameters according to v2.2.0 spec
  const escrowData = encodeAbiParameters(
    parseAbiParameters(
      "address srcImplementation, address dstImplementation, uint256 timelocks, bytes32 hashlock, address srcMaker, address srcTaker, address srcToken, uint256 srcAmount, uint256 srcSafetyDeposit, address dstReceiver, address dstToken, uint256 dstAmount, uint256 dstSafetyDeposit, uint256 nonce"
    ),
    [
      params.srcImplementation,
      params.dstImplementation,
      params.timelocks,
      params.hashlock,
      params.srcMaker,
      params.srcTaker,
      params.srcToken,
      params.srcAmount,
      params.srcSafetyDeposit,
      params.dstReceiver,
      params.dstToken,
      params.dstAmount,
      params.dstSafetyDeposit,
      params.nonce,
    ]
  );

  // Concatenate factory address (20 bytes) + escrow parameters
  return concat([factoryAddress as Hex, escrowData]);
}

/**
 * Creates timelocks value by packing src cancellation and dst withdrawal timestamps
 * @param srcCancellationDelay Delay in seconds for source cancellation
 * @param dstWithdrawalDelay Delay in seconds for destination withdrawal
 * @returns Packed timelocks value
 */
export function packTimelocks(
  srcCancellationDelay: number,
  dstWithdrawalDelay: number
): bigint {
  const now = Math.floor(Date.now() / 1000);
  const srcCancellationTimestamp = BigInt(now + srcCancellationDelay);
  const dstWithdrawalTimestamp = BigInt(now + dstWithdrawalDelay);
  
  // Pack: high 128 bits for src cancellation, low 128 bits for dst withdrawal
  return (srcCancellationTimestamp << 128n) | dstWithdrawalTimestamp;
}

/**
 * Creates deposits value by packing src and dst safety deposits
 * @param srcSafetyDeposit Source safety deposit amount
 * @param dstSafetyDeposit Destination safety deposit amount
 * @returns Packed deposits value
 */
export function packDeposits(
  srcSafetyDeposit: bigint,
  dstSafetyDeposit: bigint
): bigint {
  // Pack: high 128 bits for dst deposit, low 128 bits for src deposit
  return (dstSafetyDeposit << 128n) | srcSafetyDeposit;
}

/**
 * Maker traits flags for 1inch Limit Order Protocol
 */
export const MAKER_TRAITS = {
  HAS_EXTENSION: 1n << 2n,       // Bit 2: Has extension data
  POST_INTERACTION: 1n << 7n,     // Bit 7: Enable post interaction
  
  // Create traits for PostInteraction orders
  forPostInteraction(): bigint {
    return this.HAS_EXTENSION | this.POST_INTERACTION;
  }
};

/**
 * Generates a unique nonce for escrow creation
 * @returns A unique nonce value
 */
export function generateNonce(): bigint {
  // Use timestamp + random value for uniqueness
  const timestamp = BigInt(Date.now());
  const random = BigInt(Math.floor(Math.random() * 1000000));
  return (timestamp << 20n) | random;
}