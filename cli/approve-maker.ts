#!/usr/bin/env -S deno run -A --env-file=.env

import { base, optimism } from "viem/chains";
import { type Address } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { getCliAddresses, getPrivateKey, getBMNToken, type SupportedChainId } from "./cli-config.ts";
import { createWagmiConfig } from "./wagmi-config.ts";
import { waitForTransactionReceipt } from "@wagmi/core";
import { readIerc20Allowance, writeIerc20Approve } from "../src/generated/contracts.ts";

function usage(): never {
  console.log("Usage: deno task approve:maker -- --chain 8453|10 --spender protocol|factory --amount <wei>");
  Deno.exit(1);
}

function getArg(name: string): string | undefined {
  const idx = Deno.args.findIndex((a) => a === `--${name}`);
  if (idx >= 0) return Deno.args[idx + 1];
  return undefined;
}

const chainArg = getArg("chain");
const spenderArg = getArg("spender");
const amountArg = getArg("amount");
if (!chainArg || !spenderArg || !amountArg) usage();

const CHAIN = Number(chainArg) as SupportedChainId;
const AMOUNT = BigInt(amountArg);

async function main() {
  const ALICE_PK = (getPrivateKey("ALICE_PRIVATE_KEY") || "") as `0x${string}`;
  if (!ALICE_PK) {
    console.error("ALICE_PRIVATE_KEY missing");
    Deno.exit(1);
  }
  const account = privateKeyToAccount(ALICE_PK, { nonceManager });
  const _chain = CHAIN === base.id ? base : optimism;

  const wagmiConfig = createWagmiConfig();
  const addrs = getCliAddresses(CHAIN);
  const token = getBMNToken(CHAIN);
  const spender: Address = (spenderArg === "protocol" ? addrs.limitOrderProtocol : addrs.escrowFactory) as Address;

  const allowance = await readIerc20Allowance(wagmiConfig as any, {
    chainId: CHAIN,
    address: token,
    args: [account.address, spender],
  } as any);
  if (allowance >= AMOUNT) {
    console.log("OK allowance", allowance.toString());
    return;
  }

  const txHash = await writeIerc20Approve(wagmiConfig as any, {
    chainId: CHAIN,
    account: account as any,
    address: token,
    args: [spender, AMOUNT],
  } as any);
  const receipt = await waitForTransactionReceipt(wagmiConfig as any, { chainId: CHAIN, hash: txHash as any });
  console.log(receipt.transactionHash);
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});


