export interface PonderConfig {
  url: string;
  database?: string;
}

export interface SrcEscrow {
  id: string;
  chainId: number;
  escrowAddress: string;
  orderHash: string;
  hashlock: string;
  maker: string;
  taker: string;
  srcToken: string;
  srcAmount: bigint;
  srcSafetyDeposit: bigint;
  dstMaker: string;
  dstToken: string;
  dstAmount: bigint;
  dstSafetyDeposit: bigint;
  dstChainId: bigint;
  timelocks: bigint;
  createdAt: bigint;
  blockNumber: bigint;
  transactionHash: string;
  status: string;
}

export interface DstEscrow {
  id: string;
  chainId: number;
  escrowAddress: string;
  hashlock: string;
  taker: string;
  srcCancellationTimestamp: bigint;
  createdAt: bigint;
  blockNumber: bigint;
  transactionHash: string;
  status: string;
}

export interface AtomicSwap {
  id: string;
  orderHash: string;
  hashlock: string;
  srcChainId: number;
  dstChainId: number;
  srcEscrowAddress?: string;
  dstEscrowAddress?: string;
  srcMaker: string;
  srcTaker: string;
  dstMaker: string;
  dstTaker: string;
  srcToken: string;
  srcAmount: bigint;
  dstToken: string;
  dstAmount: bigint;
  srcSafetyDeposit: bigint;
  dstSafetyDeposit: bigint;
  timelocks: bigint;
  status: string;
  srcCreatedAt?: bigint;
  dstCreatedAt?: bigint;
  completedAt?: bigint;
  cancelledAt?: bigint;
  secret?: string;
}

export class PonderClient {
  private readonly baseUrl: string;
  private readonly database: string;

  constructor(config: PonderConfig) {
    this.baseUrl = config.url || "http://localhost:42069";
    this.database = config.database || "ponder";
  }

  private async query<T>(sql: string, params?: any[]): Promise<T[]> {
    const response = await fetch(`${this.baseUrl}/sql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        database: this.database,
        query: sql,
        params: params || [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Query failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.rows;
  }

  async getPendingSrcEscrows(resolverAddress: string): Promise<SrcEscrow[]> {
    const sql = `
      SELECT * FROM src_escrow 
      WHERE LOWER(taker) = LOWER($1) 
        AND status = 'created'
      ORDER BY createdAt DESC
    `;
    return this.query<SrcEscrow>(sql, [resolverAddress]);
  }

  async getSrcEscrowByOrderHash(orderHash: string): Promise<SrcEscrow | null> {
    const sql = `
      SELECT * FROM src_escrow 
      WHERE orderHash = $1
      LIMIT 1
    `;
    const results = await this.query<SrcEscrow>(sql, [orderHash]);
    return results[0] || null;
  }

  async getDstEscrowByHashlock(hashlock: string): Promise<DstEscrow | null> {
    const sql = `
      SELECT * FROM dst_escrow 
      WHERE hashlock = $1
      LIMIT 1
    `;
    const results = await this.query<DstEscrow>(sql, [hashlock]);
    return results[0] || null;
  }

  async getAtomicSwapByOrderHash(orderHash: string): Promise<AtomicSwap | null> {
    const sql = `
      SELECT * FROM atomic_swap 
      WHERE orderHash = $1
      LIMIT 1
    `;
    const results = await this.query<AtomicSwap>(sql, [orderHash]);
    return results[0] || null;
  }

  async getPendingAtomicSwaps(resolverAddress: string): Promise<AtomicSwap[]> {
    const sql = `
      SELECT * FROM atomic_swap 
      WHERE LOWER(srcTaker) = LOWER($1)
        AND status IN ('pending', 'src_created')
      ORDER BY srcCreatedAt DESC
    `;
    return this.query<AtomicSwap>(sql, [resolverAddress]);
  }

  async getRevealedSecrets(): Promise<Array<{ hashlock: string; secret: string }>> {
    const sql = `
      SELECT DISTINCT hashlock, secret 
      FROM escrow_withdrawal 
      WHERE secret IS NOT NULL
    `;
    return this.query<{ hashlock: string; secret: string }>(sql);
  }

  async getWithdrawalByEscrow(escrowAddress: string): Promise<{ secret: string } | null> {
    const sql = `
      SELECT secret FROM escrow_withdrawal 
      WHERE LOWER(escrowAddress) = LOWER($1)
      LIMIT 1
    `;
    const results = await this.query<{ secret: string }>(sql, [escrowAddress]);
    return results[0] || null;
  }

  async getChainStatistics(chainId: number): Promise<any> {
    const sql = `
      SELECT * FROM chain_statistics 
      WHERE chainId = $1
      LIMIT 1
    `;
    const results = await this.query<any>(sql, [chainId]);
    return results[0] || null;
  }

  async subscribe(
    table: string,
    callback: (data: any) => void,
    filter?: Record<string, any>
  ): Promise<() => void> {
    const ws = new WebSocket(`${this.baseUrl.replace("http", "ws")}/subscribe`);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "subscribe",
        table,
        filter,
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "update" && data.table === table) {
        callback(data.data);
      }
    };

    return () => ws.close();
  }
}