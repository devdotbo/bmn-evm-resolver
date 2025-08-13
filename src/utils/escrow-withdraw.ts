import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  type Hex,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  type PublicClient,
  type WalletClient,
} from "viem";
import { base, optimism } from "viem/chains";
import EscrowSrcV2Abi from "../../abis/EscrowSrcV2.json" with { type: "json" };
import EscrowDstV2Abi from "../../abis/EscrowDstV2.json" with { type: "json" };
import SimplifiedEscrowFactoryV2_3Abi from "../../abis/SimplifiedEscrowFactoryV2_3.json" with { type: "json" };
import { hashTypedData, type Address as ViemAddress } from "viem";
import { SecretManager } from "../state/SecretManager.ts";
import { PonderClient } from "../indexer/ponder-client.ts";

export interface EscrowImmutables {
  orderHash: Hex;
  hashlock: Hex;
  maker: bigint; // Address packed as uint256
  taker: bigint; // Address packed as uint256
  token: bigint; // Address packed as uint256
  amount: bigint;
  safetyDeposit: bigint;
  timelocks: bigint;
}

export interface WithdrawParams {
  escrowAddress: Address;
  secret: Hex;
  immutables: EscrowImmutables;
  isSource: boolean; // true for source escrow, false for destination
}

/**
 * Utility class for withdrawing from escrows
 */
export class EscrowWithdrawManager {
  private secretManager: SecretManager;
  private ponderClient: PonderClient;

  constructor() {
    this.secretManager = new SecretManager();
    this.ponderClient = new PonderClient({
      url: Deno.env.get("INDEXER_URL") || "http://localhost:42069",
    });
  }

  /**
   * Pack an address into a uint256 for the immutables structure
   */
  private packAddress(address: Address): bigint {
    return BigInt(address);
  }

  /**
   * Withdraw from a destination escrow (Alice withdrawing from Bob's escrow)
   */
  async withdrawFromDestination(
    orderHash: string,
    client: PublicClient,
    wallet: WalletClient,
    account: any,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Get secret from SecretManager
      const secret = await this.secretManager.getSecretByOrderHash(orderHash);
      if (!secret) {
        throw new Error(`No secret found for order ${orderHash}`);
      }

      // Get swap details from indexer
      const swap = await this.ponderClient.getAtomicSwapByOrderHash(orderHash);
      if (!swap || !swap.dstEscrowAddress) {
        throw new Error(`No destination escrow found for order ${orderHash}`);
      }

      console.log(`\n💰 Withdrawing from destination escrow`);
      console.log(`   Chain: ${swap.dstChainId}`);
      console.log(`   Escrow: ${swap.dstEscrowAddress}`);
      console.log(`   Revealing secret: ${secret}`);

      // Construct immutables from swap data
      const immutables: EscrowImmutables = {
        orderHash: orderHash as Hex,
        hashlock: swap.hashlock as Hex,
        maker: this.packAddress(swap.dstReceiver as Address), // Destination maker is receiver
        taker: this.packAddress(swap.srcMaker as Address), // Taker is source maker (resolver)
        token: this.packAddress(swap.dstToken as Address),
        amount: BigInt(swap.dstAmount as string | number | bigint),
        safetyDeposit: BigInt((swap.dstSafetyDeposit || 0) as string | number | bigint),
        timelocks: BigInt(swap.timelocks as string | number | bigint),
      };

      // Prefer EIP-712 signed public withdrawal on v2.3
      // Domain: name BMN-Escrow, version 2.3, verifyingContract = escrow clone
      const domain = {
        name: "BMN-Escrow",
        version: "2.3",
        chainId: Number(swap.dstChainId),
        verifyingContract: swap.dstEscrowAddress as ViemAddress,
      } as const;
      const types = {
        PublicAction: [
          { name: "orderHash", type: "bytes32" },
          { name: "caller", type: "address" },
          { name: "action", type: "string" },
        ],
      } as const;
      const message = {
        orderHash: orderHash as `0x${string}`,
        caller: account.address as `0x${string}`,
        action: "DST_PUBLIC_WITHDRAW",
      } as const;

      // Sign typed data with resolver key
      const signature = await wallet.signTypedData({
        account,
        domain,
        types,
        primaryType: "PublicAction",
        message,
      } as any);

      // Simulate signed call first
      const { request } = await client.simulateContract({
        account,
        address: swap.dstEscrowAddress as Address,
        abi: EscrowDstV2Abi.abi,
        functionName: "publicWithdrawSigned",
        args: [secret, immutables, signature as `0x${string}`],
      });

      // Execute the withdrawal
      const hash = await wallet.writeContract(request as any);
      console.log(`📝 Withdrawal (signed) transaction sent: ${hash}`);

      // Wait for confirmation
      const receipt = await client.waitForTransactionReceipt({
        hash,
        confirmations: 2,
      });

      if (receipt.status === "success") {
        console.log(`✅ Successfully withdrew from destination escrow`);
        console.log(`   Transaction: ${receipt.transactionHash}`);
        console.log(`   Gas used: ${receipt.gasUsed}`);

        // Store withdrawal confirmation
        await this.secretManager.confirmSecret(
          orderHash as `0x${string}`,
          receipt.transactionHash,
          receipt.gasUsed,
        );

        return { success: true, txHash: receipt.transactionHash };
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error) {
      console.error(`❌ Failed to withdraw from destination:`, error);
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);

      // Mark as failed in secret manager
      await this.secretManager.markFailed(
        orderHash as `0x${string}`,
        errorMessage,
      );

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Withdraw from a source escrow (Resolver withdrawing after learning secret)
   */
  async withdrawFromSource(
    orderHash: string,
    secret: Hex,
    client: PublicClient,
    wallet: WalletClient,
    account: any,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Get swap details from indexer
      const swap = await this.ponderClient.getAtomicSwapByOrderHash(orderHash);
      if (!swap || !swap.srcEscrowAddress) {
        throw new Error(`No source escrow found for order ${orderHash}`);
      }

      console.log(`\n💰 Withdrawing from source escrow`);
      console.log(`   Chain: ${swap.srcChainId}`);
      console.log(`   Escrow: ${swap.srcEscrowAddress}`);
      console.log(`   Using secret: ${secret}`);

      // Construct immutables from swap data
      const immutables: EscrowImmutables = {
        orderHash: orderHash as Hex,
        hashlock: swap.hashlock as Hex,
        maker: this.packAddress(swap.srcMaker as Address),
        taker: this.packAddress(swap.srcTaker as Address), // Resolver address
        token: this.packAddress(swap.srcToken as Address),
        amount: BigInt(swap.srcAmount as string | number | bigint),
        safetyDeposit: BigInt((swap.srcSafetyDeposit || 0) as string | number | bigint),
        timelocks: BigInt(swap.timelocks as string | number | bigint),
      };

      // Simulate the withdrawal first
      const { request } = await client.simulateContract({
        account,
        address: swap.srcEscrowAddress as Address,
        abi: EscrowSrcV2Abi.abi,
        functionName: "withdraw",
        args: [secret, immutables],
      });

      // Execute the withdrawal
      const hash = await wallet.writeContract(request as any);
      console.log(`📝 Withdrawal transaction sent: ${hash}`);

      // Wait for confirmation
      const receipt = await client.waitForTransactionReceipt({
        hash,
        confirmations: 2,
      });

      if (receipt.status === "success") {
        console.log(`✅ Successfully withdrew from source escrow`);
        console.log(`   Transaction: ${receipt.transactionHash}`);
        console.log(`   Gas used: ${receipt.gasUsed}`);

        return { success: true, txHash: receipt.transactionHash };
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error) {
      console.error(`❌ Failed to withdraw from source:`, error);
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Retry withdrawal with exponential backoff
   */
  async withdrawWithRetry(
    params: WithdrawParams,
    client: PublicClient,
    wallet: WalletClient,
    account: any,
    maxRetries: number = 3,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    let lastError: string = "";

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`\n🔄 Withdrawal attempt ${attempt}/${maxRetries}`);

        // Choose the right ABI based on escrow type
        const abi = params.isSource ? EscrowSrcV2Abi.abi : EscrowDstV2Abi.abi;

        // Simulate first
        const { request } = await client.simulateContract({
          account,
          address: params.escrowAddress,
          abi,
          functionName: "withdraw",
          args: [params.secret, params.immutables],
        });

        // Execute
        const hash = await wallet.writeContract(request as any);
        console.log(`📝 Transaction sent: ${hash}`);

        // Wait for confirmation
        const receipt = await client.waitForTransactionReceipt({
          hash,
          confirmations: 2,
        });

        if (receipt.status === "success") {
          return { success: true, txHash: receipt.transactionHash };
        } else {
          throw new Error("Transaction failed");
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error(`❌ Attempt ${attempt} failed:`, lastError);

        // Check if error is recoverable
        if (lastError.includes("InvalidSecret")) {
          console.error("❌ Invalid secret - cannot retry");
          break;
        }

        if (lastError.includes("InvalidTime")) {
          console.error(
            "❌ Timelock not expired or already expired - cannot retry",
          );
          break;
        }

        if (lastError.includes("InvalidCaller")) {
          console.error("❌ Not authorized to withdraw - cannot retry");
          break;
        }

        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`⏳ Waiting ${waitTime / 1000}s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    return {
      success: false,
      error: `Failed after ${maxRetries} attempts: ${lastError}`,
    };
  }

  /**
   * Get escrows that can be withdrawn (have revealed secrets)
   * Used by BobResolverService to find withdrawal opportunities
   */
  async getWithdrawableEscrows(): Promise<
    Array<{
      address: Address;
      hashlock: string;
      secret: string;
      chainId: number;
      isSource: boolean;
    }>
  > {
    try {
      // Get revealed secrets from indexer
      const recentWithdrawals = await this.ponderClient.getRecentWithdrawals(
        100,
      );
      const revealedSecrets = await this.ponderClient.getRevealedSecrets();

      // Combine secrets from both sources
      const secretsMap = new Map<string, string>();

      for (const withdrawal of recentWithdrawals) {
        if (withdrawal.secret && withdrawal.hashlock) {
          secretsMap.set(withdrawal.hashlock as string, withdrawal.secret as string);
        }
      }

      for (const secret of revealedSecrets) {
        if (secret.secret && secret.hashlock) {
          secretsMap.set(secret.hashlock as string, secret.secret as string);
        }
      }

      // Find escrows that haven't been withdrawn yet
      const withdrawableEscrows: Array<{
        address: Address;
        hashlock: string;
        secret: string;
        chainId: number;
        isSource: boolean;
      }> = [];

      // Check each secret against pending escrows
      for (const [hashlock, secret] of secretsMap.entries()) {
        // Get atomic swap details
        const swaps = await this.ponderClient.getSwapsByHashlock(hashlock);

        for (const swap of swaps) {
          // Check if source escrow can be withdrawn
          if (
            swap.srcEscrowAddress && swap.status !== "completed" &&
            !swap.srcWithdrawnAt
          ) {
            withdrawableEscrows.push({
              address: swap.srcEscrowAddress as Address,
              hashlock,
              secret,
              chainId: Number(swap.srcChainId),
              isSource: true,
            });
          }

          // Check if destination escrow can be withdrawn
          if (
            swap.dstEscrowAddress && swap.status !== "completed" &&
            !swap.dstWithdrawnAt
          ) {
            withdrawableEscrows.push({
              address: swap.dstEscrowAddress as Address,
              hashlock,
              secret,
              chainId: Number(swap.dstChainId),
              isSource: false,
            });
          }
        }
      }

      console.log(
        `🔍 Found ${withdrawableEscrows.length} withdrawable escrows`,
      );
      return withdrawableEscrows;
    } catch (error) {
      console.error("❌ Error getting withdrawable escrows:", error);
      return [];
    }
  }

  /**
   * Withdraw from an escrow
   * Generic method used by BobResolverService
   */
  async withdraw(escrow: {
    address: Address;
    hashlock: string;
    secret: string;
    chainId: number;
    isSource: boolean;
  }): Promise<boolean> {
    try {
      console.log(
        `💸 Withdrawing from ${
          escrow.isSource ? "source" : "destination"
        } escrow`,
      );
      console.log(`   Address: ${escrow.address}`);
      console.log(`   Chain: ${escrow.chainId}`);
      console.log(`   Hashlock: ${escrow.hashlock}`);

      const ankrKey = Deno.env.get("ANKR_API_KEY") || "";
      const publicClient = createPublicClient({
        chain: escrow.chainId === base.id ? base : optimism,
        transport: http(
          escrow.chainId === base.id
            ? `https://rpc.ankr.com/base/${ankrKey}`
            : `https://rpc.ankr.com/optimism/${ankrKey}`,
        ),
      });
      const { privateKeyToAccount, nonceManager } = await import("viem/accounts");
      const pk = (Deno.env.get("RESOLVER_PRIVATE_KEY") ||
        Deno.env.get("ALICE_PRIVATE_KEY") || "") as `0x${string}`;
      if (!pk) {
        throw new Error(
          "Missing RESOLVER_PRIVATE_KEY/ALICE_PRIVATE_KEY for withdrawal",
        );
      }
      const walletClient = createWalletClient({
        chain: escrow.chainId === base.id ? base : optimism,
        transport: http(
          escrow.chainId === base.id
            ? `https://rpc.ankr.com/base/${ankrKey}`
            : `https://rpc.ankr.com/optimism/${ankrKey}`,
        ),
        account: privateKeyToAccount(pk, { nonceManager }),
      });

      const result = escrow.isSource
        ? await this.withdrawFromSource(
          escrow.hashlock,
          escrow.secret as `0x${string}`,
          publicClient as any,
          walletClient,
          walletClient.account,
        )
        : await this.withdrawFromDestination(
          escrow.hashlock,
          publicClient as any,
          walletClient,
          walletClient.account,
        );

      return result.success;
    } catch (error) {
      console.error("❌ Error during withdrawal:", error);
      return false;
    }
  }

  /**
   * Monitor and auto-withdraw when secrets are revealed
   */
  async monitorAndWithdraw(
    client: PublicClient,
    wallet: WalletClient,
    account: any,
    pollingInterval: number = 10000,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    console.log(`\n🔍 Starting withdrawal monitor...`);
    console.log(`   Polling interval: ${pollingInterval / 1000}s`);

    const sleep = (ms: number) => new Promise<void>((resolve) => {
      const timerId = setTimeout(resolve, ms);
      if (abortSignal) {
        const onAbort = () => {
          clearTimeout(timerId);
          abortSignal.removeEventListener("abort", onAbort);
          resolve();
        };
        abortSignal.addEventListener("abort", onAbort, { once: true });
      }
    });

    while (!abortSignal?.aborted) {
      try {
        // Check for revealed secrets that haven't been withdrawn
        const pendingSecrets = await this.secretManager.getPendingSecrets();

        for (const secretRecord of pendingSecrets) {
          if (secretRecord.status === "pending") {
            console.log(
              `\n🎯 Found pending secret for order ${secretRecord.hashlock}`,
            );

            // Get swap details
            const swap = await this.ponderClient.getAtomicSwapByOrderHash(
              secretRecord.hashlock,
            );

            if (swap && swap.srcEscrowAddress) {
              console.log(`   Attempting to withdraw from source escrow...`);

              const result = await this.withdrawFromSource(
                secretRecord.hashlock,
                secretRecord.secret as Hex,
                client,
                wallet,
                account,
              );

              if (result.success) {
                console.log(`✅ Successfully withdrew from source escrow`);
              } else {
                console.error(`❌ Failed to withdraw:`, result.error);
              }
            }
          }
        }
      } catch (error) {
        console.error("❌ Error in withdrawal monitor:", error);
      }

      await sleep(pollingInterval);
    }
  }
}
