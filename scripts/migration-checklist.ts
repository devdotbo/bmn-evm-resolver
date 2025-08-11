#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-run

/**
 * Post-Migration Checklist Script
 *
 * Comprehensive checklist to verify all migration steps are completed
 * for the transition from factory v1.1.0 to v2.1.0
 */

import { checkFactorySecurity } from "../src/utils/factory-security.ts";
import { CREATE3_ADDRESSES } from "../src/config/contracts.ts";
import { privateKeyToAccount, nonceManager } from "viem/accounts";

interface ChecklistItem {
  category: string;
  task: string;
  check: () => Promise<boolean>;
  critical: boolean;
  help?: string;
}

class MigrationChecklist {
  private items: ChecklistItem[] = [];
  private results: Map<string, boolean> = new Map();
  private resolverAddress: string;

  constructor(resolverAddress: string) {
    this.resolverAddress = resolverAddress;
    this.setupChecklist();
  }

  private setupChecklist() {
    // Configuration checks
    this.items.push({
      category: "Configuration",
      task: "Factory addresses updated in contracts.ts",
      check: async () => {
        const { CONTRACT_ADDRESSES } = await import(
          "../src/config/contracts.ts"
        );
        const baseFactory = CONTRACT_ADDRESSES[8453]?.escrowFactory;
        const optimismFactory = CONTRACT_ADDRESSES[10]?.escrowFactory;
        return (
          baseFactory === CREATE3_ADDRESSES.ESCROW_FACTORY_V2 &&
          optimismFactory === CREATE3_ADDRESSES.ESCROW_FACTORY_V2
        );
      },
      critical: true,
      help: "Update src/config/contracts.ts with new factory address",
    });

    this.items.push({
      category: "Configuration",
      task: "Environment variables configured",
      check: async () => {
        const hasPrivateKey = !!Deno.env.get("RESOLVER_PRIVATE_KEY");
        const hasAnkrKey = !!Deno.env.get("ANKR_API_KEY");
        return hasPrivateKey && hasAnkrKey;
      },
      critical: true,
      help: "Set RESOLVER_PRIVATE_KEY and ANKR_API_KEY in .env",
    });

    this.items.push({
      category: "Configuration",
      task: "Limit Order Protocol addresses configured",
      check: async () => {
        const { CREATE3_ADDRESSES } = await import(
          "../src/config/contracts.ts"
        );
        return !!(
          CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_BASE &&
          CREATE3_ADDRESSES.LIMIT_ORDER_PROTOCOL_OPTIMISM
        );
      },
      critical: false,
      help: "Verify limit order protocol addresses are set",
    });

    // Security checks - Base
    this.items.push({
      category: "Security (Base)",
      task: "Factory v2.1.0 deployed on Base",
      check: async () => {
        try {
          const status = await checkFactorySecurity(
            8453,
            CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
            this.resolverAddress as `0x${string}`,
            Deno.env.get("BASE_RPC"),
          );
          return status.version.includes("2.1.0");
        } catch {
          return false;
        }
      },
      critical: true,
      help: "Factory v2.1.0 must be deployed on Base",
    });

    this.items.push({
      category: "Security (Base)",
      task: "Resolver whitelisted on Base",
      check: async () => {
        try {
          const status = await checkFactorySecurity(
            8453,
            CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
            this.resolverAddress as `0x${string}`,
            Deno.env.get("BASE_RPC"),
          );
          return status.isWhitelisted;
        } catch {
          return false;
        }
      },
      critical: true,
      help: "Contact protocol team to whitelist resolver on Base",
    });

    this.items.push({
      category: "Security (Base)",
      task: "Factory not paused on Base",
      check: async () => {
        try {
          const status = await checkFactorySecurity(
            8453,
            CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
            this.resolverAddress as `0x${string}`,
            Deno.env.get("BASE_RPC"),
          );
          return !status.isPaused;
        } catch {
          return false;
        }
      },
      critical: false,
      help: "Wait for factory to be unpaused on Base",
    });

    // Security checks - Optimism
    this.items.push({
      category: "Security (Optimism)",
      task: "Factory v2.1.0 deployed on Optimism",
      check: async () => {
        try {
          const status = await checkFactorySecurity(
            10,
            CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
            this.resolverAddress as `0x${string}`,
            Deno.env.get("OPTIMISM_RPC"),
          );
          return status.version.includes("2.1.0");
        } catch {
          return false;
        }
      },
      critical: true,
      help: "Factory v2.1.0 must be deployed on Optimism",
    });

    this.items.push({
      category: "Security (Optimism)",
      task: "Resolver whitelisted on Optimism",
      check: async () => {
        try {
          const status = await checkFactorySecurity(
            10,
            CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
            this.resolverAddress as `0x${string}`,
            Deno.env.get("OPTIMISM_RPC"),
          );
          return status.isWhitelisted;
        } catch {
          return false;
        }
      },
      critical: true,
      help: "Contact protocol team to whitelist resolver on Optimism",
    });

    this.items.push({
      category: "Security (Optimism)",
      task: "Factory not paused on Optimism",
      check: async () => {
        try {
          const status = await checkFactorySecurity(
            10,
            CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
            this.resolverAddress as `0x${string}`,
            Deno.env.get("OPTIMISM_RPC"),
          );
          return !status.isPaused;
        } catch {
          return false;
        }
      },
      critical: false,
      help: "Wait for factory to be unpaused on Optimism",
    });

    // Implementation checks
    this.items.push({
      category: "Implementation",
      task: "Security monitoring implemented",
      check: async () => {
        try {
          await import("../src/utils/factory-security.ts");
          await import("../src/resolver/resolver.ts");
          return true;
        } catch {
          return false;
        }
      },
      critical: true,
      help: "Ensure factory-security.ts and resolver.ts exist",
    });

    this.items.push({
      category: "Implementation",
      task: "Unified resolver implementation",
      check: async () => {
        try {
          const module = await import("../src/resolver/resolver.ts");
          return !!(module.UnifiedResolver);
        } catch {
          return false;
        }
      },
      critical: true,
      help: "Ensure UnifiedResolver class is properly implemented",
    });

    // Scripts and tools
    this.items.push({
      category: "Tools",
      task: "Verification scripts created",
      check: async () => {
        try {
          const scripts = [
            "./scripts/verify-factory-migration.ts",
            "./scripts/test-factory-connection.ts",
            "./scripts/cast-migration-verify.sh",
          ];
          for (const script of scripts) {
            await Deno.stat(script);
          }
          return true;
        } catch {
          return false;
        }
      },
      critical: false,
      help: "Create verification scripts in scripts/ directory",
    });

    // Documentation
    this.items.push({
      category: "Documentation",
      task: ".env.example updated with v2 addresses",
      check: async () => {
        try {
          const content = await Deno.readTextFile(".env.example");
          return content.includes("0xBc9A20A9FCb7571B2593e85D2533E10e3e9dC61A");
        } catch {
          return false;
        }
      },
      critical: false,
      help: "Update .env.example with new factory addresses",
    });
  }

  async runChecklist(): Promise<boolean> {
    console.log("🔍 Running Migration Checklist...\n");
    console.log(`Resolver: ${this.resolverAddress}`);
    console.log("=".repeat(60));

    const categories = new Map<string, ChecklistItem[]>();

    // Group by category
    for (const item of this.items) {
      if (!categories.has(item.category)) {
        categories.set(item.category, []);
      }
      categories.get(item.category)!.push(item);
    }

    let allCriticalPassed = true;
    let totalPassed = 0;
    let totalItems = 0;

    // Run checks by category
    for (const [category, items] of categories) {
      console.log(`\n📋 ${category}`);
      console.log("-".repeat(40));

      for (const item of items) {
        totalItems++;
        try {
          const passed = await item.check();
          this.results.set(item.task, passed);

          if (passed) {
            totalPassed++;
            console.log(`✅ ${item.task}`);
          } else {
            console.log(`❌ ${item.task}`);
            if (item.help) {
              console.log(`   → ${item.help}`);
            }
            if (item.critical) {
              allCriticalPassed = false;
            }
          }
        } catch (error) {
          console.log(`❌ ${item.task} (Error: ${error})`);
          if (item.help) {
            console.log(`   → ${item.help}`);
          }
          if (item.critical) {
            allCriticalPassed = false;
          }
        }
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 CHECKLIST SUMMARY");
    console.log("=".repeat(60));

    const percentage = Math.round((totalPassed / totalItems) * 100);
    console.log(`\nCompleted: ${totalPassed}/${totalItems} (${percentage}%)`);

    if (!allCriticalPassed) {
      console.log("\n❌ Critical items failed! Migration not ready.");
      console.log("\nRequired actions:");

      for (const item of this.items) {
        if (item.critical && !this.results.get(item.task)) {
          console.log(`  • ${item.task}`);
          if (item.help) {
            console.log(`    → ${item.help}`);
          }
        }
      }
    } else if (totalPassed === totalItems) {
      console.log("\n✅ All checks passed! Migration complete.");
      console.log("\nNext steps:");
      console.log("  1. Run a test swap with small amounts");
      console.log("  2. Monitor resolver performance");
      console.log("  3. Gradually increase operation volume");
    } else {
      console.log("\n⚠️ Non-critical items pending. Migration can proceed.");
      console.log("\nOptional improvements:");

      for (const item of this.items) {
        if (!item.critical && !this.results.get(item.task)) {
          console.log(`  • ${item.task}`);
        }
      }
    }

    return allCriticalPassed;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("POST-MIGRATION CHECKLIST");
  console.log("=".repeat(60));

  // Get resolver address
  const privateKey = Deno.env.get("RESOLVER_PRIVATE_KEY");
  if (!privateKey) {
    console.error("❌ RESOLVER_PRIVATE_KEY not set");
    console.log("\nPlease set RESOLVER_PRIVATE_KEY in your environment");
    Deno.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`, { nonceManager });
  const resolverAddress = account.address;

  const checklist = new MigrationChecklist(resolverAddress);
  const success = await checklist.runChecklist();

  // Generate timestamp
  console.log(`\nChecklist completed at: ${new Date().toISOString()}`);

  Deno.exit(success ? 0 : 1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ Checklist failed:", error);
    Deno.exit(1);
  });
}
