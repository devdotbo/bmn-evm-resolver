import {
  type Address,
  encodeAbiParameters,
  type Hex,
  keccak256,
  parseAbiParameters,
  slice,
  type WalletClient,
} from "viem";

// CRITICAL: Order structure must match contract exactly
// The contract expects addresses as uint256 in the Order struct
export interface OrderStruct {
  salt: bigint;
  maker: bigint; // Address as uint256
  receiver: bigint; // Address as uint256
  makerAsset: bigint; // Address as uint256
  takerAsset: bigint; // Address as uint256
  makingAmount: bigint;
  takingAmount: bigint;
  makerTraits: bigint;
}

// Human-friendly order interface for creation
export interface OrderInput {
  salt: bigint;
  maker: Address;
  receiver: Address;
  makerAsset: Address;
  takerAsset: Address;
  makingAmount: bigint;
  takingAmount: bigint;
  makerTraits: bigint;
}

// Signature components as expected by contract
export interface OrderSignature {
  r: Hex;
  vs: Hex;
}

// Convert address to uint256 (bigint)
export function addressToUint256(address: Address): bigint {
  return BigInt(address);
}

// Convert Order with addresses to OrderStruct with uint256
export function orderToStruct(order: OrderInput): OrderStruct {
  return {
    salt: order.salt,
    maker: addressToUint256(order.maker),
    receiver: addressToUint256(order.receiver),
    makerAsset: addressToUint256(order.makerAsset),
    takerAsset: addressToUint256(order.takerAsset),
    makingAmount: order.makingAmount,
    takingAmount: order.takingAmount,
    makerTraits: order.makerTraits,
  };
}

// EIP-712 Type definitions - MUST match contract exactly
export const ORDER_TYPE_DEF = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "uint256" }, // Address as uint256
    { name: "receiver", type: "uint256" }, // Address as uint256
    { name: "makerAsset", type: "uint256" }, // Address as uint256
    { name: "takerAsset", type: "uint256" }, // Address as uint256
    { name: "makingAmount", type: "uint256" },
    { name: "takingAmount", type: "uint256" },
    { name: "makerTraits", type: "uint256" },
  ],
} as const;

// Compute order hash (for tracking and cancellation)
export function computeOrderHash(order: OrderStruct): Hex {
  const encoded = encodeAbiParameters(
    parseAbiParameters("uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256"),
    [
      order.salt,
      order.maker,
      order.receiver,
      order.makerAsset,
      order.takerAsset,
      order.makingAmount,
      order.takingAmount,
      order.makerTraits,
    ],
  );
  return keccak256(encoded);
}

// Sign order with proper EIP-712
export async function signOrder(
  walletClient: WalletClient,
  order: OrderInput,
  chainId: number,
  verifyingContract: Address,
): Promise<OrderSignature> {
  // Convert order to struct format for signing
  const orderStruct = orderToStruct(order);
  
  // Domain MUST match contract exactly - using Bridge-Me-Not Orders
  const domain = {
    name: "Bridge-Me-Not Orders",
    version: "1",
    chainId,
    verifyingContract,
  };
  
  // Sign with uint256 addresses
  const signature = await walletClient.signTypedData({
    domain,
    types: ORDER_TYPE_DEF,
    primaryType: "Order",
    message: {
      salt: orderStruct.salt,
      maker: orderStruct.maker,
      receiver: orderStruct.receiver,
      makerAsset: orderStruct.makerAsset,
      takerAsset: orderStruct.takerAsset,
      makingAmount: orderStruct.makingAmount,
      takingAmount: orderStruct.takingAmount,
      makerTraits: orderStruct.makerTraits,
    },
  });
  
  // Split signature into r and vs components
  const r = slice(signature, 0, 32);
  const s = slice(signature, 32, 64);
  const vHex = slice(signature, 64, 65) as Hex; // 1-byte v
  const v = parseInt(vHex.slice(2), 16);
  const sBig = BigInt(s);
  const parity = BigInt(v - 27) & 1n;
  const vsBig = (parity << 255n) | (sBig & ((1n << 255n) - 1n));
  const vs = ("0x" + vsBig.toString(16).padStart(64, "0")) as Hex;
  
  return { r, vs };
}

// Helper to create a test order
export function createTestOrder(
  maker: Address,
  makerAsset: Address,
  takerAsset: Address,
  makingAmount: bigint,
  takingAmount: bigint,
  expirationMinutes: number = 60,
): OrderInput {
  const now = Math.floor(Date.now() / 1000);
  const expiration = now + expirationMinutes * 60;
  
  // Build makerTraits with expiration
  const makerTraits = BigInt(expiration) << 64n;
  
  return {
    salt: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
    maker,
    receiver: maker, // Same as maker by default
    makerAsset,
    takerAsset,
    makingAmount,
    takingAmount,
    makerTraits,
  };
}

// Verify signature format
export function verifySignatureFormat(signature: OrderSignature): boolean {
  if (!signature.r || !signature.vs) return false;
  if (signature.r.length !== 66) return false; // 0x + 64 chars
  if (signature.vs.length !== 68) return false; // 0x + 66 chars
  return true;
}

// Split a standard signature into r and vs components
export function splitSignature(signature: Hex): OrderSignature {
  if (signature.length !== 132) { // 0x + 130 chars
    throw new Error("Invalid signature length");
  }
  
  const r = slice(signature, 0, 32);
  const s = slice(signature, 32, 64);
  const vHex = slice(signature, 64, 65) as Hex;
  const v = parseInt(vHex.slice(2), 16);
  const sBig = BigInt(s);
  const parity = BigInt(v - 27) & 1n;
  const vs = ("0x" + ((parity << 255n) | (sBig & ((1n << 255n) - 1n))).toString(16).padStart(64, "0")) as Hex;
  
  return { r, vs };
}