import {
  createPublicClient,
  type PublicClient,
  type Address,
  type Log,
  parseAbiItem,
  decodeEventLog,
} from "viem";
import { CREATE3_ADDRESSES } from "../config/contracts.ts";

/**
 * PostInteraction Event Monitor for v2.2.0
 * 
 * Monitors SimplifiedEscrowFactory events related to PostInteraction execution,
 * allowing the resolver to track escrow creation and handle failures.
 */

// Event signatures for v2.2.0 SimplifiedEscrowFactory
const POST_INTERACTION_EXECUTED_EVENT = parseAbiItem(
  "event PostInteractionExecuted(bytes32 indexed orderHash, address indexed taker, address srcEscrow, address dstEscrow)"
);

const ESCROW_CREATED_EVENT = parseAbiItem(
  "event EscrowCreated(address indexed escrowAddress, uint8 indexed escrowType, bytes32 indexed immutablesHash)"
);

const POST_INTERACTION_FAILED_EVENT = parseAbiItem(
  "event PostInteractionFailed(bytes32 indexed orderHash, address indexed taker, string reason)"
);

export interface PostInteractionExecutedEvent {
  orderHash: `0x${string}`;
  taker: Address;
  srcEscrow: Address;
  dstEscrow: Address;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export interface EscrowCreatedEvent {
  escrowAddress: Address;
  escrowType: number;
  immutablesHash: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export interface PostInteractionFailedEvent {
  orderHash: `0x${string}`;
  taker: Address;
  reason: string;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export class PostInteractionEventMonitor {
  private client: PublicClient;
  private factoryAddress: Address;
  private listeners: Map<string, (event: any) => void> = new Map();

  constructor(client: PublicClient, factoryAddress?: Address) {
    this.client = client;
    this.factoryAddress = factoryAddress || CREATE3_ADDRESSES.ESCROW_FACTORY_V2;
  }

  /**
   * Watch for PostInteractionExecuted events
   * @param callback Function to call when event is detected
   * @returns Unwatch function to stop listening
   */
  watchPostInteractionExecuted(
    callback: (event: PostInteractionExecutedEvent) => void
  ): () => void {
    const unwatch = this.client.watchContractEvent({
      address: this.factoryAddress,
      abi: [POST_INTERACTION_EXECUTED_EVENT],
      eventName: "PostInteractionExecuted",
      onLogs: (logs) => {
        for (const log of logs) {
          const decoded = decodeEventLog({
            abi: [POST_INTERACTION_EXECUTED_EVENT],
            data: log.data,
            topics: log.topics,
          });
          
          callback({
            orderHash: decoded.args.orderHash as `0x${string}`,
            taker: decoded.args.taker as Address,
            srcEscrow: decoded.args.srcEscrow as Address,
            dstEscrow: decoded.args.dstEscrow as Address,
            blockNumber: log.blockNumber || 0n,
            transactionHash: log.transactionHash,
          });
        }
      },
    });

    return unwatch;
  }

  /**
   * Watch for EscrowCreated events
   * @param callback Function to call when event is detected
   * @returns Unwatch function to stop listening
   */
  watchEscrowCreated(
    callback: (event: EscrowCreatedEvent) => void
  ): () => void {
    const unwatch = this.client.watchContractEvent({
      address: this.factoryAddress,
      abi: [ESCROW_CREATED_EVENT],
      eventName: "EscrowCreated",
      onLogs: (logs) => {
        for (const log of logs) {
          const decoded = decodeEventLog({
            abi: [ESCROW_CREATED_EVENT],
            data: log.data,
            topics: log.topics,
          });
          
          callback({
            escrowAddress: decoded.args.escrowAddress as Address,
            escrowType: Number(decoded.args.escrowType),
            immutablesHash: decoded.args.immutablesHash as `0x${string}`,
            blockNumber: log.blockNumber || 0n,
            transactionHash: log.transactionHash,
          });
        }
      },
    });

    return unwatch;
  }

  /**
   * Watch for PostInteractionFailed events
   * @param callback Function to call when event is detected
   * @returns Unwatch function to stop listening
   */
  watchPostInteractionFailed(
    callback: (event: PostInteractionFailedEvent) => void
  ): () => void {
    const unwatch = this.client.watchContractEvent({
      address: this.factoryAddress,
      abi: [POST_INTERACTION_FAILED_EVENT],
      eventName: "PostInteractionFailed",
      onLogs: (logs) => {
        for (const log of logs) {
          const decoded = decodeEventLog({
            abi: [POST_INTERACTION_FAILED_EVENT],
            data: log.data,
            topics: log.topics,
          });
          
          callback({
            orderHash: decoded.args.orderHash as `0x${string}`,
            taker: decoded.args.taker as Address,
            reason: decoded.args.reason as string,
            blockNumber: log.blockNumber || 0n,
            transactionHash: log.transactionHash,
          });
        }
      },
    });

    return unwatch;
  }

  /**
   * Get historical PostInteractionExecuted events
   * @param fromBlock Starting block number
   * @param toBlock Ending block number (optional, defaults to latest)
   * @returns Array of PostInteractionExecuted events
   */
  async getHistoricalPostInteractionExecuted(
    fromBlock: bigint,
    toBlock?: bigint
  ): Promise<PostInteractionExecutedEvent[]> {
    const logs = await this.client.getContractEvents({
      address: this.factoryAddress,
      abi: [POST_INTERACTION_EXECUTED_EVENT],
      eventName: "PostInteractionExecuted",
      fromBlock,
      toBlock: toBlock || "latest",
    });

    return logs.map((log) => {
      const decoded = decodeEventLog({
        abi: [POST_INTERACTION_EXECUTED_EVENT],
        data: log.data,
        topics: log.topics,
      });

      return {
        orderHash: decoded.args.orderHash as `0x${string}`,
        taker: decoded.args.taker as Address,
        srcEscrow: decoded.args.srcEscrow as Address,
        dstEscrow: decoded.args.dstEscrow as Address,
        blockNumber: log.blockNumber || 0n,
        transactionHash: log.transactionHash,
      };
    });
  }

  /**
   * Parse PostInteraction events from a transaction receipt
   * @param receipt Transaction receipt
   * @returns Parsed events from the transaction
   */
  parsePostInteractionEvents(receipt: any): {
    postInteractionExecuted?: PostInteractionExecutedEvent;
    escrowsCreated: EscrowCreatedEvent[];
    postInteractionFailed?: PostInteractionFailedEvent;
  } {
    let postInteractionExecuted: PostInteractionExecutedEvent | undefined;
    const escrowsCreated: EscrowCreatedEvent[] = [];
    let postInteractionFailed: PostInteractionFailedEvent | undefined;

    for (const log of receipt.logs) {
      // Check if this log is from our factory
      if (log.address.toLowerCase() !== this.factoryAddress.toLowerCase()) {
        continue;
      }

      try {
        // Try to decode as PostInteractionExecuted
        if (log.topics[0] === POST_INTERACTION_EXECUTED_EVENT.inputs?.[0]?.indexed) {
          const decoded = decodeEventLog({
            abi: [POST_INTERACTION_EXECUTED_EVENT],
            data: log.data,
            topics: log.topics,
          });
          
          postInteractionExecuted = {
            orderHash: decoded.args.orderHash as `0x${string}`,
            taker: decoded.args.taker as Address,
            srcEscrow: decoded.args.srcEscrow as Address,
            dstEscrow: decoded.args.dstEscrow as Address,
            blockNumber: receipt.blockNumber,
            transactionHash: receipt.transactionHash,
          };
        }

        // Try to decode as EscrowCreated
        if (log.topics[0] === ESCROW_CREATED_EVENT.inputs?.[0]?.indexed) {
          const decoded = decodeEventLog({
            abi: [ESCROW_CREATED_EVENT],
            data: log.data,
            topics: log.topics,
          });
          
          escrowsCreated.push({
            escrowAddress: decoded.args.escrowAddress as Address,
            escrowType: Number(decoded.args.escrowType),
            immutablesHash: decoded.args.immutablesHash as `0x${string}`,
            blockNumber: receipt.blockNumber,
            transactionHash: receipt.transactionHash,
          });
        }

        // Try to decode as PostInteractionFailed
        if (log.topics[0] === POST_INTERACTION_FAILED_EVENT.inputs?.[0]?.indexed) {
          const decoded = decodeEventLog({
            abi: [POST_INTERACTION_FAILED_EVENT],
            data: log.data,
            topics: log.topics,
          });
          
          postInteractionFailed = {
            orderHash: decoded.args.orderHash as `0x${string}`,
            taker: decoded.args.taker as Address,
            reason: decoded.args.reason as string,
            blockNumber: receipt.blockNumber,
            transactionHash: receipt.transactionHash,
          };
        }
      } catch (error) {
        // Log couldn't be decoded, skip it
        console.debug(`Could not decode log: ${error}`);
      }
    }

    return {
      postInteractionExecuted,
      escrowsCreated,
      postInteractionFailed,
    };
  }

  /**
   * Wait for PostInteraction to complete for a specific order
   * @param orderHash The order hash to wait for
   * @param timeout Timeout in milliseconds (default: 60 seconds)
   * @returns PostInteraction result or throws on timeout/failure
   */
  async waitForPostInteraction(
    orderHash: `0x${string}`,
    timeout: number = 60000
  ): Promise<PostInteractionExecutedEvent> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unwatch();
        reject(new Error(`PostInteraction timeout for order ${orderHash}`));
      }, timeout);

      const unwatch = this.watchPostInteractionExecuted((event) => {
        if (event.orderHash === orderHash) {
          clearTimeout(timeoutId);
          unwatch();
          resolve(event);
        }
      });

      // Also watch for failures
      const unwatchFailed = this.watchPostInteractionFailed((event) => {
        if (event.orderHash === orderHash) {
          clearTimeout(timeoutId);
          unwatch();
          unwatchFailed();
          reject(new Error(`PostInteraction failed: ${event.reason}`));
        }
      });
    });
  }
}