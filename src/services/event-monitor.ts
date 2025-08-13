/**
 * EventMonitorService - Real-time blockchain event monitoring for atomic swaps
 * 
 * This service monitors both Base and Optimism chains for:
 * - OrderFilled events (when Bob fills Alice's order)
 * - EscrowCreated events (source and destination escrows)
 * - TokensDeposited events (when Alice deposits to source escrow)
 * - SecretRevealed events (when Alice reveals secret on destination)
 */

import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  parseAbiItem,
  type Log,
  type PublicClient,
} from "viem";
import { base, optimism } from "viem/chains";
import SimpleLimitOrderProtocolAbi from "../../abis/SimpleLimitOrderProtocol.json" with { type: "json" };
import SimplifiedEscrowFactoryV2_3Abi from "../../abis/SimplifiedEscrowFactoryV2_3.json" with { type: "json" };
import EscrowDstV2Abi from "../../abis/EscrowDstV2.json" with { type: "json" };
import { getContractAddresses } from "../config/contracts.ts";

// Event types
export interface OrderFilledEvent {
  orderHash: Hex;
  remainingAmount: bigint;
  srcEscrow?: Address;
  blockNumber: bigint;
  transactionHash: Hex;
}

export interface EscrowCreatedEvent {
  escrowAddress: Address;
  hashlock: Hex;
  orderHash: Hex;
  maker: Address;
  taker: Address;
  amount: bigint;
  chainId: number;
  isSource: boolean;
  blockNumber: bigint;
  transactionHash: Hex;
}

export interface TokensDepositedEvent {
  escrowAddress: Address;
  depositor: Address;
  amount: bigint;
  orderHash: Hex;
  chainId: number;
  blockNumber: bigint;
  transactionHash: Hex;
}

export interface SecretRevealedEvent {
  escrowAddress: Address;
  secret: Hex;
  hashlock: Hex;
  orderHash: Hex;
  revealer: Address;
  chainId: number;
  blockNumber: bigint;
  transactionHash: Hex;
}

// Event listener types
type EventCallback<T> = (event: T) => Promise<void> | void;

interface EventListeners {
  OrderFilled: EventCallback<OrderFilledEvent>[];
  SourceEscrowCreated: EventCallback<EscrowCreatedEvent>[];
  DestEscrowCreated: EventCallback<EscrowCreatedEvent>[];
  TokensDeposited: EventCallback<TokensDepositedEvent>[];
  SecretRevealed: EventCallback<SecretRevealedEvent>[];
}

export class EventMonitorService {
  private baseClient: PublicClient;
  private optimismClient: PublicClient;
  private listeners: EventListeners = {
    OrderFilled: [],
    SourceEscrowCreated: [],
    DestEscrowCreated: [],
    TokensDeposited: [],
    SecretRevealed: [],
  };
  private isMonitoring = false;
  private unwatchFunctions: Array<() => void> = [];
  private lastProcessedBlocks: Map<string, bigint> = new Map();

  constructor(ankrApiKey?: string) {
    // Initialize clients
    const baseRpc = ankrApiKey
      ? `https://rpc.ankr.com/base/${ankrApiKey}`
      : "https://erpc.up.railway.app/main/evm/8453";
    
    const optimismRpc = ankrApiKey
      ? `https://rpc.ankr.com/optimism/${ankrApiKey}`
      : "https://erpc.up.railway.app/main/evm/10";

    this.baseClient = createPublicClient({
      chain: base,
      transport: http(baseRpc),
    });

    this.optimismClient = createPublicClient({
      chain: optimism,
      transport: http(optimismRpc),
    });
  }

  /**
   * Register an event listener
   */
  on<T extends keyof EventListeners>(
    eventName: T,
    callback: EventListeners[T][0]
  ): void {
    this.listeners[eventName].push(callback as any);
  }

  /**
   * Remove an event listener
   */
  off<T extends keyof EventListeners>(
    eventName: T,
    callback: EventListeners[T][0]
  ): void {
    const index = this.listeners[eventName].indexOf(callback as any);
    if (index > -1) {
      this.listeners[eventName].splice(index, 1);
    }
  }

  /**
   * Emit an event to all registered listeners
   */
  private async emit<T extends keyof EventListeners>(
    eventName: T,
    event: Parameters<EventListeners[T][0]>[0]
  ): Promise<void> {
    const callbacks = this.listeners[eventName];
    for (const callback of callbacks) {
      try {
        await (callback as any)(event);
      } catch (error) {
        console.error(`Error in ${eventName} listener:`, error);
      }
    }
  }

  /**
   * Start monitoring blockchain events
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log("⚠️ Event monitoring already started");
      return;
    }

    console.log("🚀 Starting blockchain event monitoring...");
    this.isMonitoring = true;

    // Monitor both chains
    await this.monitorChain(base.id, this.baseClient);
    await this.monitorChain(optimism.id, this.optimismClient);

    console.log("✅ Event monitoring started on Base and Optimism");
  }

  /**
   * Monitor a specific chain for events
   */
  private async monitorChain(chainId: number, client: PublicClient): Promise<void> {
    const contracts = getContractAddresses(chainId);
    
    // Monitor OrderFilled events from SimpleLimitOrderProtocol
    const unwatch1 = client.watchContractEvent({
      address: contracts.limitOrderProtocol,
      abi: SimpleLimitOrderProtocolAbi.abi,
      eventName: "OrderFilled",
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleOrderFilled(log as any, chainId);
        }
      },
    });
    this.unwatchFunctions.push(unwatch1);

    // Monitor PostInteractionEscrowCreated events from Factory
    const unwatch2 = client.watchContractEvent({
      address: contracts.escrowFactory,
      abi: SimplifiedEscrowFactoryV2_3Abi.abi,
      eventName: "PostInteractionEscrowCreated",
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleEscrowCreated(log as any, chainId, true);
        }
      },
    });
    this.unwatchFunctions.push(unwatch2);

    // Monitor SrcEscrowCreated events from Factory (alternative event)
    const unwatch3 = client.watchContractEvent({
      address: contracts.escrowFactory,
      abi: SimplifiedEscrowFactoryV2_3Abi.abi,
      eventName: "SrcEscrowCreated",
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleEscrowCreated(log as any, chainId, true);
        }
      },
    });
    this.unwatchFunctions.push(unwatch3);

    // Monitor DstEscrowCreated events from Factory
    const unwatch4 = client.watchContractEvent({
      address: contracts.escrowFactory,
      abi: SimplifiedEscrowFactoryV2_3Abi.abi,
      eventName: "DstEscrowCreated",
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleEscrowCreated(log as any, chainId, false);
        }
      },
    });
    this.unwatchFunctions.push(unwatch4);

    // Process recent historical events on startup
    await this.processHistoricalEvents(chainId, client, contracts);
  }

  /**
   * Process recent historical events to catch up
   */
  private async processHistoricalEvents(
    chainId: number,
    client: PublicClient,
    contracts: any
  ): Promise<void> {
    try {
      const latestBlock = await client.getBlockNumber();
      const fromBlock = latestBlock - 100n; // Last 100 blocks
      
      console.log(`📊 Checking historical events on chain ${chainId} from block ${fromBlock}`);

      // Get OrderFilled events
      const orderFilledLogs = await client.getContractEvents({
        address: contracts.limitOrderProtocol,
        abi: SimpleLimitOrderProtocolAbi.abi,
        eventName: "OrderFilled",
        fromBlock,
        toBlock: latestBlock,
      });

      for (const log of orderFilledLogs) {
        await this.handleOrderFilled(log as any, chainId);
      }

      // Get escrow creation events
      const escrowLogs = await client.getContractEvents({
        address: contracts.escrowFactory,
        abi: SimplifiedEscrowFactoryV2_3Abi.abi,
        eventName: "PostInteractionEscrowCreated",
        fromBlock,
        toBlock: latestBlock,
      });

      for (const log of escrowLogs) {
        await this.handleEscrowCreated(log as any, chainId, true);
      }

      console.log(`✅ Processed ${orderFilledLogs.length + escrowLogs.length} historical events`);
    } catch (error) {
      console.error(`Error processing historical events on chain ${chainId}:`, error);
    }
  }

  /**
   * Handle OrderFilled event
   */
  private async handleOrderFilled(log: Log, chainId: number): Promise<void> {
    try {
      const { orderHash, remainingAmount } = log.args as any;
      
      console.log(`📦 OrderFilled detected on chain ${chainId}`);
      console.log(`   Order Hash: ${orderHash}`);
      console.log(`   Remaining: ${remainingAmount}`);

      const event: OrderFilledEvent = {
        orderHash,
        remainingAmount: BigInt(remainingAmount || 0),
        blockNumber: log.blockNumber || 0n,
        transactionHash: log.transactionHash || "0x",
      };

      await this.emit("OrderFilled", event);
    } catch (error) {
      console.error("Error handling OrderFilled event:", error);
    }
  }

  /**
   * Handle EscrowCreated events
   */
  private async handleEscrowCreated(
    log: Log,
    chainId: number,
    isSource: boolean
  ): Promise<void> {
    try {
      const args = log.args as any;
      const escrowAddress = args.escrow || args.escrowAddress;
      const hashlock = args.hashlock;
      const orderHash = args.orderHash || hashlock; // Use hashlock as fallback
      
      console.log(`🏦 ${isSource ? "Source" : "Destination"} Escrow created on chain ${chainId}`);
      console.log(`   Address: ${escrowAddress}`);
      console.log(`   Hashlock: ${hashlock}`);

      const event: EscrowCreatedEvent = {
        escrowAddress,
        hashlock,
        orderHash,
        maker: args.maker || args.protocol || "0x",
        taker: args.taker || "0x",
        amount: BigInt(args.amount || 0),
        chainId,
        isSource,
        blockNumber: log.blockNumber || 0n,
        transactionHash: log.transactionHash || "0x",
      };

      await this.emit(
        isSource ? "SourceEscrowCreated" : "DestEscrowCreated",
        event
      );
    } catch (error) {
      console.error("Error handling EscrowCreated event:", error);
    }
  }

  /**
   * Monitor for token deposits to escrows
   */
  async monitorTokenDeposits(escrowAddress: Address, chainId: number): Promise<void> {
    const client = chainId === base.id ? this.baseClient : this.optimismClient;
    
    // Watch for Transfer events to the escrow
    const unwatch = client.watchContractEvent({
      address: escrowAddress,
      abi: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
      eventName: "Transfer",
      onLogs: async (logs) => {
        for (const log of logs) {
          const { from, to, value } = log.args as any;
          if (to === escrowAddress) {
            console.log(`💰 Token deposit detected to escrow ${escrowAddress}`);
            console.log(`   From: ${from}`);
            console.log(`   Amount: ${value}`);

            const event: TokensDepositedEvent = {
              escrowAddress,
              depositor: from,
              amount: BigInt(value),
              orderHash: "0x", // Will be filled by correlation
              chainId,
              blockNumber: log.blockNumber || 0n,
              transactionHash: log.transactionHash || "0x",
            };

            await this.emit("TokensDeposited", event);
          }
        }
      },
    });

    this.unwatchFunctions.push(unwatch);
  }

  /**
   * Monitor for secret reveals on destination escrows
   */
  async monitorSecretReveals(escrowAddress: Address, chainId: number): Promise<void> {
    const client = chainId === base.id ? this.baseClient : this.optimismClient;
    
    // Watch for Withdraw events which indicate secret reveal
    const unwatch = client.watchContractEvent({
      address: escrowAddress,
      abi: EscrowDstV2Abi.abi,
      eventName: "Withdraw",
      onLogs: async (logs) => {
        for (const log of logs) {
          const { withdrawer, amount } = log.args as any;
          
          // Get the secret from transaction input
          const tx = await client.getTransaction({
            hash: log.transactionHash!,
          });

          // Parse secret from calldata (first 32 bytes after function selector)
          const secret = ("0x" + tx.input.slice(10, 74)) as Hex;
          
          console.log(`🔓 Secret revealed on escrow ${escrowAddress}`);
          console.log(`   Secret: ${secret}`);
          console.log(`   Withdrawer: ${withdrawer}`);

          const event: SecretRevealedEvent = {
            escrowAddress,
            secret,
            hashlock: "0x", // Will be filled by correlation
            orderHash: "0x", // Will be filled by correlation
            revealer: withdrawer,
            chainId,
            blockNumber: log.blockNumber || 0n,
            transactionHash: log.transactionHash || "0x",
          };

          await this.emit("SecretRevealed", event);
        }
      },
    });

    this.unwatchFunctions.push(unwatch);
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    console.log("🛑 Stopping event monitoring...");
    this.isMonitoring = false;

    // Unwatch all events
    for (const unwatch of this.unwatchFunctions) {
      try {
        unwatch();
      } catch (error) {
        console.error("Error unwatching event:", error);
      }
    }

    this.unwatchFunctions = [];
    console.log("✅ Event monitoring stopped");
  }

  /**
   * Check if monitoring is active
   */
  isActive(): boolean {
    return this.isMonitoring;
  }
}