import { createPublicClient, http, type Address, parseAbi } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({
  chain: base,
  transport: http("https://erpc.up.railway.app/main/evm/8453"),
});

const PROTOCOL = "0xe767105dcfB3034a346578afd2aFD8e583171489" as Address;
const ALICE = "0x240E2588e35FB9D3D60B283B45108a49972FFFd8" as Address;

console.log("Checking recent OrderFilled events...\n");

// Get current block number
const currentBlock = await client.getBlockNumber();
const fromBlock = currentBlock - 1000n; // Look back 1000 blocks

console.log(`Searching from block ${fromBlock} to ${currentBlock}\n`);

const logs = await client.getLogs({
  address: PROTOCOL,
  event: parseAbi(["event OrderFilled(bytes32 orderHash, uint256 remainingAmount)"])[0],
  fromBlock: fromBlock,
  toBlock: "latest",
});

console.log(`Found ${logs.length} OrderFilled events\n`);

for (const log of logs.slice(-5)) {
  console.log(`Block: ${log.blockNumber}`);
  console.log(`Order Hash: ${log.args.orderHash}`);
  console.log(`Remaining: ${log.args.remainingAmount}`);
  console.log(`Tx: ${log.transactionHash}\n`);
}
