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

/**
 * Order monitor that watches for new orders on the source chain
 */
export class OrderMonitor {
  private publicClient: PublicClient;
  private monitoringClient: PublicClient;
  private escrowFactoryAddress: Address;
  private onOrderCallback: EventCallback<SrcEscrowCreatedEvent>;
  private isRunning = false;
  private lastProcessedBlock: bigint = 0n;
  private unwatchFunctions: (() => void)[] = [];

  constructor(
    publicClient: PublicClient,
    escrowFactoryAddress: Address,
    onOrderCallback: EventCallback<SrcEscrowCreatedEvent>,
    monitoringClient?: PublicClient
  ) {
    this.publicClient = publicClient;
    this.monitoringClient = monitoringClient || publicClient;
    this.escrowFactoryAddress = escrowFactoryAddress;
    this.onOrderCallback = onOrderCallback;
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
    
    // Use WebSocket for real-time event monitoring
    console.log("Using WebSocket for real-time event monitoring");
    this.startRealtimeMonitoring();
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
    
    console.log("Order monitor stopped");
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