#!/usr/bin/env -S deno run --allow-all --env-file=.env

/**
 * Monitor for source escrow creation and trigger destination escrow creation
 */

import { createPublicClient, http, type Hex, type Address, parseAbiItem } from "viem";
import { base, optimism } from "viem/chains";
import { createDestinationEscrow, extractImmutables } from "../src/utils/escrow-creation.ts";

const FACTORY_ADDRESS = "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address;

// Event signatures
const POST_INTERACTION_ESCROW_CREATED = parseAbiItem(
  "event PostInteractionEscrowCreated(address indexed escrow, bytes32 indexed hashlock, address indexed protocol, address taker, uint256 amount)"
);

const SRC_ESCROW_CREATED = parseAbiItem(
  "event SrcEscrowCreated(address indexed escrow, bytes32 indexed orderHash, address indexed maker, address taker, uint256 amount)"
);

async function monitorChain(chainId: number) {
  const chain = chainId === 8453 ? base : optimism;
  const rpcUrl = chainId === 8453
    ? "https://erpc.up.railway.app/main/evm/8453"
    : "https://erpc.up.railway.app/main/evm/10";
    
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  
  console.log(`👁️ Monitoring chain ${chainId} for escrow creation events...`);
  
  // Watch for both event types
  const unwatch1 = client.watchContractEvent({
    address: FACTORY_ADDRESS,
    abi: [POST_INTERACTION_ESCROW_CREATED],
    eventName: "PostInteractionEscrowCreated",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { escrow, hashlock, protocol, taker, amount } = log.args as any;
        console.log(`\n🎉 PostInteractionEscrowCreated detected on chain ${chainId}!`);
        console.log(`   Escrow: ${escrow}`);
        console.log(`   Hashlock: ${hashlock}`);
        console.log(`   Protocol: ${protocol}`);
        console.log(`   Taker: ${taker}`);
        console.log(`   Amount: ${amount}`);
        
        // Check if we should create destination escrow
        await checkAndCreateDestinationEscrow(hashlock, escrow, chainId);
      }
    },
  });
  
  const unwatch2 = client.watchContractEvent({
    address: FACTORY_ADDRESS,
    abi: [SRC_ESCROW_CREATED],
    eventName: "SrcEscrowCreated",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { escrow, orderHash, maker, taker, amount } = log.args as any;
        console.log(`\n🎉 SrcEscrowCreated detected on chain ${chainId}!`);
        console.log(`   Escrow: ${escrow}`);
        console.log(`   Order Hash: ${orderHash}`);
        console.log(`   Maker: ${maker}`);
        console.log(`   Taker: ${taker}`);
        console.log(`   Amount: ${amount}`);
        
        // Use orderHash as hashlock for lookup
        await checkAndCreateDestinationEscrow(orderHash, escrow, chainId);
      }
    },
  });
  
  // Also check recent blocks for missed events
  const latestBlock = await client.getBlockNumber();
  const fromBlock = latestBlock - 100n; // Check last 100 blocks
  
  const logs1 = await client.getContractEvents({
    address: FACTORY_ADDRESS,
    abi: [POST_INTERACTION_ESCROW_CREATED],
    eventName: "PostInteractionEscrowCreated",
    fromBlock,
    toBlock: latestBlock,
  });
  
  const logs2 = await client.getContractEvents({
    address: FACTORY_ADDRESS,
    abi: [SRC_ESCROW_CREATED],
    eventName: "SrcEscrowCreated",
    fromBlock,
    toBlock: latestBlock,
  });
  
  console.log(`📊 Found ${logs1.length} PostInteractionEscrowCreated events in last 100 blocks`);
  console.log(`📊 Found ${logs2.length} SrcEscrowCreated events in last 100 blocks`);
  
  // Process historical events
  for (const log of logs1) {
    const { escrow, hashlock } = log.args as any;
    await checkAndCreateDestinationEscrow(hashlock, escrow, chainId);
  }
  
  for (const log of logs2) {
    const { escrow, orderHash } = log.args as any;
    await checkAndCreateDestinationEscrow(orderHash, escrow, chainId);
  }
  
  return { unwatch1, unwatch2 };
}

async function checkAndCreateDestinationEscrow(
  hashlock: Hex,
  srcEscrow: Address,
  sourceChainId: number
) {
  // Check if we have the order data
  const orderFiles = [
    `./pending-orders/${hashlock}.json`,
    `./completed-orders/${hashlock}.json`,
  ];
  
  for (const file of orderFiles) {
    try {
      const orderData = JSON.parse(await Deno.readTextFile(file));
      
      // Only Bob should create destination escrow
      const bobPrivateKey = Deno.env.get("BOB_PRIVATE_KEY");
      if (!bobPrivateKey) {
        console.log("⚠️ BOB_PRIVATE_KEY not set, skipping destination escrow creation");
        return;
      }
      
      // Extract immutables
      const immutables = extractImmutables(
        orderData.order,
        orderData.extensionData as Hex,
        srcEscrow
      );
      
      // Check if destination chain is different
      const destChainId = Number(immutables.dstChainId);
      if (destChainId === sourceChainId) {
        console.log("⚠️ Same chain swap, no destination escrow needed");
        return;
      }
      
      console.log(`\n🚀 Creating destination escrow on chain ${destChainId}...`);
      
      const result = await createDestinationEscrow(
        immutables,
        bobPrivateKey
      );
      
      console.log(`✅ Destination escrow created!`);
      console.log(`   Address: ${result.escrow}`);
      console.log(`   Transaction: ${result.hash}`);
      
      // Save destination escrow info
      const escrowInfo = {
        sourceChain: sourceChainId,
        sourceEscrow: srcEscrow,
        destChain: destChainId,
        destEscrow: result.escrow,
        hashlock,
        timestamp: new Date().toISOString(),
      };
      
      await Deno.writeTextFile(
        `./escrow-pairs/${hashlock}.json`,
        JSON.stringify(escrowInfo, null, 2)
      );
      
      return;
    } catch (error) {
      // File not found or other error, continue to next
      continue;
    }
  }
  
  console.log(`⚠️ No order data found for hashlock ${hashlock}`);
}

// Main execution
async function main() {
  console.log("🔄 Atomic Swap Escrow Monitor");
  console.log("==============================");
  
  // Create escrow-pairs directory
  await Deno.mkdir("./escrow-pairs", { recursive: true });
  
  // Monitor both chains
  const base_watchers = await monitorChain(8453);
  const optimism_watchers = await monitorChain(10);
  
  console.log("\n✅ Monitoring started. Press Ctrl+C to stop.");
  
  // Keep the script running
  await new Promise(() => {});
}

main().catch(console.error);