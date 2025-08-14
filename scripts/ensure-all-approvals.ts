#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

/**
 * Ensure all required token approvals are in place for atomic swap
 * 
 * Required approvals:
 * - Alice: BMN -> LimitOrderProtocol on Base (for making the order)
 * - Bob: BMN -> LimitOrderProtocol on Base (for filling the order)
 * - Bob: BMN -> EscrowFactory on Base (for escrow creation)
 * - Alice: BMN -> EscrowFactory on Optimism (for escrow creation)
 * - Bob: BMN -> EscrowFactory on Optimism (for escrow creation)
 */

import { base, optimism } from "viem/chains";
import { type Address, parseUnits } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { getPrivateKey, getBMNToken, getCliAddresses, type SupportedChainId } from "../cli/cli-config.ts";
import { createWagmiConfig } from "../cli/wagmi-config.ts";
import { waitForTransactionReceipt } from "@wagmi/core";
import {
  readIerc20Allowance,
  writeIerc20Approve,
} from "../src/generated/contracts.ts";
import { logSuccess, logWarning } from "../cli/logging.ts";

const INFINITE_APPROVAL = parseUnits("1000000", 18);

interface ApprovalSpec {
  account: Address;
  spender: Address;
  token: Address;
  chainId: SupportedChainId;
  description: string;
}

async function ensureApproval(
  config: any,
  spec: ApprovalSpec,
  privateKey: `0x${string}`
): Promise<boolean> {
  const currentAllowance = await readIerc20Allowance(config, {
    chainId: spec.chainId,
    address: spec.token,
    args: [spec.account, spec.spender],
  });

  if (currentAllowance >= INFINITE_APPROVAL / 2n) {
    logSuccess("ensure-all-approvals", `${spec.description}: Already approved (${currentAllowance})`);
    return true;
  }

  logWarning("ensure-all-approvals", `${spec.description}: Needs approval (current: ${currentAllowance})`);
  
  const account = privateKeyToAccount(privateKey, { nonceManager });
  
  try {
    const hash = await writeIerc20Approve(config, {
      chainId: spec.chainId,
      account: account as any,
      address: spec.token,
      args: [spec.spender, INFINITE_APPROVAL],
    });
    
    await waitForTransactionReceipt(config, { chainId: spec.chainId, hash });
    logSuccess("ensure-all-approvals", `${spec.description}: Approved successfully`);
    return true;
  } catch (e) {
    console.error(`Failed to approve ${spec.description}:`, e);
    return false;
  }
}

async function main() {
  const wagmiConfig = createWagmiConfig();
  
  // Get private keys
  const ALICE_PK = getPrivateKey("ALICE_PRIVATE_KEY");
  const BOB_PK = getPrivateKey("BOB_PRIVATE_KEY") || getPrivateKey("RESOLVER_PRIVATE_KEY");
  
  if (!ALICE_PK || !BOB_PK) {
    console.error("Missing required private keys");
    Deno.exit(1);
  }
  
  const aliceAccount = privateKeyToAccount(ALICE_PK as `0x${string}`);
  const bobAccount = privateKeyToAccount(BOB_PK as `0x${string}`);
  
  // Get addresses
  const baseAddrs = getCliAddresses(base.id as SupportedChainId);
  const optimismAddrs = getCliAddresses(optimism.id as SupportedChainId);
  
  const baseBMN = getBMNToken(base.id as SupportedChainId);
  const optimismBMN = getBMNToken(optimism.id as SupportedChainId);
  
  const approvals: ApprovalSpec[] = [
    // Alice approvals
    {
      account: aliceAccount.address,
      spender: baseAddrs.limitOrderProtocol,
      token: baseBMN,
      chainId: base.id as SupportedChainId,
      description: "Alice → LimitOrderProtocol (Base)",
    },
    {
      account: aliceAccount.address,
      spender: optimismAddrs.escrowFactory,
      token: optimismBMN,
      chainId: optimism.id as SupportedChainId,
      description: "Alice → EscrowFactory (Optimism)",
    },
    // Bob approvals
    {
      account: bobAccount.address,
      spender: baseAddrs.limitOrderProtocol,
      token: baseBMN,
      chainId: base.id as SupportedChainId,
      description: "Bob → LimitOrderProtocol (Base)",
    },
    {
      account: bobAccount.address,
      spender: baseAddrs.escrowFactory,
      token: baseBMN,
      chainId: base.id as SupportedChainId,
      description: "Bob → EscrowFactory (Base)",
    },
    {
      account: bobAccount.address,
      spender: optimismAddrs.escrowFactory,
      token: optimismBMN,
      chainId: optimism.id as SupportedChainId,
      description: "Bob → EscrowFactory (Optimism)",
    },
  ];
  
  console.log("=== Ensuring All Required Approvals ===\n");
  
  let allSuccessful = true;
  
  for (const approval of approvals) {
    const pk = approval.account === aliceAccount.address ? ALICE_PK : BOB_PK;
    const success = await ensureApproval(wagmiConfig, approval, pk as `0x${string}`);
    if (!success) {
      allSuccessful = false;
    }
  }
  
  console.log("\n=== Summary ===");
  if (allSuccessful) {
    logSuccess("ensure-all-approvals", "All approvals are in place!");
  } else {
    console.error("Some approvals failed. Please check the errors above.");
    Deno.exit(1);
  }
}

main().catch((e) => {
  console.error("Error:", e);
  Deno.exit(1);
});