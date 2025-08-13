/**
 * Example: Using Generated Wagmi Actions
 * 
 * The actions plugin generates type-safe action functions for each contract method.
 * These provide an alternative to manually calling readContract/writeContract.
 */

import { createConfig, http } from "@wagmi/core";
import { base, optimism } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Import generated actions
import {
  readSimpleLimitOrderProtocolHashOrder,
  readSimpleLimitOrderProtocolRemaining,
  writeSimpleLimitOrderProtocolFillOrderArgs,
  simpleLimitOrderProtocolAddress,
} from "../generated/contracts.ts";

// Setup config
const config = createConfig({
  chains: [base, optimism],
  transports: {
    [base.id]: http(),
    [optimism.id]: http(),
  },
});

// Example 1: Read contract using generated action
async function getOrderHash(order: any) {
  // Instead of:
  // await readContract(config, {
  //   address: simpleLimitOrderProtocolAddress[8453],
  //   abi: simpleLimitOrderProtocolAbi,
  //   functionName: "hashOrder",
  //   args: [order],
  // });

  // You can use the generated action:
  const orderHash = await readSimpleLimitOrderProtocolHashOrder(config, {
    address: simpleLimitOrderProtocolAddress[8453],
    args: [order],
  });

  return orderHash;
}

// Example 2: Check remaining amount on an order
async function checkOrderRemaining(orderHash: `0x${string}`) {
  const remaining = await readSimpleLimitOrderProtocolRemaining(config, {
    address: simpleLimitOrderProtocolAddress[8453],
    args: [orderHash],
  });

  console.log(`Order ${orderHash} has ${remaining} remaining`);
  return remaining;
}

// Example 3: Fill an order using generated write action
async function fillOrder(
  order: any,
  r: `0x${string}`,
  vs: `0x${string}`,
  amount: bigint,
  takerTraits: bigint,
  args: `0x${string}`,
) {
  const account = privateKeyToAccount(Deno.env.get("BOB_PRIVATE_KEY") as `0x${string}`);

  const hash = await writeSimpleLimitOrderProtocolFillOrderArgs(config, {
    address: simpleLimitOrderProtocolAddress[8453],
    account,
    args: [order, r, vs, amount, takerTraits, args],
  });

  console.log(`Fill order transaction: ${hash}`);
  return hash;
}

// Benefits of using generated actions:
// 1. ✅ Shorter, cleaner code
// 2. ✅ Function names are pre-bound (no need to specify functionName)
// 3. ✅ Full TypeScript support with auto-completion
// 4. ✅ Same type safety as manual approach
// 5. ✅ Consistent naming pattern across all contracts

export { getOrderHash, checkOrderRemaining, fillOrder };