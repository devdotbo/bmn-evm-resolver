// Centralized ABI imports for CLI (no src/ dependencies)
import SimpleLimitOrderProtocol from "../abis/SimpleLimitOrderProtocol.json" with { type: "json" };
import SimplifiedEscrowFactoryV2_3 from "../abis/SimplifiedEscrowFactoryV2_3.json" with { type: "json" };
import EscrowDstV2 from "../abis/EscrowDstV2.json" with { type: "json" };
import EscrowSrcV2 from "../abis/EscrowSrcV2.json" with { type: "json" };
import IERC20 from "../abis/IERC20.json" with { type: "json" };

export const simpleLimitOrderProtocolAbi = SimpleLimitOrderProtocol.abi as any;
export const simplifiedEscrowFactoryAbi = SimplifiedEscrowFactoryV2_3.abi as any;
export const escrowDstV2Abi = EscrowDstV2.abi as any;
export const escrowSrcV2Abi = EscrowSrcV2.abi as any;
export const erc20Abi = IERC20.abi as any;


