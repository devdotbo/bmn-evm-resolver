import {
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
  parseAbi,
} from "viem";
import { CREATE3_ADDRESSES } from "../config/contracts.ts";

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

/**
 * Token Approval Manager for v2.2.0 Factory
 * 
 * Manages token approvals required for the SimplifiedEscrowFactory's
 * PostInteraction to transfer tokens from the resolver to escrows.
 */
export class TokenApprovalManager {
  private factoryAddress: Address;
  
  constructor(factoryAddress?: Address) {
    this.factoryAddress = factoryAddress || CREATE3_ADDRESSES.ESCROW_FACTORY_V2;
  }

  /**
   * Ensures the factory has sufficient approval to transfer tokens
   * @param client Public client for reading contract state
   * @param wallet Wallet client for sending transactions
   * @param tokenAddress Token contract address
   * @param owner Address of the token owner (resolver)
   * @param requiredAmount Amount that needs to be approved
   * @returns Transaction hash if approval was needed, null otherwise
   */
  async ensureApproval(
    client: PublicClient,
    wallet: WalletClient,
    tokenAddress: Address,
    owner: Address,
    requiredAmount: bigint
  ): Promise<Hash | null> {
    // Check current allowance
    const currentAllowance = await this.getAllowance(
      client,
      tokenAddress,
      owner
    );

    console.log(`📊 Current allowance for factory: ${currentAllowance}`);
    console.log(`📊 Required amount: ${requiredAmount}`);

    // If allowance is sufficient, no action needed
    if (currentAllowance >= requiredAmount) {
      console.log("✅ Sufficient allowance already exists");
      return null;
    }

    // Approve the factory for max uint256 to avoid repeated approvals
    console.log("🔓 Approving factory for token transfers...");
    const approvalAmount = 2n ** 256n - 1n; // Max uint256
    
    const hash = await this.approveToken(
      wallet,
      tokenAddress,
      approvalAmount
    );

    // Wait for confirmation
    await client.waitForTransactionReceipt({ hash });
    console.log(`✅ Factory approved. Tx: ${hash}`);
    
    return hash;
  }

  /**
   * Get current allowance for the factory
   * @param client Public client for reading contract state
   * @param tokenAddress Token contract address
   * @param owner Address of the token owner
   * @returns Current allowance amount
   */
  async getAllowance(
    client: PublicClient,
    tokenAddress: Address,
    owner: Address
  ): Promise<bigint> {
    const allowance = await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, this.factoryAddress],
    }) as bigint;
    
    return allowance;
  }

  /**
   * Approve token spending for the factory
   * @param wallet Wallet client for sending transactions
   * @param tokenAddress Token contract address
   * @param amount Amount to approve
   * @returns Transaction hash
   */
  async approveToken(
    wallet: WalletClient,
    tokenAddress: Address,
    amount: bigint
  ): Promise<Hash> {
    const hash = await wallet.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [this.factoryAddress, amount],
      // viem v2 requires chain when wallet was constructed with a chain
      chain: wallet.chain || undefined,
      account: wallet.account!,
    });
    
    return hash as Hash;
  }

  /**
   * Check token balance
   * @param client Public client for reading contract state
   * @param tokenAddress Token contract address
   * @param account Address to check balance for
   * @returns Token balance
   */
  async getBalance(
    client: PublicClient,
    tokenAddress: Address,
    account: Address
  ): Promise<bigint> {
    const balance = await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account],
    }) as bigint;
    
    return balance;
  }

  /**
   * Batch approve multiple tokens for the factory
   * @param client Public client for reading contract state
   * @param wallet Wallet client for sending transactions
   * @param tokens Array of token addresses to approve
   * @param owner Address of the token owner
   * @returns Array of transaction hashes for approvals that were needed
   */
  async batchApprove(
    client: PublicClient,
    wallet: WalletClient,
    tokens: Address[],
    owner: Address
  ): Promise<Hash[]> {
    const approvalHashes: Hash[] = [];
    
    for (const token of tokens) {
      try {
        // Check if approval is needed
        const allowance = await this.getAllowance(client, token, owner);
        
        if (allowance === 0n) {
          console.log(`🔓 Approving token ${token}...`);
          const hash = await this.approveToken(
            wallet,
            token,
            2n ** 256n - 1n // Max uint256
          );
          
          // Wait for confirmation before proceeding to next token
          await client.waitForTransactionReceipt({ hash });
          approvalHashes.push(hash);
          console.log(`✅ Token ${token} approved`);
        } else {
          console.log(`✅ Token ${token} already has allowance: ${allowance}`);
        }
      } catch (error) {
        console.error(`❌ Failed to approve token ${token}:`, error);
      }
    }
    
    return approvalHashes;
  }

  /**
   * Revoke approval for a token (set allowance to 0)
   * @param wallet Wallet client for sending transactions
   * @param tokenAddress Token contract address
   * @returns Transaction hash
   */
  async revokeApproval(
    wallet: WalletClient,
    tokenAddress: Address
  ): Promise<Hash> {
    const hash = await wallet.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [this.factoryAddress, 0n],
      chain: wallet.chain || undefined,
      account: wallet.account!,
    });
    
    return hash as Hash;
  }
}

/**
 * Helper function to ensure factory approvals before filling orders
 * @param client Public client
 * @param wallet Wallet client
 * @param tokenAddress Token to approve
 * @param amount Amount needed
 * @returns Transaction hash if approval was needed
 */
export async function ensureFactoryApproval(
  client: PublicClient,
  wallet: WalletClient,
  tokenAddress: Address,
  amount: bigint
): Promise<Hash | null> {
  const manager = new TokenApprovalManager();
  const account = wallet.account;
  
  if (!account) {
    throw new Error("Wallet account not found");
  }
  
  return await manager.ensureApproval(
    client,
    wallet,
    tokenAddress,
    account.address,
    amount
  );
}