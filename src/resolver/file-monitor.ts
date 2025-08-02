import type { OrderMetadata } from "../types/order.ts";
import type { EventCallback } from "../types/events.ts";
import type { SrcEscrowCreatedEvent } from "../types/events.ts";

/**
 * File monitor that watches for new order files in data/orders directory
 */
export class FileMonitor {
  private isRunning = false;
  private pollingInterval?: number;
  private processedFiles = new Set<string>();
  private ordersDir = "./data/orders";
  
  constructor(
    private onOrderCallback: EventCallback<SrcEscrowCreatedEvent>
  ) {}

  /**
   * Start monitoring for new order files
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("File monitor already running");
      return;
    }

    this.isRunning = true;
    console.log("Starting file monitor for order files...");

    // Ensure orders directory exists
    await Deno.mkdir(this.ordersDir, { recursive: true }).catch(() => {});

    // Start polling
    this.pollForOrders();
    this.pollingInterval = setInterval(() => this.pollForOrders(), 1000); // Poll every 1 second for faster order detection
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
    console.log("File monitor stopped");
  }

  /**
   * Poll for new order files
   */
  private async pollForOrders(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Read all files in orders directory
      const entries = [];
      for await (const entry of Deno.readDir(this.ordersDir)) {
        if (entry.isFile && entry.name.startsWith("order-") && entry.name.endsWith(".json")) {
          entries.push(entry);
        }
      }

      // Process new files
      for (const entry of entries) {
        const filePath = `${this.ordersDir}/${entry.name}`;
        
        if (!this.processedFiles.has(entry.name)) {
          await this.processOrderFile(filePath);
          this.processedFiles.add(entry.name);
        }
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.error("Error polling for orders:", error);
      }
    }
  }

  /**
   * Process a single order file
   */
  private async processOrderFile(filePath: string): Promise<void> {
    try {
      console.log(`Processing new order file: ${filePath}`);
      
      // Read and parse order file
      const content = await Deno.readTextFile(filePath);
      const orderData = JSON.parse(content, (_, v) => {
        // Convert string BigInt values back to BigInt
        if (typeof v === 'string' && /^\d+$/.test(v) && v.length > 15) {
          return BigInt(v);
        }
        return v;
      });

      // Generate default timelocks
      const now = Math.floor(Date.now() / 1000);
      const timelocks = {
        srcWithdrawal: BigInt(orderData.crossChainData.timelocks?.srcWithdrawal ?? now + 300),
        srcPublicWithdrawal: BigInt(orderData.crossChainData.timelocks?.srcPublicWithdrawal ?? now + 600),
        srcCancellation: BigInt(orderData.crossChainData.timelocks?.srcCancellation ?? now + 900),
        srcPublicCancellation: BigInt(orderData.crossChainData.timelocks?.srcPublicCancellation ?? now + 1200),
        dstWithdrawal: BigInt(orderData.crossChainData.timelocks?.dstWithdrawal ?? now + 300),
        dstCancellation: BigInt(orderData.crossChainData.timelocks?.dstCancellation ?? now + 900),
      };

      // Convert to SrcEscrowCreatedEvent format
      const event: SrcEscrowCreatedEvent = {
        orderHash: orderData.orderHash,
        escrow: "0x0000000000000000000000000000000000000000", // Placeholder since escrow not created yet
        immutables: {
          orderHash: orderData.orderHash,
          hashlock: orderData.crossChainData.hashlock,
          maker: orderData.order.maker,
          taker: "0x0000000000000000000000000000000000000000",
          token: orderData.order.makerAsset,
          amount: BigInt(orderData.order.makingAmount),
          safetyDeposit: 0n,
          timelocks: timelocks,
        },
        blockNumber: 0n,
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        logIndex: 0,
        // Store additional order data for processing
        orderData: {
          order: orderData.order,
          signature: orderData.signature,
          crossChainData: orderData.crossChainData,
        },
      };

      // Trigger callback
      console.log(`Found new order: ${orderData.orderHash}`);
      await this.onOrderCallback(event);
      
    } catch (error) {
      console.error(`Error processing order file ${filePath}:`, error);
    }
  }
}