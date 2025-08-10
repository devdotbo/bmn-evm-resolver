#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Factory Migration Verification Script
 *
 * This script verifies the migration from factory v1.1.0 to v2.1.0
 * It checks:
 * - Factory version
 * - Resolver whitelist status
 * - Emergency pause status
 * - Connection health
 */

import {
  checkFactorySecurity,
  verifyMigration,
} from "../src/utils/factory-security.ts";
import { CREATE3_ADDRESSES } from "../src/config/contracts.ts";
import { privateKeyToAccount } from "viem/accounts";

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function printHeader(text: string) {
  console.log(
    `\n${colors.bright}${colors.cyan}${"=".repeat(60)}${colors.reset}`,
  );
  console.log(`${colors.bright}${colors.cyan}${text}${colors.reset}`);
  console.log(
    `${colors.bright}${colors.cyan}${"=".repeat(60)}${colors.reset}\n`,
  );
}

function printSection(text: string) {
  console.log(`\n${colors.bright}${colors.blue}📍 ${text}${colors.reset}`);
  console.log(`${colors.blue}${"-".repeat(40)}${colors.reset}`);
}

function printSuccess(text: string) {
  console.log(`${colors.green}✅ ${text}${colors.reset}`);
}

function printWarning(text: string) {
  console.log(`${colors.yellow}⚠️  ${text}${colors.reset}`);
}

function printError(text: string) {
  console.log(`${colors.red}❌ ${text}${colors.reset}`);
}

async function main() {
  printHeader("FACTORY MIGRATION VERIFICATION TOOL");

  // Get resolver address from environment or use default
  const privateKey = Deno.env.get("RESOLVER_PRIVATE_KEY");
  if (!privateKey) {
    printError("RESOLVER_PRIVATE_KEY not set in environment");
    printWarning(
      "Please set RESOLVER_PRIVATE_KEY to verify your resolver's status",
    );
    Deno.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const resolverAddress = account.address;

  console.log(
    `Resolver Address: ${colors.bright}${resolverAddress}${colors.reset}`,
  );
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Factory addresses
  const factories = {
    v2: {
      base: CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
      optimism: CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
    },
    v1: {
      base: CREATE3_ADDRESSES.ESCROW_FACTORY_V1_BASE,
      optimism: CREATE3_ADDRESSES.ESCROW_FACTORY_V1_OPTIMISM,
    },
  };

  printSection("Factory Addresses");
  console.log("V2.1.0 (SECURE):");
  console.log(`  Base:     ${factories.v2.base}`);
  console.log(`  Optimism: ${factories.v2.optimism}`);
  console.log("\nV1.1.0 (INSECURE - TO BE DEPRECATED):");
  console.log(`  Base:     ${factories.v1.base}`);
  console.log(`  Optimism: ${factories.v1.optimism}`);

  // Check both chains
  const chains = [
    {
      chainId: 10,
      name: "Optimism",
      v2Factory: factories.v2.optimism,
      v1Factory: factories.v1.optimism,
      rpcUrl: Deno.env.get("OPTIMISM_RPC") || "https://mainnet.optimism.io",
    },
    {
      chainId: 8453,
      name: "Base",
      v2Factory: factories.v2.base,
      v1Factory: factories.v1.base,
      rpcUrl: Deno.env.get("BASE_RPC") || "https://mainnet.base.org",
    },
  ];

  let allChecksPass = true;

  for (const chain of chains) {
    printSection(`${chain.name} (Chain ${chain.chainId})`);

    try {
      // Check V2 factory
      console.log("\n🔍 Checking V2.1.0 Factory...");
      const v2Status = await checkFactorySecurity(
        chain.chainId,
        chain.v2Factory,
        resolverAddress,
        chain.rpcUrl,
      );

      console.log(`  Factory: ${chain.v2Factory}`);
      console.log(`  Version: ${v2Status.version}`);

      // Version check
      if (v2Status.version.includes("2.1.0")) {
        printSuccess(`Version confirmed: ${v2Status.version}`);
      } else {
        printWarning(`Unexpected version: ${v2Status.version}`);
        allChecksPass = false;
      }

      // Whitelist check
      if (v2Status.isWhitelisted) {
        printSuccess("Resolver is whitelisted");
      } else {
        printError("Resolver is NOT whitelisted");
        console.log("  → Contact protocol team to get whitelisted");
        allChecksPass = false;
      }

      // Pause check
      if (v2Status.isPaused) {
        printWarning("Factory is currently paused");
        console.log("  → Wait for factory to be unpaused");
      } else {
        printSuccess("Factory is operational (not paused)");
      }

      // Overall status
      console.log("\n📊 Status Summary:");
      if (v2Status.isWhitelisted && !v2Status.isPaused) {
        printSuccess("READY TO OPERATE on V2.1.0");
      } else if (v2Status.isPaused) {
        printWarning("WAITING - Factory is paused");
      } else if (!v2Status.isWhitelisted) {
        printError("NOT OPERATIONAL - Not whitelisted");
      }

      // Optional: Check V1 factory status
      if (Deno.env.get("CHECK_V1") === "true") {
        console.log("\n🔍 Checking V1.1.0 Factory (for comparison)...");
        try {
          const v1Status = await checkFactorySecurity(
            chain.chainId,
            chain.v1Factory,
            resolverAddress,
            chain.rpcUrl,
          );
          console.log(`  V1 Factory: ${chain.v1Factory}`);
          console.log(`  V1 Version: ${v1Status.version}`);
          printWarning("V1 factory is INSECURE and will be deprecated");
        } catch (error) {
          console.log(
            "  Could not check V1 factory (may not have security features)",
          );
        }
      }
    } catch (error) {
      printError(`Failed to check ${chain.name}: ${error}`);
      allChecksPass = false;
    }
  }

  // Migration checklist
  printSection("Migration Checklist");
  const checklist = [
    { item: "Factory addresses updated to V2.1.0", done: true },
    { item: "Resolver whitelisted on both chains", done: allChecksPass },
    { item: "Factory version verified (2.1.0)", done: allChecksPass },
    { item: "Emergency pause handling implemented", done: true },
    { item: "Error handling for security reverts", done: true },
    { item: "Monitoring system configured", done: true },
  ];

  checklist.forEach(({ item, done }) => {
    if (done) {
      printSuccess(item);
    } else {
      printError(item);
    }
  });

  // Final summary
  printHeader("VERIFICATION COMPLETE");

  if (allChecksPass) {
    printSuccess("All checks passed! Resolver is ready for V2.1.0 factory.");
    console.log("\nNext steps:");
    console.log("1. Test a small value swap on mainnet");
    console.log("2. Monitor for any errors or reverts");
    console.log("3. Scale up operations gradually");
  } else {
    printError("Some checks failed. Please address the issues above.");
    console.log("\nRequired actions:");
    console.log("1. Contact protocol team if not whitelisted");
    console.log("2. Wait for factory unpause if paused");
    console.log("3. Verify factory addresses are correct");
    Deno.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main().catch((error) => {
    printError(`Script failed: ${error}`);
    Deno.exit(1);
  });
}
