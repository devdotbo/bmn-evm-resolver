import { createPublicClient, http } from "viem";
import { baseMainnet, etherlinkMainnet } from "../src/config/chains.ts";
import { getContractAddresses } from "../src/config/contracts.ts";
import { EscrowFactoryABI } from "../src/types/contracts.ts";

console.log("🔍 Verifying Mainnet Configuration...\n");

// Check Base Mainnet
console.log("📍 Base Mainnet (Chain ID: 8453)");
const baseAddresses = getContractAddresses(8453);
console.log(`  Factory: ${baseAddresses.escrowFactory}`);
console.log(`  BMN Token: ${baseAddresses.tokens.BMN || "Not configured"}`);

// Check Etherlink Mainnet
console.log("\n📍 Etherlink Mainnet (Chain ID: 42793)");
const etherlinkAddresses = getContractAddresses(42793);
console.log(`  Factory: ${etherlinkAddresses.escrowFactory}`);
console.log(`  BMN Token: ${etherlinkAddresses.tokens.BMN || "Not configured"}`);

// Test RPC connections
console.log("\n🌐 Testing RPC Connections...");

try {
  const baseClient = createPublicClient({
    chain: baseMainnet,
    transport: http(),
  });
  
  const baseBlockNumber = await baseClient.getBlockNumber();
  console.log(`  ✅ Base RPC connected (block: ${baseBlockNumber})`);
  
  // Check if factory is deployed on Base
  const baseFactoryCode = await baseClient.getBytecode({
    address: baseAddresses.escrowFactory,
  });
  
  if (baseFactoryCode && baseFactoryCode !== "0x") {
    console.log(`  ✅ Factory deployed on Base`);
    
    // Try to call a view function
    try {
      const srcImpl = await baseClient.readContract({
        address: baseAddresses.escrowFactory,
        abi: EscrowFactoryABI.abi,
        functionName: "escrowSrcImplementation",
      });
      console.log(`  ✅ Factory is functional (srcImpl: ${srcImpl})`);
    } catch (err) {
      console.log(`  ⚠️  Factory view function failed: ${err.message}`);
    }
  } else {
    console.log(`  ❌ Factory not deployed on Base`);
  }
} catch (err) {
  console.log(`  ❌ Base RPC connection failed: ${err.message}`);
}

try {
  const etherlinkClient = createPublicClient({
    chain: etherlinkMainnet,
    transport: http(),
  });
  
  const etherlinkBlockNumber = await etherlinkClient.getBlockNumber();
  console.log(`  ✅ Etherlink RPC connected (block: ${etherlinkBlockNumber})`);
  
  // Check if factory is deployed on Etherlink
  const etherlinkFactoryCode = await etherlinkClient.getBytecode({
    address: etherlinkAddresses.escrowFactory,
  });
  
  if (etherlinkFactoryCode && etherlinkFactoryCode !== "0x") {
    console.log(`  ✅ Factory deployed on Etherlink`);
    
    // Try to call a view function
    try {
      const srcImpl = await etherlinkClient.readContract({
        address: etherlinkAddresses.escrowFactory,
        abi: EscrowFactoryABI.abi,
        functionName: "escrowSrcImplementation",
      });
      console.log(`  ✅ Factory is functional (srcImpl: ${srcImpl})`);
    } catch (err) {
      console.log(`  ⚠️  Factory view function failed: ${err.message}`);
    }
  } else {
    console.log(`  ❌ Factory not deployed on Etherlink`);
  }
} catch (err) {
  console.log(`  ❌ Etherlink RPC connection failed: ${err.message}`);
}

console.log("\n✨ Verification complete!");
console.log("\nTo run the resolver on mainnet:");
console.log("1. Copy .env.mainnet.example to .env.mainnet");
console.log("2. Configure your private keys and addresses");
console.log("3. Run: ./scripts/run-mainnet.sh");