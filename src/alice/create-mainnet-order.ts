#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env

import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { parseEther } from "viem";
import { getChains, getChainName } from "../config/chain-selector.ts";
import { getContractAddresses, BMN_TOKEN_CONFIG } from "../config/contracts.ts";
import { SAFETY_DEPOSIT_ETH } from "../config/constants.ts";
import {
  createPublicClientForChain,
  createWalletClientForChain,
  createEscrowFactory,
  createERC20Token,
  waitForTransaction,
} from "../utils/contracts.ts";
import { generateSecret, computeHashlock } from "../utils/secrets.ts";
import { createTimelocks, packTimelocks } from "../utils/timelocks.ts";
import { computeEscrowSrcAddress, getProxyBytecodeHash } from "../utils/addresses.ts";
import { formatTokenAmount } from "../config/constants.ts";
import { AliceStateManager } from "./state.ts";
import type { OrderParams, OrderState } from "../types/index.ts";
import { OrderStatus } from "../types/index.ts";

/**
 * Create a BMN swap order on mainnet
 * Alice swaps BMN on Base for BMN on Etherlink
 */
async function createMainnetOrder() {
  console.log("=== Creating BMN Swap Order on Mainnet ===\n");

  // Get Alice's private key from environment
  const alicePrivateKey = Deno.env.get("ALICE_PRIVATE_KEY");
  if (!alicePrivateKey || !alicePrivateKey.startsWith("0x")) {
    console.error("Please set ALICE_PRIVATE_KEY environment variable");
    Deno.exit(1);
  }

  const account = privateKeyToAccount(alicePrivateKey as `0x${string}`);
  console.log(`Alice address: ${account.address}`);

  // Set mainnet mode
  Deno.env.set("NETWORK_MODE", "mainnet");

  // Get chain configuration
  const chains = getChains();
  console.log(`Source chain: ${getChainName(chains.srcChainId)} (${chains.srcChainId})`);
  console.log(`Destination chain: ${getChainName(chains.dstChainId)} (${chains.dstChainId})\n`);

  // Create clients
  const srcPublicClient = createPublicClientForChain(chains.srcChain);
  const srcWalletClient = createWalletClientForChain(chains.srcChain, alicePrivateKey as `0x${string}`);

  // Get contract addresses
  const srcAddresses = getContractAddresses(chains.srcChainId);
  const dstAddresses = getContractAddresses(chains.dstChainId);

  // BMN token address (same on both chains via CREATE3)
  const BMN_TOKEN = BMN_TOKEN_CONFIG.address;

  // Swap parameters
  const swapAmount = parseEther("10"); // Swap 10 BMN tokens
  const safetyDeposit = SAFETY_DEPOSIT_ETH; // 0.00002 ETH (~$0.03-0.04 at $2000/ETH)

  // Check BMN balance
  const bmnToken = createERC20Token(BMN_TOKEN, srcPublicClient, srcWalletClient);
  const balance = await bmnToken.read.balanceOf([account.address]);
  
  console.log(`Alice BMN balance on Base: ${balance} (${formatTokenAmount(balance)} BMN)`);
  
  if (balance < swapAmount) {
    console.error("Insufficient BMN balance for swap");
    return;
  }
  
  // Check ETH balance for safety deposit
  const ethBalance = await srcPublicClient.getBalance({ address: account.address });
  if (ethBalance < safetyDeposit) {
    console.error("Insufficient ETH balance for safety deposit");
    return;
  }

  // Generate secret
  const secret = generateSecret();
  const hashlock = computeHashlock(secret);
  
  console.log(`Secret: ${secret}`);
  console.log(`Hashlock: ${hashlock}`);

  // Create timelocks
  const timelocks = createTimelocks();
  
  // Create immutables
  const immutables = {
    orderHash: hashlock, // Using hashlock as order hash for simplicity
    hashlock,
    maker: account.address,
    taker: "0x0000000000000000000000000000000000000000" as Address, // Any taker
    token: BMN_TOKEN,
    amount: swapAmount,
    safetyDeposit,
    timelocks: packTimelocks(timelocks),
  };

  // Compute escrow address
  const proxyBytecodeHash = getProxyBytecodeHash(chains.srcChainId);
  const srcEscrowAddress = computeEscrowSrcAddress(
    srcAddresses.escrowFactory,
    immutables,
    proxyBytecodeHash
  );

  console.log(`\nComputed source escrow address: ${srcEscrowAddress}`);

  // Approve tokens to factory
  console.log("\nChecking token approval...");
  const allowance = await bmnToken.read.allowance([
    account.address,
    srcAddresses.escrowFactory,
  ]);

  if (allowance < swapAmount + safetyDeposit) {
    console.log("Approving BMN tokens to factory...");
    const approveHash = await bmnToken.write.approve([
      srcAddresses.escrowFactory,
      swapAmount + safetyDeposit,
    ]);
    await waitForTransaction(srcPublicClient, approveHash);
    console.log("✅ Tokens approved");
  }

  // Create escrow through factory
  console.log("\nCreating source escrow...");
  const factory = createEscrowFactory(
    srcAddresses.escrowFactory,
    srcPublicClient,
    srcWalletClient
  );

  try {
    const txHash = await factory.write.createEscrowSrc([immutables]);
    console.log(`Transaction hash: ${txHash}`);
    
    const receipt = await waitForTransaction(srcPublicClient, txHash);
    
    if (receipt.status === "success") {
      console.log("✅ Source escrow created successfully!");
      console.log(`Escrow address: ${srcEscrowAddress}`);
      
      // Save order state
      const orderParams: OrderParams = {
        srcToken: BMN_TOKEN,
        dstToken: BMN_TOKEN,
        srcAmount: swapAmount,
        dstAmount: swapAmount,
        safetyDeposit,
        secret,
        srcChainId: chains.srcChainId,
        dstChainId: chains.dstChainId,
      };

      const orderState: OrderState = {
        id: hashlock,
        params: orderParams,
        immutables,
        srcEscrowAddress,
        status: OrderStatus.SrcEscrowDeployed,
        createdAt: Date.now(),
      };

      const stateManager = new AliceStateManager();
      await stateManager.loadFromFile().catch(() => {});
      stateManager.addOrder(orderState, secret);
      await stateManager.saveToFile();

      console.log("\n📋 Order Summary:");
      console.log(`- Order ID: ${hashlock}`);
      console.log(`- Swapping: ${formatTokenAmount(swapAmount)} BMN (Base → Etherlink)`);
      console.log(`- Safety deposit: ${formatTokenAmount(safetyDeposit)} BMN`);
      console.log(`- Source escrow: ${srcEscrowAddress}`);
      console.log("\n✅ Order created! Waiting for resolver to execute...");
      
    } else {
      console.error("❌ Transaction failed!");
    }
  } catch (error) {
    console.error("Error creating escrow:", error);
  }
}

// Run the script
if (import.meta.main) {
  await createMainnetOrder();
}