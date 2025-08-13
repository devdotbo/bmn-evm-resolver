import { type Hex, keccak256 } from "viem";

export interface SecretRecord {
  hashlock: string;
  secret: string;
  orderHash: string;
  escrowAddress: string;
  chainId: number;
  revealedAt: number;
  status: "pending" | "confirmed" | "failed";
  txHash?: string;
  gasUsed?: string;
}

export class SecretManager {
  private kv!: Deno.Kv;
  private static readonly SECRETS_DIR = "./data/secrets";

  constructor(private kvPath?: string) {}

  async init(): Promise<void> {
    // Open KV database (uses default location if no path specified)
    this.kv = await Deno.openKv(this.kvPath);
    // Ensure secrets directory exists for JSON persistence (PoC)
    try {
      await Deno.mkdir(SecretManager.SECRETS_DIR, { recursive: true });
    } catch (_e) {
      // ignore if exists
    }
    console.log("✅ SecretManager initialized with Deno KV");
  }

  private async ensureKv(): Promise<void> {
    if (!this.kv) {
      this.kv = await Deno.openKv(this.kvPath);
    }
  }

  async storeSecret(params: {
    secret: Hex;
    orderHash: Hex;
    escrowAddress: string;
    chainId: number;
  }): Promise<SecretRecord> {
    await this.ensureKv();
    const hashlock = keccak256(params.secret);

    const record: SecretRecord = {
      hashlock,
      secret: params.secret,
      orderHash: params.orderHash,
      escrowAddress: params.escrowAddress.toLowerCase(),
      chainId: params.chainId,
      revealedAt: Date.now(),
      status: "pending",
    };

    // Store in KV
    await this.kv.set(["secrets", hashlock], record);
    await this.kv.set(["secrets_by_order", params.orderHash], hashlock);

    // Also persist to JSON file for PoC
    try {
      const filePath = `${SecretManager.SECRETS_DIR}/${hashlock}.json`;
      await Deno.writeTextFile(filePath, JSON.stringify(record, null, 2));
    } catch (e) {
      console.warn("Failed to write secret JSON file:", e);
    }

    console.log(`💾 Stored secret for hashlock: ${hashlock}`);
    return record;
  }

  async getSecretByHashlock(hashlock: string): Promise<string | null> {
    await this.ensureKv();
    const result = await this.kv.get<SecretRecord>(["secrets", hashlock]);
    return result.value?.secret || null;
  }

  async getSecretByOrderHash(orderHash: string): Promise<string | null> {
    await this.ensureKv();
    const hashlockResult = await this.kv.get<string>([
      "secrets_by_order",
      orderHash,
    ]);
    if (!hashlockResult.value) return null;

    return this.getSecretByHashlock(hashlockResult.value);
  }

  async confirmSecret(
    hashlock: string,
    txHash: string,
    gasUsed: bigint,
  ): Promise<void> {
    await this.ensureKv();
    const result = await this.kv.get<SecretRecord>(["secrets", hashlock]);
    if (!result.value) {
      console.warn(`⚠️ Secret not found for hashlock: ${hashlock}`);
      return;
    }

    const updated: SecretRecord = {
      ...result.value,
      status: "confirmed",
      txHash,
      gasUsed: gasUsed.toString(),
    };

    await this.kv.set(["secrets", hashlock], updated);
    // Update JSON file
    try {
      const filePath = `${SecretManager.SECRETS_DIR}/${hashlock}.json`;
      await Deno.writeTextFile(filePath, JSON.stringify(updated, null, 2));
    } catch (e) {
      console.warn("Failed to update secret JSON file:", e);
    }
    console.log(`✅ Confirmed secret for hashlock: ${hashlock}`);
  }

  async markFailed(hashlock: string, error: string): Promise<void> {
    await this.ensureKv();
    const result = await this.kv.get<SecretRecord>(["secrets", hashlock]);
    if (!result.value) return;

    const updated: SecretRecord = {
      ...result.value,
      status: "failed",
    };

    await this.kv.set(["secrets", hashlock], updated);
    // Update JSON file
    try {
      const filePath = `${SecretManager.SECRETS_DIR}/${hashlock}.json`;
      await Deno.writeTextFile(filePath, JSON.stringify(updated, null, 2));
    } catch (e) {
      console.warn("Failed to update secret JSON file:", e);
    }
    console.log(`❌ Marked secret as failed: ${hashlock}, error: ${error}`);
  }

  async getRevealedSecrets(): Promise<SecretRecord[]> {
    await this.ensureKv();
    const secrets: SecretRecord[] = [];
    const iter = this.kv.list<SecretRecord>({ prefix: ["secrets"] });

    for await (const entry of iter) {
      if (
        entry.value && typeof entry.value === "object" &&
        "secret" in entry.value
      ) {
        secrets.push(entry.value);
      }
    }

    return secrets.sort((a, b) => b.revealedAt - a.revealedAt);
  }

  async getPendingSecrets(): Promise<SecretRecord[]> {
    await this.ensureKv();
    const allSecrets = await this.getRevealedSecrets();
    return allSecrets.filter((s) => s.status === "pending");
  }

  async hasSecret(hashlock: string): Promise<boolean> {
    await this.ensureKv();
    const result = await this.kv.get(["secrets", hashlock]);
    return result.value !== null;
  }

  async getStatistics(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    failed: number;
  }> {
    await this.ensureKv();
    const allSecrets = await this.getRevealedSecrets();

    return {
      total: allSecrets.length,
      pending: allSecrets.filter((s) => s.status === "pending").length,
      confirmed: allSecrets.filter((s) => s.status === "confirmed").length,
      failed: allSecrets.filter((s) => s.status === "failed").length,
    };
  }

  async clearAll(): Promise<void> {
    await this.ensureKv();
    const entries = this.kv.list({ prefix: ["secrets"] });
    for await (const entry of entries) {
      await this.kv.delete(entry.key);
    }
    const orderEntries = this.kv.list({ prefix: ["secrets_by_order"] });
    for await (const entry of orderEntries) {
      await this.kv.delete(entry.key);
    }
  }

  close(): void {
    if (this.kv) this.kv.close();
  }
}
