import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  webSocket,
  type PublicClient, 
  type WalletClient,
  type Chain,
  type Address,
  getContract,
  type GetContractReturnType
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  EscrowFactoryABI,
  EscrowSrcABI,
  EscrowDstABI,
  LimitOrderProtocolABI,
  IERC20ABI,
  type ContractInstance
} from "../types/contracts.ts";

/**
 * Create a public client for reading from the blockchain
 * @param chain The chain configuration
 * @returns Public client instance
 */
export function createPublicClientForChain(chain: Chain): PublicClient {
  return createPublicClient({
    chain,
    transport: http(),
  });
}

/**
 * Create a wallet client for writing to the blockchain
 * @param chain The chain configuration
 * @param privateKey The private key for the wallet
 * @returns Wallet client instance
 */
export function createWalletClientForChain(
  chain: Chain,
  privateKey: `0x${string}`
): WalletClient {
  const account = privateKeyToAccount(privateKey);
  
  return createWalletClient({
    account,
    chain,
    transport: http(),
  });
}

/**
 * Create an EscrowFactory contract instance
 * @param address The contract address
 * @param publicClient The public client
 * @param walletClient Optional wallet client for write operations
 * @returns Contract instance
 */
export function createEscrowFactory(
  address: Address,
  publicClient: PublicClient,
  walletClient?: WalletClient
): GetContractReturnType<typeof EscrowFactoryABI.abi, PublicClient, WalletClient> {
  return getContract({
    address,
    abi: EscrowFactoryABI.abi,
    client: { public: publicClient, wallet: walletClient }
  });
}

/**
 * Create an EscrowSrc contract instance
 * @param address The contract address
 * @param publicClient The public client
 * @param walletClient Optional wallet client for write operations
 * @returns Contract instance
 */
export function createEscrowSrc(
  address: Address,
  publicClient: PublicClient,
  walletClient?: WalletClient
): GetContractReturnType<typeof EscrowSrcABI.abi, PublicClient, WalletClient> {
  return getContract({
    address,
    abi: EscrowSrcABI.abi,
    client: { public: publicClient, wallet: walletClient }
  });
}

/**
 * Create an EscrowDst contract instance
 * @param address The contract address
 * @param publicClient The public client
 * @param walletClient Optional wallet client for write operations
 * @returns Contract instance
 */
export function createEscrowDst(
  address: Address,
  publicClient: PublicClient,
  walletClient?: WalletClient
): GetContractReturnType<typeof EscrowDstABI.abi, PublicClient, WalletClient> {
  return getContract({
    address,
    abi: EscrowDstABI.abi,
    client: { public: publicClient, wallet: walletClient }
  });
}

/**
 * Create a LimitOrderProtocol contract instance
 * @param address The contract address
 * @param publicClient The public client
 * @param walletClient Optional wallet client for write operations
 * @returns Contract instance
 */
export function createLimitOrderProtocol(
  address: Address,
  publicClient: PublicClient,
  walletClient?: WalletClient
): GetContractReturnType<typeof LimitOrderProtocolABI.abi, PublicClient, WalletClient> {
  return getContract({
    address,
    abi: LimitOrderProtocolABI.abi,
    client: { public: publicClient, wallet: walletClient }
  });
}

/**
 * Create an ERC20 token contract instance
 * @param address The token address
 * @param publicClient The public client
 * @param walletClient Optional wallet client for write operations
 * @returns Contract instance
 */
export function createERC20Token(
  address: Address,
  publicClient: PublicClient,
  walletClient?: WalletClient
): GetContractReturnType<typeof IERC20ABI.abi, PublicClient, WalletClient> {
  return getContract({
    address,
    abi: IERC20ABI.abi,
    client: { public: publicClient, wallet: walletClient }
  });
}

/**
 * Helper to create all necessary contract instances for a chain
 * @param chain The chain configuration
 * @param addresses Contract addresses
 * @param privateKey Optional private key for write operations
 * @returns Object with all contract instances
 */
export function createContractsForChain(
  chain: Chain,
  addresses: {
    escrowFactory: Address;
    limitOrderProtocol?: Address;
  },
  privateKey?: `0x${string}`
) {
  const publicClient = createPublicClientForChain(chain);
  const walletClient = privateKey 
    ? createWalletClientForChain(chain, privateKey) 
    : undefined;

  return {
    publicClient,
    walletClient,
    escrowFactory: createEscrowFactory(
      addresses.escrowFactory,
      publicClient,
      walletClient
    ),
    limitOrderProtocol: addresses.limitOrderProtocol
      ? createLimitOrderProtocol(
          addresses.limitOrderProtocol,
          publicClient,
          walletClient
        )
      : undefined,
  };
}

/**
 * Wait for a transaction to be mined
 * @param publicClient The public client
 * @param hash The transaction hash
 * @returns Transaction receipt
 */
export async function waitForTransaction(
  publicClient: PublicClient,
  hash: `0x${string}`
) {
  return await publicClient.waitForTransactionReceipt({ hash });
}

/**
 * Get the current block number
 * @param publicClient The public client
 * @returns Current block number
 */
export async function getCurrentBlock(publicClient: PublicClient): Promise<bigint> {
  return await publicClient.getBlockNumber();
}

/**
 * Estimate gas for a transaction
 * @param publicClient The public client
 * @param transaction The transaction to estimate
 * @returns Estimated gas
 */
export async function estimateGas(
  publicClient: PublicClient,
  transaction: any
): Promise<bigint> {
  return await publicClient.estimateGas(transaction);
}

/**
 * Create a monitoring client with WebSocket transport for real-time events
 * @param chain The chain configuration
 * @returns Public client with WebSocket transport
 */
export function createMonitoringClient(chain: Chain): PublicClient {
  return createPublicClient({
    chain,
    transport: webSocket(),
  });
}