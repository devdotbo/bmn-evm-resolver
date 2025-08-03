#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env --env-file

import { privateKeyToAccount } from "viem/accounts";
import { parseEther } from "viem";
import { getChains } from "../config/chain-selector.ts";
import { getContractAddresses } from "../config/contracts.ts";
import { createWalletClientForChain } from "../utils/contracts.ts";
import { TokenMockABI } from "../types/contracts.ts";

// Funding script to give Bob TKB on Chain B

async function fundBob() {
  // Get chain configuration
  const chains = getChains();
  
  // Get contract addresses
  const chainBAddresses = getContractAddresses(chains.dstChainId);
  
  // Use Alice's private key (she has TKB on chain B)
  const alicePrivateKey = Deno.env.get("ALICE_PRIVATE_KEY") as `0x${string}`;
  const bobPrivateKey = Deno.env.get("RESOLVER_PRIVATE_KEY") as `0x${string}`;
  
  const aliceAccount = privateKeyToAccount(alicePrivateKey);
  const bobAccount = privateKeyToAccount(bobPrivateKey);
  
  console.log(`Funding Bob with TKB on ${chains.dstChain.name}...`);
  console.log(`Alice: ${aliceAccount.address}`);
  console.log(`Bob: ${bobAccount.address}`);
  
  // Create wallet client for Alice on destination chain
  const walletClient = createWalletClientForChain(chains.dstChain, alicePrivateKey);
  
  // Transfer 50 TKB from Alice to Bob on Chain B (Alice only has 100)
  const amount = parseEther("50");
  
  try {
    const hash = await walletClient.writeContract({
      address: chainBAddresses.tokens.TKB,
      abi: TokenMockABI.abi,
      functionName: "transfer",
      args: [bobAccount.address, amount],
    });
    
    console.log(`✅ Transferred 50 TKB to Bob on ${chains.dstChain.name}`);
    console.log(`   Transaction: ${hash}`);
  } catch (error) {
    console.error("❌ Failed to transfer TKB:", error);
  }
}

// Run the funding
await fundBob();