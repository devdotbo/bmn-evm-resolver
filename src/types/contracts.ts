import type { Address } from "viem";

export interface ContractAddresses {
  escrowFactory: Address;
  limitOrderProtocol: Address;
  tokens: Record<string, Address>;
}
