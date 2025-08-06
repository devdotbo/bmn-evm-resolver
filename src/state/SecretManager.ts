import { keccak256, type Hex } from 'viem';

export interface SecretRecord {
  hashlock: string;
  secret: string;
  orderHash: string;
  escrowAddress: string;
  chainId: number;
  revealedAt: number;
  status: 'pending' | 'confirmed' | 'failed';
  txHash?: string;
  gasUsed?: string;
}

export class SecretManager {
  private kv: Deno.Kv;

  constructor(private kvPath?: string) {}

  async init(): Promise<void> {
    // Open KV database (uses default location if no path specified)
    this.kv = await Deno.openKv(this.kvPath);
    console.log('✅ SecretManager initialized with Deno KV');
  }

  async storeSecret(params: {
    secret: Hex;
    orderHash: Hex;
    escrowAddress: string;
    chainId: number;
  }): Promise<SecretRecord> {
    const hashlock = keccak256(params.secret);
    
    const record: SecretRecord = {
      hashlock,
      secret: params.secret,
      orderHash: params.orderHash,
      escrowAddress: params.escrowAddress.toLowerCase(),
      chainId: params.chainId,
      revealedAt: Date.now(),
      status: 'pending'
    };

    // Store in KV
    await this.kv.set(['secrets', hashlock], record);
    await this.kv.set(['secrets_by_order', params.orderHash], hashlock);
    
    console.log(`💾 Stored secret for hashlock: ${hashlock}`);
    return record;
  }

  async getSecretByHashlock(hashlock: string): Promise<string | null> {
    const result = await this.kv.get<SecretRecord>(['secrets', hashlock]);
    return result.value?.secret || null;
  }

  async getSecretByOrderHash(orderHash: string): Promise<string | null> {
    const hashlockResult = await this.kv.get<string>(['secrets_by_order', orderHash]);
    if (!hashlockResult.value) return null;
    
    return this.getSecretByHashlock(hashlockResult.value);
  }

  async confirmSecret(hashlock: string, txHash: string, gasUsed: bigint): Promise<void> {
    const result = await this.kv.get<SecretRecord>(['secrets', hashlock]);
    if (!result.value) {
      console.warn(`⚠️ Secret not found for hashlock: ${hashlock}`);
      return;
    }

    const updated: SecretRecord = {
      ...result.value,
      status: 'confirmed',
      txHash,
      gasUsed: gasUsed.toString()
    };

    await this.kv.set(['secrets', hashlock], updated);
    console.log(`✅ Confirmed secret for hashlock: ${hashlock}`);
  }

  async markFailed(hashlock: string, error: string): Promise<void> {
    const result = await this.kv.get<SecretRecord>(['secrets', hashlock]);
    if (!result.value) return;

    const updated: SecretRecord = {
      ...result.value,
      status: 'failed'
    };

    await this.kv.set(['secrets', hashlock], updated);
    console.log(`❌ Marked secret as failed: ${hashlock}, error: ${error}`);
  }

  async getRevealedSecrets(): Promise<SecretRecord[]> {
    const secrets: SecretRecord[] = [];
    const iter = this.kv.list<SecretRecord>({ prefix: ['secrets'] });
    
    for await (const entry of iter) {
      if (entry.value && typeof entry.value === 'object' && 'secret' in entry.value) {
        secrets.push(entry.value);
      }
    }
    
    return secrets.sort((a, b) => b.revealedAt - a.revealedAt);
  }

  async getPendingSecrets(): Promise<SecretRecord[]> {
    const allSecrets = await this.getRevealedSecrets();
    return allSecrets.filter(s => s.status === 'pending');
  }

  async hasSecret(hashlock: string): Promise<boolean> {
    const result = await this.kv.get(['secrets', hashlock]);
    return result.value !== null;
  }

  async getStatistics(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    failed: number;
  }> {
    const allSecrets = await this.getRevealedSecrets();
    
    return {
      total: allSecrets.length,
      pending: allSecrets.filter(s => s.status === 'pending').length,
      confirmed: allSecrets.filter(s => s.status === 'confirmed').length,
      failed: allSecrets.filter(s => s.status === 'failed').length
    };
  }

  async close(): Promise<void> {
    this.kv.close();
  }
}