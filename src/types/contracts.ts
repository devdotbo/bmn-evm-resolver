import type { Address, PublicClient, WalletClient } from "viem";

// Contract ABIs will be imported from the abis directory
export { default as EscrowFactoryABI } from "../../abis/EscrowFactory.json" with { type: "json" };
export { default as EscrowSrcABI } from "../../abis/EscrowSrc.json" with { type: "json" };
export { default as EscrowDstABI } from "../../abis/EscrowDst.json" with { type: "json" };
export { default as LimitOrderProtocolABI } from "../../abis/LimitOrderProtocol.json" with { type: "json" };
export { default as IERC20ABI } from "../../abis/IERC20.json" with { type: "json" };
export { default as TokenMockABI } from "../../abis/TokenMock.json" with { type: "json" };

// Contract instance types
export interface ContractInstance<T = any> {
  address: Address;
  abi: T;
  publicClient: PublicClient;
  walletClient?: WalletClient;
}

// EscrowFactory interface
export interface IEscrowFactory {
  addressOfEscrowSrc(immutables: any): Promise<Address>;
  addressOfEscrowDst(immutables: any): Promise<Address>;
  createDstEscrow(
    srcImmutables: any,
    dstImmutables: any,
    srcChainId: bigint
  ): Promise<`0x${string}`>;
}

// EscrowSrc interface
export interface IEscrowSrc {
  withdraw(secret: `0x${string}`, rebateToken?: Address): Promise<`0x${string}`>;
  withdrawTo(
    secret: `0x${string}`,
    target: Address,
    rebateToken?: Address
  ): Promise<`0x${string}`>;
  cancel(): Promise<`0x${string}`>;
  publicCancel(): Promise<`0x${string}`>;
  publicWithdraw(secret: `0x${string}`): Promise<`0x${string}`>;
}

// EscrowDst interface
export interface IEscrowDst {
  withdraw(secret: `0x${string}`): Promise<`0x${string}`>;
  cancel(): Promise<`0x${string}`>;
  publicWithdraw(secret: `0x${string}`): Promise<`0x${string}`>;
}

// LimitOrderProtocol interface
export interface ILimitOrderProtocol {
  fillOrderArgs(
    order: any,
    signature: `0x${string}`,
    makingAmount: bigint,
    takingAmount: bigint,
    skipPermit: bigint,
    fillOrderArgsExtension: `0x${string}`
  ): Promise<`0x${string}`>;
}

// IERC20 interface
export interface IERC20 {
  balanceOf(account: Address): Promise<bigint>;
  allowance(owner: Address, spender: Address): Promise<bigint>;
  approve(spender: Address, amount: bigint): Promise<`0x${string}`>;
  transfer(to: Address, amount: bigint): Promise<`0x${string}`>;
  transferFrom(
    from: Address,
    to: Address,
    amount: bigint
  ): Promise<`0x${string}`>;
}

// Contract addresses type
export interface ContractAddresses {
  escrowFactory: Address;
  limitOrderProtocol: Address;
  tokens: {
    [key: string]: Address;
  };
}

// Contract clients type
export interface ContractClients {
  srcChain: {
    publicClient: PublicClient;
    walletClient: WalletClient;
    escrowFactory: ContractInstance;
    limitOrderProtocol: ContractInstance;
  };
  dstChain: {
    publicClient: PublicClient;
    walletClient: WalletClient;
    escrowFactory: ContractInstance;
  };
}