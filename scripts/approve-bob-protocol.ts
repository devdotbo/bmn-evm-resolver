import { createWalletClient, http, type Address, type Hex, parseAbi, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const BMN_TOKEN = "0x8287CD2aC7E227D9D927F998EB600a0683a832A1" as Address;
const PROTOCOL = "0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06" as Address;

const bobPrivateKey = Deno.env.get("BOB_PRIVATE_KEY");
if (!bobPrivateKey) {
  console.error("BOB_PRIVATE_KEY not set");
  Deno.exit(1);
}

const bobAccount = privateKeyToAccount(bobPrivateKey as Hex);
const wallet = createWalletClient({
  account: bobAccount,
  chain: base,
  transport: http("https://erpc.up.railway.app/main/evm/8453"),
});

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

console.log(`🤖 Approving protocol to spend Bob's BMN...`);
console.log(`   Spender: ${PROTOCOL}`);
console.log(`   Amount: 1000 BMN`);

const hash = await wallet.writeContract({
  address: BMN_TOKEN,
  abi: erc20Abi,
  functionName: "approve",
  args: [PROTOCOL, parseEther("1000")],
});

console.log(`✅ Approval transaction: ${hash}`);
