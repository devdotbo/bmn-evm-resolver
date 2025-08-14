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
  // Correct format:
  // - First 32 bytes: offsets header (8 x uint32 cumulative ends)
  // - Next 20 bytes: factory/listener address
  // - Remainder: ABI-encoded payload (bytes32, uint256, address, uint256, uint256)
  
  // 1) Strip the 32-byte offsets header (64 hex chars after 0x)
  const afterHeader = extensionData.slice(2 + 64);
  
  // 2) Read 20-byte factory address (40 hex chars)
  const factory = ('0x' + afterHeader.slice(0, 40)) as Address;
  
  // 3) Decode the ABI-encoded payload
  const payload = ('0x' + afterHeader.slice(40)) as Hex;
  
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