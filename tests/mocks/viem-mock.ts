/**
 * Viem Test Client Mocks
 * 
 * Provides mock implementations of viem clients for testing blockchain interactions
 * without requiring actual network connections.
 */

import type {
  Account,
  Address,
  Chain,
  Hash,
  Hex,
  Log,
  PublicClient,
  Transaction,
  TransactionReceipt,
  WalletClient,
  Block,
} from "viem";
import { createPublicClient, createWalletClient, http, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, optimism, arbitrum, polygon } from "viem/chains";
import { stub } from "@std/testing/mock";

// Test private keys (Hardhat defaults)
export const TEST_PRIVATE_KEYS = {
  ALICE: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex,
  BOB: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex,
  CHARLIE: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex,
  RESOLVER: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex,
};

// Test accounts
export const TEST_ACCOUNTS = {
  ALICE: privateKeyToAccount(TEST_PRIVATE_KEYS.ALICE),
  BOB: privateKeyToAccount(TEST_PRIVATE_KEYS.BOB),
  CHARLIE: privateKeyToAccount(TEST_PRIVATE_KEYS.CHARLIE),
  RESOLVER: privateKeyToAccount(TEST_PRIVATE_KEYS.RESOLVER),
};

/**
 * Mock transaction store for tracking transactions
 */
export class MockTransactionStore {
  private transactions: Map<Hash, Transaction> = new Map();
  private receipts: Map<Hash, TransactionReceipt> = new Map();
  private blocks: Map<bigint, Block> = new Map();
  private currentBlockNumber = 1000n;
  private nonces: Map<Address, number> = new Map();
  
  addTransaction(tx: Partial<Transaction>): Hash {
    const hash = this.generateHash();
    const fullTx: Transaction = {
      blockHash: this.generateHash(),
      blockNumber: this.currentBlockNumber,
      from: tx.from || TEST_ACCOUNTS.ALICE.address,
      gas: tx.gas || 21000n,
      gasPrice: tx.gasPrice || 1000000000n,
      hash,
      input: tx.input || "0x",
      nonce: tx.nonce || this.getNextNonce(tx.from || TEST_ACCOUNTS.ALICE.address),
      to: tx.to || null,
      transactionIndex: 0,
      value: tx.value || 0n,
      v: 27n,
      r: "0x" + "1".repeat(64) as Hex,
      s: "0x" + "2".repeat(64) as Hex,
      type: "legacy",
      typeHex: "0x0",
      ...tx,
    } as Transaction;
    
    this.transactions.set(hash, fullTx);
    
    // Auto-create receipt
    const receipt: TransactionReceipt = {
      blockHash: fullTx.blockHash!,
      blockNumber: fullTx.blockNumber!,
      contractAddress: null,
      cumulativeGasUsed: 100000n,
      effectiveGasPrice: fullTx.gasPrice!,
      from: fullTx.from,
      gasUsed: 21000n,
      logs: [],
      logsBloom: "0x" + "0".repeat(512) as Hex,
      status: "success",
      to: fullTx.to,
      transactionHash: hash,
      transactionIndex: 0,
      type: fullTx.type,
    };
    
    this.receipts.set(hash, receipt);
    
    return hash;
  }
  
  getTransaction(hash: Hash): Transaction | undefined {
    return this.transactions.get(hash);
  }
  
  getReceipt(hash: Hash): TransactionReceipt | undefined {
    return this.receipts.get(hash);
  }
  
  addBlock(block?: Partial<Block>): Block {
    const blockNumber = block?.number || this.currentBlockNumber++;
    const fullBlock = {
      baseFeePerGas: 1000000000n,
      blobGasUsed: 0n,
      difficulty: 0n,
      excessBlobGas: 0n,
      extraData: "0x" as Hex,
      gasLimit: 30000000n,
      gasUsed: 0n,
      hash: this.generateHash(),
      logsBloom: "0x" + "0".repeat(512) as Hex,
      miner: TEST_ACCOUNTS.ALICE.address,
      mixHash: this.generateHash(),
      nonce: "0x0000000000000000" as Hex,
      number: blockNumber,
      parentHash: this.generateHash(),
      receiptsRoot: this.generateHash(),
      sha3Uncles: this.generateHash(),
      sealFields: [] as Hex[],
      size: 1000n,
      stateRoot: this.generateHash(),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      totalDifficulty: 0n,
      transactions: [],
      transactionsRoot: this.generateHash(),
      uncles: [],
      ...block,
    } as Block;
    
    this.blocks.set(blockNumber, fullBlock);
    return fullBlock;
  }
  
  getBlock(number: bigint): Block | undefined {
    return this.blocks.get(number);
  }
  
  getCurrentBlockNumber(): bigint {
    return this.currentBlockNumber;
  }
  
  private getNextNonce(address: Address): number {
    const current = this.nonces.get(address) || 0;
    this.nonces.set(address, current + 1);
    return current;
  }
  
  private generateHash(): Hash {
    const random = Math.random().toString(16).slice(2);
    return `0x${random.padEnd(64, "0")}` as Hash;
  }
  
  clear(): void {
    this.transactions.clear();
    this.receipts.clear();
    this.blocks.clear();
    this.nonces.clear();
    this.currentBlockNumber = 1000n;
  }
}

/**
 * Create a mock public client for testing
 */
export function createMockPublicClient(
  options: {
    chain?: Chain;
    store?: MockTransactionStore;
    mockFunctions?: Partial<PublicClient>;
  } = {}
): PublicClient {
  const { 
    chain = mainnet, 
    store = new MockTransactionStore(),
    mockFunctions = {}
  } = options;
  
  const client = createPublicClient({
    chain,
    transport: http("http://localhost:8545"),
  }) as any;
  
  // Mock common functions
  const mockedClient = {
    ...client,
    
    // Block methods
    getBlockNumber: stub(client, "getBlockNumber", (() => 
      Promise.resolve(store.getCurrentBlockNumber())
    ) as any),
    
    getBlock: stub(client, "getBlock", ((args: any) => {
      const block = store.getBlock(args?.blockNumber || store.getCurrentBlockNumber());
      return Promise.resolve(block || store.addBlock());
    }) as any),
    
    // Transaction methods
    getTransaction: stub(client, "getTransaction", ((args: { hash: Hash }) => 
      Promise.resolve(store.getTransaction(args.hash) || null)
    ) as any),
    
    getTransactionReceipt: stub(client, "getTransactionReceipt", ((args: { hash: Hash }) =>
      Promise.resolve(store.getReceipt(args.hash) || null)
    ) as any),
    
    waitForTransactionReceipt: ((args: { hash: Hash }) => {
      const receipt = store.getReceipt(args.hash);
      if (receipt) return Promise.resolve(receipt);
      
      // Simulate waiting and then return a mock receipt (faster for tests)
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(store.getReceipt(args.hash) || {
            blockHash: "0x" + "1".repeat(64) as Hash,
            blockNumber: store.getCurrentBlockNumber(),
            contractAddress: null,
            cumulativeGasUsed: 100000n,
            effectiveGasPrice: 1000000000n,
            from: TEST_ACCOUNTS.ALICE.address,
            gasUsed: 21000n,
            logs: [],
            logsBloom: "0x" + "0".repeat(512) as Hex,
            status: "success",
            to: null,
            transactionHash: args.hash,
            transactionIndex: 0,
            type: "legacy",
          } as TransactionReceipt);
        }, 10);
      });
    }) as any,
    
    // Contract methods
    readContract: ((args: any) => {
      // Return mock data based on function name
      const functionName = args.functionName;
      
      switch (functionName) {
        case "balanceOf":
          return Promise.resolve(1000000000000000000n); // 1 token
        case "allowance":
          return Promise.resolve(BigInt(2) ** BigInt(256) - BigInt(1)); // Max uint256
        case "decimals":
          return Promise.resolve(18);
        case "symbol":
          return Promise.resolve("BMN");
        case "name":
          return Promise.resolve("Bridge Me Not");
        case "totalSupply":
          return Promise.resolve(1000000000000000000000000n); // 1M tokens
        default:
          return Promise.resolve(null);
      }
    }) as any,
    
    simulateContract: ((args: any) => {
      // Return successful simulation
      return Promise.resolve({
        result: true,
        request: args,
      });
    }) as any,
    
    call: ((args: any) => {
      // Return mock call data
      return Promise.resolve({
        data: "0x" + "0".repeat(64) as Hex,
      });
    }) as any,
    
    estimateGas: (() => 
      Promise.resolve(100000n)
    ) as any,
    
    getGasPrice: (() =>
      Promise.resolve(1000000000n) // 1 gwei
    ) as any,
    
    // Event methods
    getLogs: (() =>
      Promise.resolve([])
    ) as any,
    
    watchContractEvent: ((args: any) => {
      // Return a mock unwatch function
      return () => {};
    }) as any,
    
    // Chain methods
    getChainId: (() =>
      Promise.resolve(chain.id)
    ) as any,
    
    // Apply any custom mock functions
    ...mockFunctions,
  };
  
  return mockedClient as unknown as PublicClient;
}

/**
 * Create a mock wallet client for testing
 */
export function createMockWalletClient(
  options: {
    account?: Account;
    chain?: Chain;
    store?: MockTransactionStore;
    mockFunctions?: Partial<WalletClient>;
  } = {}
): WalletClient {
  const {
    account = TEST_ACCOUNTS.ALICE,
    chain = mainnet,
    store = new MockTransactionStore(),
    mockFunctions = {}
  } = options;
  
  const client = createWalletClient({
    account,
    chain,
    transport: http("http://localhost:8545"),
  }) as any;
  
  // Mock common functions
  const mockedClient = {
    ...client,
    
    sendTransaction: ((args: any) => {
      const hash = store.addTransaction({
        from: account.address,
        to: args.to,
        value: args.value,
        input: args.data,
        gas: args.gas,
      });
      return Promise.resolve(hash);
    }) as any,
    
    writeContract: ((args: any) => {
      const hash = store.addTransaction({
        from: account.address,
        to: args.address,
        input: args.data,
      });
      return Promise.resolve(hash);
    }) as any,
    
    signMessage: ((args: { message: string }) => {
      // Return a mock signature
      return Promise.resolve(`0x${"1".repeat(130)}` as Hex);
    }) as any,
    
    signTypedData: (() => {
      // Return a mock signature
      return Promise.resolve(`0x${"2".repeat(130)}` as Hex);
    }) as any,
    
    requestAddresses: (() =>
      Promise.resolve([account.address])
    ) as any,
    
    getAddresses: (() =>
      Promise.resolve([account.address])
    ) as any,
    
    // Apply any custom mock functions
    ...mockFunctions,
  };
  
  return mockedClient as unknown as WalletClient;
}

/**
 * Create a mock contract event for testing
 */
export function createMockContractEvent(
  options: {
    address?: Address;
    eventName?: string;
    args?: Record<string, unknown>;
    blockNumber?: bigint;
    transactionHash?: Hash;
  } = {}
): Log {
  const {
    address = TEST_ACCOUNTS.ALICE.address,
    eventName = "Transfer",
    args = {},
    blockNumber = 1000n,
    transactionHash = `0x${"1".repeat(64)}` as Hash,
  } = options;
  
  return {
    address,
    blockHash: `0x${"2".repeat(64)}` as Hash,
    blockNumber,
    data: "0x" as Hex,
    logIndex: 0,
    removed: false,
    topics: [`0x${"3".repeat(64)}` as Hex], // Event signature
    transactionHash,
    transactionIndex: 0,
    args,
    eventName,
  } as unknown as Log;
}

/**
 * Create a mock transaction receipt for testing
 */
export function createMockTransactionReceipt(
  options: Partial<TransactionReceipt> = {}
): TransactionReceipt {
  return {
    blockHash: `0x${"1".repeat(64)}` as Hash,
    blockNumber: 1000n,
    contractAddress: null,
    cumulativeGasUsed: 100000n,
    effectiveGasPrice: 1000000000n,
    from: TEST_ACCOUNTS.ALICE.address,
    gasUsed: 21000n,
    logs: [],
    logsBloom: "0x" + "0".repeat(512) as Hex,
    status: "success",
    to: TEST_ACCOUNTS.BOB.address,
    transactionHash: `0x${"2".repeat(64)}` as Hash,
    transactionIndex: 0,
    type: "legacy",
    ...options,
  };
}

/**
 * Mock chain configuration for testing
 */
export const mockChains = {
  chainA: {
    ...mainnet,
    id: 31337,
    name: "Chain A (Test)",
    rpcUrls: {
      default: { http: ["http://localhost:8545"] },
      public: { http: ["http://localhost:8545"] },
    },
  } as Chain,
  
  chainB: {
    ...optimism,
    id: 31338,
    name: "Chain B (Test)",
    rpcUrls: {
      default: { http: ["http://localhost:8546"] },
      public: { http: ["http://localhost:8546"] },
    },
  } as Chain,
};

/**
 * Helper to create a test environment with mock clients
 */
export function createTestEnvironment(options: {
  chains?: Chain[];
  accounts?: Account[];
} = {}) {
  const store = new MockTransactionStore();
  const chains = options.chains || [mockChains.chainA, mockChains.chainB];
  const accounts = options.accounts || [TEST_ACCOUNTS.ALICE, TEST_ACCOUNTS.BOB];
  
  const publicClients = new Map<number, PublicClient>();
  const walletClients = new Map<string, WalletClient>();
  
  // Create public clients for each chain
  for (const chain of chains) {
    publicClients.set(chain.id, createMockPublicClient({ chain, store }));
  }
  
  // Create wallet clients for each account on each chain
  for (const account of accounts) {
    for (const chain of chains) {
      const key = `${account.address}-${chain.id}`;
      walletClients.set(key, createMockWalletClient({ account, chain, store }));
    }
  }
  
  return {
    store,
    publicClients,
    walletClients,
    
    getPublicClient(chainId: number): PublicClient {
      const client = publicClients.get(chainId);
      if (!client) throw new Error(`No public client for chain ${chainId}`);
      return client;
    },
    
    getWalletClient(address: Address, chainId: number): WalletClient {
      const key = `${address}-${chainId}`;
      const client = walletClients.get(key);
      if (!client) throw new Error(`No wallet client for ${address} on chain ${chainId}`);
      return client;
    },
    
    reset(): void {
      store.clear();
    },
  };
}

/**
 * Mock contract ABI for testing
 */
export const mockABIs = {
  ERC20: [
    {
      name: "balanceOf",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "balance", type: "uint256" }],
    },
    {
      name: "transfer",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "success", type: "bool" }],
    },
    {
      name: "approve",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "success", type: "bool" }],
    },
  ],
  
  LimitOrderProtocol: [
    {
      name: "fillOrder",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "order", type: "tuple" },
        { name: "signature", type: "bytes" },
        { name: "interaction", type: "bytes" },
        { name: "makingAmount", type: "uint256" },
        { name: "takingAmount", type: "uint256" },
        { name: "skipPermitAndThresholdAmount", type: "uint256" },
      ],
      outputs: [
        { name: "actualMakingAmount", type: "uint256" },
        { name: "actualTakingAmount", type: "uint256" },
      ],
    },
  ],
  
  EscrowFactory: [
    {
      name: "postInteraction",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "orderHash", type: "bytes32" },
        { name: "maker", type: "address" },
        { name: "taker", type: "address" },
        { name: "makingAmount", type: "uint256" },
        { name: "takingAmount", type: "uint256" },
        { name: "interactiveData", type: "bytes" },
      ],
      outputs: [],
    },
  ],
};