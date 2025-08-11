#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Test Factory Connection Script
 *
 * Tests the resolver's ability to interact with the new v2.1.0 factory
 * Performs read operations to verify connectivity and permissions
 */

import { type Address, createPublicClient, http } from "viem";
import { base, optimism } from "viem/chains";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { CREATE3_ADDRESSES } from "../src/config/contracts.ts";

// Factory ABI for testing
const FACTORY_TEST_ABI = [
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
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "srcEscrowImplementation",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "dstEscrowImplementation",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface TestResult {
  test: string;
  passed: boolean;
  details?: string;
  error?: string;
}

class FactoryConnectionTester {
  private results: TestResult[] = [];
  private resolverAddress: Address;

  constructor(resolverAddress: Address) {
    this.resolverAddress = resolverAddress;
  }

  private addResult(
    test: string,
    passed: boolean,
    details?: string,
    error?: string,
  ) {
    this.results.push({ test, passed, details, error });
    const symbol = passed ? "✅" : "❌";
    const message = details || error || "";
    console.log(`${symbol} ${test}: ${message}`);
  }

  async testChain(
    chainId: number,
    chainName: string,
    factoryAddress: Address,
    rpcUrl: string,
  ) {
    console.log(`\n🔗 Testing ${chainName} (Chain ${chainId})`);
    console.log(`Factory: ${factoryAddress}`);
    console.log("-".repeat(50));

    const chain = chainId === 10 ? optimism : base;
    const client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // Test 1: Basic connectivity
    try {
      const blockNumber = await client.getBlockNumber();
      this.addResult(
        `${chainName}: RPC Connection`,
        true,
        `Connected (block ${blockNumber})`,
      );
    } catch (error) {
      this.addResult(
        `${chainName}: RPC Connection`,
        false,
        undefined,
        String(error),
      );
      return; // Can't continue without RPC
    }

    // Test 2: Factory exists
    try {
      const code = await client.getBytecode({ address: factoryAddress });
      const exists = code && code !== "0x";
      this.addResult(
        `${chainName}: Factory Exists`,
        exists,
        exists ? "Contract deployed" : "No contract at address",
      );
      if (!exists) return;
    } catch (error) {
      this.addResult(
        `${chainName}: Factory Exists`,
        false,
        undefined,
        String(error),
      );
      return;
    }

    // Test 3: Read VERSION
    try {
      const version = await client.readContract({
        address: factoryAddress,
        abi: FACTORY_TEST_ABI,
        functionName: "VERSION",
      });
      const isV2 = version.includes("2.1.0");
      this.addResult(
        `${chainName}: Factory Version`,
        isV2,
        `Version: ${version}`,
      );
    } catch (error) {
      this.addResult(
        `${chainName}: Factory Version`,
        false,
        undefined,
        String(error),
      );
    }

    // Test 4: Check whitelist status
    try {
      const isWhitelisted = await client.readContract({
        address: factoryAddress,
        abi: FACTORY_TEST_ABI,
        functionName: "whitelistedResolvers",
        args: [this.resolverAddress],
      });
      this.addResult(
        `${chainName}: Whitelist Status`,
        isWhitelisted,
        isWhitelisted ? "Resolver whitelisted" : "Not whitelisted",
      );
    } catch (error) {
      this.addResult(
        `${chainName}: Whitelist Status`,
        false,
        undefined,
        String(error),
      );
    }

    // Test 5: Check pause status
    try {
      const isPaused = await client.readContract({
        address: factoryAddress,
        abi: FACTORY_TEST_ABI,
        functionName: "emergencyPaused",
      });
      this.addResult(
        `${chainName}: Pause Status`,
        !isPaused,
        isPaused ? "Factory is paused" : "Factory operational",
      );
    } catch (error) {
      this.addResult(
        `${chainName}: Pause Status`,
        false,
        undefined,
        String(error),
      );
    }

    // Test 6: Read owner
    try {
      const owner = await client.readContract({
        address: factoryAddress,
        abi: FACTORY_TEST_ABI,
        functionName: "owner",
      });
      this.addResult(
        `${chainName}: Owner Access`,
        true,
        `Owner: ${owner}`,
      );
    } catch (error) {
      this.addResult(
        `${chainName}: Owner Access`,
        false,
        undefined,
        String(error),
      );
    }

    // Test 7: Read implementation addresses
    try {
      const [srcImpl, dstImpl] = await Promise.all([
        client.readContract({
          address: factoryAddress,
          abi: FACTORY_TEST_ABI,
          functionName: "srcEscrowImplementation",
        }),
        client.readContract({
          address: factoryAddress,
          abi: FACTORY_TEST_ABI,
          functionName: "dstEscrowImplementation",
        }),
      ]);
      this.addResult(
        `${chainName}: Implementation Addresses`,
        true,
        `Src: ${srcImpl.slice(0, 10)}..., Dst: ${dstImpl.slice(0, 10)}...`,
      );
    } catch (error) {
      this.addResult(
        `${chainName}: Implementation Addresses`,
        false,
        undefined,
        String(error),
      );
    }
  }

  printSummary() {
    console.log("\n" + "=".repeat(60));
    console.log("TEST SUMMARY");
    console.log("=".repeat(60));

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const passRate = ((passed / this.results.length) * 100).toFixed(1);

    console.log(
      `\nTests Passed: ${passed}/${this.results.length} (${passRate}%)`,
    );

    if (failed > 0) {
      console.log("\n❌ Failed Tests:");
      this.results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`  - ${r.test}: ${r.error || r.details}`);
        });
    }

    if (passed === this.results.length) {
      console.log("\n✅ All tests passed! Factory connection verified.");
    } else {
      console.log("\n⚠️ Some tests failed. Please review the issues above.");
    }

    return passed === this.results.length;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("FACTORY CONNECTION TEST");
  console.log("=".repeat(60));

  // Get resolver address
  const privateKey = Deno.env.get("RESOLVER_PRIVATE_KEY");
  if (!privateKey) {
    console.error("❌ RESOLVER_PRIVATE_KEY not set");
    Deno.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`, { nonceManager });
  const resolverAddress = account.address;

  console.log(`\nResolver Address: ${resolverAddress}`);
  console.log(`Factory V2: ${CREATE3_ADDRESSES.ESCROW_FACTORY_V2}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const tester = new FactoryConnectionTester(resolverAddress);

  // Test Optimism
  await tester.testChain(
    10,
    "Optimism",
    CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
    Deno.env.get("OPTIMISM_RPC") || "https://mainnet.optimism.io",
  );

  // Test Base
  await tester.testChain(
    8453,
    "Base",
    CREATE3_ADDRESSES.ESCROW_FACTORY_V2,
    Deno.env.get("BASE_RPC") || "https://mainnet.base.org",
  );

  // Print summary
  const allPassed = tester.printSummary();

  // Recommendations
  console.log("\n" + "=".repeat(60));
  console.log("RECOMMENDATIONS");
  console.log("=".repeat(60));

  if (allPassed) {
    console.log(
      "\n✅ Your resolver is ready to interact with the v2.1.0 factory!",
    );
    console.log("\nNext steps:");
    console.log("1. Run a test swap with small amounts");
    console.log("2. Monitor for any transaction reverts");
    console.log("3. Gradually increase operation volume");
  } else {
    console.log("\n⚠️ Action required before migration:");
    console.log("1. If not whitelisted: Contact protocol team");
    console.log("2. If factory paused: Wait for unpause");
    console.log("3. If connection failed: Check RPC endpoints");
    console.log("4. Run this test again after fixes");
  }

  Deno.exit(allPassed ? 0 : 1);
}

// Run the test
if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ Test failed:", error);
    Deno.exit(1);
  });
}
