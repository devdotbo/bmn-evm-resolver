import type { Address, Hex } from "viem";

// Order structure matching LimitOrderProtocol's IOrderMixin.Order
export interface Order {
  salt: bigint;
  maker: Address;
  receiver: Address;
  makerAsset: Address;
  takerAsset: Address;
  makingAmount: bigint;
  takingAmount: bigint;
  makerTraits: bigint;
}

// EIP-712 Domain for 1inch Limit Order Protocol v4
export const LIMIT_ORDER_PROTOCOL_DOMAIN = {
  name: "1inch Limit Order Protocol",
  version: "4",
} as const;

// EIP-712 Type definitions
export const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "receiver", type: "address" },
    { name: "makerAsset", type: "address" },
    { name: "takerAsset", type: "address" },
    { name: "makingAmount", type: "uint256" },
    { name: "takingAmount", type: "uint256" },
    { name: "makerTraits", type: "uint256" },
  ],
} as const;

// MakerTraits bit flags
export const MakerTraitsFlags = {
  NO_PARTIAL_FILLS: 255n,
  ALLOW_MULTIPLE_FILLS: 254n,
  NEED_PREINTERACTION: 252n,
  NEED_POSTINTERACTION: 251n,
  NEED_EPOCH_CHECK: 250n,
  HAS_EXTENSION: 249n,
  USE_PERMIT2: 248n,
  UNWRAP_WETH: 247n,
} as const;

// TakerTraits bit flags
export const TakerTraitsFlags = {
  MAKER_AMOUNT_FLAG: 1n << 255n,
  UNWRAP_WETH_FLAG: 1n << 254n,
  SKIP_ORDER_PERMIT_FLAG: 1n << 253n,
  USE_PERMIT2_FLAG: 1n << 252n,
  ARGS_HAS_TARGET: 1n << 251n,
} as const;

// Utility functions for building orders
export function buildOrder(params: {
  maker: Address;
  receiver?: Address;
  makerAsset: Address;
  takerAsset: Address;
  makingAmount: bigint;
  takingAmount: bigint;
  salt?: bigint;
  allowPartialFills?: boolean;
  allowMultipleFills?: boolean;
  needPostInteraction?: boolean;
}): Order {
  const {
    maker,
    receiver = maker,
    makerAsset,
    takerAsset,
    makingAmount,
    takingAmount,
    salt = BigInt(Date.now()),
    allowPartialFills = true,
    allowMultipleFills = true,
    needPostInteraction = true,
  } = params;

  let makerTraits = 0n;
  
  // Set maker traits flags
  if (!allowPartialFills) {
    makerTraits = setBit(makerTraits, MakerTraitsFlags.NO_PARTIAL_FILLS, true);
  }
  if (allowMultipleFills) {
    makerTraits = setBit(makerTraits, MakerTraitsFlags.ALLOW_MULTIPLE_FILLS, true);
  }
  if (needPostInteraction) {
    makerTraits = setBit(makerTraits, MakerTraitsFlags.NEED_POSTINTERACTION, true);
  }

  return {
    salt,
    maker,
    receiver,
    makerAsset,
    takerAsset,
    makingAmount,
    takingAmount,
    makerTraits,
  };
}

// Utility function to build taker traits
export function buildTakerTraits(params: {
  makingAmount?: boolean;
  threshold?: bigint;
  extension?: Hex;
  interaction?: Hex;
  target?: Address;
}): bigint {
  const {
    makingAmount = false,
    threshold = 0n,
    extension,
    interaction,
    target,
  } = params;

  let traits = threshold;

  if (makingAmount) {
    traits |= TakerTraitsFlags.MAKER_AMOUNT_FLAG;
  }

  if (target) {
    traits |= TakerTraitsFlags.ARGS_HAS_TARGET;
  }

  // Add extension length if provided
  if (extension) {
    const extensionLength = BigInt((extension.length - 2) / 2); // Remove 0x and convert to bytes
    traits |= (extensionLength & 0xffffffn) << 224n;
  }

  // Add interaction length if provided
  if (interaction) {
    const interactionLength = BigInt((interaction.length - 2) / 2);
    traits |= (interactionLength & 0xffffffn) << 200n;
  }

  return traits;
}

// Helper function to set/unset bits
function setBit(value: bigint, bit: bigint, set: boolean): bigint {
  if (set) {
    return value | (1n << bit);
  } else {
    return value & ~(1n << bit);
  }
}

// Type for order with signature
export interface SignedOrder {
  order: Order;
  signature: Hex;
}

// Type for order metadata (for storage)
export interface OrderMetadata {
  order: Order;
  signature: Hex;
  orderHash: Hex;
  createdAt: number;
  chainId: number;
  status: "pending" | "filled" | "cancelled";
}