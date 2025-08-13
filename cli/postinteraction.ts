import { type Address, concat, encodeAbiParameters, getAddress, type Hex, parseAbiParameters, toHex } from "viem";

export interface EscrowParams {
  srcImplementation: Address;
  dstImplementation: Address;
  timelocks: bigint;
  hashlock: Hex;
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

export function encodePostInteractionData(factoryAddress: Address, params: EscrowParams): Hex {
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
  return concat([normalizedFactory as Hex, payload]);
}

export function encode1inchExtension(postInteractionData: Hex): Hex {
  const offsets = new Uint8Array(32);
  const postInteractionLength = (postInteractionData.length - 2) / 2;
  // DynamicField index for PostInteractionData = 7 (zero-based)
  const idx = 7 * 4;
  offsets[idx + 0] = (postInteractionLength >> 24) & 0xff;
  offsets[idx + 1] = (postInteractionLength >> 16) & 0xff;
  offsets[idx + 2] = (postInteractionLength >> 8) & 0xff;
  offsets[idx + 3] = postInteractionLength & 0xff;
  const offsetsHex = toHex(offsets) as Hex;
  return concat([offsetsHex, postInteractionData]);
}

export function packTimelocks(srcCancellationDelay: number, dstWithdrawalDelay: number): bigint {
  const now = Math.floor(Date.now() / 1000);
  const srcCancellationTimestamp = BigInt(now + srcCancellationDelay);
  const dstWithdrawalTimestamp = BigInt(now + dstWithdrawalDelay);
  return (srcCancellationTimestamp << 128n) | dstWithdrawalTimestamp;
}

export function packDeposits(srcSafetyDeposit: bigint, dstSafetyDeposit: bigint): bigint {
  return (dstSafetyDeposit << 128n) | srcSafetyDeposit;
}

export const MAKER_TRAITS = {
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

let lastNonceTimestampMs = 0;
let nonceSequence = 0n;
export function generateNonce(): bigint {
  const nowMs = Date.now();
  if (nowMs === lastNonceTimestampMs) {
    nonceSequence = (nonceSequence + 1n) & ((1n << 20n) - 1n);
  } else {
    lastNonceTimestampMs = nowMs;
    nonceSequence = 0n;
  }
  return (BigInt(nowMs) << 20n) | nonceSequence;
}


