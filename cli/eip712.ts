import { type Address, encodeAbiParameters, type Hex, keccak256, parseAbiParameters, slice, type WalletClient } from "viem";

export interface OrderStruct {
  salt: bigint;
  maker: bigint;
  receiver: bigint;
  makerAsset: bigint;
  takerAsset: bigint;
  makingAmount: bigint;
  takingAmount: bigint;
  makerTraits: bigint;
}

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

export interface OrderSignature { r: Hex; vs: Hex }

export function addressToUint256(address: Address): bigint {
  return BigInt(address);
}

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

export const ORDER_TYPE_DEF = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "uint256" },
    { name: "receiver", type: "uint256" },
    { name: "makerAsset", type: "uint256" },
    { name: "takerAsset", type: "uint256" },
    { name: "makingAmount", type: "uint256" },
    { name: "takingAmount", type: "uint256" },
    { name: "makerTraits", type: "uint256" },
  ],
} as const;

export async function signOrder(
  walletClient: WalletClient,
  order: OrderInput,
  chainId: number,
  verifyingContract: Address,
): Promise<OrderSignature> {
  const s = orderToStruct(order);
  const domain = { name: "Bridge-Me-Not Orders", version: "1", chainId, verifyingContract };
  const signature = await walletClient.signTypedData({
    account: walletClient.account!,
    domain,
    types: ORDER_TYPE_DEF,
    primaryType: "Order",
    message: {
      salt: s.salt,
      maker: s.maker,
      receiver: s.receiver,
      makerAsset: s.makerAsset,
      takerAsset: s.takerAsset,
      makingAmount: s.makingAmount,
      takingAmount: s.takingAmount,
      makerTraits: s.makerTraits,
    },
  });
  const r = slice(signature, 0, 32);
  const sPart = slice(signature, 32, 64);
  const vHex = slice(signature, 64, 65) as Hex;
  const v = parseInt(vHex.slice(2), 16);
  const sBig = BigInt(sPart);
  const parity = BigInt(v - 27) & 1n;
  const vsBig = (parity << 255n) | (sBig & ((1n << 255n) - 1n));
  const vs = ("0x" + vsBig.toString(16).padStart(64, "0")) as Hex;
  return { r, vs };
}

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


