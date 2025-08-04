import {
  type PublicClient,
  type Log,
  parseAbiItem,
  type Address,
} from "viem";
import { IndexerClient } from "../indexer/client.ts";
import type { SecretRevealEvent } from "../indexer/types.ts";

export interface WithdrawnEvent {
  escrowAddress: Address;
  secret: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
}

/**
 * Monitor for destination chain events (secret reveals)
 * Supports both indexer-based and event-based monitoring
 */
export class DestinationChainMonitor {
  private publicClient: PublicClient;
  private monitoringClient: PublicClient;
  private onSecretRevealCallback: (event: WithdrawnEvent) => Promise<void>;
  private lastProcessedBlock: bigint = 0n;
  private isRunning = false;
  private unwatchFunctions: (() => void)[] = [];
  
  // Indexer support
  private indexerClient?: IndexerClient;
  private useIndexer: boolean;
  private hybridMode: boolean;

  constructor(
    publicClient: PublicClient,
    onSecretRevealCallback: (event: WithdrawnEvent) => Promise<void>,
    monitoringClient?: PublicClient,
    options?: {
      indexerClient?: IndexerClient;
      useIndexer?: boolean;
      hybridMode?: boolean;
    }
  ) {
    this.publicClient = publicClient;
    this.monitoringClient = monitoringClient || publicClient;
    this.onSecretRevealCallback = onSecretRevealCallback;
    
    // Indexer configuration
    this.indexerClient = options?.indexerClient;
    this.useIndexer = options?.useIndexer || false;
    this.hybridMode = options?.hybridMode || false;
  }

  /**
   * Start monitoring for withdrawn events
   * @param fromBlock Starting block number
   */
  async start(fromBlock?: bigint): Promise<void> {
    if (this.isRunning) {
      console.log("Destination chain monitor already running");
      return;
    }

    // Get current block if not specified
    this.lastProcessedBlock = fromBlock ?? await this.publicClient.getBlockNumber();
    this.isRunning = true;

    console.log(`Starting destination chain monitor from block ${this.lastProcessedBlock}`);

    // Determine monitoring mode
    if (this.useIndexer && this.indexerClient) {
      console.log("Using indexer-based monitoring for secret reveals");
      await this.startIndexerMonitoring();
      
      if (this.hybridMode) {
        console.log("Also enabling WebSocket event monitoring (hybrid mode)");
        this.startRealtimeMonitoring();
      }
    } else {
      // Use WebSocket for real-time monitoring
      console.log("Using WebSocket for real-time destination chain monitoring");
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
    
    console.log("Destination chain monitor stopped");
  }

  /**
   * Start indexer-based monitoring
   */
  private async startIndexerMonitoring(): Promise<void> {
    if (!this.indexerClient) {
      console.error("Indexer client not configured");
      return;
    }
    
    try {
      // Subscribe to secret reveals via indexer
      const unsubscribe = await this.indexerClient.subscribeToSecretReveals(
        async (event: SecretRevealEvent) => {
          // Convert to WithdrawnEvent format
          const withdrawnEvent: WithdrawnEvent = {
            escrowAddress: event.escrowAddress as Address,
            secret: event.secret as `0x${string}`,
            blockNumber: BigInt(event.blockNumber || 0),
            transactionHash: event.transactionHash as `0x${string}`,
            logIndex: 0, // Not available from indexer
          };
          
          await this.onSecretRevealCallback(withdrawnEvent);
        }
      );
      
      this.unwatchFunctions.push(unsubscribe);
      
      console.log("Started indexer-based secret reveal monitoring");
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
   * Start real-time monitoring using WebSocket
   */
  private startRealtimeMonitoring(): void {
    // Watch for EscrowWithdrawal events on all addresses
    const unwatch = this.monitoringClient.watchContractEvent({
      // Watch all addresses since we don't know the escrow addresses in advance
      abi: [{
        type: "event",
        name: "EscrowWithdrawal",
        inputs: [
          { name: "secret", type: "bytes32", indexed: false }
        ]
      }],
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.processEvent(log);
        }
      },
      onError: (error) => {
        console.error("WebSocket monitoring error on destination chain:", error);
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
      const event = this.parseEventLog(log);
      
      if (event) {
        console.log(`Secret revealed on destination chain: ${event.secret}`);
        console.log(`From escrow: ${event.escrowAddress}`);
        await this.onSecretRevealCallback(event);
      }
    } catch (error) {
      console.error("Error processing destination event:", error);
    }
  }

  /**
   * Parse event log into WithdrawnEvent
   * @param log The raw log
   * @returns Parsed event or null
   */
  private parseEventLog(log: Log): WithdrawnEvent | null {
    try {
      if (!log.args || !log.blockNumber || !log.transactionHash || log.logIndex === undefined || !log.address) {
        return null;
      }

      const args = log.args as any;
      
      return {
        escrowAddress: log.address as Address,
        secret: args.secret || args[0], // Handle both named and unnamed args
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
      };
    } catch (error) {
      console.error("Error parsing withdrawal event log:", error);
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
}