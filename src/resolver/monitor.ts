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
  private escrowFactoryAddress: Address;
  private onOrderCallback: EventCallback<SrcEscrowCreatedEvent>;
  private isRunning = false;
  private lastProcessedBlock: bigint = 0n;
  private pollingInterval?: number;

  constructor(
    publicClient: PublicClient,
    escrowFactoryAddress: Address,
    onOrderCallback: EventCallback<SrcEscrowCreatedEvent>
  ) {
    this.publicClient = publicClient;
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
    
    // Start polling
    this.pollForEvents();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    console.log("Order monitor stopped");
  }

  /**
   * Poll for new events
   */
  private async pollForEvents(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentBlock = await getCurrentBlock(this.publicClient);
        
        if (currentBlock > this.lastProcessedBlock) {
          await this.processBlocks(this.lastProcessedBlock + 1n, currentBlock);
          this.lastProcessedBlock = currentBlock;
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, BLOCK_POLLING_INTERVAL_MS));
      } catch (error) {
        console.error("Error in event polling:", error);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));
      }
    }
  }

  /**
   * Process blocks for events
   * @param fromBlock Starting block
   * @param toBlock Ending block
   */
  private async processBlocks(fromBlock: bigint, toBlock: bigint): Promise<void> {
    // Process in batches to avoid overwhelming the RPC
    let currentBlock = fromBlock;
    
    while (currentBlock <= toBlock) {
      const batchEnd = currentBlock + BigInt(EVENT_BATCH_SIZE) - 1n;
      const actualEnd = batchEnd > toBlock ? toBlock : batchEnd;
      
      await this.fetchAndProcessEvents(currentBlock, actualEnd);
      currentBlock = actualEnd + 1n;
    }
  }

  /**
   * Fetch and process events for a block range
   * @param fromBlock Starting block
   * @param toBlock Ending block
   */
  private async fetchAndProcessEvents(
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<void> {
    try {
      // Fetch SrcEscrowCreated events
      const logs = await this.publicClient.getLogs({
        address: this.escrowFactoryAddress,
        event: parseAbiItem(
          "event SrcEscrowCreated(address indexed escrow, address indexed orderHash, (bytes32,bytes32,address,address,address,uint256,uint256,(uint256,uint256,uint256,uint256,uint256,uint256)) immutables)"
        ),
        fromBlock,
        toBlock,
      });

      // Process each event
      for (const log of logs) {
        await this.processEvent(log);
      }

      if (logs.length > 0) {
        console.log(`Processed ${logs.length} SrcEscrowCreated events`);
      }
    } catch (error) {
      console.error(`Error fetching events from ${fromBlock} to ${toBlock}:`, error);
      throw error;
    }
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
      // Watch for EscrowWithdrawal events
      const unwatch = this.publicClient.watchContractEvent({
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
      // In production, we'd manage this properly
    } catch (error) {
      console.error("Error watching escrow withdrawals:", error);
    }
  }
}