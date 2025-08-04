import type { PublicClient, Address, Log } from "viem";
import { parseAbiItem } from "viem";
import type { 
  SrcEscrowCreatedEvent, 
  EventCallback,
  Immutables 
} from "../types/events.ts";
import type { OrderState } from "../types/index.ts";
import { OrderStatus } from "../types/index.ts";
import { generateOrderId } from "../utils/addresses.ts";
import { getCurrentBlock } from "../utils/contracts.ts";
import { 
  BLOCK_POLLING_INTERVAL_MS, 
  EVENT_BATCH_SIZE,
  RECONNECT_DELAY_MS 
} from "../config/constants.ts";
import { IndexerClient, type IndexerClientConfig } from "../indexer/client.ts";
import type { AtomicSwap } from "../indexer/types.ts";

/**
 * Order monitor that watches for new orders on the source chain
 * Supports both indexer-based and event-based monitoring
 */
export class OrderMonitor {
  private publicClient: PublicClient;
  private monitoringClient: PublicClient;
  private escrowFactoryAddress: Address;
  private onOrderCallback: EventCallback<SrcEscrowCreatedEvent>;
  private isRunning = false;
  private lastProcessedBlock: bigint = 0n;
  private unwatchFunctions: (() => void)[] = [];
  
  // Indexer support
  private indexerClient?: IndexerClient;
  private useIndexer: boolean;
  private hybridMode: boolean;
  private indexerPollingInterval?: number;
  private resolverAddress?: Address;

  constructor(
    publicClient: PublicClient,
    escrowFactoryAddress: Address,
    onOrderCallback: EventCallback<SrcEscrowCreatedEvent>,
    monitoringClient?: PublicClient,
    options?: {
      indexerClient?: IndexerClient;
      useIndexer?: boolean;
      hybridMode?: boolean;
      resolverAddress?: Address;
      indexerPollingInterval?: number;
    }
  ) {
    this.publicClient = publicClient;
    this.monitoringClient = monitoringClient || publicClient;
    this.escrowFactoryAddress = escrowFactoryAddress;
    this.onOrderCallback = onOrderCallback;
    
    // Indexer configuration
    this.indexerClient = options?.indexerClient;
    this.useIndexer = options?.useIndexer || false;
    this.hybridMode = options?.hybridMode || false;
    this.resolverAddress = options?.resolverAddress;
    this.indexerPollingInterval = options?.indexerPollingInterval || 5000;
  }

  /**
   * Start monitoring for new orders
   * @param fromBlock Optional starting block
   */
  async start(fromBlock?: bigint): Promise<void> {
    if (this.isRunning) {
      console.log("Monitor already running");
      return;
    }

    this.isRunning = true;
    this.lastProcessedBlock = fromBlock || await getCurrentBlock(this.publicClient);
    
    console.log(`Starting order monitor from block ${this.lastProcessedBlock}`);
    
    // Determine monitoring mode
    if (this.useIndexer && this.indexerClient) {
      console.log("Using indexer-based monitoring");
      await this.startIndexerMonitoring();
      
      if (this.hybridMode) {
        console.log("Also enabling WebSocket event monitoring (hybrid mode)");
        this.startRealtimeMonitoring();
      }
    } else {
      // Fallback to event monitoring
      console.log("Using WebSocket for real-time event monitoring");
      this.startRealtimeMonitoring();
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isRunning = false;
    
    // Clean up WebSocket watchers
    for (const unwatch of this.unwatchFunctions) {
      unwatch();
    }
    this.unwatchFunctions = [];
    
    // Stop indexer subscription if active
    if (this.indexerClient) {
      // Unsubscribe handled by unwatchFunctions
    }
    
    console.log("Order monitor stopped");
  }

  /**
   * Start indexer-based monitoring
   */
  private async startIndexerMonitoring(): Promise<void> {
    if (!this.indexerClient || !this.resolverAddress) {
      console.error("Indexer client or resolver address not configured");
      return;
    }
    
    try {
      // Subscribe to new orders via indexer
      const unsubscribe = await this.indexerClient.subscribeToNewOrders(
        async (order: AtomicSwap) => {
          // Convert AtomicSwap to SrcEscrowCreatedEvent format
          const event = this.convertAtomicSwapToEvent(order);
          if (event) {
            await this.onOrderCallback(event);
          }
        },
        this.resolverAddress
      );
      
      this.unwatchFunctions.push(unsubscribe);
      
      console.log("Started indexer-based order monitoring");
    } catch (error) {
      console.error("Failed to start indexer monitoring:", error);
      // Fallback to event monitoring if indexer fails
      if (!this.hybridMode) {
        console.log("Falling back to event-based monitoring");
        this.startRealtimeMonitoring();
      }
    }
  }
  
  /**
   * Convert AtomicSwap from indexer to SrcEscrowCreatedEvent
   */
  private convertAtomicSwapToEvent(swap: AtomicSwap): SrcEscrowCreatedEvent | null {
    try {
      // Only process orders that have source escrow created
      if (!swap.srcEscrowAddress) {
        return null;
      }
      
      const immutables: Immutables = {
        orderHash: swap.orderHash as `0x${string}`,
        hashlock: swap.hashlock as `0x${string}`,
        maker: swap.srcMaker as Address,
        taker: swap.srcTaker as Address,
        token: swap.srcToken as Address,
        amount: swap.srcAmount,
        safetyDeposit: swap.srcSafetyDeposit,
        timelocks: {
          // Extract timelocks from packed format if needed
          // For now, use defaults
          srcWithdrawal: 300n, // 5 minutes
          srcPublicWithdrawal: 600n, // 10 minutes
          srcCancellation: 900n, // 15 minutes
          srcPublicCancellation: 1200n, // 20 minutes
          dstWithdrawal: 300n, // 5 minutes
          dstCancellation: 600n, // 10 minutes
        },
      };
      
      return {
        escrow: swap.srcEscrowAddress as Address,
        orderHash: swap.orderHash as Address,
        immutables,
        blockNumber: swap.srcCreatedAt || 0n,
        transactionHash: "0x0" as `0x${string}`, // Not available from indexer
        logIndex: 0,
      };
    } catch (error) {
      console.error("Error converting AtomicSwap to event:", error);
      return null;
    }
  }

  /**
   * Start real-time monitoring using WebSocket
   */
  private startRealtimeMonitoring(): void {
    // Watch for SrcEscrowCreated events
    const unwatch = this.monitoringClient.watchContractEvent({
      address: this.escrowFactoryAddress,
      abi: [{
        type: "event",
        name: "SrcEscrowCreated",
        inputs: [
          { name: "escrow", type: "address", indexed: true },
          { name: "orderHash", type: "address", indexed: true },
          { 
            name: "immutables", 
            type: "tuple",
            components: [
              { name: "orderHash", type: "bytes32" },
              { name: "hashlock", type: "bytes32" },
              { name: "maker", type: "address" },
              { name: "taker", type: "address" },
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
              { name: "safetyDeposit", type: "uint256" },
              {
                name: "timelocks",
                type: "tuple",
                components: [
                  { name: "srcWithdrawal", type: "uint256" },
                  { name: "srcPublicWithdrawal", type: "uint256" },
                  { name: "srcCancellation", type: "uint256" },
                  { name: "srcPublicCancellation", type: "uint256" },
                  { name: "dstWithdrawal", type: "uint256" },
                  { name: "dstCancellation", type: "uint256" }
                ]
              }
            ]
          }
        ]
      }],
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.processEvent(log);
        }
      },
      onError: (error) => {
        console.error("WebSocket monitoring error:", error);
        // No fallback - just log the error
      }
    });

    this.unwatchFunctions.push(unwatch);
  }


  /**
   * Process a single event log
   * @param log The event log
   */
  private async processEvent(log: Log): Promise<void> {
    try {
      // Parse the event
      const event = this.parseEventLog(log);
      
      if (event) {
        // Call the callback
        await this.onOrderCallback(event);
      }
    } catch (error) {
      console.error("Error processing event:", error);
    }
  }

  /**
   * Parse event log into SrcEscrowCreatedEvent
   * @param log The raw log
   * @returns Parsed event or null
   */
  private parseEventLog(log: Log): SrcEscrowCreatedEvent | null {
    try {
      if (!log.args || !log.blockNumber || !log.transactionHash || log.logIndex === undefined) {
        return null;
      }

      const args = log.args as any;
      
      // Extract immutables from the event
      const immutables: Immutables = {
        orderHash: args.immutables[0],
        hashlock: args.immutables[1],
        maker: args.immutables[2],
        taker: args.immutables[3],
        token: args.immutables[4],
        amount: args.immutables[5],
        safetyDeposit: args.immutables[6],
        timelocks: {
          srcWithdrawal: args.immutables[7][0],
          srcPublicWithdrawal: args.immutables[7][1],
          srcCancellation: args.immutables[7][2],
          srcPublicCancellation: args.immutables[7][3],
          dstWithdrawal: args.immutables[7][4],
          dstCancellation: args.immutables[7][5],
        },
      };

      return {
        escrow: args.escrow,
        orderHash: args.orderHash,
        immutables,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
      };
    } catch (error) {
      console.error("Error parsing event log:", error);
      return null;
    }
  }

  /**
   * Get the last processed block number
   * @returns Last processed block
   */
  getLastProcessedBlock(): bigint {
    return this.lastProcessedBlock;
  }

  /**
   * Check if monitor is running
   * @returns True if running
   */
  isMonitoring(): boolean {
    return this.isRunning;
  }

  /**
   * Watch for withdrawal events on escrow contracts
   * @param escrowAddress The escrow address to watch
   * @param callback Callback for withdrawal events
   */
  async watchEscrowWithdrawals(
    escrowAddress: Address,
    callback: (secret: `0x${string}`) => Promise<void>
  ): Promise<void> {
    try {
      // Watch for EscrowWithdrawal events using monitoring client for WebSocket
      const unwatch = this.monitoringClient.watchContractEvent({
        address: escrowAddress,
        abi: [{
          type: "event",
          name: "EscrowWithdrawal",
          inputs: [
            { name: "token", type: "address", indexed: false },
            { name: "recipient", type: "address", indexed: false },
            { name: "amount", type: "uint256", indexed: false }
          ]
        }],
        onLogs: async (logs) => {
          // Get transaction details to extract secret
          for (const log of logs) {
            const tx = await this.publicClient.getTransaction({
              hash: log.transactionHash!
            });
            
            // Extract secret from transaction input
            // The withdraw function selector is 0x2e1a7d4d
            if (tx.input.startsWith("0x2e1a7d4d")) {
              const secret = `0x${tx.input.slice(10, 74)}` as `0x${string}`;
              await callback(secret);
            }
          }
        }
      });

      // Store the unwatch function for cleanup
      this.unwatchFunctions.push(unwatch);
    } catch (error) {
      console.error("Error watching escrow withdrawals:", error);
    }
  }
}