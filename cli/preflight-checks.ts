#!/usr/bin/env -S deno run -A --unstable-kv --env-file=.env

/**
 * Pre-flight checks for swap execution
 * Validates balances, allowances, and system readiness before attempting swaps
 * 
 * Usage: deno run -A --env-file=.env cli/preflight-checks.ts [--role alice|bob] [--json]
 */

import { base, optimism } from "viem/chains";
import { type Address, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getPrivateKey, getBMNToken } from "./cli-config.ts";
import { createWagmiConfig } from "./wagmi-config.ts";
import { 
  readIerc20BalanceOf, 
  readIerc20Allowance,
  simpleLimitOrderProtocolAddress,
  simplifiedEscrowFactoryV2_3Address 
} from "../src/generated/contracts.ts";
import { createPublicClient, http } from "viem";

const role = Deno.args.includes("--role") 
  ? Deno.args[Deno.args.indexOf("--role") + 1] 
  : "both";
const outputJson = Deno.args.includes("--json");

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  details?: any;
}

async function checkRpcConnectivity(): Promise<CheckResult> {
  const results: CheckResult[] = [];
  
  const ANKR_API_KEY = Deno.env.get("ANKR_API_KEY") || "";
  const baseRpc = ANKR_API_KEY 
    ? `https://rpc.ankr.com/base/${ANKR_API_KEY}`
    : "https://mainnet.base.org";
    
  const optimismRpc = ANKR_API_KEY
    ? `https://rpc.ankr.com/optimism/${ANKR_API_KEY}`
    : "https://mainnet.optimism.io";

  // Check Base RPC
  try {
    const baseClient = createPublicClient({
      chain: base,
      transport: http(baseRpc),
    });
    const blockNumber = await baseClient.getBlockNumber();
    results.push({
      name: "Base RPC",
      status: "pass",
      message: `Connected (block #${blockNumber})`,
    });
  } catch (e) {
    results.push({
      name: "Base RPC",
      status: "fail",
      message: `Connection failed: ${(e as any)?.message}`,
    });
  }

  // Check Optimism RPC
  try {
    const opClient = createPublicClient({
      chain: optimism,
      transport: http(optimismRpc),
    });
    const blockNumber = await opClient.getBlockNumber();
    results.push({
      name: "Optimism RPC",
      status: "pass",
      message: `Connected (block #${blockNumber})`,
    });
  } catch (e) {
    results.push({
      name: "Optimism RPC",
      status: "fail",
      message: `Connection failed: ${(e as any)?.message}`,
    });
  }

  return {
    name: "RPC Connectivity",
    status: results.every(r => r.status === "pass") ? "pass" : "fail",
    message: results.every(r => r.status === "pass") 
      ? "All RPCs connected" 
      : "Some RPCs failed",
    details: results,
  };
}

async function checkAliceReadiness(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const ALICE_PK = getPrivateKey("ALICE_PRIVATE_KEY");
  
  if (!ALICE_PK) {
    return [{
      name: "Alice Configuration",
      status: "fail",
      message: "ALICE_PRIVATE_KEY not set",
    }];
  }

  const aliceAccount = privateKeyToAccount(ALICE_PK as `0x${string}`);
  const wagmiConfig = createWagmiConfig();

  // Check Base balance
  try {
    const balance = await readIerc20BalanceOf(wagmiConfig, {
      chainId: base.id,
      address: getBMNToken(base.id as 8453),
      args: [aliceAccount.address],
    });
    
    const MIN_BALANCE = BigInt(10) ** BigInt(16); // 0.01 BMN
    results.push({
      name: "Alice Base Balance",
      status: balance >= MIN_BALANCE ? "pass" : "fail",
      message: balance >= MIN_BALANCE 
        ? `${formatUnits(balance, 18)} BMN`
        : `Insufficient balance: ${formatUnits(balance, 18)} BMN`,
      details: { balance: balance.toString(), formatted: formatUnits(balance, 18) },
    });
  } catch (e) {
    results.push({
      name: "Alice Base Balance",
      status: "fail",
      message: `Check failed: ${(e as any)?.message}`,
    });
  }

  // Check protocol allowance
  try {
    const protocolAddress = simpleLimitOrderProtocolAddress[8453 as keyof typeof simpleLimitOrderProtocolAddress] as Address;
    const allowance = await readIerc20Allowance(wagmiConfig, {
      chainId: base.id,
      address: getBMNToken(base.id as 8453),
      args: [aliceAccount.address, protocolAddress],
    });
    
    const MIN_ALLOWANCE = BigInt(10) ** BigInt(16); // 0.01 BMN
    results.push({
      name: "Alice Protocol Allowance",
      status: allowance >= MIN_ALLOWANCE ? "pass" : "fail",
      message: allowance >= MIN_ALLOWANCE 
        ? `${formatUnits(allowance, 18)} BMN approved`
        : `Insufficient allowance: ${formatUnits(allowance, 18)} BMN`,
      details: { allowance: allowance.toString(), formatted: formatUnits(allowance, 18) },
    });
  } catch (e) {
    results.push({
      name: "Alice Protocol Allowance",
      status: "fail",
      message: `Check failed: ${(e as any)?.message}`,
    });
  }

  return results;
}

async function checkBobReadiness(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const BOB_PK = getPrivateKey("BOB_PRIVATE_KEY") || getPrivateKey("RESOLVER_PRIVATE_KEY");
  
  if (!BOB_PK) {
    return [{
      name: "Bob Configuration",
      status: "fail",
      message: "BOB_PRIVATE_KEY/RESOLVER_PRIVATE_KEY not set",
    }];
  }

  const bobAccount = privateKeyToAccount(BOB_PK as `0x${string}`);
  const wagmiConfig = createWagmiConfig();

  // Check Optimism balance
  try {
    const balance = await readIerc20BalanceOf(wagmiConfig, {
      chainId: optimism.id,
      address: getBMNToken(optimism.id as 10),
      args: [bobAccount.address],
    });
    
    const MIN_BALANCE = BigInt(10) ** BigInt(16); // 0.01 BMN
    results.push({
      name: "Bob Optimism Balance",
      status: balance >= MIN_BALANCE ? "pass" : "fail",
      message: balance >= MIN_BALANCE 
        ? `${formatUnits(balance, 18)} BMN`
        : `Insufficient balance: ${formatUnits(balance, 18)} BMN`,
      details: { balance: balance.toString(), formatted: formatUnits(balance, 18) },
    });
  } catch (e) {
    results.push({
      name: "Bob Optimism Balance",
      status: "fail",
      message: `Check failed: ${(e as any)?.message}`,
    });
  }

  // Check factory allowance
  try {
    const factoryAddress = simplifiedEscrowFactoryV2_3Address[10 as keyof typeof simplifiedEscrowFactoryV2_3Address] as Address;
    const allowance = await readIerc20Allowance(wagmiConfig, {
      chainId: optimism.id,
      address: getBMNToken(optimism.id as 10),
      args: [bobAccount.address, factoryAddress],
    });
    
    const MIN_ALLOWANCE = BigInt(10) ** BigInt(16); // 0.01 BMN
    results.push({
      name: "Bob Factory Allowance",
      status: allowance >= MIN_ALLOWANCE ? "pass" : "warn",
      message: allowance >= MIN_ALLOWANCE 
        ? `${formatUnits(allowance, 18)} BMN approved`
        : `Low/no allowance: ${formatUnits(allowance, 18)} BMN (auto-approve available)`,
      details: { allowance: allowance.toString(), formatted: formatUnits(allowance, 18) },
    });
  } catch (e) {
    results.push({
      name: "Bob Factory Allowance",
      status: "fail",
      message: `Check failed: ${(e as any)?.message}`,
    });
  }

  return results;
}

async function checkDataDirectories(): Promise<CheckResult> {
  const dirs = [
    "./data/orders/pending",
    "./data/escrows/src",
    "./data/escrows/dst",
    "./data/swaps",
    "./data/secrets",
    "./data/fills",
  ];

  const results: CheckResult[] = [];
  
  for (const dir of dirs) {
    try {
      const stat = await Deno.stat(dir);
      if (stat.isDirectory) {
        results.push({
          name: dir,
          status: "pass",
          message: "Directory exists",
        });
      } else {
        results.push({
          name: dir,
          status: "fail",
          message: "Path exists but is not a directory",
        });
      }
    } catch (e) {
      if ((e as any).name === "NotFound") {
        // Create the directory
        try {
          await Deno.mkdir(dir, { recursive: true });
          results.push({
            name: dir,
            status: "pass",
            message: "Directory created",
          });
        } catch (createError) {
          results.push({
            name: dir,
            status: "fail",
            message: `Failed to create: ${(createError as any)?.message}`,
          });
        }
      } else {
        results.push({
          name: dir,
          status: "fail",
          message: `Check failed: ${(e as any)?.message}`,
        });
      }
    }
  }

  return {
    name: "Data Directories",
    status: results.every(r => r.status === "pass") ? "pass" : "fail",
    message: results.every(r => r.status === "pass") 
      ? "All directories ready" 
      : "Some directories missing/failed",
    details: results,
  };
}

async function runPreflightChecks() {
  const allChecks: CheckResult[] = [];

  // Check RPC connectivity
  console.log("Checking RPC connectivity...");
  const rpcCheck = await checkRpcConnectivity();
  allChecks.push(rpcCheck);

  // Check data directories
  console.log("Checking data directories...");
  const dirCheck = await checkDataDirectories();
  allChecks.push(dirCheck);

  // Check Alice readiness
  if (role === "alice" || role === "both") {
    console.log("Checking Alice readiness...");
    const aliceChecks = await checkAliceReadiness();
    allChecks.push(...aliceChecks);
  }

  // Check Bob readiness
  if (role === "bob" || role === "both") {
    console.log("Checking Bob readiness...");
    const bobChecks = await checkBobReadiness();
    allChecks.push(...bobChecks);
  }

  // Output results
  if (outputJson) {
    console.log(JSON.stringify({ checks: allChecks }, null, 2));
  } else {
    console.log("\n=== Pre-flight Check Results ===\n");
    
    for (const check of allChecks) {
      const icon = check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
      console.log(`${icon} ${check.name}: ${check.message}`);
      
      if (check.details && Array.isArray(check.details)) {
        for (const detail of check.details) {
          const subIcon = detail.status === "pass" ? "  ✓" : detail.status === "warn" ? "  ⚠" : "  ✗";
          console.log(`${subIcon} ${detail.name}: ${detail.message}`);
        }
      }
    }

    // Summary
    const passed = allChecks.filter(c => c.status === "pass").length;
    const warned = allChecks.filter(c => c.status === "warn").length;
    const failed = allChecks.filter(c => c.status === "fail").length;
    
    console.log("\n=== Summary ===");
    console.log(`Passed: ${passed}/${allChecks.length}`);
    if (warned > 0) console.log(`Warnings: ${warned}`);
    if (failed > 0) console.log(`Failed: ${failed}`);
    
    if (failed === 0) {
      console.log("\n✅ System ready for swap execution");
    } else {
      console.log("\n❌ System not ready - resolve failed checks before proceeding");
      
      // Provide recommendations
      console.log("\n💡 Recommendations:");
      if (allChecks.some(c => c.name.includes("Balance") && c.status === "fail")) {
        console.log("  - Fund accounts with BMN tokens");
      }
      if (allChecks.some(c => c.name.includes("Allowance") && c.status === "fail")) {
        console.log("  - Run: deno task approve:maker (for Alice)");
        console.log("  - Bob allowances are auto-approved during swap");
      }
      if (allChecks.some(c => c.name.includes("RPC") && c.status === "fail")) {
        console.log("  - Check network connectivity");
        console.log("  - Verify ANKR_API_KEY is set correctly");
      }
    }
  }

  // Exit with error if any critical checks failed
  const hasCriticalFailure = allChecks.some(c => c.status === "fail");
  if (hasCriticalFailure) {
    Deno.exit(1);
  }
}

// Main execution
runPreflightChecks().catch((e) => {
  console.error("Pre-flight check error:", e);
  Deno.exit(1);
});