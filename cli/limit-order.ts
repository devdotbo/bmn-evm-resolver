import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { decodeErrorResult } from "viem";
import { simpleLimitOrderProtocolAbi } from "./abis.ts";
import { ierc20Abi as generatedErc20Abi } from "../src/generated/contracts.ts";

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
  signature: Hex; // 65-byte 0x... signature
  extensionData: Hex;
  fillAmount: bigint;
  takerTraits?: bigint;
}

export function decodeRevert(error: any): { message: string; selector?: string; data?: Hex } {
  const msg = (error?.shortMessage || error?.message || String(error)) as string;
  const candidates: unknown[] = [
    error?.data,
    error?.cause?.data,
    error?.cause?.data?.data,
    error?.cause?.cause?.data,
    error?.error?.data,
    error?.cause?.error?.data,
  ];
  const hexInMessage = (msg.match(/0x[0-9a-fA-F]{8,}/)?.[0]) as string | undefined;
  if (hexInMessage) candidates.push(hexInMessage);
  let firstHex: Hex | undefined;
  for (const c of candidates) {
    const data = typeof c === "string" && c.startsWith("0x") ? (c as Hex) : undefined;
    if (!data) continue;
    if (!firstHex) firstHex = data;
    try {
      decodeErrorResult({ abi: simpleLimitOrderProtocolAbi as any, data });
      return { message: msg, selector: (data.length >= 10 ? data.slice(0, 10) : undefined) as any, data };
    } catch {
      // ignore non-decodable candidates
    }
  }
  if (firstHex) return { message: msg, selector: (firstHex.length >= 10 ? firstHex.slice(0, 10) : undefined) as any, data: firstHex };
  return { message: msg };
}

export async function ensureApprovals(
  client: PublicClient,
  wallet: WalletClient,
  tokenAddress: Address,
  protocolAddress: Address,
  factoryAddress: Address,
  amount: bigint,
): Promise<void> {
  const account = wallet.account?.address as Address;
  if (!account) throw new Error("No account");
  const erc20 = generatedErc20Abi as any;
  const allowance = await client.readContract({ address: tokenAddress, abi: erc20, functionName: "allowance", args: [account, protocolAddress] }) as unknown as bigint;
  if (allowance < amount) {
    const tx = await wallet.writeContract({ address: tokenAddress, chain: null, account: wallet.account!, abi: erc20, functionName: "approve", args: [protocolAddress, amount * 10n] });
    await client.waitForTransactionReceipt({ hash: tx });
  }
  // Factory allowance (if needed)
  const facAllowance = await client.readContract({ address: tokenAddress, abi: erc20, functionName: "allowance", args: [account, factoryAddress] }) as unknown as bigint;
  if (facAllowance < amount) {
    const tx = await wallet.writeContract({ address: tokenAddress, chain: null, account: wallet.account!, abi: erc20, functionName: "approve", args: [factoryAddress, amount * 10n] });
    await client.waitForTransactionReceipt({ hash: tx });
  }
}

export async function fillLimitOrder(
  client: PublicClient,
  wallet: WalletClient,
  protocolAddress: Address,
  params: FillOrderParams,
): Promise<{ hash: Hex }> {
  // Compute takerTraits if not provided
  const computedArgsExtLenBytes = BigInt((params.extensionData.length - 2) / 2);
  const makerAmountFlag = 1n << 255n;
  const threshold = params.order.takingAmount & ((1n << 185n) - 1n);
  const defaultTakerTraits = makerAmountFlag | (computedArgsExtLenBytes << 224n) | threshold;
  const takerTraits = params.takerTraits && params.takerTraits !== 0n ? params.takerTraits : defaultTakerTraits;
  const argsExtLenFromTraits = (takerTraits >> 224n) & ((1n << 24n) - 1n);
  if (argsExtLenFromTraits !== computedArgsExtLenBytes) {
    throw new Error(`argsExtensionLength mismatch: takerTraits=${argsExtLenFromTraits} vs bytes(extension)=${computedArgsExtLenBytes}`);
  }

  // EOA path: fillOrderArgs(order, r, vs, amount, takerTraits, args)
  const r = ("0x" + params.signature.slice(2, 66)) as Hex;
  const v = parseInt(params.signature.slice(130, 132), 16);
  const s = BigInt("0x" + params.signature.slice(66, 130));
  const vs = ("0x" + (((BigInt(v - 27) & 1n) << 255n) | (s & ((1n << 255n) - 1n))).toString(16).padStart(64, "0")) as Hex;

  const functionName = "fillOrderArgs" as const;
  try {
    const { request } = await client.simulateContract({
      address: protocolAddress,
      abi: simpleLimitOrderProtocolAbi as any,
      functionName,
      args: [params.order, r, vs, params.fillAmount, takerTraits, params.extensionData],
      account: wallet.account!,
      gas: 2_500_000n,
    } as any);
    const hash = await wallet.writeContract(request as any);
    return { hash };
  } catch (e: any) {
    const dec = decodeRevert(e);
    if (dec.selector) console.error(`revert_selector: ${dec.selector}`);
    if (dec.data) console.error(`revert_data: ${dec.data}`);
    throw e;
  }
}


