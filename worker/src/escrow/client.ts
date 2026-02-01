/**
 * Solana Escrow Client for Cloudflare Workers
 * Uses raw @solana/web3.js for Workers compatibility
 * Note: Uses Uint8Array instead of Buffer for Workers compatibility
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

import {
  JOB_ESCROW_PROGRAM_ID,
  PLATFORM_WALLET,
  DISCRIMINATORS,
  ESCROW_ACCOUNT_DISCRIMINATOR,
  EscrowStatus,
  STATUS_NAMES,
  type EscrowAccount,
} from './idl';

// RPC URLs - Using Helius for reliable access from Cloudflare Workers
// HELIUS_API_KEY should be passed in config or falls back to public RPC (slower)
const PUBLIC_RPC_URLS = {
  devnet: 'https://api.devnet.solana.com',
  mainnet: 'https://api.mainnet-beta.solana.com',
};

export type SolanaNetwork = 'devnet' | 'mainnet';

export interface EscrowClientConfig {
  network: SolanaNetwork;
  platformWalletSecret?: number[]; // JSON array of secret key bytes
  heliusApiKey?: string; // Helius API key for reliable RPC (optional)
}

function getRpcUrl(network: SolanaNetwork, heliusApiKey?: string): string {
  if (heliusApiKey) {
    return network === 'mainnet'
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
      : `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  }
  return PUBLIC_RPC_URLS[network];
}

// Helper to encode text to bytes (Workers-compatible)
function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// Helper to write u32 little-endian
function writeU32LE(value: number): Uint8Array {
  const arr = new Uint8Array(4);
  const view = new DataView(arr.buffer);
  view.setUint32(0, value, true);
  return arr;
}

// Helper to write u64 little-endian
function writeU64LE(value: bigint | number): Uint8Array {
  const arr = new Uint8Array(8);
  const view = new DataView(arr.buffer);
  view.setBigUint64(0, BigInt(value), true);
  return arr;
}

// Helper to write i64 little-endian
function writeI64LE(value: bigint | number): Uint8Array {
  const arr = new Uint8Array(8);
  const view = new DataView(arr.buffer);
  view.setBigInt64(0, BigInt(value), true);
  return arr;
}

// Helper to read u32 little-endian
function readU32LE(arr: Uint8Array, offset: number): number {
  const view = new DataView(arr.buffer, arr.byteOffset + offset, 4);
  return view.getUint32(0, true);
}

// Helper to read u64 little-endian
function readU64LE(arr: Uint8Array, offset: number): bigint {
  const view = new DataView(arr.buffer, arr.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

// Helper to read i64 little-endian
function readI64LE(arr: Uint8Array, offset: number): bigint {
  const view = new DataView(arr.buffer, arr.byteOffset + offset, 8);
  return view.getBigInt64(0, true);
}

// Helper to concatenate Uint8Arrays
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Helper to convert Uint8Array to base64
function toBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

export class EscrowClient {
  private connection: Connection;
  private programId: PublicKey;
  private platformWallet: Keypair | null = null;

  constructor(config: EscrowClientConfig) {
    const rpcUrl = getRpcUrl(config.network, config.heliusApiKey);
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.programId = new PublicKey(JOB_ESCROW_PROGRAM_ID);

    if (config.platformWalletSecret) {
      this.platformWallet = Keypair.fromSecretKey(
        Uint8Array.from(config.platformWalletSecret)
      );
    }
  }

  /**
   * Derive the escrow PDA address
   * NanoID job IDs (21 chars) fit directly in PDA seeds - no hashing needed
   */
  deriveEscrowPDA(jobId: string, posterPubkey: PublicKey): [PublicKey, number] {
    if (jobId.length > 32) {
      throw new Error(`Job ID too long: ${jobId.length} chars (max 32)`);
    }
    const seeds = [
      textToBytes('escrow'),
      textToBytes(jobId),
      posterPubkey.toBytes(),
    ];
    return PublicKey.findProgramAddressSync(seeds, this.programId);
  }

  /**
   * Encode a string with length prefix (Borsh-style)
   */
  private encodeString(str: string): Uint8Array {
    const strBytes = textToBytes(str);
    const lenBytes = writeU32LE(strBytes.length);
    return concatBytes(lenBytes, strBytes);
  }

  /**
   * Encode u64 (little-endian)
   */
  private encodeU64(value: bigint | number): Uint8Array {
    return writeU64LE(value);
  }

  /**
   * Encode i64 (little-endian)
   */
  private encodeI64(value: bigint | number): Uint8Array {
    return writeI64LE(value);
  }

  /**
   * Encode Option<i64>
   */
  private encodeOptionI64(value: bigint | number | null): Uint8Array {
    if (value === null) {
      return new Uint8Array([0]); // None
    }
    const valueBytes = writeI64LE(value);
    return concatBytes(new Uint8Array([1]), valueBytes); // Some
  }

  /**
   * Create escrow instruction data
   * Args: job_id (string), amount (u64), expiry_seconds (Option<i64>)
   */
  buildCreateEscrowData(
    jobId: string,
    amountLamports: number | bigint,
    expirySeconds: number | null = null
  ): Uint8Array {
    return concatBytes(
      new Uint8Array(DISCRIMINATORS.create_escrow),
      this.encodeString(jobId),
      this.encodeU64(amountLamports),
      this.encodeOptionI64(expirySeconds),
    );
  }

  /**
   * Create escrow transaction (poster signs)
   * Returns transaction that poster must sign
   */
  async buildCreateEscrowTx(
    jobId: string,
    posterPubkey: PublicKey,
    amountLamports: number | bigint,
    expirySeconds: number | null = null
  ): Promise<{ transaction: Transaction; escrowPDA: PublicKey }> {
    const [escrowPDA] = await this.deriveEscrowPDA(jobId, posterPubkey);

    const data = this.buildCreateEscrowData(jobId, amountLamports, expirySeconds);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: posterPubkey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = posterPubkey;

    return { transaction, escrowPDA };
  }

  /**
   * Assign worker instruction data
   */
  buildAssignWorkerData(workerPubkey: PublicKey): Uint8Array {
    return concatBytes(
      new Uint8Array(DISCRIMINATORS.assign_worker),
      workerPubkey.toBytes(),
    );
  }

  /**
   * Build assign worker transaction (poster or platform signs)
   */
  async buildAssignWorkerTx(
    escrowPDA: PublicKey,
    initiatorPubkey: PublicKey,
    workerPubkey: PublicKey
  ): Promise<Transaction> {
    const data = this.buildAssignWorkerData(workerPubkey);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: initiatorPubkey, isSigner: true, isWritable: false },
      ],
      data,
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = initiatorPubkey;

    return transaction;
  }

  /**
   * Build release to worker transaction (platform authority signs)
   */
  async buildReleaseToWorkerTx(
    escrowPDA: PublicKey,
    workerPubkey: PublicKey
  ): Promise<Transaction> {
    if (!this.platformWallet) {
      throw new Error('Platform wallet not configured');
    }

    const platformPubkey = this.platformWallet.publicKey;

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: platformPubkey, isSigner: true, isWritable: false }, // platform_authority
        { pubkey: workerPubkey, isSigner: false, isWritable: true },   // worker
        { pubkey: platformPubkey, isSigner: false, isWritable: true }, // platform (fee recipient)
      ],
      data: new Uint8Array(DISCRIMINATORS.release_to_worker),
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = platformPubkey;

    return transaction;
  }

  /**
   * Release funds to worker (platform signs and sends)
   */
  async releaseToWorker(
    escrowPDA: PublicKey,
    workerPubkey: PublicKey
  ): Promise<string> {
    if (!this.platformWallet) {
      throw new Error('Platform wallet not configured');
    }

    const tx = await this.buildReleaseToWorkerTx(escrowPDA, workerPubkey);
    
    const signature = await sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.platformWallet],
      { commitment: 'confirmed' }
    );

    return signature;
  }

  /**
   * Build refund to poster transaction (platform authority signs)
   */
  async buildRefundToPosterTx(
    escrowPDA: PublicKey,
    posterPubkey: PublicKey
  ): Promise<Transaction> {
    if (!this.platformWallet) {
      throw new Error('Platform wallet not configured');
    }

    const platformPubkey = this.platformWallet.publicKey;

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: platformPubkey, isSigner: true, isWritable: false }, // platform_authority
        { pubkey: posterPubkey, isSigner: false, isWritable: true },   // poster
      ],
      data: new Uint8Array(DISCRIMINATORS.refund_to_poster),
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = platformPubkey;

    return transaction;
  }

  /**
   * Refund to poster (platform signs and sends)
   * Requires dispute to be initiated and timelock passed (24h)
   */
  async refundToPoster(
    escrowPDA: PublicKey,
    posterPubkey: PublicKey
  ): Promise<string> {
    if (!this.platformWallet) {
      throw new Error('Platform wallet not configured');
    }

    const tx = await this.buildRefundToPosterTx(escrowPDA, posterPubkey);
    
    const signature = await sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.platformWallet],
      { commitment: 'confirmed' }
    );

    return signature;
  }

  /**
   * Get escrow account info
   */
  async getEscrow(escrowPDA: PublicKey): Promise<EscrowAccount | null> {
    const accountInfo = await this.connection.getAccountInfo(escrowPDA);
    if (!accountInfo || !accountInfo.data) {
      return null;
    }

    return this.decodeEscrowAccount(accountInfo.data);
  }

  /**
   * Decode escrow account data
   */
  private decodeEscrowAccount(data: Uint8Array): EscrowAccount {
    let offset = 0;

    // Skip account discriminator (8 bytes)
    offset += 8;

    // poster (32 bytes)
    const poster = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;

    // worker (32 bytes)
    const worker = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;

    // job_id (string: 4-byte length prefix + data)
    const jobIdLen = readU32LE(data, offset);
    offset += 4;
    const jobId = new TextDecoder().decode(data.slice(offset, offset + jobIdLen));
    offset += jobIdLen;

    // amount (u64)
    const amount = readU64LE(data, offset);
    offset += 8;

    // status (u8 enum)
    const status = data[offset] as EscrowStatus;
    offset += 1;

    // created_at (i64)
    const createdAt = readI64LE(data, offset);
    offset += 8;

    // expires_at (i64)
    const expiresAt = readI64LE(data, offset);
    offset += 8;

    // dispute_initiated_at (Option<i64>)
    const hasDispute = data[offset] === 1;
    offset += 1;
    let disputeInitiatedAt: bigint | null = null;
    if (hasDispute) {
      disputeInitiatedAt = readI64LE(data, offset);
      offset += 8;
    }

    // bump (u8)
    const bump = data[offset];

    return {
      poster,
      worker,
      jobId,
      amount,
      status,
      createdAt,
      expiresAt,
      disputeInitiatedAt,
      bump,
    };
  }

  /**
   * Get escrow balance (SOL in the PDA)
   */
  async getEscrowBalance(escrowPDA: PublicKey): Promise<number> {
    const balance = await this.connection.getBalance(escrowPDA);
    return balance;
  }

  /**
   * Get human-readable escrow info
   */
  async getEscrowInfo(jobId: string, posterPubkey: PublicKey): Promise<{
    address: string;
    exists: boolean;
    escrow: EscrowAccount | null;
    balance: number;
    balanceSol: number;
    statusName: string;
    rpcError?: string;
  }> {
    const [escrowPDA] = await this.deriveEscrowPDA(jobId, posterPubkey);
    
    let escrow: EscrowAccount | null = null;
    let balance = 0;
    let rpcError: string | undefined;
    
    try {
      escrow = await this.getEscrow(escrowPDA);
      balance = await this.getEscrowBalance(escrowPDA);
    } catch (e: any) {
      rpcError = e.message || 'RPC error';
    }

    return {
      address: escrowPDA.toBase58(),
      exists: escrow !== null,
      escrow,
      balance,
      balanceSol: balance / LAMPORTS_PER_SOL,
      statusName: escrow ? STATUS_NAMES[escrow.status] || 'Unknown' : (rpcError ? 'Unknown (RPC error)' : 'Not Found'),
      rpcError,
    };
  }

  /**
   * Check if platform wallet is configured and valid
   */
  getPlatformWalletInfo(): { configured: boolean; address: string | null } {
    if (!this.platformWallet) {
      return { configured: false, address: null };
    }
    return {
      configured: true,
      address: this.platformWallet.publicKey.toBase58(),
    };
  }

  /**
   * Get connection info
   */
  getConnectionInfo(): { rpcUrl: string; programId: string } {
    return {
      rpcUrl: this.connection.rpcEndpoint,
      programId: this.programId.toBase58(),
    };
  }
}

/**
 * Create escrow client from environment
 */
export function createEscrowClient(env: {
  SOLANA_NETWORK?: string;
  PLATFORM_WALLET_SECRET?: string;
  HELIUS_API_KEY?: string;
}): EscrowClient {
  const network = (env.SOLANA_NETWORK || 'devnet') as SolanaNetwork;
  
  let platformWalletSecret: number[] | undefined;
  if (env.PLATFORM_WALLET_SECRET) {
    try {
      platformWalletSecret = JSON.parse(env.PLATFORM_WALLET_SECRET);
    } catch (e) {
      console.error('Failed to parse PLATFORM_WALLET_SECRET:', e);
    }
  }

  return new EscrowClient({
    network,
    platformWalletSecret,
    heliusApiKey: env.HELIUS_API_KEY,
  });
}

/**
 * Helper to convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * Helper to convert lamports to SOL
 */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}
