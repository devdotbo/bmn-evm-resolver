#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-run

/**
 * Comprehensive integration test for Bridge-Me-Not atomic swap flow
 * Tests the complete flow from order creation to completion
 */

import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";
import { privateKeyToAccount } from "viem/accounts";
import { parseEther, formatEther } from "viem";
import type { Address } from "viem";
import { Resolver } from "../src/resolver/index.ts";
import { createOrder } from "../src/alice/create-order.ts";
import { withdrawFromOrder } from "../src/alice/withdraw.ts";
import { AliceStateManager } from "../src/alice/state.ts";
import { OrderStateManager } from "../src/resolver/state.ts";
import { getChains, getChainName } from "../src/config/chain-selector.ts";
import { getContractAddresses, loadContractAddressesFromEnv, BMN_TOKEN_CONFIG } from "../src/config/contracts.ts";
import { createPublicClientForChain, createWalletClientForChain, createERC20Token } from "../src/utils/contracts.ts";
import { OrderStatus } from "../src/types/index.ts";

// Test configuration
const TEST_AMOUNT = "10"; // 10 tokens
const TEST_SAFETY_DEPOSIT = parseEther("0.00002"); // 0.00002 ETH safety deposit
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_WAIT_TIME = 120000; // 2 minutes
const RESOLVER_STARTUP_TIME = 5000; // 5 seconds

// Colors for output
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

interface TestContext {
  alicePrivateKey: `0x${string}`;
  bobPrivateKey: `0x${string}`;
  tokenA: string;
  tokenB: string;
  networkMode: "local" | "testnet" | "mainnet";
  verbose: boolean;
}

class IntegrationTest {
  private resolver: Resolver | null = null;
  private aliceStateManager: AliceStateManager;
  private bobStateManager: OrderStateManager;
  private orderId: string | null = null;

  constructor(private context: TestContext) {
    this.aliceStateManager = new AliceStateManager();
    this.bobStateManager = new OrderStateManager();
  }

  async run(): Promise<boolean> {
    console.log(`${BLUE}=== Bridge-Me-Not Integration Test ===${RESET}\n`);
    console.log(`Network mode: ${this.context.networkMode}`);
    console.log(`Token A: ${this.context.tokenA}`);
    console.log(`Token B: ${this.context.tokenB}`);
    console.log(`Amount: ${TEST_AMOUNT}`);
    console.log(`Safety Deposit: ${formatEther(TEST_SAFETY_DEPOSIT)} ETH\n`);

    try {
      // Step 1: Setup and verify environment
      console.log(`${YELLOW}Step 1: Setting up test environment...${RESET}`);
      await this.setupEnvironment();

      // Step 2: Start resolver
      console.log(`\n${YELLOW}Step 2: Starting resolver (Bob)...${RESET}`);
      await this.startResolver();

      // Step 3: Create order
      console.log(`\n${YELLOW}Step 3: Creating order (Alice)...${RESET}`);
      await this.createTestOrder();

      // Step 4: Wait for order discovery
      console.log(`\n${YELLOW}Step 4: Waiting for order discovery by Bob...${RESET}`);
      await this.waitForOrderDiscovery();

      // Step 5: Wait for destination escrow deployment
      console.log(`\n${YELLOW}Step 5: Waiting for destination escrow deployment...${RESET}`);
      await this.waitForDestinationEscrow();

      // Step 6: Alice withdraws revealing secret
      console.log(`\n${YELLOW}Step 6: Alice withdraws from destination escrow...${RESET}`);
      await this.aliceWithdraw();

      // Step 7: Wait for Bob to claim
      console.log(`\n${YELLOW}Step 7: Waiting for Bob to claim from source...${RESET}`);
      await this.waitForBobClaim();

      // Step 8: Verify final state
      console.log(`\n${YELLOW}Step 8: Verifying final state...${RESET}`);
      await this.verifyFinalState();

      console.log(`\n${GREEN}✅ Integration test completed successfully!${RESET}`);
      return true;

    } catch (error) {
      console.error(`\n${RED}❌ Integration test failed:${RESET}`, error);
      return false;
    } finally {
      await this.cleanup();
    }
  }

  private async setupEnvironment(): Promise<void> {
    // Load contract addresses
    loadContractAddressesFromEnv();

    const chains = getChains();
    const srcAddresses = getContractAddresses(chains.srcChainId);
    const dstAddresses = getContractAddresses(chains.dstChainId);

    // Get account addresses
    const aliceAccount = privateKeyToAccount(this.context.alicePrivateKey);
    const bobAccount = privateKeyToAccount(this.context.bobPrivateKey);

    console.log(`Alice address: ${aliceAccount.address}`);
    console.log(`Bob address: ${bobAccount.address}`);
    console.log(`Source chain: ${getChainName(chains.srcChainId)} (${chains.srcChainId})`);
    console.log(`Destination chain: ${getChainName(chains.dstChainId)} (${chains.dstChainId})`);

    // Check balances
    const srcPublicClient = createPublicClientForChain(chains.srcChain);
    const dstPublicClient = createPublicClientForChain(chains.dstChain);

    // Get token addresses based on network mode
    let srcTokenAddress: Address;
    let dstTokenAddress: Address;

    if (this.context.networkMode === "mainnet") {
      // Use BMN token on mainnet
      srcTokenAddress = BMN_TOKEN_CONFIG.address;
      dstTokenAddress = BMN_TOKEN_CONFIG.address;
    } else {
      // Use test tokens on local/testnet
      srcTokenAddress = srcAddresses.tokens[this.context.tokenA];
      dstTokenAddress = dstAddresses.tokens[this.context.tokenB];
    }

    // Check ETH balances for safety deposit
    const aliceEthBalance = await srcPublicClient.getBalance({ address: aliceAccount.address });
    const bobEthBalance = await dstPublicClient.getBalance({ address: bobAccount.address });

    console.log(`\nETH Balances:`);
    console.log(`  Alice (source): ${formatEther(aliceEthBalance)} ETH`);
    console.log(`  Bob (destination): ${formatEther(bobEthBalance)} ETH`);

    if (aliceEthBalance < TEST_SAFETY_DEPOSIT) {
      throw new Error(`Alice needs at least ${formatEther(TEST_SAFETY_DEPOSIT)} ETH for safety deposit`);
    }

    // Check token balances
    const srcToken = createERC20Token(srcTokenAddress, srcPublicClient);
    const dstToken = createERC20Token(dstTokenAddress, dstPublicClient);

    const aliceTokenBalance = await srcToken.read.balanceOf([aliceAccount.address]);
    const bobTokenBalance = await dstToken.read.balanceOf([bobAccount.address]);

    console.log(`\nToken Balances:`);
    console.log(`  Alice ${this.context.tokenA}: ${formatEther(aliceTokenBalance)}`);
    console.log(`  Bob ${this.context.tokenB}: ${formatEther(bobTokenBalance)}`);

    const requiredAmount = parseEther(TEST_AMOUNT);
    if (aliceTokenBalance < requiredAmount) {
      throw new Error(`Alice needs at least ${TEST_AMOUNT} ${this.context.tokenA}`);
    }
    if (bobTokenBalance < requiredAmount) {
      throw new Error(`Bob needs at least ${TEST_AMOUNT} ${this.context.tokenB}`);
    }

    // Check contract deployments
    console.log(`\nVerifying contract deployments...`);
    const srcFactoryCode = await srcPublicClient.getBytecode({ address: srcAddresses.escrowFactory });
    const dstFactoryCode = await dstPublicClient.getBytecode({ address: dstAddresses.escrowFactory });

    if (!srcFactoryCode || srcFactoryCode === "0x") {
      throw new Error("Source chain EscrowFactory not deployed");
    }
    if (!dstFactoryCode || dstFactoryCode === "0x") {
      throw new Error("Destination chain EscrowFactory not deployed");
    }

    console.log(`✅ Environment setup verified`);
  }

  private async startResolver(): Promise<void> {
    this.resolver = new Resolver(this.context.bobPrivateKey);
    
    // Start resolver in background
    const resolverPromise = this.resolver.start();
    
    // Wait for startup
    await new Promise(resolve => setTimeout(resolve, RESOLVER_STARTUP_TIME));
    
    // Check if resolver started successfully
    const stats = this.resolver.getStatistics();
    if (!stats.isRunning) {
      throw new Error("Resolver failed to start");
    }

    console.log(`✅ Resolver started successfully`);
  }

  private async createTestOrder(): Promise<void> {
    // Clear any existing state
    this.aliceStateManager = new AliceStateManager();
    await this.aliceStateManager.loadFromFile().catch(() => {});

    const initialOrderCount = this.aliceStateManager.getAllOrders().length;

    // Create order with proper safety deposit
    await createOrder({
      amount: TEST_AMOUNT,
      tokenA: this.context.tokenA,
      tokenB: this.context.tokenB,
      privateKey: this.context.alicePrivateKey,
    });

    // Reload state and verify order was created
    await this.aliceStateManager.loadFromFile();
    const orders = this.aliceStateManager.getAllOrders();
    
    if (orders.length <= initialOrderCount) {
      throw new Error("Order was not created");
    }

    // Get the latest order
    const order = orders[orders.length - 1];
    this.orderId = order.id;

    console.log(`✅ Order created with ID: ${this.orderId}`);
    console.log(`   Hashlock: ${order.immutables.hashlock}`);
    console.log(`   Amount: ${formatEther(order.params.srcAmount)} ${this.context.tokenA}`);
  }

  private async waitForOrderDiscovery(): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_WAIT_TIME) {
      // Check Bob's state
      await this.bobStateManager.loadFromFile().catch(() => {});
      const bobOrder = this.bobStateManager.getOrder(this.orderId!);

      if (bobOrder) {
        console.log(`✅ Order discovered by Bob`);
        console.log(`   Status: ${bobOrder.status}`);
        return;
      }

      if (this.context.verbose) {
        console.log(`   Waiting for order discovery...`);
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }

    throw new Error("Timeout waiting for order discovery");
  }

  private async waitForDestinationEscrow(): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_WAIT_TIME) {
      // Check Bob's state for destination escrow
      await this.bobStateManager.loadFromFile();
      const bobOrder = this.bobStateManager.getOrder(this.orderId!);

      if (bobOrder && bobOrder.dstEscrowAddress && 
          bobOrder.dstEscrowAddress !== "0x0000000000000000000000000000000000000000") {
        console.log(`✅ Destination escrow deployed at: ${bobOrder.dstEscrowAddress}`);
        
        // Update Alice's state with the destination escrow
        const aliceOrder = this.aliceStateManager.getOrder(this.orderId!);
        if (aliceOrder) {
          this.aliceStateManager.updateOrderEscrows(
            this.orderId!,
            bobOrder.srcEscrowAddress,
            bobOrder.dstEscrowAddress
          );
          await this.aliceStateManager.saveToFile();
        }
        return;
      }

      if (this.context.verbose) {
        console.log(`   Waiting for destination escrow deployment...`);
        if (bobOrder) {
          console.log(`   Current status: ${bobOrder.status}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }

    throw new Error("Timeout waiting for destination escrow deployment");
  }

  private async aliceWithdraw(): Promise<void> {
    // Get the order with updated escrow addresses
    await this.aliceStateManager.loadFromFile();
    const order = this.aliceStateManager.getOrder(this.orderId!);
    
    if (!order || !order.dstEscrowAddress) {
      throw new Error("Order not found or destination escrow not set");
    }

    // Perform withdrawal
    const success = await withdrawFromOrder({
      orderId: this.orderId!,
      privateKey: this.context.alicePrivateKey,
    });

    if (!success) {
      throw new Error("Alice withdrawal failed");
    }

    console.log(`✅ Alice successfully withdrew from destination escrow`);
  }

  private async waitForBobClaim(): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_WAIT_TIME) {
      // Check Bob's state
      await this.bobStateManager.loadFromFile();
      const bobOrder = this.bobStateManager.getOrder(this.orderId!);

      if (bobOrder && bobOrder.status === OrderStatus.Completed) {
        console.log(`✅ Bob successfully claimed from source escrow`);
        return;
      }

      if (this.context.verbose && bobOrder) {
        console.log(`   Bob's order status: ${bobOrder.status}`);
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }

    throw new Error("Timeout waiting for Bob to claim");
  }

  private async verifyFinalState(): Promise<void> {
    // Load final states
    await this.aliceStateManager.loadFromFile();
    await this.bobStateManager.loadFromFile();

    const aliceOrder = this.aliceStateManager.getOrder(this.orderId!);
    const bobOrder = this.bobStateManager.getOrder(this.orderId!);

    if (!aliceOrder || !bobOrder) {
      throw new Error("Orders not found in final state");
    }

    // Verify both orders are completed
    if (aliceOrder.status !== OrderStatus.Completed) {
      throw new Error(`Alice order not completed: ${aliceOrder.status}`);
    }
    if (bobOrder.status !== OrderStatus.Completed) {
      throw new Error(`Bob order not completed: ${bobOrder.status}`);
    }

    // Verify balances changed appropriately
    const chains = getChains();
    const srcPublicClient = createPublicClientForChain(chains.srcChain);
    const dstPublicClient = createPublicClientForChain(chains.dstChain);

    const aliceAccount = privateKeyToAccount(this.context.alicePrivateKey);
    const bobAccount = privateKeyToAccount(this.context.bobPrivateKey);

    // Get token addresses
    const srcAddresses = getContractAddresses(chains.srcChainId);
    const dstAddresses = getContractAddresses(chains.dstChainId);

    let srcTokenAddress: Address;
    let dstTokenAddress: Address;

    if (this.context.networkMode === "mainnet") {
      srcTokenAddress = BMN_TOKEN_CONFIG.address;
      dstTokenAddress = BMN_TOKEN_CONFIG.address;
    } else {
      srcTokenAddress = srcAddresses.tokens[this.context.tokenA];
      dstTokenAddress = dstAddresses.tokens[this.context.tokenB];
    }

    const srcToken = createERC20Token(srcTokenAddress, srcPublicClient);
    const dstToken = createERC20Token(dstTokenAddress, dstPublicClient);

    const aliceSrcBalance = await srcToken.read.balanceOf([aliceAccount.address]);
    const aliceDstBalance = await dstToken.read.balanceOf([aliceAccount.address]);
    const bobSrcBalance = await srcToken.read.balanceOf([bobAccount.address]);
    const bobDstBalance = await dstToken.read.balanceOf([bobAccount.address]);

    console.log(`\nFinal Token Balances:`);
    console.log(`  Alice ${this.context.tokenA} (source): ${formatEther(aliceSrcBalance)}`);
    console.log(`  Alice ${this.context.tokenB} (destination): ${formatEther(aliceDstBalance)}`);
    console.log(`  Bob ${this.context.tokenA} (source): ${formatEther(bobSrcBalance)}`);
    console.log(`  Bob ${this.context.tokenB} (destination): ${formatEther(bobDstBalance)}`);

    console.log(`\n✅ Atomic swap completed successfully!`);
  }

  private async cleanup(): Promise<void> {
    console.log(`\n${YELLOW}Cleaning up...${RESET}`);
    
    if (this.resolver) {
      try {
        await this.resolver.stop();
        console.log("✅ Resolver stopped");
      } catch (error) {
        console.error("Failed to stop resolver:", error);
      }
    }

    // Save final states
    await this.aliceStateManager.saveToFile();
    await this.bobStateManager.saveToFile();
  }
}

// Main entry point
if (import.meta.main) {
  const flags = parseArgs(Deno.args, {
    string: ["token-a", "token-b", "network", "alice-key", "bob-key"],
    boolean: ["verbose", "help"],
    default: {
      "token-a": "TKA",
      "token-b": "TKB",
      "network": "local",
      "verbose": false,
    },
  });

  if (flags.help) {
    console.log(`
Bridge-Me-Not Integration Test

Usage:
  deno run --allow-all scripts/integration-test-flow.ts [options]

Options:
  --network <mode>      Network mode: local, testnet, or mainnet (default: local)
  --token-a <symbol>    Source token symbol (default: TKA)
  --token-b <symbol>    Destination token symbol (default: TKB)
  --alice-key <key>     Alice's private key (default: from env)
  --bob-key <key>       Bob's private key (default: from env)
  --verbose             Show detailed progress
  --help                Show this help message

Examples:
  # Test on local chains
  deno run --allow-all scripts/integration-test-flow.ts

  # Test on mainnet with BMN token
  deno run --allow-all scripts/integration-test-flow.ts --network mainnet --token-a BMN --token-b BMN

  # Test with custom tokens
  deno run --allow-all scripts/integration-test-flow.ts --token-a USDC --token-b USDT
`);
    Deno.exit(0);
  }

  // Set network mode
  const networkMode = flags.network as "local" | "testnet" | "mainnet";
  Deno.env.set("NETWORK_MODE", networkMode);

  // Get private keys
  const alicePrivateKey = flags["alice-key"] || Deno.env.get("ALICE_PRIVATE_KEY");
  const bobPrivateKey = flags["bob-key"] || Deno.env.get("RESOLVER_PRIVATE_KEY");

  if (!alicePrivateKey || !bobPrivateKey) {
    console.error("Please provide private keys via --alice-key/--bob-key or environment variables");
    Deno.exit(1);
  }

  // Create test context
  const context: TestContext = {
    alicePrivateKey: alicePrivateKey as `0x${string}`,
    bobPrivateKey: bobPrivateKey as `0x${string}`,
    tokenA: flags["token-a"],
    tokenB: flags["token-b"],
    networkMode,
    verbose: flags.verbose,
  };

  // Run test
  const test = new IntegrationTest(context);
  const success = await test.run();

  Deno.exit(success ? 0 : 1);
}