#!/usr/bin/env -S deno run --allow-all --env-file=.env

import { createPublicClient, http, type Address, type Hex, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const BMN_TOKEN = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address;
const PROTOCOL = "0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06" as Address;
const FACTORY = "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address;

const bobPrivateKey = Deno.env.get("BOB_PRIVATE_KEY");
if (!bobPrivateKey) {
  console.error("BOB_PRIVATE_KEY not set");
  Deno.exit(1);
}

const bobAccount = privateKeyToAccount(bobPrivateKey as Hex);
const client = createPublicClient({
  chain: base,
  transport: http("https://erpc.up.railway.app/main/evm/8453"),
});

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

// Check Bob's BMN balance
const balance = await client.readContract({
  address: BMN_TOKEN,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [bobAccount.address],
});

// Check allowances
const protocolAllowance = await client.readContract({
  address: BMN_TOKEN,
  abi: erc20Abi,
  functionName: "allowance",
  args: [bobAccount.address, PROTOCOL],
});

const factoryAllowance = await client.readContract({
  address: BMN_TOKEN,
  abi: erc20Abi,
  functionName: "allowance",
  args: [bobAccount.address, FACTORY],
});

console.log(`🤖 Bob's Account Status on Base`);
console.log(`================================`);
console.log(`Address: ${bobAccount.address}`);
console.log(`BMN Balance: ${balance} (${Number(balance) / 1e18} BMN)`);
console.log(`Protocol Allowance: ${protocolAllowance} (${Number(protocolAllowance) / 1e18} BMN)`);
console.log(`Factory Allowance: ${factoryAllowance} (${Number(factoryAllowance) / 1e18} BMN)`);

if (balance === 0n) {
  console.log(`\n❌ Bob has no BMN tokens on Base!`);
  console.log(`   Please transfer some BMN to Bob's address`);
}

if (protocolAllowance === 0n) {
  console.log(`\n⚠️ Bob needs to approve the protocol to spend BMN`);
}

if (factoryAllowance === 0n) {
  console.log(`\n⚠️ Bob needs to approve the factory to spend BMN`);
}