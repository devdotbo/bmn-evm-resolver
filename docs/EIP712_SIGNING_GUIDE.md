# EIP-712 Signing Guide for Bridge-Me-Not Orders

## Table of Contents

1. [Overview](#overview)
2. [Domain Parameters](#domain-parameters)
3. [Order Type Structure](#order-type-structure)
4. [EOA vs Smart Contract Detection](#eoa-vs-smart-contract-detection)
5. [Signing Pattern](#signing-pattern)
6. [Filling Orders](#filling-orders)
7. [Signature Format Conversion](#signature-format-conversion)
8. [Complete Code Examples](#complete-code-examples)
9. [Common Mistakes](#common-mistakes)
10. [Testing and Verification](#testing-and-verification)

## Overview

EIP-712 is a standard for typed structured data hashing and signing in Ethereum. It provides:

- **Human-readable signing**: Users see structured data instead of raw bytes
- **Domain separation**: Prevents signature replay across different contracts/chains
- **Type safety**: Ensures data structure consistency

Bridge-Me-Not uses EIP-712 for signing limit orders to ensure security and compatibility with the 1inch SimpleLimitOrderProtocol.

## Domain Parameters

The EIP-712 domain for Bridge-Me-Not Orders is strictly defined:

```typescript
const domain = {
  name: "Bridge-Me-Not Orders",
  version: "1",
  chainId: chainId, // The chain ID where the order will be executed
  verifyingContract: protocolAddress, // SimpleLimitOrderProtocol contract address
};
```

**Important**: These parameters MUST match exactly:
- `name`: Always "Bridge-Me-Not Orders" (not "1inch Limit Order Protocol")
- `version`: Always "1"
- `chainId`: Must match the chain where the order is created and will be filled
- `verifyingContract`: The deployed SimpleLimitOrderProtocol address for that chain

## Order Type Structure

The order structure follows the SimpleLimitOrderProtocol format:

```typescript
const types = {
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
};
```

### Field Descriptions

- **salt**: Unique identifier with extension hash in lower 160 bits (if using extensions)
- **maker**: Address creating and signing the order
- **receiver**: Address to receive maker assets (usually same as maker)
- **makerAsset**: Token address the maker is offering
- **takerAsset**: Token address the maker wants to receive
- **makingAmount**: Amount of makerAsset to trade
- **takingAmount**: Amount of takerAsset to receive
- **makerTraits**: Bitfield encoding order parameters and flags

### MakerTraits Flags

Key flags for PostInteraction support:
```typescript
const HAS_EXTENSION = 1n << 249n;      // Order has extension data
const POST_INTERACTION = 1n << 251n;   // Enable PostInteraction hook
const ALLOW_MULTIPLE_FILLS = 1n << 254n; // Allow partial fills
```

## EOA vs Smart Contract Detection

Before filling an order, detect if the maker is an EOA or smart contract:

```typescript
async function isEOA(client: PublicClient, address: Address): Promise<boolean> {
  try {
    const code = await client.getBytecode({ address });
    // EOA if no code or code is "0x"
    return !code || code === "0x";
  } catch {
    // Default to EOA if check fails
    return true;
  }
}
```

This determines which fill function to use:
- **EOA**: Use `fillOrderArgs` with split signature (r, vs)
- **Smart Contract**: Use `fillContractOrderArgs` with full bytes signature

## Signing Pattern

### Creating and Signing an Order

```typescript
import { createWalletClient, type Address, type Hex } from "viem";

async function createAndSignOrder(
  wallet: WalletClient,
  chainId: number,
  protocolAddress: Address,
  orderParams: {
    maker: Address;
    receiver: Address;
    makerAsset: Address;
    takerAsset: Address;
    makingAmount: bigint;
    takingAmount: bigint;
    extensionData?: Hex;
  }
): Promise<{ order: any; signature: Hex }> {
  // Generate salt with extension hash if using extensions
  let salt: bigint;
  if (orderParams.extensionData) {
    const extensionHash = keccak256(orderParams.extensionData);
    const extensionHashLast160 = BigInt(extensionHash) & ((1n << 160n) - 1n);
    const randomUpper = BigInt(crypto.getRandomValues(new Uint8Array(12))) << 160n;
    salt = randomUpper | extensionHashLast160;
  } else {
    salt = BigInt(crypto.getRandomValues(new Uint8Array(32)));
  }

  // Build makerTraits
  let makerTraits = 0n;
  if (orderParams.extensionData) {
    makerTraits |= (1n << 249n); // HAS_EXTENSION
    makerTraits |= (1n << 251n); // POST_INTERACTION
  }
  makerTraits |= (1n << 254n); // ALLOW_MULTIPLE_FILLS

  // Create order object
  const order = {
    salt,
    maker: orderParams.maker,
    receiver: orderParams.receiver,
    makerAsset: orderParams.makerAsset,
    takerAsset: orderParams.takerAsset,
    makingAmount: orderParams.makingAmount,
    takingAmount: orderParams.takingAmount,
    makerTraits,
  };

  // Sign using EIP-712
  const signature = await wallet.signTypedData({
    domain: {
      name: "Bridge-Me-Not Orders",
      version: "1",
      chainId,
      verifyingContract: protocolAddress,
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

  return { order, signature };
}
```

## Filling Orders

### Determining Fill Function and Arguments

```typescript
async function fillOrder(
  client: PublicClient,
  wallet: WalletClient,
  protocolAddress: Address,
  order: any,
  signature: Hex,
  extensionData: Hex,
  fillAmount: bigint
) {
  // Check if maker is EOA or smart contract
  const makerIsEOA = await isEOA(client, order.maker);
  
  // Compute takerTraits
  const extensionLength = BigInt((extensionData.length - 2) / 2);
  const makerAmountFlag = 1n << 255n; // Interpret amount as makingAmount
  const threshold = order.takingAmount & ((1n << 185n) - 1n);
  const takerTraits = makerAmountFlag | (extensionLength << 224n) | threshold;

  if (makerIsEOA) {
    // Use fillOrderArgs with split signature
    const r = ("0x" + signature.slice(2, 66)) as Hex;
    const vs = splitSignatureToVS(signature);
    
    await client.simulateContract({
      address: protocolAddress,
      abi: SimpleLimitOrderProtocolAbi,
      functionName: "fillOrderArgs",
      args: [order, r, vs, fillAmount, takerTraits, extensionData],
      account: wallet.account,
    });
  } else {
    // Use fillContractOrderArgs with full signature
    await client.simulateContract({
      address: protocolAddress,
      abi: SimpleLimitOrderProtocolAbi,
      functionName: "fillContractOrderArgs",
      args: [order, signature, fillAmount, takerTraits, extensionData],
      account: wallet.account,
    });
  }
}
```

## Signature Format Conversion

### Converting Full Signature to r,vs Format for EOAs

```typescript
function splitSignatureToVS(signature: Hex): Hex {
  // Extract v, s from signature
  const v = parseInt(signature.slice(130, 132), 16);
  const s = BigInt("0x" + signature.slice(66, 130));
  
  // Combine into vs format: v-27 in bit 255, s in lower 255 bits
  const vs = ((BigInt(v - 27) << 255n) | s);
  
  return ("0x" + vs.toString(16).padStart(64, "0")) as Hex;
}

function splitSignature(signature: Hex): { r: Hex; vs: Hex } {
  return {
    r: ("0x" + signature.slice(2, 66)) as Hex,
    vs: splitSignatureToVS(signature),
  };
}
```

### Understanding the vs Format

The `vs` parameter combines:
- **Bit 255**: Recovery ID (v - 27), either 0 or 1
- **Bits 0-254**: The s value from the signature

This compact format saves gas by packing two values into one word.

## Complete Code Examples

### Example 1: Creating a Cross-Chain Order with PostInteraction

```typescript
import { 
  createWalletClient, 
  createPublicClient, 
  http, 
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex 
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

async function createCrossChainOrder() {
  // Setup
  const chainId = 8453; // Base
  const protocolAddress = "0x11431a89893025D2a48dCA4EddC396f8C8117187" as Address;
  const factoryAddress = "0xYourFactoryAddress" as Address;
  const tokenAddress = "0xBMNTokenAddress" as Address;
  
  const privateKey = process.env.PRIVATE_KEY as Hex;
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  // Generate hashlock for cross-chain coordination
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const hashlock = keccak256(("0x" + Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')) as Hex);

  // Build PostInteraction data
  const now = Math.floor(Date.now() / 1000);
  const postInteractionData = encodeAbiParameters(
    parseAbiParameters("address,bytes"),
    [
      factoryAddress,
      encodeAbiParameters(
        parseAbiParameters("bytes32,uint256,address,uint256,uint256"),
        [
          hashlock,
          10, // Destination chain ID (Optimism)
          tokenAddress,
          0n, // Safety deposits
          packTimelocks(now + 7200, now + 600), // 2hr cancel, 10min withdraw
        ]
      )
    ]
  );

  // Encode as 1inch extension
  const extensionData = encode1inchExtension(postInteractionData);

  // Create and sign order
  const { order, signature } = await createAndSignOrder(
    wallet,
    chainId,
    protocolAddress,
    {
      maker: account.address,
      receiver: account.address,
      makerAsset: tokenAddress,
      takerAsset: tokenAddress,
      makingAmount: 10000000000000000n, // 0.01 tokens
      takingAmount: 10000000000000000n,
      extensionData,
    }
  );

  console.log("Order created:", order);
  console.log("Signature:", signature);
  
  return { order, signature, extensionData, hashlock };
}

function packTimelocks(srcCancel: number, dstWithdraw: number): bigint {
  return (BigInt(srcCancel) << 128n) | BigInt(dstWithdraw);
}

function encode1inchExtension(postInteractionData: Hex): Hex {
  // 1inch extension format: offsets word + data
  const offsetsWord = "0x" + "00".repeat(32); // Simple case: one segment at offset 0
  return (offsetsWord + postInteractionData.slice(2)) as Hex;
}
```

### Example 2: Filling an Order with Proper Detection

```typescript
async function fillOrderWithDetection(
  orderData: any,
  resolverPrivateKey: Hex
) {
  const chainId = orderData.chainId;
  const client = createPublicClient({
    chain: chainId === 8453 ? base : optimism,
    transport: http(),
  });
  
  const resolverAccount = privateKeyToAccount(resolverPrivateKey);
  const wallet = createWalletClient({
    account: resolverAccount,
    chain: chainId === 8453 ? base : optimism,
    transport: http(),
  });

  const protocolAddress = getProtocolAddress(chainId);
  const order = orderData.order;
  const signature = orderData.signature as Hex;
  const extensionData = orderData.extensionData as Hex;

  // Detect maker type
  const makerIsEOA = await isEOA(client, order.maker);
  console.log(`Maker ${order.maker} is ${makerIsEOA ? "EOA" : "Smart Contract"}`);

  // Compute takerTraits
  const extensionLength = BigInt((extensionData.length - 2) / 2);
  const makerAmountFlag = 1n << 255n;
  const threshold = BigInt(order.takingAmount) & ((1n << 185n) - 1n);
  const takerTraits = makerAmountFlag | (extensionLength << 224n) | threshold;

  // Validate extension length
  const argsExtLenFromTraits = (takerTraits >> 224n) & ((1n << 24n) - 1n);
  if (argsExtLenFromTraits !== extensionLength) {
    throw new Error(
      `Extension length mismatch: traits=${argsExtLenFromTraits} vs actual=${extensionLength}`
    );
  }

  // Prepare function call based on maker type
  let functionName: string;
  let args: any[];

  if (makerIsEOA) {
    // Split signature for EOA
    const { r, vs } = splitSignature(signature);
    functionName = "fillOrderArgs";
    args = [order, r, vs, order.makingAmount, takerTraits, extensionData];
  } else {
    // Use full signature for smart contract
    functionName = "fillContractOrderArgs";
    args = [order, signature, order.makingAmount, takerTraits, extensionData];
  }

  // Simulate first
  try {
    const { request } = await client.simulateContract({
      address: protocolAddress,
      abi: SimpleLimitOrderProtocolAbi,
      functionName,
      args,
      account: resolverAccount,
      gas: 2_500_000n,
    });

    // Execute if simulation succeeds
    const hash = await wallet.writeContract(request);
    console.log(`Order filled: ${hash}`);
    
    const receipt = await client.waitForTransactionReceipt({ hash });
    console.log(`Gas used: ${receipt.gasUsed}`);
    
    return receipt;
  } catch (error) {
    console.error("Fill failed:", error);
    throw error;
  }
}
```

## Common Mistakes

### 1. Wrong Domain Name
```typescript
// ❌ WRONG - Using 1inch domain
const domain = {
  name: "1inch Limit Order Protocol",
  version: "4",
  // ...
};

// ✅ CORRECT - Bridge-Me-Not domain
const domain = {
  name: "Bridge-Me-Not Orders",
  version: "1",
  // ...
};
```

### 2. Incorrect Salt for Extensions
```typescript
// ❌ WRONG - Random salt when using extensions
const salt = BigInt(crypto.getRandomValues(new Uint8Array(32)));

// ✅ CORRECT - Extension hash in lower 160 bits
const extensionHash = keccak256(extensionData);
const extensionHashLast160 = BigInt(extensionHash) & ((1n << 160n) - 1n);
const randomUpper = BigInt(...) << 160n;
const salt = randomUpper | extensionHashLast160;
```

### 3. Wrong Function for Maker Type
```typescript
// ❌ WRONG - Using fillOrderArgs for smart contract wallet
if (true) { // No detection!
  await fillOrderArgs(order, r, vs, ...);
}

// ✅ CORRECT - Detect and use appropriate function
const makerIsEOA = await isEOA(client, order.maker);
if (makerIsEOA) {
  await fillOrderArgs(order, r, vs, ...);
} else {
  await fillContractOrderArgs(order, signature, ...);
}
```

### 4. Incorrect Signature Splitting
```typescript
// ❌ WRONG - Simple split without vs conversion
const r = signature.slice(0, 66);
const s = signature.slice(66, 130);
const v = signature.slice(130, 132);

// ✅ CORRECT - Proper vs format
const r = ("0x" + signature.slice(2, 66)) as Hex;
const v = parseInt(signature.slice(130, 132), 16);
const s = BigInt("0x" + signature.slice(66, 130));
const vs = ((BigInt(v - 27) << 255n) | s);
```

### 5. Missing MakerTraits Flags
```typescript
// ❌ WRONG - Missing required flags for PostInteraction
let makerTraits = 0n;

// ✅ CORRECT - Include all necessary flags
let makerTraits = 0n;
makerTraits |= (1n << 249n); // HAS_EXTENSION
makerTraits |= (1n << 251n); // POST_INTERACTION
makerTraits |= (1n << 254n); // ALLOW_MULTIPLE_FILLS
```

### 6. TakerTraits Extension Length Mismatch
```typescript
// ❌ WRONG - Hardcoded or incorrect extension length
const takerTraits = makerAmountFlag | (32n << 224n) | threshold;

// ✅ CORRECT - Calculate from actual extension data
const extensionLength = BigInt((extensionData.length - 2) / 2);
const takerTraits = makerAmountFlag | (extensionLength << 224n) | threshold;
```

## Testing and Verification

### 1. Verify Signature Locally

```typescript
import { hashTypedData, recoverAddress } from "viem";

async function verifySignature(
  order: any,
  signature: Hex,
  chainId: number,
  protocolAddress: Address
): Promise<boolean> {
  const digest = hashTypedData({
    domain: {
      name: "Bridge-Me-Not Orders",
      version: "1",
      chainId,
      verifyingContract: protocolAddress,
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

  const recovered = await recoverAddress({ 
    hash: digest, 
    signature 
  });

  const isValid = recovered.toLowerCase() === order.maker.toLowerCase();
  console.log(`Signature ${isValid ? "valid" : "INVALID"}`);
  console.log(`Recovered: ${recovered}, Expected: ${order.maker}`);
  
  return isValid;
}
```

### 2. Test with Local Fork

```bash
# Start local fork
anvil --fork-url https://mainnet.base.org --chain-id 8453

# Run test script
deno run --allow-all test-signing.ts
```

### 3. Verify Order Hash On-Chain

```typescript
async function verifyOrderHash(
  client: PublicClient,
  protocolAddress: Address,
  order: any
): Promise<string> {
  const orderHash = await client.readContract({
    address: protocolAddress,
    abi: SimpleLimitOrderProtocolAbi,
    functionName: "hashOrder",
    args: [[
      order.salt,
      order.maker,
      order.receiver,
      order.makerAsset,
      order.takerAsset,
      order.makingAmount,
      order.takingAmount,
      order.makerTraits,
    ]],
  });

  console.log("Order hash:", orderHash);
  return orderHash as string;
}
```

### 4. Debug Failed Fills

```typescript
import { decodeErrorResult } from "viem";

function decodeProtocolError(error: any): {
  errorName?: string;
  errorArgs?: any[];
  message: string;
} {
  const message = error?.message || String(error);
  
  // Try to extract revert data
  const candidates = [
    error?.data,
    error?.cause?.data,
    error?.cause?.data?.data,
  ];

  for (const data of candidates) {
    if (!data || !data.startsWith("0x")) continue;
    try {
      const decoded = decodeErrorResult({ 
        abi: SimpleLimitOrderProtocolAbi, 
        data 
      });
      return {
        errorName: decoded.errorName,
        errorArgs: decoded.args,
        message,
      };
    } catch {
      continue;
    }
  }

  return { message };
}
```

### 5. Common Error Messages and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `BadSignature` | Invalid signature or wrong domain | Check domain parameters match exactly |
| `InvalidatedOrder` | Order already filled or cancelled | Check order status before filling |
| `WrongAmount` | Incorrect fill amount | Ensure amount respects maker amount flag |
| `PrivateOrder` | Order restricted to specific taker | Check if you're the allowed taker |
| `BadExtension` | Extension data mismatch | Verify salt contains extension hash |
| `PostInteractionFailed` | Factory execution failed | Check factory approval and token balances |

## Best Practices

1. **Always verify signatures locally** before sending to chain
2. **Use simulation** before executing transactions
3. **Check maker type** to determine correct fill function
4. **Validate extension lengths** match between data and traits
5. **Monitor PostInteraction events** for escrow creation confirmation
6. **Handle errors gracefully** with proper decoding and retry logic
7. **Test on testnets/forks** before mainnet deployment
8. **Keep audit trail** of orders and signatures for debugging

## Conclusion

Proper EIP-712 signing and filling is crucial for Bridge-Me-Not Orders. Key points:

- Use exact domain parameters: "Bridge-Me-Not Orders", version "1"
- Detect EOA vs Smart Contract makers to choose the right fill function
- Convert signatures correctly for EOA fills (r, vs format)
- Include proper flags in makerTraits for PostInteraction
- Calculate takerTraits with correct extension length
- Always simulate before executing

Following this guide ensures orders are signed correctly, filled efficiently, and PostInteraction hooks execute successfully for cross-chain escrow creation.