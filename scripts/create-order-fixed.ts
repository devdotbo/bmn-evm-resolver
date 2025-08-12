#!/usr/bin/env -S deno run --allow-all --env-file=.env

import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http, type Hex, type Address, hashTypedData } from "viem";
import { base } from "viem/chains";
import { getContractAddresses } from "../src/config/contracts.ts";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { encode1inchExtension, encodePostInteractionData } from "../src/utils/postinteraction-v2.ts";

// Generate unique nonce
function generateNonce(): bigint {
  const nowMs = Date.now();
  return (BigInt(nowMs) << 20n) | BigInt(Math.floor(Math.random() * 1048576));
}

// Pack timelocks (src cancel time, dst withdraw time)
function packTimelocks(srcCancel: number, dstWithdraw: number): bigint {
  return (BigInt(srcCancel) << 128n) | BigInt(dstWithdraw);
}

async function main() {
  // Configuration
  const chainId = 8453; // Base
  const dstChainId = 10; // Optimism
  const amount = 10000000000000000n; // 0.01 BMN
  
  const addresses = getContractAddresses(chainId);
  const protocol = addresses.limitOrderProtocol as Address;
  const factory = addresses.escrowFactory as Address;
  const token = addresses.tokens.BMN as Address;
  
  // Setup wallet - use Alice account from environment
  const privateKey = Deno.env.get("ALICE_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("ALICE_PRIVATE_KEY environment variable not set");
  }
  const account = privateKeyToAccount(privateKey as Hex);
  const wallet = createWalletClient({
    account,
    chain: base,
    transport: http("https://erpc.up.railway.app/main/evm/8453"),
  });
  
  console.log("Creating order from:", account.address);
  console.log("Protocol:", protocol);
  console.log("Factory:", factory);
  console.log("Token:", token);
  
  // Generate hashlock
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const hashlock = keccak256(("0x" + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')) as Hex);
  console.log("Hashlock:", hashlock);
  
  // Build PostInteraction data using the proper encoding functions
  const now = Math.floor(Date.now() / 1000);
  const srcCancelTime = now + 7200; // 2 hours
  const dstWithdrawTime = now + 600; // 10 minutes
  const timelocks = packTimelocks(srcCancelTime, dstWithdrawTime);
  
  // Use the proper encoding function from postinteraction-v2.ts
  // Note: This function expects factory as first param and EscrowParams as second
  const postInteractionData = encodePostInteractionData(
    factory as Address,
    {
      hashlock,
      srcChainId: chainId,
      dstChainId,
      srcImplementation: "0x0000000000000000000000000000000000000000" as Address, // Not used for simplified escrows
      dstImplementation: "0x0000000000000000000000000000000000000000" as Address,
      srcMaker: account.address,
      srcTaker: "0xfdF1dDeB176BEA06c7430166e67E615bC312b7B5" as Address, // Bob/Resolver
      srcToken: token as Address,
      dstReceiver: account.address,
      dstToken: token as Address,
      srcMakingAmount: amount,
      srcTakingAmount: amount,
      srcSafetyDeposit: 0n,
      dstSafetyDeposit: 0n,
      timelocks,
    }
  );
  
  // Encode extension data using the 1inch format
  const extensionData = encode1inchExtension(postInteractionData);
  
  console.log("Extension data:", extensionData);
  console.log("Extension length:", (extensionData.length - 2) / 2, "bytes");
  
  // Calculate extension hash for salt
  const extensionHash = keccak256(extensionData);
  const extensionHashLast160 = BigInt(extensionHash) & ((1n << 160n) - 1n);
  const randomSalt = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) << 160n;
  const salt = randomSalt | extensionHashLast160;
  
  // Build maker traits with CORRECT FLAGS
  // Bit 249: HAS_EXTENSION
  // Bit 251: POST_INTERACTION
  // Bit 254: ALLOW_MULTIPLE_FILLS
  const HAS_EXTENSION = 1n << 249n;
  const POST_INTERACTION = 1n << 251n;
  const ALLOW_MULTIPLE_FILLS = 1n << 254n;
  
  // Set nonce in bits 120-159 (40 bits)
  const nonce40 = generateNonce() & ((1n << 40n) - 1n);
  
  let makerTraits = 0n;
  makerTraits |= HAS_EXTENSION;
  makerTraits |= POST_INTERACTION;
  makerTraits |= ALLOW_MULTIPLE_FILLS;
  makerTraits |= (nonce40 << 120n);
  
  console.log("MakerTraits:", makerTraits.toString());
  console.log("MakerTraits (hex):", "0x" + makerTraits.toString(16));
  console.log("Has HAS_EXTENSION:", (makerTraits & HAS_EXTENSION) !== 0n);
  console.log("Has POST_INTERACTION:", (makerTraits & POST_INTERACTION) !== 0n);
  
  // Create order
  const order = {
    salt,
    maker: account.address,
    receiver: account.address,
    makerAsset: token,
    takerAsset: token,
    makingAmount: amount,
    takingAmount: amount,
    makerTraits,
  };
  
  // Sign order
  const signature = await wallet.signTypedData({
    domain: {
      name: "Bridge-Me-Not Orders",
      version: "1",
      chainId,
      verifyingContract: protocol,
    },
    primaryType: "Order",
    types: {
      Order: [
        { name: "salt", type: "uint256" },
        { name: "maker", type: "address" },
        { name: "receiver", type: "address" },
        { name: "makerAsset", type: "address" },
        { name: "takerAsset", type: "address" },
        { name: "makingAmount", type: "uint256" },
        { name: "takingAmount", type: "uint256" },
        { name: "makerTraits", type: "uint256" },
      ],
    },
    message: order,
  });
  
  console.log("Signature:", signature);
  
  // Save order
  const orderData = {
    order: {
      salt: salt.toString(),
      maker: order.maker,
      receiver: order.receiver,
      makerAsset: order.makerAsset,
      takerAsset: order.takerAsset,
      makingAmount: order.makingAmount.toString(),
      takingAmount: order.takingAmount.toString(),
      makerTraits: order.makerTraits.toString(),
    },
    signature,
    extensionData,
    chainId,
    hashlock,
    timestamp: Date.now(),
  };
  
  const filename = `pending-orders/${hashlock}.json`;
  await Deno.writeTextFile(filename, JSON.stringify(orderData, null, 2));
  console.log(`\n✅ Order saved to ${filename}`);
  
  // Calculate order hash for reference
  const orderHash = hashTypedData({
    domain: {
      name: "Bridge-Me-Not Orders",
      version: "1",
      chainId,
      verifyingContract: protocol,
    },
    primaryType: "Order",
    types: {
      Order: [
        { name: "salt", type: "uint256" },
        { name: "maker", type: "address" },
        { name: "receiver", type: "address" },
        { name: "makerAsset", type: "address" },
        { name: "takerAsset", type: "address" },
        { name: "makingAmount", type: "uint256" },
        { name: "takingAmount", type: "uint256" },
        { name: "makerTraits", type: "uint256" },
      ],
    },
    message: order,
  });
  console.log("Order hash:", orderHash);
}

await main();