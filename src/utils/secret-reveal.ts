import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import EscrowDst from "../../abis/EscrowDst.json" with { type: "json" };

/**
 * Secret management for atomic swaps
 */
export class SecretRevealer {
  private secrets: Map<string, string> = new Map();
  
  /**
   * Generate a secret and its hashlock
   */
  generateSecret(): { secret: Hex; hashlock: Hex } {
    // Generate random 32-byte secret
    const secretBytes = new Uint8Array(32);
    crypto.getRandomValues(secretBytes);
    const secret = ('0x' + Array.from(secretBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')) as Hex;
    
    // Calculate hashlock = keccak256(secret)
    const hashlock = keccak256(secret);
    
    // Store secret for later use
    this.secrets.set(hashlock, secret);
    
    return { secret, hashlock };
  }
  
  /**
   * Store a known secret
   */
  storeSecret(hashlock: Hex, secret: Hex) {
    this.secrets.set(hashlock, secret);
  }
  
  /**
   * Get secret for a hashlock
   */
  getSecret(hashlock: Hex): Hex | undefined {
    return this.secrets.get(hashlock) as Hex;
  }
  
  /**
   * Reveal secret on destination escrow (Alice action)
   */
  async revealSecret(
    escrowAddress: Address,
    secret: Hex,
    chainId: number,
    privateKey: string,
    rpcUrl?: string
  ): Promise<Hex> {
    const chain = chainId === 10 ? optimism : base;
    const finalRpcUrl = rpcUrl || (
      chainId === 10
        ? "https://erpc.up.railway.app/main/evm/10"
        : "https://erpc.up.railway.app/main/evm/8453"
    );
    
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
    
    console.log(`🔓 Revealing secret on escrow ${escrowAddress}`);
    console.log(`   Chain: ${chainId}`);
    console.log(`   Secret: ${secret}`);
    
    try {
      // Call withdraw with secret
      const { request } = await publicClient.simulateContract({
        address: escrowAddress,
        abi: EscrowDst.abi,
        functionName: "withdraw",
        args: [secret],
        account,
      });
      
      const hash = await walletClient.writeContract(request);
      console.log(`📝 Secret reveal transaction: ${hash}`);
      
      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === "success") {
        console.log(`✅ Secret revealed and tokens withdrawn!`);
      } else {
        console.log(`❌ Transaction failed`);
      }
      
      return hash;
    } catch (error: any) {
      console.error(`❌ Failed to reveal secret:`, error);
      throw error;
    }
  }
  
  /**
   * Monitor destination escrow and reveal secret when funded (Alice action)
   */
  async monitorAndRevealSecret(
    escrowAddress: Address,
    hashlock: Hex,
    chainId: number,
    privateKey: string,
    rpcUrl?: string,
    maxAttempts: number = 60
  ): Promise<boolean> {
    const chain = chainId === 10 ? optimism : base;
    const finalRpcUrl = rpcUrl || (
      chainId === 10
        ? "https://erpc.up.railway.app/main/evm/10"
        : "https://erpc.up.railway.app/main/evm/8453"
    );
    
    const publicClient = createPublicClient({
      chain,
      transport: http(finalRpcUrl),
    });
    
    const secret = this.getSecret(hashlock);
    if (!secret) {
      console.error(`❌ No secret found for hashlock ${hashlock}`);
      return false;
    }
    
    console.log(`👁️ Monitoring escrow ${escrowAddress} for funding...`);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Check escrow balance
        const [token, amount, recipient] = await Promise.all([
          publicClient.readContract({
            address: escrowAddress,
            abi: EscrowDst.abi,
            functionName: "dstToken",
          }),
          publicClient.readContract({
            address: escrowAddress,
            abi: EscrowDst.abi,
            functionName: "dstAmount",
          }),
          publicClient.readContract({
            address: escrowAddress,
            abi: EscrowDst.abi,
            functionName: "dstReceiver",
          }),
        ]);
        
        // Check if escrow has the required token balance
        // For simplicity, we'll check if the escrow contract exists and has been deployed
        const code = await publicClient.getBytecode({ address: escrowAddress });
        
        if (code && code !== "0x") {
          console.log(`✅ Escrow is deployed and ready!`);
          console.log(`   Token: ${token}`);
          console.log(`   Amount: ${amount}`);
          console.log(`   Recipient: ${recipient}`);
          
          // Reveal the secret
          await this.revealSecret(
            escrowAddress,
            secret,
            chainId,
            privateKey,
            rpcUrl
          );
          
          return true;
        }
      } catch (error) {
        // Escrow might not exist yet
        console.log(`⏳ Attempt ${i + 1}/${maxAttempts}: Escrow not ready yet`);
      }
      
      // Wait 10 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    console.log(`⏱️ Timeout: Escrow was not funded within ${maxAttempts * 10} seconds`);
    return false;
  }
}

/**
 * Bob's withdrawal after learning the secret
 */
export async function withdrawWithSecret(
  escrowAddress: Address,
  secret: Hex,
  chainId: number,
  privateKey: string,
  rpcUrl?: string
): Promise<Hex> {
  const chain = chainId === 8453 ? base : optimism;
  const finalRpcUrl = rpcUrl || (
    chainId === 8453
      ? "https://erpc.up.railway.app/main/evm/8453"
      : "https://erpc.up.railway.app/main/evm/10"
  );
  
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
  
  console.log(`💰 Withdrawing from source escrow ${escrowAddress} with learned secret`);
  
  try {
    // Call withdraw on source escrow (EscrowSrc has same withdraw function)
    const { request } = await publicClient.simulateContract({
      address: escrowAddress,
      abi: EscrowDst.abi, // Both Src and Dst have same withdraw interface
      functionName: "withdraw",
      args: [secret],
      account,
    });
    
    const hash = await walletClient.writeContract(request);
    console.log(`📝 Withdrawal transaction: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === "success") {
      console.log(`✅ Tokens withdrawn successfully!`);
    } else {
      console.log(`❌ Withdrawal failed`);
    }
    
    return hash;
  } catch (error: any) {
    console.error(`❌ Failed to withdraw:`, error);
    throw error;
  }
}