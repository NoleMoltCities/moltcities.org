/**
 * Solana Escrow Client for MoltCities Platform
 * Complete integration with the job_escrow Anchor program
 * 
 * Uses raw @solana/web3.js for Cloudflare Workers compatibility
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
  SYSTEM_PROGRAM_ID,
  DISCRIMINATORS,
  ESCROW_ACCOUNT_DISCRIMINATOR,
  EscrowStatus,
  STATUS_NAMES,
  Vote,
  DisputeResolution,
  PDA_SEEDS,
  REVIEW_WINDOW_SECONDS,
  DEFAULT_EXPIRY_SECONDS,
  type EscrowAccount,
} from './idl';

// RPC URLs - Using Helius for reliable access from Cloudflare Workers
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

// ============== Encoding Helpers ==============

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function writeU32LE(value: number): Uint8Array {
  const arr = new Uint8Array(4);
  const view = new DataView(arr.buffer);
  view.setUint32(0, value, true);
  return arr;
}

function writeU64LE(value: bigint | number): Uint8Array {
  const arr = new Uint8Array(8);
  const view = new DataView(arr.buffer);
  view.setBigUint64(0, BigInt(value), true);
  return arr;
}

function writeI64LE(value: bigint | number): Uint8Array {
  const arr = new Uint8Array(8);
  const view = new DataView(arr.buffer);
  view.setBigInt64(0, BigInt(value), true);
  return arr;
}

function readU32LE(arr: Uint8Array, offset: number): number {
  const view = new DataView(arr.buffer, arr.byteOffset + offset, 4);
  return view.getUint32(0, true);
}

function readU64LE(arr: Uint8Array, offset: number): bigint {
  const view = new DataView(arr.buffer, arr.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

function readI64LE(arr: Uint8Array, offset: number): bigint {
  const view = new DataView(arr.buffer, arr.byteOffset + offset, 8);
  return view.getBigInt64(0, true);
}

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

// SHA-256 hash (Workers-compatible via SubtleCrypto)
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

// Compute job_id_hash for PDA derivation (SHA256 of job_id string)
async function computeJobIdHash(jobId: string): Promise<Uint8Array> {
  return sha256(textToBytes(jobId));
}

// ============== EscrowClient ==============

export class EscrowClient {
  private connection: Connection;
  private programId: PublicKey;
  private platformWallet: Keypair | null = null;
  private platformPubkey: PublicKey;

  constructor(config: EscrowClientConfig) {
    const rpcUrl = getRpcUrl(config.network, config.heliusApiKey);
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.programId = new PublicKey(JOB_ESCROW_PROGRAM_ID);
    this.platformPubkey = new PublicKey(PLATFORM_WALLET);

    if (config.platformWalletSecret) {
      this.platformWallet = Keypair.fromSecretKey(
        Uint8Array.from(config.platformWalletSecret)
      );
    }
  }

  // ============== PDA Derivation ==============

  /**
   * Derive the escrow PDA address using job_id_hash
   * Seeds: ["escrow", job_id_hash, poster]
   */
  async deriveEscrowPDA(jobId: string, posterPubkey: PublicKey): Promise<[PublicKey, number]> {
    const jobIdHash = await computeJobIdHash(jobId);
    return this.deriveEscrowPDAFromHash(jobIdHash, posterPubkey);
  }

  /**
   * Derive escrow PDA from pre-computed hash (sync version for when hash is known)
   */
  deriveEscrowPDAFromHash(jobIdHash: Uint8Array, posterPubkey: PublicKey): [PublicKey, number] {
    const seeds = [
      PDA_SEEDS.escrow,
      jobIdHash,
      posterPubkey.toBytes(),
    ];
    return PublicKey.findProgramAddressSync(seeds, this.programId);
  }

  /**
   * Derive dispute case PDA
   * Seeds: ["dispute", escrow_pubkey]
   */
  deriveDisputeCasePDA(escrowPubkey: PublicKey): [PublicKey, number] {
    const seeds = [
      PDA_SEEDS.dispute,
      escrowPubkey.toBytes(),
    ];
    return PublicKey.findProgramAddressSync(seeds, this.programId);
  }

  /**
   * Derive arbitrator PDA
   * Seeds: ["arbitrator", agent_pubkey]
   */
  deriveArbitratorPDA(agentPubkey: PublicKey): [PublicKey, number] {
    const seeds = [
      PDA_SEEDS.arbitrator,
      agentPubkey.toBytes(),
    ];
    return PublicKey.findProgramAddressSync(seeds, this.programId);
  }

  /**
   * Derive arbitrator pool PDA
   * Seeds: ["arbitrator_pool"]
   */
  deriveArbitratorPoolPDA(): [PublicKey, number] {
    const seeds = [PDA_SEEDS.arbitrator_pool];
    return PublicKey.findProgramAddressSync(seeds, this.programId);
  }

  /**
   * Derive reputation PDA
   * Seeds: ["reputation", agent_pubkey]
   */
  deriveReputationPDA(agentPubkey: PublicKey): [PublicKey, number] {
    const seeds = [
      PDA_SEEDS.reputation,
      agentPubkey.toBytes(),
    ];
    return PublicKey.findProgramAddressSync(seeds, this.programId);
  }

  // ============== Encoding Helpers ==============

  private encodeString(str: string): Uint8Array {
    const strBytes = textToBytes(str);
    const lenBytes = writeU32LE(strBytes.length);
    return concatBytes(lenBytes, strBytes);
  }

  private encodeU64(value: bigint | number): Uint8Array {
    return writeU64LE(value);
  }

  private encodeI64(value: bigint | number): Uint8Array {
    return writeI64LE(value);
  }

  private encodeOptionI64(value: bigint | number | null): Uint8Array {
    if (value === null) {
      return new Uint8Array([0]); // None
    }
    return concatBytes(new Uint8Array([1]), writeI64LE(value)); // Some
  }

  private encodeOptionHash(hash: Uint8Array | null): Uint8Array {
    if (hash === null) {
      return new Uint8Array([0]); // None
    }
    return concatBytes(new Uint8Array([1]), hash); // Some([u8; 32])
  }

  private encodePubkey(pubkey: PublicKey): Uint8Array {
    return pubkey.toBytes();
  }

  // ============== create_escrow ==============

  /**
   * Build create_escrow instruction data
   * Args: job_id (string), job_id_hash ([u8;32]), amount (u64), expiry_seconds (Option<i64>)
   */
  private buildCreateEscrowData(
    jobId: string,
    jobIdHash: Uint8Array,
    amountLamports: number | bigint,
    expirySeconds: number | null = null
  ): Uint8Array {
    return concatBytes(
      new Uint8Array(DISCRIMINATORS.create_escrow),
      this.encodeString(jobId),
      jobIdHash, // [u8; 32] - no length prefix
      this.encodeU64(amountLamports),
      this.encodeOptionI64(expirySeconds),
    );
  }

  /**
   * Build create escrow transaction for poster to sign and fund
   * Returns serialized transaction and escrow PDA address
   */
  async buildCreateEscrowTx(
    jobId: string,
    posterPubkey: PublicKey,
    amountLamports: number | bigint,
    expirySeconds: number | null = null
  ): Promise<{ transaction: Transaction; escrowPDA: PublicKey; jobIdHash: Uint8Array }> {
    const jobIdHash = await computeJobIdHash(jobId);
    const [escrowPDA] = this.deriveEscrowPDAFromHash(jobIdHash, posterPubkey);

    const data = this.buildCreateEscrowData(
      jobId,
      jobIdHash,
      amountLamports,
      expirySeconds ?? DEFAULT_EXPIRY_SECONDS
    );

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

    return { transaction, escrowPDA, jobIdHash };
  }

  // ============== assign_worker ==============

  /**
   * Build assign_worker instruction data
   * Args: worker (pubkey)
   */
  private buildAssignWorkerData(workerPubkey: PublicKey): Uint8Array {
    return concatBytes(
      new Uint8Array(DISCRIMINATORS.assign_worker),
      this.encodePubkey(workerPubkey),
    );
  }

  /**
   * Build assign worker transaction
   * Can be signed by poster or platform
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
   * Assign worker to escrow (platform signs and sends)
   */
  async assignWorker(
    escrowPDA: PublicKey,
    workerPubkey: PublicKey
  ): Promise<string> {
    if (!this.platformWallet) {
      throw new Error('Platform wallet not configured');
    }

    const tx = await this.buildAssignWorkerTx(escrowPDA, this.platformWallet.publicKey, workerPubkey);
    
    return sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.platformWallet],
      { commitment: 'confirmed' }
    );
  }

  // ============== submit_work ==============

  /**
   * Build submit_work instruction data
   * Args: proof_hash (Option<[u8; 32]>)
   */
  private buildSubmitWorkData(proofHash: Uint8Array | null = null): Uint8Array {
    return concatBytes(
      new Uint8Array(DISCRIMINATORS.submit_work),
      this.encodeOptionHash(proofHash),
    );
  }

  /**
   * Build submit work transaction for worker to sign
   */
  async buildSubmitWorkTx(
    escrowPDA: PublicKey,
    workerPubkey: PublicKey,
    proofHash: Uint8Array | null = null
  ): Promise<Transaction> {
    const data = this.buildSubmitWorkData(proofHash);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: workerPubkey, isSigner: true, isWritable: false },
      ],
      data,
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = workerPubkey;

    return transaction;
  }

  // ============== approve_work ==============

  /**
   * Build approve_work instruction data (no args)
   */
  private buildApproveWorkData(): Uint8Array {
    return new Uint8Array(DISCRIMINATORS.approve_work);
  }

  /**
   * Build approve work transaction for poster to sign
   * Releases funds immediately to worker
   */
  async buildApproveWorkTx(
    escrowPDA: PublicKey,
    posterPubkey: PublicKey,
    workerPubkey: PublicKey
  ): Promise<Transaction> {
    const data = this.buildApproveWorkData();

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: posterPubkey, isSigner: true, isWritable: false },
        { pubkey: workerPubkey, isSigner: false, isWritable: true },
        { pubkey: this.platformPubkey, isSigner: false, isWritable: true },
      ],
      data,
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = posterPubkey;

    return transaction;
  }

  // ============== auto_release ==============

  /**
   * Build auto_release instruction data (no args)
   */
  private buildAutoReleaseData(): Uint8Array {
    return new Uint8Array(DISCRIMINATORS.auto_release);
  }

  /**
   * Build auto release transaction (anyone can crank after 24h)
   */
  async buildAutoReleaseTx(
    escrowPDA: PublicKey,
    crankerPubkey: PublicKey,
    workerPubkey: PublicKey
  ): Promise<Transaction> {
    const data = this.buildAutoReleaseData();

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: crankerPubkey, isSigner: true, isWritable: false },
        { pubkey: workerPubkey, isSigner: false, isWritable: true },
        { pubkey: this.platformPubkey, isSigner: false, isWritable: true },
      ],
      data,
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = crankerPubkey;

    return transaction;
  }

  /**
   * Auto-release escrow funds (platform cranks after 24h review window)
   */
  async autoRelease(
    escrowPDA: PublicKey,
    workerPubkey: PublicKey
  ): Promise<string> {
    if (!this.platformWallet) {
      throw new Error('Platform wallet not configured');
    }

    const tx = await this.buildAutoReleaseTx(escrowPDA, this.platformWallet.publicKey, workerPubkey);
    
    return sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.platformWallet],
      { commitment: 'confirmed' }
    );
  }

  // ============== release_to_worker ==============

  /**
   * Build release to worker transaction (platform authority only)
   */
  async buildReleaseToWorkerTx(
    escrowPDA: PublicKey,
    workerPubkey: PublicKey
  ): Promise<Transaction> {
    if (!this.platformWallet) {
      throw new Error('Platform wallet not configured');
    }

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: this.platformWallet.publicKey, isSigner: true, isWritable: false }, // platform_authority
        { pubkey: workerPubkey, isSigner: false, isWritable: true },   // worker
        { pubkey: this.platformPubkey, isSigner: false, isWritable: true }, // platform (fee recipient)
      ],
      data: new Uint8Array(DISCRIMINATORS.release_to_worker),
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = this.platformWallet.publicKey;

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
    
    return sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.platformWallet],
      { commitment: 'confirmed' }
    );
  }

  // ============== refund_to_poster ==============

  /**
   * Build refund to poster transaction (platform authority only)
   */
  async buildRefundToPosterTx(
    escrowPDA: PublicKey,
    posterPubkey: PublicKey
  ): Promise<Transaction> {
    if (!this.platformWallet) {
      throw new Error('Platform wallet not configured');
    }

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: this.platformWallet.publicKey, isSigner: true, isWritable: false }, // platform_authority
        { pubkey: posterPubkey, isSigner: false, isWritable: true },   // poster
      ],
      data: new Uint8Array(DISCRIMINATORS.refund_to_poster),
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = this.platformWallet.publicKey;

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
    
    return sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.platformWallet],
      { commitment: 'confirmed' }
    );
  }

  // ============== cancel_escrow ==============

  /**
   * Build cancel escrow transaction (poster only, before worker assigned)
   */
  async buildCancelEscrowTx(
    escrowPDA: PublicKey,
    posterPubkey: PublicKey
  ): Promise<Transaction> {
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: posterPubkey, isSigner: true, isWritable: true },
      ],
      data: new Uint8Array(DISCRIMINATORS.cancel_escrow),
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = posterPubkey;

    return transaction;
  }

  // ============== initiate_dispute ==============

  /**
   * Build initiate dispute transaction
   * Starts the 24h dispute timelock
   */
  async buildInitiateDisputeTx(
    escrowPDA: PublicKey,
    initiatorPubkey: PublicKey
  ): Promise<Transaction> {
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: initiatorPubkey, isSigner: true, isWritable: false },
      ],
      data: new Uint8Array(DISCRIMINATORS.initiate_dispute),
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = initiatorPubkey;

    return transaction;
  }

  /**
   * Initiate dispute (platform signs)
   */
  async initiateDispute(escrowPDA: PublicKey): Promise<string> {
    if (!this.platformWallet) {
      throw new Error('Platform wallet not configured');
    }

    const tx = await this.buildInitiateDisputeTx(escrowPDA, this.platformWallet.publicKey);
    
    return sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.platformWallet],
      { commitment: 'confirmed' }
    );
  }

  // ============== raise_dispute_case ==============

  /**
   * Build raise dispute case instruction data
   * Args: reason (string)
   */
  private buildRaiseDisputeCaseData(reason: string): Uint8Array {
    return concatBytes(
      new Uint8Array(DISCRIMINATORS.raise_dispute_case),
      this.encodeString(reason),
    );
  }

  /**
   * Build raise dispute case transaction
   * Creates a DisputeCase account and selects arbitrators
   */
  async buildRaiseDisputeCaseTx(
    escrowPDA: PublicKey,
    initiatorPubkey: PublicKey,
    reason: string
  ): Promise<{ transaction: Transaction; disputeCasePDA: PublicKey }> {
    const [disputeCasePDA] = this.deriveDisputeCasePDA(escrowPDA);
    const [arbitratorPoolPDA] = this.deriveArbitratorPoolPDA();

    const data = this.buildRaiseDisputeCaseData(reason);

    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: disputeCasePDA, isSigner: false, isWritable: true },
        { pubkey: arbitratorPoolPDA, isSigner: false, isWritable: false },
        { pubkey: initiatorPubkey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    const transaction = new Transaction().add(ix);
    transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = initiatorPubkey;

    return { transaction, disputeCasePDA };
  }

  /**
   * Raise dispute case (platform signs)
   */
  async raiseDisputeCase(
    escrowPDA: PublicKey,
    reason: string
  ): Promise<{ signature: string; disputeCasePDA: PublicKey }> {
    if (!this.platformWallet) {
      throw new Error('Platform wallet not configured');
    }

    const { transaction, disputeCasePDA } = await this.buildRaiseDisputeCaseTx(
      escrowPDA,
      this.platformWallet.publicKey,
      reason
    );
    
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.platformWallet],
      { commitment: 'confirmed' }
    );

    return { signature, disputeCasePDA };
  }

  // ============== Account Fetching ==============

  /**
   * Get escrow account info
   */
  async getEscrow(escrowPDA: PublicKey): Promise<EscrowAccount | null> {
    const accountInfo = await this.connection.getAccountInfo(escrowPDA);
    if (!accountInfo || !accountInfo.data) {
      return null;
    }

    return this.decodeEscrowAccount(new Uint8Array(accountInfo.data));
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

    // submitted_at (Option<i64>)
    const hasSubmitted = data[offset] === 1;
    offset += 1;
    let submittedAt: bigint | null = null;
    if (hasSubmitted) {
      submittedAt = readI64LE(data, offset);
      offset += 8;
    }

    // proof_hash (Option<[u8; 32]>)
    const hasProofHash = data[offset] === 1;
    offset += 1;
    let proofHash: Uint8Array | null = null;
    if (hasProofHash) {
      proofHash = data.slice(offset, offset + 32);
      offset += 32;
    }

    // dispute_case (Option<pubkey>)
    const hasDisputeCase = data[offset] === 1;
    offset += 1;
    let disputeCase: string | null = null;
    if (hasDisputeCase) {
      disputeCase = new PublicKey(data.slice(offset, offset + 32)).toBase58();
      offset += 32;
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
      submittedAt,
      proofHash,
      disputeCase,
      bump,
    };
  }

  /**
   * Get escrow balance (SOL in the PDA)
   */
  async getEscrowBalance(escrowPDA: PublicKey): Promise<number> {
    return this.connection.getBalance(escrowPDA);
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
    isInReviewWindow: boolean;
    reviewDeadline: Date | null;
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

    // Check review window status
    let isInReviewWindow = false;
    let reviewDeadline: Date | null = null;
    
    if (escrow?.submittedAt) {
      const submittedTime = Number(escrow.submittedAt) * 1000;
      reviewDeadline = new Date(submittedTime + REVIEW_WINDOW_SECONDS * 1000);
      isInReviewWindow = Date.now() < reviewDeadline.getTime();
    }

    return {
      address: escrowPDA.toBase58(),
      exists: escrow !== null,
      escrow,
      balance,
      balanceSol: balance / LAMPORTS_PER_SOL,
      statusName: escrow ? STATUS_NAMES[escrow.status] || 'Unknown' : (rpcError ? 'Unknown (RPC error)' : 'Not Found'),
      isInReviewWindow,
      reviewDeadline,
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
  getConnectionInfo(): { rpcUrl: string; programId: string; platformWallet: string } {
    return {
      rpcUrl: this.connection.rpcEndpoint,
      programId: this.programId.toBase58(),
      platformWallet: this.platformPubkey.toBase58(),
    };
  }

  /**
   * Check if an escrow is ready for auto-release (review window expired)
   */
  isReadyForAutoRelease(escrow: EscrowAccount): boolean {
    if (escrow.status !== EscrowStatus.PendingReview) {
      return false;
    }
    if (!escrow.submittedAt) {
      return false;
    }
    const submittedTime = Number(escrow.submittedAt);
    const now = Math.floor(Date.now() / 1000);
    return (now - submittedTime) >= REVIEW_WINDOW_SECONDS;
  }

  /**
   * Check if a disputed escrow is ready for refund (timelock passed)
   */
  isReadyForRefund(escrow: EscrowAccount): boolean {
    if (escrow.status !== EscrowStatus.Disputed) {
      return false;
    }
    if (!escrow.disputeInitiatedAt) {
      return false;
    }
    const disputeTime = Number(escrow.disputeInitiatedAt);
    const now = Math.floor(Date.now() / 1000);
    const DISPUTE_TIMELOCK_SECONDS = 24 * 60 * 60; // 24 hours
    return (now - disputeTime) >= DISPUTE_TIMELOCK_SECONDS;
  }
}

// ============== Factory Functions ==============

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

// ============== Utility Functions ==============

/**
 * Helper to convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * Helper to convert lamports to SOL
 */
export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

/**
 * Compute SHA-256 hash of a string (for proof hashes)
 */
export async function computeProofHash(proof: string): Promise<Uint8Array> {
  return sha256(textToBytes(proof));
}
