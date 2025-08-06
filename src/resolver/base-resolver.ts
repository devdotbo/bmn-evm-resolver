import { createPublicClient, createWalletClient, http, type Address, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import { FactorySecurityMonitor, type FactorySecurityStatus } from "../utils/factory-security.ts";
import { CREATE3_ADDRESSES } from "../config/contracts.ts";

// Error types for factory security
export class FactoryPausedError extends Error {
  constructor(chainId: number) {
    super(`Factory is paused on chain ${chainId}`);
    this.name = "FactoryPausedError";
  }
}

export class NotWhitelistedError extends Error {
  constructor(chainId: number, resolverAddress: Address) {
    super(`Resolver ${resolverAddress} is not whitelisted on chain ${chainId}`);
    this.name = "NotWhitelistedError";
  }
}

export interface BaseResolverConfig {
  privateKey: string;
  ankrApiKey?: string;
  factoryAddresses?: {
    base: Address;
    optimism: Address;
  };
  enableSecurityMonitoring?: boolean;
  securityCheckInterval?: number;
}

/**
 * Base resolver class with factory security features
 */
export abstract class BaseResolver {
  protected account: any;
  protected baseClient: PublicClient;
  protected optimismClient: PublicClient;
  protected baseWallet: WalletClient;
  protected optimismWallet: WalletClient;
  protected securityMonitor?: FactorySecurityMonitor;
  protected factoryAddresses: {
    base: Address;
    optimism: Address;
  };
  protected isRunning = false;

  constructor(config: BaseResolverConfig) {
    if (!config.privateKey) {
      throw new Error("Private key is required");
    }

    this.account = privateKeyToAccount(config.privateKey as `0x${string}`);
    
    // Use v2.1.0 factory addresses by default
    this.factoryAddresses = config.factoryAddresses || {
      base: CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
      optimism: CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
    };

    const ankrKey = config.ankrApiKey || Deno.env.get("ANKR_API_KEY") || "";

    // Set up clients
    this.baseClient = createPublicClient({
      chain: base,
      transport: http(ankrKey ? `https://rpc.ankr.com/base/${ankrKey}` : base.rpcUrls.default.http[0]),
    });

    this.optimismClient = createPublicClient({
      chain: optimism,
      transport: http(ankrKey ? `https://rpc.ankr.com/optimism/${ankrKey}` : optimism.rpcUrls.default.http[0]),
    });

    this.baseWallet = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(ankrKey ? `https://rpc.ankr.com/base/${ankrKey}` : base.rpcUrls.default.http[0]),
    });

    this.optimismWallet = createWalletClient({
      account: this.account,
      chain: optimism,
      transport: http(ankrKey ? `https://rpc.ankr.com/optimism/${ankrKey}` : optimism.rpcUrls.default.http[0]),
    });

    // Set up security monitoring if enabled
    if (config.enableSecurityMonitoring) {
      this.setupSecurityMonitoring(config.securityCheckInterval);
    }
  }

  /**
   * Set up factory security monitoring
   */
  private setupSecurityMonitoring(intervalMs?: number): void {
    const chains = [
      {
        chainId: base.id,
        factoryAddress: this.factoryAddresses.base,
        rpcUrl: this.baseClient.transport.url,
      },
      {
        chainId: optimism.id,
        factoryAddress: this.factoryAddresses.optimism,
        rpcUrl: this.optimismClient.transport.url,
      },
    ];

    this.securityMonitor = new FactorySecurityMonitor(
      this.account.address,
      chains,
      (status) => this.handleSecurityStatusChange(status),
      intervalMs
    );
  }

  /**
   * Handle security status changes
   */
  protected handleSecurityStatusChange(status: FactorySecurityStatus): void {
    if (!status.isWhitelisted) {
      console.error(`❌ CRITICAL: Resolver is not whitelisted on chain ${status.chainId}!`);
      // Could trigger alerts, stop operations, etc.
      this.onWhitelistRemoved(status.chainId);
    }

    if (status.isPaused) {
      console.warn(`⏸️ Factory is paused on chain ${status.chainId}`);
      this.onFactoryPaused(status.chainId);
    } else if (!status.isPaused && this.wasFactoryPaused(status.chainId)) {
      console.log(`▶️ Factory resumed on chain ${status.chainId}`);
      this.onFactoryResumed(status.chainId);
    }
  }

  /**
   * Check if factory was previously paused
   */
  private wasFactoryPaused(chainId: number): boolean {
    // This could be tracked in state management
    // For now, return false
    return false;
  }

  /**
   * Called when resolver is removed from whitelist
   */
  protected onWhitelistRemoved(chainId: number): void {
    // Override in subclass if needed
    console.error(`Resolver removed from whitelist on chain ${chainId}. Stopping operations.`);
  }

  /**
   * Called when factory is paused
   */
  protected onFactoryPaused(chainId: number): void {
    // Override in subclass if needed
    console.log(`Factory paused on chain ${chainId}. Halting new operations.`);
  }

  /**
   * Called when factory is resumed
   */
  protected onFactoryResumed(chainId: number): void {
    // Override in subclass if needed
    console.log(`Factory resumed on chain ${chainId}. Resuming operations.`);
  }

  /**
   * Check if operations can proceed on a chain
   */
  protected async canOperate(chainId: number): Promise<boolean> {
    if (!this.securityMonitor) {
      return true; // If no monitor, assume we can operate
    }

    return this.securityMonitor.isOperational(chainId);
  }

  /**
   * Pre-operation security check
   */
  protected async preOperationCheck(chainId: number): Promise<void> {
    if (!this.securityMonitor) {
      return; // Skip if monitoring not enabled
    }

    const status = this.securityMonitor.getStatus().get(chainId);
    if (!status) {
      throw new Error(`No security status available for chain ${chainId}`);
    }

    if (!status.isWhitelisted) {
      throw new NotWhitelistedError(chainId, this.account.address);
    }

    if (status.isPaused) {
      throw new FactoryPausedError(chainId);
    }
  }

  /**
   * Get client for a specific chain
   */
  protected getClient(chainId: number): PublicClient {
    if (chainId === base.id) {
      return this.baseClient;
    } else if (chainId === optimism.id) {
      return this.optimismClient;
    }
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  /**
   * Get wallet for a specific chain
   */
  protected getWallet(chainId: number): WalletClient {
    if (chainId === base.id) {
      return this.baseWallet;
    } else if (chainId === optimism.id) {
      return this.optimismWallet;
    }
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  /**
   * Start the resolver
   */
  async start(): Promise<void> {
    console.log(`🚀 Starting resolver with address: ${this.account.address}`);
    
    // Start security monitoring
    if (this.securityMonitor) {
      await this.securityMonitor.start();
      
      // Initial operational check
      const baseOperational = this.securityMonitor.isOperational(base.id);
      const optimismOperational = this.securityMonitor.isOperational(optimism.id);
      
      console.log(`📍 Base operational: ${baseOperational ? "✅" : "❌"}`);
      console.log(`📍 Optimism operational: ${optimismOperational ? "✅" : "❌"}`);
      
      if (!baseOperational && !optimismOperational) {
        throw new Error("Resolver is not operational on any chain!");
      }
    }
    
    this.isRunning = true;
  }

  /**
   * Stop the resolver
   */
  async stop(): Promise<void> {
    console.log("🛑 Stopping resolver...");
    this.isRunning = false;
    
    if (this.securityMonitor) {
      this.securityMonitor.stop();
    }
  }

  /**
   * Handle errors with retry logic
   */
  protected async handleWithRetry<T>(
    operation: () => Promise<T>,
    chainId: number,
    maxRetries = 3,
    delayMs = 5000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < maxRetries; i++) {
      try {
        // Check security before operation
        await this.preOperationCheck(chainId);
        
        // Execute operation
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry security errors
        if (error instanceof NotWhitelistedError || error instanceof FactoryPausedError) {
          throw error;
        }

        // Check if it's a security-related revert
        if (error.message?.includes("Not whitelisted resolver")) {
          throw new NotWhitelistedError(chainId, this.account.address);
        }
        if (error.message?.includes("Protocol is paused")) {
          throw new FactoryPausedError(chainId);
        }

        console.warn(`Attempt ${i + 1} failed:`, error.message);
        
        if (i < maxRetries - 1) {
          console.log(`Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError || new Error("Operation failed after retries");
  }
}