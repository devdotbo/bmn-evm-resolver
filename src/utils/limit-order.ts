import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  decodeErrorResult,
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
 * Decode a revert from SimpleLimitOrderProtocol and extract error name/args
 */
export function decodeProtocolError(error: any): {
  errorName?: string;
  errorArgs?: any[];
  data?: Hex;
  message: string;
} {
  const message = (error?.shortMessage || error?.message || String(error)) as string;

  // Try to find revert data across common shapes
  const candidates: unknown[] = [
    error?.data,
    error?.cause?.data,
    error?.cause?.data?.data,
    error?.cause?.cause?.data,
  ];

  // Also attempt to extract a 0x... hex sequence from the message
  const hexInMessage = (message.match(/0x[0-9a-fA-F]{8,}/)?.[0]) as string | undefined;
  if (hexInMessage) candidates.push(hexInMessage);

  for (const c of candidates) {
    const data = typeof c === "string" && c.startsWith("0x") ? (c as Hex) : undefined;
    if (!data) continue;
    try {
      const decoded = decodeErrorResult({ abi: SimpleLimitOrderProtocolAbi.abi, data });
      return {
        errorName: (decoded as any)?.errorName,
        errorArgs: (decoded as any)?.args,
        data,
        message,
      };
    } catch (_e) {
      // ignore and try next candidate
    }
  }

  return { message };
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
  // Prepare conservative EIP-1559 fee params (fallback to gasPrice if needed)
  let feeParams: { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint; gasPrice?: bigint } = {};
  try {
    // @ts-ignore: estimateFeesPerGas available on supported chains
    const fees = await (client as any).estimateFeesPerGas?.();
    if (fees?.maxFeePerGas && fees?.maxPriorityFeePerGas) {
      // Add 10% headroom
      const add10 = (x: bigint) => (x * 110n) / 100n;
      feeParams = {
        maxFeePerGas: add10(fees.maxFeePerGas),
        maxPriorityFeePerGas: add10(fees.maxPriorityFeePerGas),
      };
    } else {
      const gasPrice = await client.getGasPrice();
      feeParams = { gasPrice };
    }
  } catch (_e) {
    try {
      const gasPrice = await client.getGasPrice();
      feeParams = { gasPrice };
    } catch { /* leave empty, wallet may fill */ }
  }
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

  // Build takerTraits: if not provided or zero, set maker-amount mode, threshold, and encode argsExtensionLength.
  // - Bit 255 (maker-amount flag): interpret `amount` as makingAmount
  // - Bits [224..247]: argsExtensionLength so LOP parses `args` as extension
  // - Bits [0..184]: threshold (max allowed taking amount)
  const computedArgsExtLenBytes = BigInt((params.extensionData.length - 2) / 2);
  const makerAmountFlag = 1n << 255n;
  const threshold = params.order.takingAmount & ((1n << 185n) - 1n);
  const defaultTakerTraits =
    makerAmountFlag | (computedArgsExtLenBytes << 224n) | threshold;
  const takerTraits =
    params.takerTraits && params.takerTraits !== 0n
      ? params.takerTraits
      : defaultTakerTraits;

  // Try simulate first; if provider rejects due to gas quirks, fall back to direct send with manual gas.
  let hash: Hex;
  try {
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
      gas: 2_500_000n,
      ...(feeParams.maxFeePerGas
        ? { maxFeePerGas: feeParams.maxFeePerGas, maxPriorityFeePerGas: feeParams.maxPriorityFeePerGas }
        : feeParams.gasPrice
        ? { gasPrice: feeParams.gasPrice }
        : {}),
    });
    hash = await wallet.writeContract(request);
  } catch (simulateError: any) {
    const msg = (simulateError?.message || simulateError?.shortMessage || "").toLowerCase();
    const knownGasIssue =
      msg.includes("gas uint64 overflow") ||
      msg.includes("invalid operand") ||
      msg.includes("transaction creation failed");
    if (!knownGasIssue) {
      const decoded = decodeProtocolError(simulateError);
      if (decoded.errorName) {
        console.error(`fillOrderArgs simulation reverted with ${decoded.errorName}`);
        if (decoded.errorArgs && decoded.errorArgs.length > 0) {
          console.error(`args: ${JSON.stringify(decoded.errorArgs)}`);
        }
      } else {
        console.error(`fillOrderArgs simulation error: ${decoded.message}`);
      }
      const enriched: any = new Error(
        decoded.errorName ? `ProtocolRevert(${decoded.errorName})` : decoded.message,
      );
      enriched.decoded = decoded;
      enriched.code = "SIMULATION_ERROR";
      throw enriched;
    }
    // Fallback: direct write with manual gas
    try {
      hash = await wallet.writeContract({
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
        gas: 2_500_000n,
        account: wallet.account,
        ...(feeParams.maxFeePerGas
          ? { maxFeePerGas: feeParams.maxFeePerGas, maxPriorityFeePerGas: feeParams.maxPriorityFeePerGas }
          : feeParams.gasPrice
          ? { gasPrice: feeParams.gasPrice }
          : {}),
      });
    } catch (writeError: any) {
      const decoded = decodeProtocolError(writeError);
      if (decoded.errorName) {
        console.error(`fillOrderArgs send reverted with ${decoded.errorName}`);
        if (decoded.errorArgs && decoded.errorArgs.length > 0) {
          console.error(`args: ${JSON.stringify(decoded.errorArgs)}`);
        }
      } else {
        console.error(`fillOrderArgs send error: ${decoded.message}`);
      }
      const enriched: any = new Error(
        decoded.errorName ? `ProtocolRevert(${decoded.errorName})` : decoded.message,
      );
      enriched.decoded = decoded;
      enriched.code = "SEND_ERROR";
      throw enriched;
    }
  }
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
