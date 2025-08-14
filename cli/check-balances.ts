#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

/**
 * Check BMN token balances for Alice and Bob across Base and Optimism chains
 * Useful for pre-flight checks before executing swaps
 * 
 * Usage: deno run -A --env-file=.env cli/check-balances.ts [--json]
 */

import { base, optimism } from "viem/chains";
import { type Address, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getPrivateKey, getBMNToken } from "./cli-config.ts";
import { createWagmiConfig } from "./wagmi-config.ts";
import { readIerc20BalanceOf } from "../src/generated/contracts.ts";
import { logErrorWithRevert } from "./logging.ts";

const outputJson = Deno.args.includes("--json");

interface BalanceInfo {
  address: Address;
  role: string;
  chain: string;
  chainId: number;
  balance: string;
  balanceFormatted: string;
  token: Address;
}

async function getBalance(
  config: any,
  address: Address,
  chainId: number,
  tokenAddress: Address
): Promise<bigint> {
  return await readIerc20BalanceOf(config, {
    chainId,
    address: tokenAddress,
    args: [address],
  });
}

async function checkBalances() {
  const results: BalanceInfo[] = [];
  const warnings: string[] = [];

  // Get private keys
  const ALICE_PK = getPrivateKey("ALICE_PRIVATE_KEY");
  const BOB_PK = getPrivateKey("BOB_PRIVATE_KEY") || getPrivateKey("RESOLVER_PRIVATE_KEY");

  if (!ALICE_PK) {
    warnings.push("ALICE_PRIVATE_KEY not set - skipping Alice balance checks");
  }
  if (!BOB_PK) {
    warnings.push("BOB_PRIVATE_KEY/RESOLVER_PRIVATE_KEY not set - skipping Bob balance checks");
  }

  const wagmiConfig = createWagmiConfig();
  const chains = [
    { chain: base, name: "Base" },
    { chain: optimism, name: "Optimism" },
  ];

  // Check Alice balances
  if (ALICE_PK) {
    const aliceAccount = privateKeyToAccount(ALICE_PK as `0x${string}`);
    for (const { chain, name } of chains) {
      try {
        const balance = await getBalance(
          wagmiConfig,
          aliceAccount.address,
          chain.id,
          getBMNToken(chain.id as 8453 | 10)
        );
        
        const info: BalanceInfo = {
          address: aliceAccount.address,
          role: "Alice",
          chain: name,
          chainId: chain.id,
          balance: balance.toString(),
          balanceFormatted: formatUnits(balance, 18),
          token: getBMNToken(chain.id as 8453 | 10),
        };
        results.push(info);

        if (balance === 0n) {
          warnings.push(`Alice has zero BMN balance on ${name}`);
        }
      } catch (e) {
        warnings.push(`Failed to check Alice balance on ${name}: ${(e as any)?.message}`);
      }
    }
  }

  // Check Bob balances
  if (BOB_PK) {
    const bobAccount = privateKeyToAccount(BOB_PK as `0x${string}`);
    for (const { chain, name } of chains) {
      try {
        const balance = await getBalance(
          wagmiConfig,
          bobAccount.address,
          chain.id,
          getBMNToken(chain.id as 8453 | 10)
        );
        
        const info: BalanceInfo = {
          address: bobAccount.address,
          role: "Bob/Resolver",
          chain: name,
          chainId: chain.id,
          balance: balance.toString(),
          balanceFormatted: formatUnits(balance, 18),
          token: getBMNToken(chain.id as 8453 | 10),
        };
        results.push(info);

        if (balance === 0n) {
          warnings.push(`Bob has zero BMN balance on ${name}`);
        }
      } catch (e) {
        warnings.push(`Failed to check Bob balance on ${name}: ${(e as any)?.message}`);
      }
    }
  }

  // Output results
  if (outputJson) {
    console.log(JSON.stringify({ balances: results, warnings }, null, 2));
  } else {
    console.log("=== BMN Token Balance Report ===\n");
    console.log(`Token Address: ${getBMNToken(8453)}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    // Group by role
    const aliceBalances = results.filter(r => r.role === "Alice");
    const bobBalances = results.filter(r => r.role === "Bob/Resolver");

    if (aliceBalances.length > 0) {
      console.log(`Alice (${aliceBalances[0].address}):`);
      for (const bal of aliceBalances) {
        const status = bal.balance === "0" ? "❌" : "✅";
        console.log(`  ${status} ${bal.chain}: ${bal.balanceFormatted} BMN`);
      }
      console.log();
    }

    if (bobBalances.length > 0) {
      console.log(`Bob/Resolver (${bobBalances[0].address}):`);
      for (const bal of bobBalances) {
        const status = bal.balance === "0" ? "❌" : "✅";
        console.log(`  ${status} ${bal.chain}: ${bal.balanceFormatted} BMN`);
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

    // Summary
    const totalAliceBalance = aliceBalances.reduce((sum, b) => sum + BigInt(b.balance), 0n);
    const totalBobBalance = bobBalances.reduce((sum, b) => sum + BigInt(b.balance), 0n);

    console.log("=== Summary ===");
    if (totalAliceBalance > 0n) {
      console.log(`✅ Alice total: ${formatUnits(totalAliceBalance, 18)} BMN`);
    } else if (aliceBalances.length > 0) {
      console.log("❌ Alice has no BMN tokens - cannot create orders");
    }

    if (totalBobBalance > 0n) {
      console.log(`✅ Bob total: ${formatUnits(totalBobBalance, 18)} BMN`);
    } else if (bobBalances.length > 0) {
      console.log("❌ Bob has no BMN tokens - cannot fill orders");
    }

    // Recommendations
    if (warnings.some(w => w.includes("zero BMN balance"))) {
      console.log("\n💡 Recommendations:");
      console.log("  - Fund accounts with BMN tokens before attempting swaps");
      console.log("  - Alice needs BMN on source chain (Base) to create orders");
      console.log("  - Bob needs BMN on destination chain (Optimism) to fill orders");
    }
  }

  return { balances: results, warnings };
}

// Main execution
checkBalances().catch(async (e) => {
  await logErrorWithRevert(e, "check-balances", {
    args: Deno.args,
  });
  Deno.exit(1);
});