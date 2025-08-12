import { 
  type Address, 
  type Hex, 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseUnits,
  type WalletClient,
  type PublicClient,
  decodeAbiParameters,
  parseAbiParameters
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import SimplifiedEscrowFactoryV2_3 from "../../abis/SimplifiedEscrowFactoryV2_3.json" with { type: "json" };

/**
 * Escrow Immutables structure for factory calls
 */
export interface EscrowImmutables {
  srcImplementation: Address;
  dstImplementation: Address;
  timelocks: bigint;
  hashlock: Hex;
  dstChainId: bigint;
  srcMaker: Address;
  srcTaker: Address;
  srcToken: Address;
  srcAmount: bigint;
  srcSafetyDeposit: bigint;
  dstReceiver: Address;
  dstToken: Address;
  dstAmount: bigint;
  dstSafetyDeposit: bigint;
  nonce: bigint;
}

/**
 * Parse PostInteraction extension data to extract escrow parameters
 */
export function parsePostInteractionData(extensionData: Hex): {
  factory: Address;
  hashlock: Hex;
  dstChainId: bigint;
  dstToken: Address;
  deposits: bigint;
  timelocks: bigint;
} {
  // Extension data format: 20 bytes factory + abi.encode(hashlock, dstChainId, dstToken, deposits, timelocks)
  const factory = ('0x' + extensionData.slice(2, 42)) as Address;
  const payload = ('0x' + extensionData.slice(42)) as Hex;
  
  // Decode the 5-tuple payload
  const [hashlock, dstChainId, dstToken, deposits, timelocks] = decodeAbiParameters(
    parseAbiParameters('bytes32, uint256, address, uint256, uint256'),
    payload
  );
  
  return {
    factory,
    hashlock: hashlock as Hex,
    dstChainId,
    dstToken: dstToken as Address,
    deposits,
    timelocks
  };
}

/**
 * Extract immutables from order and extension data
 */
export function extractImmutables(
  order: any,
  extensionData: Hex,
  srcEscrowAddress?: Address
): EscrowImmutables {
  const parsed = parsePostInteractionData(extensionData);
  
  // Extract safety deposits from packed value
  const srcSafetyDeposit = parsed.deposits & ((1n << 128n) - 1n);
  const dstSafetyDeposit = parsed.deposits >> 128n;
  
  // Extract timelocks from packed value  
  const dstWithdrawalTimestamp = parsed.timelocks & ((1n << 128n) - 1n);
  const srcCancellationTimestamp = parsed.timelocks >> 128n;
  
  // Repack timelocks in correct order for immutables
  const timelocks = (srcCancellationTimestamp << 128n) | dstWithdrawalTimestamp;
  
  return {
    // Use default implementations (will be replaced by factory)
    srcImplementation: "0x0000000000000000000000000000000000000000" as Address,
    dstImplementation: "0x0000000000000000000000000000000000000000" as Address,
    timelocks,
    hashlock: parsed.hashlock,
    dstChainId: parsed.dstChainId,
    srcMaker: order.maker as Address,
    srcTaker: order.receiver as Address, // Bob is the taker/receiver
    srcToken: order.makerAsset as Address,
    srcAmount: BigInt(order.makingAmount),
    srcSafetyDeposit,
    dstReceiver: order.maker as Address, // Alice receives on destination
    dstToken: parsed.dstToken,
    dstAmount: BigInt(order.takingAmount),
    dstSafetyDeposit,
    nonce: 0n // Default nonce
  };
}

/**
 * Create destination escrow on the target chain
 */
export async function createDestinationEscrow(
  immutables: EscrowImmutables,
  privateKey: string,
  rpcUrl?: string
): Promise<{ hash: Hex; escrow: Address }> {
  // Determine chain and RPC
  const chainId = Number(immutables.dstChainId);
  const chain = chainId === 10 ? optimism : chainId === 8453 ? base : optimism;
  
  const finalRpcUrl = rpcUrl || (
    chainId === 10 
      ? "https://erpc.up.railway.app/main/evm/10"
      : "https://erpc.up.railway.app/main/evm/8453"
  );
  
  // Create clients
  const account = privateKeyToAccount(privateKey as Hex);
  const publicClient = createPublicClient({
    chain,
    transport: http(finalRpcUrl),
  });
  
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(finalRpcUrl),
  });
  
  // Factory address (same on both chains via CREATE3)
  const factoryAddress = "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address;
  
  console.log(`🏭 Creating destination escrow on chain ${chainId}`);
  console.log(`   Factory: ${factoryAddress}`);
  console.log(`   Hashlock: ${immutables.hashlock}`);
  console.log(`   Dst Token: ${immutables.dstToken}`);
  console.log(`   Dst Amount: ${immutables.dstAmount}`);
  
  try {
    // Simulate first
    const { request } = await publicClient.simulateContract({
      address: factoryAddress,
      abi: SimplifiedEscrowFactoryV2_3.abi,
      functionName: "createDstEscrow",
      args: [immutables],
      account,
    });
    
    // Execute transaction
    const hash = await walletClient.writeContract(request);
    console.log(`📝 Destination escrow creation tx: ${hash}`);
    
    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    // Parse logs to get escrow address
    let escrowAddress: Address | undefined;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === factoryAddress.toLowerCase()) {
        // Look for DstEscrowCreated event
        // event DstEscrowCreated(address indexed escrow, bytes32 indexed hashlock, address indexed taker)
        if (log.topics[0] === "0x5a43c8e0e6e8d6e59e086b7cd50a4c73e8bccf8f79530d594049f7dc5e42c8c1") {
          escrowAddress = ('0x' + log.topics[1]?.slice(26)) as Address;
          break;
        }
      }
    }
    
    if (!escrowAddress) {
      // Fallback: calculate address from immutables
      const addressResult = await publicClient.readContract({
        address: factoryAddress,
        abi: SimplifiedEscrowFactoryV2_3.abi,
        functionName: "addressOfEscrow",
        args: [immutables, false], // false for destination escrow
      });
      escrowAddress = addressResult as Address;
    }
    
    console.log(`✅ Destination escrow created at: ${escrowAddress}`);
    
    return {
      hash,
      escrow: escrowAddress,
    };
  } catch (error: any) {
    console.error(`❌ Failed to create destination escrow:`, error);
    throw error;
  }
}

/**
 * Monitor source chain for escrow creation and create matching destination escrow
 */
export async function monitorAndCreateDestinationEscrow(
  orderData: any,
  privateKey: string,
  sourceChainId: number,
  sourceRpcUrl?: string,
  destRpcUrl?: string
): Promise<Address | null> {
  const sourceChain = sourceChainId === 8453 ? base : optimism;
  const finalSourceRpc = sourceRpcUrl || (
    sourceChainId === 8453
      ? "https://erpc.up.railway.app/main/evm/8453"
      : "https://erpc.up.railway.app/main/evm/10"
  );
  
  const publicClient = createPublicClient({
    chain: sourceChain,
    transport: http(finalSourceRpc),
  });
  
  const factoryAddress = "0xB436dBBee1615dd80ff036Af81D8478c1FF1Eb68" as Address;
  
  // Get recent logs from factory
  const logs = await publicClient.getLogs({
    address: factoryAddress,
    fromBlock: 'latest',
    toBlock: 'latest',
  });
  
  for (const log of logs) {
    // Check for SrcEscrowCreated or PostInteractionEscrowCreated events
    if (log.topics[0] === "0x..." || // SrcEscrowCreated signature
        log.topics[0] === "0x...") { // PostInteractionEscrowCreated signature
      
      // Extract hashlock from event (usually topics[2])
      const eventHashlock = log.topics[2];
      
      // Check if this matches our order
      if (eventHashlock === orderData.hashlock) {
        console.log(`🔍 Found matching source escrow for hashlock ${orderData.hashlock}`);
        
        // Extract immutables from order
        const immutables = extractImmutables(
          orderData.order,
          orderData.extensionData
        );
        
        // Create destination escrow
        const result = await createDestinationEscrow(
          immutables,
          privateKey,
          destRpcUrl
        );
        
        return result.escrow;
      }
    }
  }
  
  return null;
}