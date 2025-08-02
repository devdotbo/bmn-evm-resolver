import {
  type PublicClient,
  type Log,
  parseAbiItem,
  type Address,
} from "viem";

export interface WithdrawnEvent {
  escrowAddress: Address;
  secret: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
}

/**
 * Monitor for destination chain events (secret reveals)
 */
export class DestinationChainMonitor {
  private publicClient: PublicClient;
  private onSecretRevealCallback: (event: WithdrawnEvent) => Promise<void>;
  private lastProcessedBlock: bigint = 0n;
  private isRunning = false;
  private pollInterval: number;
  private intervalId?: number;

  constructor(
    publicClient: PublicClient,
    onSecretRevealCallback: (event: WithdrawnEvent) => Promise<void>,
    pollInterval = 12000, // 12 seconds default
  ) {
    this.publicClient = publicClient;
    this.onSecretRevealCallback = onSecretRevealCallback;
    this.pollInterval = pollInterval;
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

    // Start polling
    await this.poll();
    this.intervalId = setInterval(() => this.poll(), this.pollInterval);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    console.log("Destination chain monitor stopped");
  }

  /**
   * Poll for new events
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const currentBlock = await this.publicClient.getBlockNumber();
      
      if (currentBlock > this.lastProcessedBlock) {
        await this.fetchEvents(this.lastProcessedBlock + 1n, currentBlock);
        this.lastProcessedBlock = currentBlock;
      }
    } catch (error) {
      console.error("Error polling destination chain:", error);
    }
  }

  /**
   * Fetch events from a block range
   * @param fromBlock Start block
   * @param toBlock End block
   */
  private async fetchEvents(fromBlock: bigint, toBlock: bigint): Promise<void> {
    try {
      // Get all logs for Withdrawn events
      const logs = await this.publicClient.getLogs({
        event: parseAbiItem("event EscrowWithdrawal(bytes32 secret)"),
        fromBlock,
        toBlock,
      });

      // Process each event
      for (const log of logs) {
        await this.processEvent(log);
      }

      if (logs.length > 0) {
        console.log(`Processed ${logs.length} withdrawal events on destination chain`);
      }
    } catch (error) {
      console.error(`Error fetching destination events from ${fromBlock} to ${toBlock}:`, error);
    }
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