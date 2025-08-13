#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write

import { createWalletClient, createPublicClient, http, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import { erc20Abi } from "viem";

const BMN_TOKEN = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address;
const LIMIT_ORDER_PROTOCOL = "0xe767105dcfB3034a346578afd2aFD8e583171489" as Address;
const ESCROW_FACTORY = "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address;

async function main() {
  const privateKey = Deno.env.get("RESOLVER_PRIVATE_KEY") || Deno.env.get("BOB_PRIVATE_KEY");
  if (!privateKey) {
    console.error("❌ RESOLVER_PRIVATE_KEY or BOB_PRIVATE_KEY required");
    Deno.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`🔑 Bob's address: ${account.address}`);

  // Setup clients for both chains
  const baseClient = createPublicClient({
    chain: base,
    transport: http("https://erpc.up.railway.app/main/evm/8453"),
  });

  const baseWallet = createWalletClient({
    chain: base,
    transport: http("https://erpc.up.railway.app/main/evm/8453"),
    account,
  });

  const optimismClient = createPublicClient({
    chain: optimism,
    transport: http("https://erpc.up.railway.app/main/evm/10"),
  });

  const optimismWallet = createWalletClient({
    chain: optimism,
    transport: http("https://erpc.up.railway.app/main/evm/10"),
    account,
  });

  // Check and approve on Base
  console.log("\n📍 Base Chain (8453):");
  
  const baseBalance = await baseClient.readContract({
    address: BMN_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`   Balance: ${Number(baseBalance) / 1e18} BMN`);

  const baseAllowanceLP = await baseClient.readContract({
    address: BMN_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, LIMIT_ORDER_PROTOCOL],
  });
  console.log(`   Allowance (LimitOrderProtocol): ${baseAllowanceLP > 0n ? "✅" : "❌"}`);

  if (baseAllowanceLP === 0n) {
    console.log("   🔓 Approving tokens for LimitOrderProtocol...");
    const tx = await baseWallet.writeContract({
      address: BMN_TOKEN,
      abi: erc20Abi,
      functionName: "approve",
      args: [LIMIT_ORDER_PROTOCOL, 2n ** 256n - 1n],
    });
    await baseClient.waitForTransactionReceipt({ hash: tx });
    console.log(`   ✅ Approved: ${tx}`);
  }

  const baseAllowanceEF = await baseClient.readContract({
    address: BMN_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, ESCROW_FACTORY],
  });
  console.log(`   Allowance (EscrowFactory): ${baseAllowanceEF > 0n ? "✅" : "❌"}`);

  if (baseAllowanceEF === 0n) {
    console.log("   🔓 Approving tokens for EscrowFactory...");
    const tx = await baseWallet.writeContract({
      address: BMN_TOKEN,
      abi: erc20Abi,
      functionName: "approve",
      args: [ESCROW_FACTORY, 2n ** 256n - 1n],
    });
    await baseClient.waitForTransactionReceipt({ hash: tx });
    console.log(`   ✅ Approved: ${tx}`);
  }

  // Check and approve on Optimism
  console.log("\n📍 Optimism Chain (10):");
  
  const opBalance = await optimismClient.readContract({
    address: BMN_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`   Balance: ${Number(opBalance) / 1e18} BMN`);

  // Get Optimism contract addresses  
  const OP_LIMIT_ORDER_PROTOCOL = "0xe767105dcfB3034a346578afd2aFD8e583171489" as Address;
  const OP_ESCROW_FACTORY = "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address;

  const opAllowanceLP = await optimismClient.readContract({
    address: BMN_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, OP_LIMIT_ORDER_PROTOCOL],
  });
  console.log(`   Allowance (LimitOrderProtocol): ${opAllowanceLP > 0n ? "✅" : "❌"}`);

  if (opAllowanceLP === 0n) {
    console.log("   🔓 Approving tokens for LimitOrderProtocol...");
    const tx = await optimismWallet.writeContract({
      address: BMN_TOKEN,
      abi: erc20Abi,
      functionName: "approve",
      args: [OP_LIMIT_ORDER_PROTOCOL, 2n ** 256n - 1n],
    });
    await optimismClient.waitForTransactionReceipt({ hash: tx });
    console.log(`   ✅ Approved: ${tx}`);
  }

  const opAllowanceEF = await optimismClient.readContract({
    address: BMN_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, OP_ESCROW_FACTORY],
  });
  console.log(`   Allowance (EscrowFactory): ${opAllowanceEF > 0n ? "✅" : "❌"}`);

  if (opAllowanceEF === 0n) {
    console.log("   🔓 Approving tokens for EscrowFactory...");
    const tx = await optimismWallet.writeContract({
      address: BMN_TOKEN,
      abi: erc20Abi,
      functionName: "approve",
      args: [OP_ESCROW_FACTORY, 2n ** 256n - 1n],
    });
    await optimismClient.waitForTransactionReceipt({ hash: tx });
    console.log(`   ✅ Approved: ${tx}`);
  }

  console.log("\n✅ All approvals complete!");
}

main().catch(console.error);