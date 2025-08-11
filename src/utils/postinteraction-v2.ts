import {
  type Address,
  concat,
  encodeAbiParameters,
  getAddress,
  type Hex,
  keccak256,
  parseAbiParameters,
  toHex,
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
  // Destination chain where the receiver will withdraw
  dstChainId?: bigint | number;
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
 * Encodes PostInteraction data expected by SimplifiedEscrowFactory.postInteraction
 * Layout: 20 bytes target (factory) + abi.encode(bytes32,uint256,address,uint256,uint256)
 *   - hashlock
 *   - dstChainId
 *   - dstToken
 *   - deposits  = (dstSafetyDeposit << 128) | srcSafetyDeposit
 *   - timelocks = (srcCancellationTimestamp << 128) | dstWithdrawalTimestamp
 * @param factoryAddress The SimplifiedEscrowFactory address
 * @param params Escrow creation parameters
 * @returns PostInteraction data (factory address + 5-tuple payload)
 */
export function encodePostInteractionData(
  factoryAddress: Address,
  params: EscrowParams,
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

  const dstChainId = BigInt(normalizedParams.dstChainId ?? 0);
  const deposits = packDeposits(
    normalizedParams.srcSafetyDeposit,
    normalizedParams.dstSafetyDeposit,
  );
  const payload = encodeAbiParameters(
    parseAbiParameters("bytes32 hashlock, uint256 dstChainId, address dstToken, uint256 deposits, uint256 timelocks"),
    [
      normalizedParams.hashlock,
      dstChainId,
      normalizedParams.dstToken,
      deposits,
      normalizedParams.timelocks,
    ],
  );
  // Concatenate factory address (20 bytes) + payload
  return concat([normalizedFactory as Hex, payload]);
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

  // Set offset for PostInteractionData (field 7) in the highest 4 bytes [0..3]
  // 1inch OffsetsLib expects end_7 at bits [224..255] (big-endian)
  offsets[0] = (postInteractionLength >> 24) & 0xff;
  offsets[1] = (postInteractionLength >> 16) & 0xff;
  offsets[2] = (postInteractionLength >> 8) & 0xff;
  offsets[3] = postInteractionLength & 0xff;

  // Combine offsets + postInteractionData
  const offsetsHex = toHex(offsets) as Hex;
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
  dstWithdrawalDelay: number,
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
  dstSafetyDeposit: bigint,
): bigint {
  // Pack: high 128 bits for dst deposit, low 128 bits for src deposit
  return (dstSafetyDeposit << 128n) | srcSafetyDeposit;
}

/**
 * Maker traits flags for 1inch Limit Order Protocol
 * Based on MakerTraitsLib.sol from 1inch protocol
 */
export const MAKER_TRAITS = {
  HAS_EXTENSION: 1n << 249n, // Bit 249: Has extension data
  POST_INTERACTION: 1n << 251n, // Bit 251: Enable post interaction call

  // Create traits for PostInteraction orders
  forPostInteraction(): bigint {
    return this.HAS_EXTENSION | this.POST_INTERACTION;
  },

  // Advanced builder: set fields and flags per MakerTraitsLib layout
  // Layout (low 200 bits):
  //   [0..79]  allowedSender (last 10 bytes of address)
  //   [80..119] expiration (uint40)
  //   [120..159] nonceOrEpoch (uint40)
  //   [160..199] series (uint40)
  // Flags:
  //   255 NO_PARTIAL_FILLS, 254 ALLOW_MULTIPLE_FILLS, 253 unused,
  //   252 PRE_INTERACTION, 251 POST_INTERACTION, 250 NEED_CHECK_EPOCH_MANAGER,
  //   249 HAS_EXTENSION, 248 USE_PERMIT2, 247 UNWRAP_WETH
  build(options?: {
    hasExtension?: boolean;
    postInteraction?: boolean;
    allowMultipleFills?: boolean;
    noPartialFills?: boolean;
    preInteraction?: boolean;
    needCheckEpochManager?: boolean;
    usePermit2?: boolean;
    unwrapWeth?: boolean;
    allowedSender?: Address;
    expiration?: bigint | number;
    nonceOrEpoch?: bigint | number;
    series?: bigint | number;
  }): bigint {
    const NO_PARTIAL_FILLS = 1n << 255n;
    const ALLOW_MULTIPLE_FILLS = 1n << 254n;
    const PRE_INTERACTION = 1n << 252n;
    const POST_INTERACTION = 1n << 251n;
    const NEED_CHECK_EPOCH_MANAGER = 1n << 250n;
    const HAS_EXTENSION = 1n << 249n;
    const USE_PERMIT2 = 1n << 248n;
    const UNWRAP_WETH = 1n << 247n;

    let traits = 0n;
    const opts = options || {};
    if (opts.hasExtension ?? true) traits |= HAS_EXTENSION;
    if (opts.postInteraction ?? true) traits |= POST_INTERACTION;
    if (opts.allowMultipleFills) traits |= ALLOW_MULTIPLE_FILLS;
    if (opts.noPartialFills) traits |= NO_PARTIAL_FILLS;
    if (opts.preInteraction) traits |= PRE_INTERACTION;
    if (opts.needCheckEpochManager) traits |= NEED_CHECK_EPOCH_MANAGER;
    if (opts.usePermit2) traits |= USE_PERMIT2;
    if (opts.unwrapWeth) traits |= UNWRAP_WETH;

    const mask40 = (1n << 40n) - 1n;
    const mask80 = (1n << 80n) - 1n;
    if (opts.allowedSender) {
      // Keep only low 80 bits of address
      const low80 = BigInt(opts.allowedSender) & mask80;
      traits |= low80;
    }
    if (opts.expiration !== undefined) {
      const exp = BigInt(opts.expiration) & mask40;
      traits |= exp << 80n;
    }
    if (opts.nonceOrEpoch !== undefined) {
      const nonce = BigInt(opts.nonceOrEpoch) & mask40;
      traits |= nonce << 120n;
    }
    if (opts.series !== undefined) {
      const series = BigInt(opts.series) & mask40;
      traits |= series << 160n;
    }

    return traits;
  },
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
