#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

/**
 * Check BMN token allowances for protocol and factory contracts
 * Ensures accounts have proper approvals before attempting swaps
 * 
 * Usage: deno run -A --env-file=.env cli/check-allowances.ts [--json]
 */

import { base, optimism } from "viem/chains";
import { type Address, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getPrivateKey, getBMNToken } from "./cli-config.ts";
import { createWagmiConfig } from "./wagmi-config.ts";
import { readIerc20Allowance, simpleLimitOrderProtocolAddress, simplifiedEscrowFactoryV2_3Address } from "../src/generated/contracts.ts";
import { logErrorWithRevert } from "./logging.ts";

const outputJson = Deno.args.includes("--json");

interface AllowanceInfo {
  owner: Address;
  spender: Address;
  spenderName: string;
  chain: string;
  chainId: number;
  allowance: string;
  allowanceFormatted: string;
  isInfinite: boolean;
  isSufficient: boolean;
}

async function getAllowance(
  config: any,
  owner: Address,
  spender: Address,
  chainId: number,
  tokenAddress: Address
): Promise<bigint> {
  return await readIerc20Allowance(config, {
    chainId,
    address: tokenAddress,
    args: [owner, spender],
  });
}

async function checkAllowances() {
  const results: AllowanceInfo[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Get private keys
  const ALICE_PK = getPrivateKey("ALICE_PRIVATE_KEY");
  const BOB_PK = getPrivateKey("BOB_PRIVATE_KEY") || getPrivateKey("RESOLVER_PRIVATE_KEY");

  if (!ALICE_PK) {
    warnings.push("ALICE_PRIVATE_KEY not set - skipping Alice allowance checks");
  }
  if (!BOB_PK) {
    warnings.push("BOB_PRIVATE_KEY/RESOLVER_PRIVATE_KEY not set - skipping Bob allowance checks");
  }

  const wagmiConfig = createWagmiConfig();
  const chains = [
    { chain: base, name: "Base", id: 8453 },
    { chain: optimism, name: "Optimism", id: 10 },
  ];

  // Define spenders to check
  const spenders = [
    { 
      address: simpleLimitOrderProtocolAddress[8453 as keyof typeof simpleLimitOrderProtocolAddress] as Address, 
      name: "LimitOrderProtocol" 
    },
    { 
      address: simplifiedEscrowFactoryV2_3Address[8453 as keyof typeof simplifiedEscrowFactoryV2_3Address] as Address, 
      name: "EscrowFactory" 
    },
  ];

  const MIN_ALLOWANCE = BigInt(10) ** BigInt(18); // 1 BMN minimum
  const INFINITE = BigInt(2) ** BigInt(256) - BigInt(1);

  // Check Alice allowances (needed on source chain - Base)
  if (ALICE_PK) {
    const aliceAccount = privateKeyToAccount(ALICE_PK as `0x${string}`);
    
    // Alice needs allowance on Base for the protocol
    try {
      const allowance = await getAllowance(
        wagmiConfig,
        aliceAccount.address,
        spenders[0].address, // Protocol
        base.id,
        getBMNToken(base.id as 8453)
      );
      
      const info: AllowanceInfo = {
        owner: aliceAccount.address,
        spender: spenders[0].address,
        spenderName: `${spenders[0].name} (Base)`,
        chain: "Base",
        chainId: base.id,
        allowance: allowance.toString(),
        allowanceFormatted: formatUnits(allowance, 18),
        isInfinite: allowance === INFINITE,
        isSufficient: allowance >= MIN_ALLOWANCE,
      };
      results.push(info);

      if (!info.isSufficient) {
        warnings.push(`Alice has insufficient allowance for ${spenders[0].name} on Base`);
        recommendations.push(`Run: deno task approve:maker`);
      }
    } catch (e) {
      warnings.push(`Failed to check Alice allowance on Base: ${(e as any)?.message}`);
    }
  }

  // Check Bob allowances (needed on destination chain - Optimism)
  if (BOB_PK) {
    const bobAccount = privateKeyToAccount(BOB_PK as `0x${string}`);
    
    // Bob needs allowance on Optimism for the factory
    try {
      const allowance = await getAllowance(
        wagmiConfig,
        bobAccount.address,
        spenders[1].address, // Factory
        optimism.id,
        getBMNToken(optimism.id as 10)
      );
      
      const info: AllowanceInfo = {
        owner: bobAccount.address,
        spender: spenders[1].address,
        spenderName: `${spenders[1].name} (Optimism)`,
        chain: "Optimism",
        chainId: optimism.id,
        allowance: allowance.toString(),
        allowanceFormatted: formatUnits(allowance, 18),
        isInfinite: allowance === INFINITE,
        isSufficient: allowance >= MIN_ALLOWANCE,
      };
      results.push(info);

      if (!info.isSufficient) {
        warnings.push(`Bob has insufficient allowance for ${spenders[1].name} on Optimism`);
        recommendations.push(`Bob needs to approve EscrowFactory on Optimism`);
      }
    } catch (e) {
      warnings.push(`Failed to check Bob allowance on Optimism: ${(e as any)?.message}`);
    }
  }

  // Output results
  if (outputJson) {
    console.log(JSON.stringify({ allowances: results, warnings, recommendations }, null, 2));
  } else {
    console.log("=== BMN Token Allowance Report ===\n");
    console.log(`Token Address: ${getBMNToken(8453)}`);
    console.log(`Protocol Address: ${spenders[0].address}`);
    console.log(`Factory Address: ${spenders[1].address}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    // Display allowances
    for (const info of results) {
      const roleLabel = info.owner === privateKeyToAccount(ALICE_PK as `0x${string}` || "0x0").address ? "Alice" : "Bob";
      const status = info.isSufficient ? "✅" : "❌";
      const infiniteLabel = info.isInfinite ? " (∞)" : "";
      
      console.log(`${roleLabel} → ${info.spenderName}:`);
      console.log(`  ${status} Allowance: ${info.allowanceFormatted} BMN${infiniteLabel}`);
      if (!info.isSufficient) {
        console.log(`  ⚠️  Insufficient for swaps (min: 1 BMN)`);
      }
      console.log();
    }

    if (warnings.length > 0) {
      console.log("⚠️  Warnings:");
      for (const warning of warnings) {
        console.log(`  - ${warning}`);
      }
      console.log();
    }

    if (recommendations.length > 0) {
      console.log("💡 Recommendations:");
      for (const rec of recommendations) {
        console.log(`  - ${rec}`);
      }
      console.log();
    }

    // Summary
    const allSufficient = results.every(r => r.isSufficient);
    if (allSufficient && results.length > 0) {
      console.log("=== Summary ===");
      console.log("✅ All required allowances are set");
    } else if (results.length > 0) {
      console.log("=== Summary ===");
      console.log("❌ Some allowances need to be set before swaps can proceed");
      console.log("\nRequired allowances:");
      console.log("  1. Alice must approve LimitOrderProtocol on Base (source chain)");
      console.log("  2. Bob must approve EscrowFactory on Optimism (destination chain)");
    }
  }

  return { allowances: results, warnings, recommendations };
}

// Main execution
checkAllowances().catch(async (e) => {
  await logErrorWithRevert(e, "check-allowances", {
    args: Deno.args,
  });
  Deno.exit(1);
});