import { type Address, type Hex, decodeAbiParameters, parseAbiParameters } from "viem";

// Intentionally minimal utility module: keep only the parser used by CLIs

/**
 * Parse PostInteraction extension data to extract escrow parameters
 */
export function parsePostInteractionData(extensionData: Hex): {
  factory: Address;
  hashlock: Hex;
  dstChainId: bigint;
  dstToken: Address;
  deposits: bigint;
  timelocks: bigint;
} {
  // Extension data format after offsets header removal:
  // 28 bytes padding + 20 bytes factory + abi.encode(hashlock, dstChainId, dstToken, deposits, timelocks)
  
  // Skip 28 bytes of padding (56 hex chars after 0x)
  const dataAfterPadding = extensionData.slice(2 + 56); // Skip 0x + 28 bytes (56 hex chars)
  
  // Extract factory address (next 20 bytes = 40 hex chars)
  const factory = ('0x' + dataAfterPadding.slice(0, 40)) as Address;
  
  // The rest is the ABI-encoded payload
  const payload = ('0x' + dataAfterPadding.slice(40)) as Hex;
  
  // Decode the 5-tuple payload
  const [hashlock, dstChainId, dstToken, deposits, timelocks] = decodeAbiParameters(
    parseAbiParameters('bytes32, uint256, address, uint256, uint256'),
    payload
  );
  
  return {
    factory,
    hashlock: hashlock as Hex,
    dstChainId,
    dstToken: dstToken as Address,
    deposits,
    timelocks
  };
}