#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Monitor Swap Script
 * 
 * Monitors the progress of an atomic swap by watching blockchain events
 * and checking escrow states on both chains.
 */

import {
  type Address,
  createPublicClient,
  http,
  type Hex,
  parseAbi,
} from "viem";
import { base, optimism } from "viem/chains";
import { getContractAddresses } from "../src/config/contracts.ts";

interface SwapState {
  hashlock: Hex;
  sourceChain: number;
  destinationChain: number;
  sourceEscrow?: Address;
  destinationEscrow?: Address;
  sourceDeposited: boolean;
  destinationFunded: boolean;
  secretRevealed: boolean;
  secret?: Hex;
  sourceWithdrawn: boolean;
  destinationWithdrawn: boolean;
}

const ESCROW_ABI = parseAbi([
  "function state() view returns (uint8)",
  "function immutables() view returns (bytes32 hashlock, address tokenAddress, uint256 amount, address sender, address receiver, uint256 timelocks)",
  "event Deposited(address indexed sender, uint256 amount)",
  "event Withdrawn(address indexed receiver, bytes32 secret)",
  "event Cancelled(address indexed sender)",
]);

async function getEscrowState(client: any, escrowAddress: Address): Promise<{
  state: number;
  hashlock: Hex;
  amount: bigint;
  sender: Address;
  receiver: Address;
  timelocks: bigint;
}> {
  const [state, immutables] = await Promise.all([
    client.readContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: "state",
    }),
    client.readContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: "immutables",
    }),
  ]);
  
  return {
    state: state as number,
    hashlock: immutables[0] as Hex,
    amount: immutables[2] as bigint,
    sender: immutables[3] as Address,
    receiver: immutables[4] as Address,
    timelocks: immutables[5] as bigint,
  };
}

async function findEscrowsByHashlock(
  client: any,
  factoryAddress: Address,
  hashlock: Hex,
  fromBlock: bigint = 0n
): Promise<Address[]> {
  // Get EscrowCreated events from factory
  const logs = await client.getLogs({
    address: factoryAddress,
    event: parseAbi([
      "event EscrowCreated(address indexed escrow, bytes32 indexed hashlock, uint8 escrowType)",
    ])[0],
    args: {
      hashlock,
    },
    fromBlock,
    toBlock: "latest",
  });
  
  return logs.map((log: any) => log.args.escrow as Address);
}

async function monitorSwapProgress(hashlock: Hex, options?: {
  sourceChain?: number;
  destinationChain?: number;
  pollInterval?: number;
  timeout?: number;
}): Promise<void> {
  const sourceChain = options?.sourceChain || 8453; // Base
  const destinationChain = options?.destinationChain || 10; // Optimism
  const pollInterval = options?.pollInterval || 5000; // 5 seconds
  const timeout = options?.timeout || 600000; // 10 minutes
  
  // Setup clients
  const sourceClient = createPublicClient({
    chain: sourceChain === 8453 ? base : optimism,
    transport: http(),
  });
  
  const destClient = createPublicClient({
    chain: destinationChain === 10 ? optimism : base,
    transport: http(),
  });
  
  const sourceAddresses = getContractAddresses(sourceChain);
  const destAddresses = getContractAddresses(destinationChain);
  
  const state: SwapState = {
    hashlock,
    sourceChain,
    destinationChain,
    sourceDeposited: false,
    destinationFunded: false,
    secretRevealed: false,
    sourceWithdrawn: false,
    destinationWithdrawn: false,
  };
  
  console.log(`\n🔍 Monitoring swap with hashlock: ${hashlock}`);
  console.log(`   Source Chain: ${sourceChain === 8453 ? "Base" : "Optimism"}`);
  console.log(`   Destination Chain: ${destinationChain === 10 ? "Optimism" : "Base"}\n`);
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      // Find escrows if not already found
      if (!state.sourceEscrow) {
        const sourceEscrows = await findEscrowsByHashlock(
          sourceClient,
          sourceAddresses.escrowFactory as Address,
          hashlock,
          BigInt(sourceAddresses.deploymentBlock || 0)
        );
        
        if (sourceEscrows.length > 0) {
          state.sourceEscrow = sourceEscrows[0];
          console.log(`✅ Source escrow found: ${state.sourceEscrow}`);
        }
      }
      
      if (!state.destinationEscrow) {
        const destEscrows = await findEscrowsByHashlock(
          destClient,
          destAddresses.escrowFactory as Address,
          hashlock,
          BigInt(destAddresses.deploymentBlock || 0)
        );
        
        if (destEscrows.length > 0) {
          state.destinationEscrow = destEscrows[0];
          console.log(`✅ Destination escrow found: ${state.destinationEscrow}`);
        }
      }
      
      // Check escrow states
      if (state.sourceEscrow && !state.sourceDeposited) {
        const escrowState = await getEscrowState(sourceClient, state.sourceEscrow);
        if (escrowState.state === 1) { // Active state
          state.sourceDeposited = true;
          console.log(`✅ Source escrow deposited: ${escrowState.amount} tokens`);
        }
      }
      
      if (state.destinationEscrow && !state.destinationFunded) {
        const escrowState = await getEscrowState(destClient, state.destinationEscrow);
        if (escrowState.state === 1) { // Active state
          state.destinationFunded = true;
          console.log(`✅ Destination escrow funded: ${escrowState.amount} tokens`);
        }
      }
      
      // Check for withdrawals (state = 2)
      if (state.destinationEscrow && !state.destinationWithdrawn) {
        const escrowState = await getEscrowState(destClient, state.destinationEscrow);
        if (escrowState.state === 2) { // Withdrawn state
          state.destinationWithdrawn = true;
          state.secretRevealed = true;
          console.log(`✅ Destination escrow withdrawn (secret revealed)`);
          
          // Get the secret from withdrawal event
          const withdrawLogs = await destClient.getLogs({
            address: state.destinationEscrow,
            event: parseAbi(["event Withdrawn(address indexed receiver, bytes32 secret)"])[0],
            fromBlock: BigInt(destAddresses.deploymentBlock || 0),
            toBlock: "latest",
          });
          
          if (withdrawLogs.length > 0) {
            state.secret = withdrawLogs[0].args.secret as Hex;
            console.log(`   Secret: ${state.secret}`);
          }
        }
      }
      
      if (state.sourceEscrow && !state.sourceWithdrawn) {
        const escrowState = await getEscrowState(sourceClient, state.sourceEscrow);
        if (escrowState.state === 2) { // Withdrawn state
          state.sourceWithdrawn = true;
          console.log(`✅ Source escrow withdrawn`);
        }
      }
      
      // Check if swap is complete
      if (state.sourceWithdrawn && state.destinationWithdrawn) {
        console.log("\n🎉 Atomic swap completed successfully!");
        console.log("\n📊 Final State:");
        console.log(`   Source Escrow: ${state.sourceEscrow}`);
        console.log(`   Destination Escrow: ${state.destinationEscrow}`);
        console.log(`   Secret: ${state.secret}`);
        return;
      }
      
      // Print current status
      const statusLine = [
        state.sourceEscrow ? "📦" : "⏳",
        state.sourceDeposited ? "💰" : "⏳",
        state.destinationEscrow ? "📦" : "⏳",
        state.destinationFunded ? "💰" : "⏳",
        state.secretRevealed ? "🔓" : "🔒",
        state.sourceWithdrawn && state.destinationWithdrawn ? "✅" : "⏳",
      ].join(" → ");
      
      process.stdout.write(`\r${statusLine} (${Math.floor((Date.now() - startTime) / 1000)}s)`);
      
    } catch (error) {
      console.error("\n⚠️ Error checking state:", error);
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  console.error("\n\n❌ Monitoring timed out");
  console.log("\n📊 Final State:");
  console.log(`   Source Escrow: ${state.sourceEscrow || "Not created"}`);
  console.log(`   Source Deposited: ${state.sourceDeposited}`);
  console.log(`   Destination Escrow: ${state.destinationEscrow || "Not created"}`);
  console.log(`   Destination Funded: ${state.destinationFunded}`);
  console.log(`   Secret Revealed: ${state.secretRevealed}`);
  console.log(`   Source Withdrawn: ${state.sourceWithdrawn}`);
  console.log(`   Destination Withdrawn: ${state.destinationWithdrawn}`);
}

async function main() {
  const hashlock = Deno.args[0] as Hex;
  const sourceChain = parseInt(Deno.args[1] || "8453");
  const destinationChain = parseInt(Deno.args[2] || "10");
  
  if (!hashlock || !hashlock.startsWith("0x")) {
    console.error("Usage: deno run monitor-swap.ts <hashlock> [sourceChain] [destChain]");
    console.error("Example: deno run monitor-swap.ts 0x1234... 8453 10");
    Deno.exit(1);
  }
  
  await monitorSwapProgress(hashlock, {
    sourceChain,
    destinationChain,
    pollInterval: 3000,
    timeout: 600000, // 10 minutes
  });
}

if (import.meta.main) {
  main().catch(error => {
    console.error("Fatal error:", error);
    Deno.exit(1);
  });
}