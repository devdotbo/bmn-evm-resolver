#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-run

/**
 * Simple atomic swap test runner with clear output
 * Coordinates resolver and Alice to demonstrate a complete swap
 */

import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";
import { privateKeyToAccount } from "viem/accounts";
import { parseEther, formatEther } from "viem";
import { Resolver } from "../src/resolver/index.ts";
import { createOrder } from "../src/alice/create-order.ts";
import { withdrawFromOrder } from "../src/alice/withdraw.ts";
import { AliceStateManager } from "../src/alice/state.ts";
import { OrderStateManager } from "../src/resolver/state.ts";
import { getChains, getChainName } from "../src/config/chain-selector.ts";
import { loadContractAddressesFromEnv } from "../src/config/contracts.ts";
import { OrderStatus } from "../src/types/index.ts";

// Test configuration
const TEST_AMOUNT = "10"; // 10 tokens
const TEST_SAFETY_DEPOSIT = parseEther("0.00002"); // 0.00002 ETH
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_STEPS = 30; // Max polling attempts

// Colors for terminal output
const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

// Simple logger with step tracking
class Logger {
  private step = 0;

  info(message: string) {
    console.log(`${COLORS.blue}[${new Date().toLocaleTimeString()}]${COLORS.reset} ${message}`);
  }

  step(message: string) {
    this.step++;
    console.log(`\n${COLORS.yellow}Step ${this.step}:${COLORS.reset} ${message}`);
  }

  success(message: string) {
    console.log(`${COLORS.green}✓${COLORS.reset} ${message}`);
  }

  error(message: string) {
    console.log(`${COLORS.red}✗${COLORS.reset} ${message}`);
  }

  waiting(message: string) {
    console.log(`${COLORS.gray}⏳ ${message}${COLORS.reset}`);
  }
}

// Main test runner
async function runAtomicSwapTest(network: string) {
  const logger = new Logger();
  let resolver: Resolver | null = null;
  let orderId: string | null = null;

  logger.info("🚀 Starting Bridge-Me-Not Atomic Swap Test");
  logger.info(`Network: ${network}`);
  logger.info(`Amount: ${TEST_AMOUNT} tokens`);
  logger.info(`Safety deposit: ${formatEther(TEST_SAFETY_DEPOSIT)} ETH`);

  try {
    // Load environment
    Deno.env.set("NETWORK_MODE", network);
    loadContractAddressesFromEnv();

    const chains = getChains();
    logger.info(`Source chain: ${getChainName(chains.srcChainId)}`);
    logger.info(`Destination chain: ${getChainName(chains.dstChainId)}`);

    // Get accounts
    const alicePrivateKey = Deno.env.get("ALICE_PRIVATE_KEY") as `0x${string}`;
    const bobPrivateKey = Deno.env.get("RESOLVER_PRIVATE_KEY") as `0x${string}`;

    if (!alicePrivateKey || !bobPrivateKey) {
      throw new Error("Missing ALICE_PRIVATE_KEY or RESOLVER_PRIVATE_KEY in environment");
    }

    const alice = privateKeyToAccount(alicePrivateKey);
    const bob = privateKeyToAccount(bobPrivateKey);

    logger.info(`Alice: ${alice.address}`);
    logger.info(`Bob: ${bob.address}`);

    // Step 1: Start resolver
    logger.step("Starting resolver (Bob)");
    resolver = new Resolver(bobPrivateKey);
    const resolverPromise = resolver.start();
    
    // Give resolver time to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.success("Resolver started and monitoring for orders");

    // Step 2: Create order
    logger.step("Creating order (Alice)");
    const aliceState = new AliceStateManager();
    
    await createOrder({
      amount: TEST_AMOUNT,
      tokenA: network === "mainnet" ? "BMN" : "TKA",
      tokenB: network === "mainnet" ? "BMN" : "TKB",
      privateKey: alicePrivateKey,
    });

    // Get the created order
    await aliceState.loadFromFile();
    const orders = aliceState.getAllOrders();
    const order = orders[orders.length - 1];
    orderId = order.id;

    logger.success(`Order created: ${orderId}`);
    logger.info(`Hashlock: ${order.immutables.hashlock}`);

    // Step 3: Wait for Bob to discover and deploy destination escrow
    logger.step("Waiting for Bob to deploy destination escrow");
    const bobState = new OrderStateManager();
    let bobOrder = null;
    let attempts = 0;

    while (attempts < MAX_STEPS) {
      await bobState.loadFromFile();
      bobOrder = bobState.getOrder(orderId);

      if (bobOrder?.dstEscrowAddress && bobOrder.dstEscrowAddress !== "0x0000000000000000000000000000000000000000") {
        logger.success(`Destination escrow deployed: ${bobOrder.dstEscrowAddress}`);
        
        // Update Alice's state
        aliceState.updateOrderEscrows(orderId, bobOrder.srcEscrowAddress, bobOrder.dstEscrowAddress);
        await aliceState.saveToFile();
        break;
      }

      if (attempts % 5 === 0) {
        logger.waiting(`Waiting for destination escrow... (${attempts}/${MAX_STEPS})`);
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      attempts++;
    }

    if (!bobOrder?.dstEscrowAddress) {
      throw new Error("Timeout waiting for destination escrow");
    }

    // Step 4: Alice withdraws (reveals secret)
    logger.step("Alice withdraws from destination escrow");
    const withdrawSuccess = await withdrawFromOrder({
      orderId,
      privateKey: alicePrivateKey,
    });

    if (!withdrawSuccess) {
      throw new Error("Alice withdrawal failed");
    }

    logger.success("Alice successfully withdrew tokens");
    logger.info("Secret revealed on-chain");

    // Step 5: Wait for Bob to claim
    logger.step("Waiting for Bob to claim from source escrow");
    attempts = 0;

    while (attempts < MAX_STEPS) {
      await bobState.loadFromFile();
      bobOrder = bobState.getOrder(orderId);

      if (bobOrder?.status === OrderStatus.Completed) {
        logger.success("Bob successfully claimed tokens");
        break;
      }

      if (attempts % 5 === 0) {
        logger.waiting(`Waiting for Bob to claim... (${attempts}/${MAX_STEPS})`);
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      attempts++;
    }

    if (bobOrder?.status !== OrderStatus.Completed) {
      throw new Error("Timeout waiting for Bob to claim");
    }

    // Final verification
    await aliceState.loadFromFile();
    const finalOrder = aliceState.getOrder(orderId);

    if (finalOrder?.status === OrderStatus.Completed) {
      logger.success("Alice's order marked as completed");
    }

    // Success!
    console.log("\n" + "=".repeat(50));
    logger.success("🎉 ATOMIC SWAP COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(50));
    logger.info("Alice sent tokens on source chain");
    logger.info("Alice received tokens on destination chain");
    logger.info("Bob sent tokens on destination chain");
    logger.info("Bob received tokens on source chain");
    logger.info("All transactions are atomic and trustless!");

    return true;

  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
    return false;

  } finally {
    // Cleanup
    if (resolver) {
      logger.info("\nStopping resolver...");
      try {
        await resolver.stop();
        logger.success("Resolver stopped");
      } catch (e) {
        logger.error(`Failed to stop resolver: ${e.message}`);
      }
    }
  }
}

// Main entry point
if (import.meta.main) {
  const flags = parseArgs(Deno.args, {
    string: ["network"],
    boolean: ["help"],
    default: {
      network: "local",
    },
  });

  if (flags.help) {
    console.log(`
Bridge-Me-Not Atomic Swap Test Runner

Usage:
  ./scripts/run-atomic-swap-test.ts [options]

Options:
  --network <mode>  Network to test on: local, testnet, or mainnet (default: local)
  --help           Show this help message

Examples:
  # Test on local chains
  ./scripts/run-atomic-swap-test.ts

  # Test on mainnet (uses BMN token)
  ./scripts/run-atomic-swap-test.ts --network mainnet

Environment Variables Required:
  ALICE_PRIVATE_KEY     Alice's private key
  RESOLVER_PRIVATE_KEY  Bob's private key
  
For local testing, also requires:
  - Local chains running on ports 8545 and 8546
  - Contracts deployed (see bmn-evm-contracts)

Safety Notes:
  - Uses minimal amounts (10 tokens, 0.00002 ETH deposits)
  - Test accounts should have sufficient balances
  - For mainnet, ensure you understand the risks
`);
    Deno.exit(0);
  }

  const network = flags.network;
  if (!["local", "testnet", "mainnet"].includes(network)) {
    console.error(`Invalid network: ${network}. Must be local, testnet, or mainnet`);
    Deno.exit(1);
  }

  // Check environment
  const envFile = network === "mainnet" ? ".env.mainnet" : 
                  network === "testnet" ? ".env.testnet" : 
                  ".env";
  
  try {
    await Deno.stat(envFile);
  } catch {
    console.error(`Missing ${envFile} file. Please create it from .env.example`);
    Deno.exit(1);
  }

  // Run the test
  const success = await runAtomicSwapTest(network);
  Deno.exit(success ? 0 : 1);
}