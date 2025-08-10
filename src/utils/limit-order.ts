import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  parseAbi,
  type PublicClient,
  type WalletClient,
} from "viem";
import { TokenApprovalManager } from "./token-approvals.ts";
import { PostInteractionEventMonitor } from "../monitoring/postinteraction-events.ts";
import { PostInteractionErrorHandler } from "./postinteraction-errors.ts";
import SimpleLimitOrderProtocolAbi from "../../abis/SimpleLimitOrderProtocol.json" with {
  type: "json",
};

/**
 * Utility functions for interacting with SimpleLimitOrderProtocol
 * Handles order filling through the protocol which triggers PostInteraction
 */

export interface LimitOrderData {
  salt: bigint;
  maker: Address;
  receiver: Address;
  makerAsset: Address;
  takerAsset: Address;
  makingAmount: bigint;
  takingAmount: bigint;
  makerTraits: bigint;
}

export interface FillOrderParams {
  order: LimitOrderData;
  signature: Hex;
  extensionData: Hex;
  fillAmount: bigint;
  takerTraits?: bigint;
}

export interface FillOrderResult {
  transactionHash: Hex;
  gasUsed: bigint;
  postInteractionExecuted: boolean;
  srcEscrow?: Address;
  dstEscrow?: Address;
  orderHash?: string;
}

/**
 * Fills a limit order through SimpleLimitOrderProtocol
 * The protocol will automatically trigger the factory's postInteraction if configured
 *
 * @param client Public client for reading blockchain state
 * @param wallet Wallet client for sending transactions
 * @param protocolAddress Address of SimpleLimitOrderProtocol contract
 * @param params Order parameters and signature
 * @param factoryAddress Factory address for monitoring PostInteraction events
 * @returns Fill result with transaction details and escrow addresses if created
 */
export async function fillLimitOrder(
  client: PublicClient,
  wallet: WalletClient,
  protocolAddress: Address,
  params: FillOrderParams,
  factoryAddress: Address,
): Promise<FillOrderResult> {
  // Extract signature components (r, vs) from the signature
  const signature = params.signature;
  const r = signature.slice(0, 66) as Hex; // 0x + 64 hex chars = 32 bytes

  // Extract s and v
  const s = signature.slice(66, 130); // 64 hex chars = 32 bytes
  const v = signature.slice(130, 132); // 2 hex chars = 1 byte

  // Pack v into the highest bit of s to create vs
  const vNum = parseInt(v, 16);
  let sWithV = s;
  if (vNum === 28 || vNum === 1) {
    // Set the highest bit by ORing with 0x80...
    const sBigInt = BigInt(`0x${s}`);
    const vMask = BigInt(
      "0x8000000000000000000000000000000000000000000000000000000000000000",
    );
    const packedBigInt = sBigInt | vMask;
    sWithV = packedBigInt.toString(16).padStart(64, "0");
  }
  const vs = `0x${sWithV}` as Hex;

  // Build takerTraits: if not provided or zero, encode argsExtensionLength so LOP parses `args` as extension
  // TakerTraitsLib encodes extension length in bits [224..247] (24 bits). We pass only extension in `args`.
  const computedArgsExtLenBytes = BigInt((params.extensionData.length - 2) / 2);
  const defaultTakerTraits = computedArgsExtLenBytes << 224n;
  const takerTraits = params.takerTraits && params.takerTraits !== 0n
    ? params.takerTraits
    : defaultTakerTraits;

  // Simulate transaction first to catch errors early
  const { request } = await client.simulateContract({
    address: protocolAddress,
    abi: SimpleLimitOrderProtocolAbi.abi,
    functionName: "fillOrderArgs",
    args: [
      params.order,
      r,
      vs,
      params.fillAmount,
      takerTraits,
      params.extensionData,
    ],
    account: wallet.account,
  });

  // Execute the transaction
  const hash = await wallet.writeContract(request);
  console.log(`📝 Fill order transaction sent: ${hash}`);

  // Wait for confirmation
  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log(`✅ Order filled successfully in tx: ${receipt.transactionHash}`);
  console.log(`   Gas used: ${receipt.gasUsed}`);
  console.log(`   Block: ${receipt.blockNumber}`);

  // Parse PostInteraction events from the receipt
  const eventMonitor = new PostInteractionEventMonitor(client, factoryAddress);
  const events = eventMonitor.parsePostInteractionEvents(receipt);

  const result: FillOrderResult = {
    transactionHash: receipt.transactionHash,
    gasUsed: receipt.gasUsed,
    postInteractionExecuted: false,
  };

  if (events.postInteractionExecuted) {
    console.log(`✨ PostInteraction executed successfully!`);
    console.log(`   Order Hash: ${events.postInteractionExecuted.orderHash}`);
    console.log(
      `   Source Escrow: ${events.postInteractionExecuted.srcEscrow}`,
    );
    console.log(
      `   Destination Escrow: ${events.postInteractionExecuted.dstEscrow}`,
    );

    result.postInteractionExecuted = true;
    result.orderHash = events.postInteractionExecuted.orderHash;
    result.srcEscrow = events.postInteractionExecuted.srcEscrow as Address;
    result.dstEscrow = events.postInteractionExecuted.dstEscrow as Address;
  } else if (events.postInteractionFailed) {
    console.error(
      `❌ PostInteraction failed: ${events.postInteractionFailed.reason}`,
    );
    throw new Error(
      `PostInteraction failed: ${events.postInteractionFailed.reason}`,
    );
  } else {
    console.warn(`⚠️ No PostInteraction events found in transaction`);
  }

  // Log escrow creation events
  if (events.escrowsCreated.length > 0) {
    console.log(`📦 Created ${events.escrowsCreated.length} escrows:`);
    for (const escrow of events.escrowsCreated) {
      console.log(
        `   - ${escrow.escrowAddress} (type: ${
          escrow.escrowType === 0 ? "Source" : "Destination"
        })`,
      );
    }
  }

  return result;
}

/**
 * Ensures proper token approvals for SimpleLimitOrderProtocol and Factory
 * The protocol needs approval to take tokens from the filler
 * The factory needs approval for PostInteraction token transfers
 *
 * @param client Public client for reading blockchain state
 * @param wallet Wallet client for sending transactions
 * @param tokenAddress Token to approve
 * @param protocolAddress SimpleLimitOrderProtocol address
 * @param factoryAddress Factory address for PostInteraction
 * @param amount Amount to approve
 */
export async function ensureLimitOrderApprovals(
  client: PublicClient,
  wallet: WalletClient,
  tokenAddress: Address,
  protocolAddress: Address,
  factoryAddress: Address,
  amount: bigint,
): Promise<void> {
  const account = wallet.account?.address;
  if (!account) throw new Error("No account available in wallet");

  // Check and approve for protocol
  const protocolAllowance = await client.readContract({
    address: tokenAddress,
    abi: parseAbi([
      "function allowance(address owner, address spender) view returns (uint256)",
    ]),
    functionName: "allowance",
    args: [account, protocolAddress],
  });

  if (protocolAllowance < amount) {
    console.log(`🔓 Approving tokens for SimpleLimitOrderProtocol...`);
    console.log(`   Current allowance: ${protocolAllowance}`);
    console.log(`   Required: ${amount}`);

    const approveHash = await wallet.writeContract({
      address: tokenAddress,
      abi: parseAbi([
        "function approve(address spender, uint256 amount) returns (bool)",
      ]),
      functionName: "approve",
      args: [protocolAddress, amount * 10n], // Approve 10x for future orders
    });

    const approveReceipt = await client.waitForTransactionReceipt({
      hash: approveHash,
    });
    console.log(`✅ Protocol approval tx: ${approveHash}`);
    console.log(`   Gas used: ${approveReceipt.gasUsed}`);
  } else {
    console.log(
      `✅ Sufficient allowance already set for protocol: ${protocolAllowance}`,
    );
  }

  // Check and approve for factory (critical for PostInteraction)
  console.log(`🏭 Checking Factory approval (v2.2.0 requirement)...`);
  const approvalManager = new TokenApprovalManager(factoryAddress);
  const factoryApprovalHash = await approvalManager.ensureApproval(
    client,
    wallet,
    tokenAddress,
    account,
    amount,
  );

  if (factoryApprovalHash) {
    console.log(`✅ Factory approved for PostInteraction transfers`);
  }
}

/**
 * Handles errors during limit order filling with retry logic
 *
 * @param error The error that occurred
 * @param context Error context for recovery decisions
 * @param client Public client for reading blockchain state
 * @param wallet Wallet client for sending transactions
 * @returns Whether to retry and what action to take
 */
export async function handleLimitOrderError(
  error: any,
  context: {
    orderHash: string;
    resolverAddress: string;
    factoryAddress: Address;
    tokenAddress: Address;
    amount: bigint;
  },
  client?: PublicClient,
  wallet?: WalletClient,
): Promise<{ retry: boolean; action?: string }> {
  const recovery = await PostInteractionErrorHandler.handleError(
    error,
    context,
  );

  if (
    recovery.retry && recovery.action === "APPROVE_FACTORY" && client && wallet
  ) {
    console.log("🔄 Re-approving factory...");
    const approvalManager = new TokenApprovalManager(context.factoryAddress);
    await approvalManager.ensureApproval(
      client,
      wallet,
      context.tokenAddress,
      context.resolverAddress as Address,
      context.amount,
    );
  }

  return recovery;
}

/**
 * Calculates the order hash for a limit order
 * Uses the protocol's hashOrder function to get the proper EIP-712 hash
 *
 * @param client Public client for reading blockchain state
 * @param protocolAddress SimpleLimitOrderProtocol address
 * @param order The order to hash
 * @returns The order hash
 */
export async function calculateOrderHash(
  client: PublicClient,
  protocolAddress: Address,
  order: LimitOrderData,
): Promise<string> {
  const orderHash = await client.readContract({
    address: protocolAddress,
    abi: SimpleLimitOrderProtocolAbi.abi,
    functionName: "hashOrder",
    args: [[
      order.salt,
      order.maker,
      order.receiver,
      order.makerAsset,
      order.takerAsset,
      order.makingAmount,
      order.takingAmount,
      order.makerTraits,
    ]],
  });

  return orderHash as string;
}
