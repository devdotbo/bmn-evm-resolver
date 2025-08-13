import { LimitOrderAlice } from "../src/alice/limit-order-alice.ts";

const alice = new LimitOrderAlice();
await alice.init();

const amount = 10000000000000000n; // 0.01 tokens

const orderHash = await alice.createOrder({
  srcChainId: 8453, // Base
  dstChainId: 10,    // Optimism  
  srcAmount: amount,
  dstAmount: amount,
  resolverAddress: "0x0000000000000000000000000000000000000000",
  srcSafetyDeposit: amount / 100n,
  dstSafetyDeposit: amount / 100n,
});

console.log("Order created:", orderHash);
