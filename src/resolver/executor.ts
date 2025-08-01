import type { PublicClient, WalletClient, Address } from "viem";
import type { Immutables, OrderState } from "../types/index.ts";
import { OrderStatus } from "../types/index.ts";
import { 
  createEscrowFactory, 
  createEscrowDst, 
  createEscrowSrc,
  createERC20Token,
  waitForTransaction 
} from "../utils/contracts.ts";
import { 
  computeEscrowDstAddress, 
  computeEscrowSrcAddress,
  getProxyBytecodeHash 
} from "../utils/addresses.ts";
import { validateTokenBalance, validateTokenAllowance } from "../utils/validation.ts";
import { hasTimelockPassed } from "../utils/timelocks.ts";
import { TX_RETRY_ATTEMPTS, TX_RETRY_DELAY_MS } from "../config/constants.ts";

/**
 * Order executor that handles the execution of profitable orders
 */
export class OrderExecutor {
  private srcPublicClient: PublicClient;
  private srcWalletClient: WalletClient;
  private dstPublicClient: PublicClient;
  private dstWalletClient: WalletClient;
  private srcChainId: number;
  private dstChainId: number;

  constructor(
    srcClients: { publicClient: PublicClient; walletClient: WalletClient },
    dstClients: { publicClient: PublicClient; walletClient: WalletClient },
    srcChainId: number,
    dstChainId: number
  ) {
    this.srcPublicClient = srcClients.publicClient;
    this.srcWalletClient = srcClients.walletClient;
    this.dstPublicClient = dstClients.publicClient;
    this.dstWalletClient = dstClients.walletClient;
    this.srcChainId = srcChainId;
    this.dstChainId = dstChainId;
  }

  /**
   * Execute an order by deploying destination escrow and locking tokens
   * @param order The order to execute
   * @param escrowFactoryAddress The escrow factory address on destination chain
   * @returns True if successful
   */
  async executeOrder(
    order: OrderState,
    escrowFactoryAddress: Address
  ): Promise<boolean> {
    try {
      console.log(`Executing order ${order.id}`);

      // Validate order state
      if (order.status !== OrderStatus.SrcEscrowDeployed && order.status !== OrderStatus.Created) {
        console.error(`Order ${order.id} is not ready for execution (status: ${order.status})`);
        return false;
      }

      // Get resolver address
      const resolverAddress = this.dstWalletClient.account?.address;
      if (!resolverAddress) {
        throw new Error("No resolver address configured");
      }

      // Validate resolver has sufficient balance
      await validateTokenBalance(
        order.params.dstToken,
        resolverAddress,
        order.params.dstAmount + order.params.safetyDeposit,
        this.dstPublicClient
      );

      // Deploy destination escrow
      const dstEscrowAddress = await this.deployDestinationEscrow(
        order,
        escrowFactoryAddress
      );

      if (!dstEscrowAddress) {
        throw new Error("Failed to deploy destination escrow");
      }

      // Lock tokens in destination escrow
      const success = await this.lockTokensInEscrow(
        dstEscrowAddress,
        order.params.dstToken,
        order.params.dstAmount + order.params.safetyDeposit
      );

      if (!success) {
        throw new Error("Failed to lock tokens in escrow");
      }

      console.log(`Successfully executed order ${order.id}`);
      return true;
    } catch (error) {
      console.error(`Error executing order ${order.id}:`, error);
      return false;
    }
  }

  /**
   * Deploy destination escrow contract
   * @param order The order state
   * @param escrowFactoryAddress Factory address
   * @returns Deployed escrow address
   */
  private async deployDestinationEscrow(
    order: OrderState,
    escrowFactoryAddress: Address
  ): Promise<Address | null> {
    try {
      const factory = createEscrowFactory(
        escrowFactoryAddress,
        this.dstPublicClient,
        this.dstWalletClient
      );

      // Create destination immutables (Bob is maker on destination)
      const dstImmutables: Immutables = {
        orderHash: order.immutables.orderHash,
        hashlock: order.immutables.hashlock,
        maker: this.dstWalletClient.account!.address, // Bob
        taker: order.immutables.maker, // Alice
        token: order.params.dstToken,
        amount: order.params.dstAmount,
        safetyDeposit: order.params.safetyDeposit,
        timelocks: order.immutables.timelocks,
      };

      // Deploy escrow
      console.log("Deploying destination escrow...");
      const hash = await this.retryTransaction(async () => {
        const srcCancellationTimestamp = typeof order.immutables.timelocks.srcCancellation === 'bigint' 
          ? order.immutables.timelocks.srcCancellation 
          : BigInt(order.immutables.timelocks.srcCancellation);
        
        return await factory.write.createDstEscrow([
          dstImmutables,
          srcCancellationTimestamp
        ], {
          value: order.params.safetyDeposit
        });
      });

      // Wait for confirmation
      const receipt = await waitForTransaction(this.dstPublicClient, hash);
      
      if (receipt.status !== "success") {
        throw new Error("Escrow deployment failed");
      }

      // Get escrow address from event or compute it
      const proxyBytecodeHash = getProxyBytecodeHash(this.dstChainId);
      const escrowAddress = computeEscrowDstAddress(
        escrowFactoryAddress,
        dstImmutables,
        BigInt(this.srcChainId),
        proxyBytecodeHash
      );

      console.log(`Destination escrow deployed at ${escrowAddress}`);
      return escrowAddress;
    } catch (error) {
      console.error("Error deploying destination escrow:", error);
      return null;
    }
  }

  /**
   * Lock tokens in the destination escrow
   * @param escrowAddress The escrow address
   * @param tokenAddress The token address
   * @param amount The amount to lock (including safety deposit)
   * @returns True if successful
   */
  private async lockTokensInEscrow(
    escrowAddress: Address,
    tokenAddress: Address,
    amount: bigint
  ): Promise<boolean> {
    try {
      const token = createERC20Token(
        tokenAddress,
        this.dstPublicClient,
        this.dstWalletClient
      );

      // Check allowance
      const resolverAddress = this.dstWalletClient.account!.address;
      const allowance = await token.read.allowance([resolverAddress, escrowAddress]);

      // Approve if needed
      if (allowance < amount) {
        console.log("Approving token transfer...");
        const approveHash = await this.retryTransaction(async () => {
          return await token.write.approve([escrowAddress, amount]);
        });

        await waitForTransaction(this.dstPublicClient, approveHash);
      }

      // Transfer tokens to escrow
      console.log("Transferring tokens to escrow...");
      const transferHash = await this.retryTransaction(async () => {
        return await token.write.transfer([escrowAddress, amount]);
      });

      const receipt = await waitForTransaction(this.dstPublicClient, transferHash);
      
      return receipt.status === "success";
    } catch (error) {
      console.error("Error locking tokens:", error);
      return false;
    }
  }

  /**
   * Withdraw from source escrow using revealed secret
   * @param srcEscrowAddress Source escrow address
   * @param secret The revealed secret
   * @returns True if successful
   */
  async withdrawFromSourceEscrow(
    srcEscrowAddress: Address,
    secret: `0x${string}`
  ): Promise<boolean> {
    try {
      const escrow = createEscrowSrc(
        srcEscrowAddress,
        this.srcPublicClient,
        this.srcWalletClient
      );

      console.log(`Withdrawing from source escrow ${srcEscrowAddress}...`);
      
      // Call withdraw function
      const hash = await this.retryTransaction(async () => {
        return await escrow.write.withdraw([secret]);
      });

      const receipt = await waitForTransaction(this.srcPublicClient, hash);
      
      if (receipt.status === "success") {
        console.log("Successfully withdrew from source escrow");
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error withdrawing from source escrow:", error);
      return false;
    }
  }

  /**
   * Cancel an order on destination chain (after timelock)
   * @param dstEscrowAddress Destination escrow address
   * @returns True if successful
   */
  async cancelDestinationEscrow(dstEscrowAddress: Address): Promise<boolean> {
    try {
      const escrow = createEscrowDst(
        dstEscrowAddress,
        this.dstPublicClient,
        this.dstWalletClient
      );

      console.log(`Cancelling destination escrow ${dstEscrowAddress}...`);
      
      const hash = await this.retryTransaction(async () => {
        return await escrow.write.cancel();
      });

      const receipt = await waitForTransaction(this.dstPublicClient, hash);
      
      return receipt.status === "success";
    } catch (error) {
      console.error("Error cancelling destination escrow:", error);
      return false;
    }
  }

  /**
   * Check if an order can be cancelled
   * @param order The order to check
   * @returns True if can be cancelled
   */
  canCancelOrder(order: OrderState): boolean {
    if (!order.dstEscrowAddress) return false;
    
    // Check if destination cancellation timelock has passed
    return hasTimelockPassed(order.immutables.timelocks.dstCancellation);
  }

  /**
   * Retry a transaction with exponential backoff
   * @param fn The function to retry
   * @returns Transaction hash
   */
  private async retryTransaction(
    fn: () => Promise<`0x${string}`>
  ): Promise<`0x${string}`> {
    let lastError: any;
    
    for (let i = 0; i < TX_RETRY_ATTEMPTS; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        console.warn(`Transaction attempt ${i + 1} failed:`, error);
        
        if (i < TX_RETRY_ATTEMPTS - 1) {
          const delay = TX_RETRY_DELAY_MS * Math.pow(2, i);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Estimate gas costs for order execution
   * @param order The order to estimate
   * @returns Estimated gas costs
   */
  async estimateExecutionGas(order: OrderState): Promise<{
    deployGas: bigint;
    approveGas: bigint;
    transferGas: bigint;
    totalGas: bigint;
  }> {
    // These are rough estimates
    const deployGas = 300000n;
    const approveGas = 50000n;
    const transferGas = 70000n;
    
    return {
      deployGas,
      approveGas,
      transferGas,
      totalGas: deployGas + approveGas + transferGas,
    };
  }
}