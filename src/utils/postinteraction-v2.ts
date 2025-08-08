import {
  encodeAbiParameters,
  parseAbiParameters,
  concat,
  getAddress,
  keccak256,
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
 * Encodes PostInteraction data for 1inch protocol (not the full extension)
 * @param factoryAddress The SimplifiedEscrowFactory address
 * @param params Escrow creation parameters
 * @returns PostInteraction data (factory address + escrow parameters)
 */
export function encodePostInteractionData(
  factoryAddress: Address,
  params: EscrowParams
): Hex {
  // Normalize & validate addresses (throws on invalid formats)
  const normalizedFactory = getAddress(factoryAddress);
  const normalizedParams = {
    ...params,
    srcImplementation: getAddress(params.srcImplementation),
    dstImplementation: getAddress(params.dstImplementation),
    srcMaker: getAddress(params.srcMaker),
    srcTaker: getAddress(params.srcTaker),
    srcToken: getAddress(params.srcToken),
    dstReceiver: getAddress(params.dstReceiver),
    dstToken: getAddress(params.dstToken),
  } as EscrowParams;

  // Encode all escrow parameters according to v2.2.0 spec
  const escrowData = encodeAbiParameters(
    parseAbiParameters(
      "address srcImplementation, address dstImplementation, uint256 timelocks, bytes32 hashlock, address srcMaker, address srcTaker, address srcToken, uint256 srcAmount, uint256 srcSafetyDeposit, address dstReceiver, address dstToken, uint256 dstAmount, uint256 dstSafetyDeposit, uint256 nonce"
    ),
    [
      normalizedParams.srcImplementation,
      normalizedParams.dstImplementation,
      normalizedParams.timelocks,
      normalizedParams.hashlock,
      normalizedParams.srcMaker,
      normalizedParams.srcTaker,
      normalizedParams.srcToken,
      normalizedParams.srcAmount,
      normalizedParams.srcSafetyDeposit,
      normalizedParams.dstReceiver,
      normalizedParams.dstToken,
      normalizedParams.dstAmount,
      normalizedParams.dstSafetyDeposit,
      normalizedParams.nonce,
    ]
  );

  // Concatenate factory address (20 bytes) + escrow parameters
  return concat([normalizedFactory as Hex, escrowData]);
}

/**
 * Encodes the full extension data for 1inch Limit Order Protocol
 * Following the offset-based structure from ExtensionLib.sol
 * 
 * Extension structure:
 * - First 32 bytes: Offsets array
 * - Remaining bytes: Concatenated dynamic fields
 * 
 * Dynamic fields (in order):
 * 0. MakerAssetSuffix
 * 1. TakerAssetSuffix
 * 2. MakingAmountData
 * 3. TakingAmountData
 * 4. Predicate
 * 5. MakerPermit
 * 6. PreInteractionData
 * 7. PostInteractionData
 * 8. CustomData
 * 
 * @param postInteractionData The PostInteraction data (factory address + params)
 * @returns Full extension data with offsets
 */
export function encode1inchExtension(postInteractionData: Hex): Hex {
  // Create offsets array (32 bytes total, 4 bytes per field)
  // Each offset points to the END of the corresponding field
  const offsets = new Uint8Array(32);
  
  // All fields are empty except PostInteractionData (field 7)
  // Fields 0-6 have offset 0 (empty)
  // Field 7 (PostInteractionData) has offset = length of postInteractionData
  // Field 8 (CustomData) also has the same offset (no custom data)
  
  const postInteractionLength = (postInteractionData.length - 2) / 2; // Remove 0x and divide by 2 for bytes
  
  // Set offset for PostInteractionData (field 7) at bytes [28..31]
  offsets[28] = (postInteractionLength >> 24) & 0xff;
  offsets[29] = (postInteractionLength >> 16) & 0xff;
  offsets[30] = (postInteractionLength >> 8) & 0xff;
  offsets[31] = postInteractionLength & 0xff;
  
  // Combine offsets + postInteractionData
  const offsetsHex = `0x${Buffer.from(offsets).toString('hex')}` as Hex;
  return concat([offsetsHex, postInteractionData]);
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
 * Based on MakerTraitsLib.sol from 1inch protocol
 */
export const MAKER_TRAITS = {
  HAS_EXTENSION: 1n << 249n,       // Bit 249: Has extension data
  POST_INTERACTION: 1n << 251n,    // Bit 251: Enable post interaction call
  
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
  // Monotonic, process-unique nonce: timestamp (ms) << 20 | sequence
  // Supports up to 1,048,576 unique nonces per millisecond
  const nowMs = Date.now();
  if (nowMs === lastNonceTimestampMs) {
    nonceSequence = (nonceSequence + 1n) & ((1n << 20n) - 1n);
  } else {
    lastNonceTimestampMs = nowMs;
    nonceSequence = 0n;
  }
  return (BigInt(nowMs) << 20n) | nonceSequence;
}

// Internal state for generateNonce()
let lastNonceTimestampMs = 0;
let nonceSequence = 0n;