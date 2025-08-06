import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { optimism, base } from "viem/chains";
import { CREATE3_ADDRESSES } from "../config/contracts.ts";

// Factory ABI for security checks
const FACTORY_SECURITY_ABI = [
  {
    inputs: [],
    name: "VERSION",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "whitelistedResolvers",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "emergencyPaused",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface FactorySecurityStatus {
  chainId: number;
  chainName: string;
  factoryAddress: Address;
  version: string;
  isWhitelisted: boolean;
  isPaused: boolean;
  timestamp: number;
}

/**
 * Check if resolver is whitelisted on the factory
 */
export async function checkWhitelistStatus(
  client: PublicClient,
  factoryAddress: Address,
  resolverAddress: Address
): Promise<boolean> {
  try {
    const isWhitelisted = await client.readContract({
      address: factoryAddress,
      abi: FACTORY_SECURITY_ABI,
      functionName: "whitelistedResolvers",
      args: [resolverAddress],
    });
    return isWhitelisted;
  } catch (error) {
    console.error("Error checking whitelist status:", error);
    return false;
  }
}

/**
 * Check if factory is paused
 */
export async function checkPauseStatus(
  client: PublicClient,
  factoryAddress: Address
): Promise<boolean> {
  try {
    const isPaused = await client.readContract({
      address: factoryAddress,
      abi: FACTORY_SECURITY_ABI,
      functionName: "emergencyPaused",
    });
    return isPaused;
  } catch (error) {
    console.error("Error checking pause status:", error);
    return false;
  }
}

/**
 * Get factory version
 */
export async function getFactoryVersion(
  client: PublicClient,
  factoryAddress: Address
): Promise<string> {
  try {
    const version = await client.readContract({
      address: factoryAddress,
      abi: FACTORY_SECURITY_ABI,
      functionName: "VERSION",
    });
    return version;
  } catch (error) {
    console.error("Error getting factory version:", error);
    return "unknown";
  }
}

/**
 * Comprehensive security check for a resolver on a factory
 */
export async function checkFactorySecurity(
  chainId: number,
  factoryAddress: Address,
  resolverAddress: Address,
  rpcUrl?: string
): Promise<FactorySecurityStatus> {
  // Determine chain and RPC
  const chain = chainId === 10 ? optimism : chainId === 8453 ? base : undefined;
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  // Perform all security checks
  const [version, isWhitelisted, isPaused] = await Promise.all([
    getFactoryVersion(client, factoryAddress),
    checkWhitelistStatus(client, factoryAddress, resolverAddress),
    checkPauseStatus(client, factoryAddress),
  ]);

  return {
    chainId,
    chainName: chain.name,
    factoryAddress,
    version,
    isWhitelisted,
    isPaused,
    timestamp: Date.now(),
  };
}

/**
 * Monitor factory security status continuously
 */
export class FactorySecurityMonitor {
  private intervalId?: number;
  private lastStatus: Map<number, FactorySecurityStatus> = new Map();

  constructor(
    private resolverAddress: Address,
    private chains: Array<{ chainId: number; factoryAddress: Address; rpcUrl?: string }>,
    private onStatusChange?: (status: FactorySecurityStatus) => void,
    private intervalMs: number = 60000 // Check every minute
  ) {}

  /**
   * Start monitoring factory security
   */
  async start(): Promise<void> {
    console.log("🔒 Starting factory security monitoring...");
    
    // Initial check
    await this.checkAll();
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.checkAll().catch(console.error);
    }, this.intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log("🛑 Stopped factory security monitoring");
    }
  }

  /**
   * Check all configured chains
   */
  private async checkAll(): Promise<void> {
    const checks = this.chains.map(async ({ chainId, factoryAddress, rpcUrl }) => {
      try {
        const status = await checkFactorySecurity(
          chainId,
          factoryAddress,
          this.resolverAddress,
          rpcUrl
        );

        // Check for changes
        const lastStatus = this.lastStatus.get(chainId);
        if (lastStatus) {
          if (
            lastStatus.isWhitelisted !== status.isWhitelisted ||
            lastStatus.isPaused !== status.isPaused ||
            lastStatus.version !== status.version
          ) {
            console.log(`⚠️ Security status changed on chain ${chainId}:`, {
              whitelisted: `${lastStatus.isWhitelisted} → ${status.isWhitelisted}`,
              paused: `${lastStatus.isPaused} → ${status.isPaused}`,
              version: `${lastStatus.version} → ${status.version}`,
            });
            
            if (this.onStatusChange) {
              this.onStatusChange(status);
            }
          }
        }

        // Log warnings
        if (!status.isWhitelisted) {
          console.error(`❌ Resolver NOT whitelisted on chain ${chainId}`);
        }
        if (status.isPaused) {
          console.warn(`⏸️ Factory PAUSED on chain ${chainId}`);
        }
        if (!status.version.includes("2.1.0")) {
          console.warn(`⚠️ Unexpected factory version on chain ${chainId}: ${status.version}`);
        }

        this.lastStatus.set(chainId, status);
        return status;
      } catch (error) {
        console.error(`Error checking chain ${chainId}:`, error);
        return null;
      }
    });

    await Promise.all(checks);
  }

  /**
   * Get current status for all chains
   */
  getStatus(): Map<number, FactorySecurityStatus> {
    return new Map(this.lastStatus);
  }

  /**
   * Check if resolver is operational (whitelisted and not paused)
   */
  isOperational(chainId: number): boolean {
    const status = this.lastStatus.get(chainId);
    return status ? status.isWhitelisted && !status.isPaused : false;
  }
}

/**
 * Quick verification script for migration
 */
export async function verifyMigration(resolverAddress: Address): Promise<void> {
  console.log("🔍 Verifying factory migration...\n");
  console.log("Resolver address:", resolverAddress);
  console.log("=".repeat(60));

  // Check both chains
  const chains = [
    {
      chainId: 10,
      name: "Optimism",
      factoryAddress: CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
      rpcUrl: Deno.env.get("OPTIMISM_RPC"),
    },
    {
      chainId: 8453,
      name: "Base",
      factoryAddress: CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
      rpcUrl: Deno.env.get("BASE_RPC"),
    },
  ];

  for (const { chainId, name, factoryAddress, rpcUrl } of chains) {
    console.log(`\n📍 ${name} (Chain ${chainId})`);
    console.log("-".repeat(40));

    try {
      const status = await checkFactorySecurity(
        chainId,
        factoryAddress,
        resolverAddress,
        rpcUrl
      );

      console.log(`Factory: ${factoryAddress}`);
      console.log(`Version: ${status.version}`);
      console.log(`Whitelisted: ${status.isWhitelisted ? "✅ Yes" : "❌ No"}`);
      console.log(`Paused: ${status.isPaused ? "⏸️ Yes" : "✅ No"}`);

      if (status.isWhitelisted && !status.isPaused) {
        console.log(`Status: ✅ READY TO OPERATE`);
      } else if (status.isPaused) {
        console.log(`Status: ⏸️ WAITING (Factory paused)`);
      } else if (!status.isWhitelisted) {
        console.log(`Status: ❌ NOT OPERATIONAL (Not whitelisted)`);
      }
    } catch (error) {
      console.error(`❌ Error checking ${name}:`, error);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Migration verification complete!");
}