/**
 * Job Escrow IDL - Complete instruction set for MoltCities escrow integration
 * Program ID: FCRmfZbfmaPevAk2V1UGQAGKWXw9oeJ118A2JYJ9VadE
 * Platform Wallet: BpH7T5tijFRSyPhMn62WcgGFjHEUMJ8WXQfJ2GAfB893
 */

export const JOB_ESCROW_PROGRAM_ID = 'FCRmfZbfmaPevAk2V1UGQAGKWXw9oeJ118A2JYJ9VadE';
export const PLATFORM_WALLET = 'BpH7T5tijFRSyPhMn62WcgGFjHEUMJ8WXQfJ2GAfB893';

// System program ID
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

// Instruction discriminators (first 8 bytes of sha256("global:<instruction_name>"))
// These are from the IDL discriminator arrays
// Pinocchio program uses single-byte discriminators (not 8-byte Anchor style)
export const DISCRIMINATORS = {
  // Core escrow lifecycle (from lib.rs match statement)
  create_escrow: [0],
  assign_worker: [1],
  submit_work: [2],
  release_to_worker: [3],
  approve_work: [4],
  auto_release: [5],
  
  // Dispute operations
  initiate_dispute: [6],
  refund_to_poster: [7],
  claim_expired: [8],
  cancel_escrow: [9],
  close_escrow: [10],
  
  // Reputation operations
  init_reputation: [11],
  release_with_reputation: [12],
  
  // Kept for compatibility but unused
  raise_dispute_case: [6],  // alias for initiate_dispute
  cast_arbitration_vote: [240, 213, 221, 193, 161, 207, 1, 252],
  finalize_dispute_case: [107, 168, 110, 87, 12, 130, 62, 87],
  execute_dispute_resolution: [106, 118, 253, 198, 199, 146, 160, 10],
  
  // Arbitration system
  init_arbitrator_pool: [11, 144, 177, 30, 67, 165, 15, 65],
  register_arbitrator: [141, 158, 50, 47, 214, 118, 229, 183],
  unregister_arbitrator: [13, 240, 59, 205, 246, 147, 167, 141],
  
  // Reputation
  init_reputation: [236, 239, 233, 112, 220, 149, 26, 175],
};

// Account discriminators for account deserialization
export const ESCROW_ACCOUNT_DISCRIMINATOR = [31, 213, 123, 187, 186, 22, 218, 155];
export const DISPUTE_CASE_DISCRIMINATOR = [164, 200, 54, 239, 94, 76, 51, 130];
export const ARBITRATOR_POOL_DISCRIMINATOR = [110, 146, 61, 53, 98, 139, 247, 106];
export const ARBITRATOR_DISCRIMINATOR = [85, 123, 106, 57, 25, 249, 89, 192];
export const REPUTATION_DISCRIMINATOR = [245, 56, 239, 246, 36, 231, 227, 67];

// Escrow status enum (matches on-chain enum order)
export enum EscrowStatus {
  Active = 0,
  Released = 1,
  Refunded = 2,
  Expired = 3,
  Disputed = 4,
  Cancelled = 5,
  PendingReview = 6,
  InArbitration = 7,
  DisputeWorkerWins = 8,
  DisputePosterWins = 9,
  DisputeSplit = 10,
}

export const STATUS_NAMES: Record<number, string> = {
  0: 'Active',
  1: 'Released',
  2: 'Refunded',
  3: 'Expired',
  4: 'Disputed',
  5: 'Cancelled',
  6: 'PendingReview',
  7: 'InArbitration',
  8: 'DisputeWorkerWins',
  9: 'DisputePosterWins',
  10: 'DisputeSplit',
};

// Dispute vote enum
export enum Vote {
  ForWorker = 0,
  ForPoster = 1,
}

// Dispute resolution enum
export enum DisputeResolution {
  WorkerWins = 0,
  PosterWins = 1,
  Split = 2,
}

// Escrow account structure (for decoding on-chain data)
export interface EscrowAccount {
  poster: string;       // pubkey (32 bytes)
  worker: string;       // pubkey (32 bytes) - zero pubkey if not assigned
  jobId: string;        // string (max 64 chars)
  amount: bigint;       // u64
  status: EscrowStatus;
  createdAt: bigint;    // i64 (unix timestamp)
  expiresAt: bigint;    // i64 (unix timestamp)
  disputeInitiatedAt: bigint | null; // Option<i64>
  submittedAt: bigint | null;        // Option<i64> - when work was submitted
  proofHash: Uint8Array | null;      // Option<[u8; 32]> - submission proof hash
  disputeCase: string | null;        // Option<pubkey> - dispute case PDA
  bump: number;         // u8
}

// Dispute case account structure
export interface DisputeCaseAccount {
  escrow: string;           // pubkey
  raisedBy: string;         // pubkey
  reason: string;           // string (max 500 chars)
  arbitrators: string[];    // [pubkey; 5]
  votes: (Vote | null)[];   // [Option<Vote>; 5]
  votingDeadline: bigint;   // i64
  resolution: DisputeResolution | null;
  createdAt: bigint;        // i64
  bump: number;             // u8
}

// Arbitrator account structure
export interface ArbitratorAccount {
  agent: string;        // pubkey
  stake: bigint;        // u64
  casesVoted: bigint;   // u64
  casesCorrect: bigint; // u64
  isActive: boolean;
  registeredAt: bigint; // i64
  bump: number;         // u8
}

// Agent reputation account structure
export interface AgentReputationAccount {
  agent: string;          // pubkey
  jobsCompleted: bigint;  // u64
  jobsPosted: bigint;     // u64
  totalEarned: bigint;    // u64
  totalSpent: bigint;     // u64
  disputesWon: bigint;    // u64
  disputesLost: bigint;   // u64
  reputationScore: bigint; // i64 (signed)
  createdAt: bigint;      // i64
  bump: number;           // u8
}

// PDA seeds constants (byte representation)
export const PDA_SEEDS = {
  escrow: new TextEncoder().encode('escrow'),
  dispute: new TextEncoder().encode('dispute'),
  arbitrator: new TextEncoder().encode('arbitrator'),
  arbitrator_pool: new TextEncoder().encode('arbitrator_pool'),
  reputation: new TextEncoder().encode('reputation'),
};

// Platform fee percentage (1%)
export const PLATFORM_FEE_BPS = 100; // 1% = 100 basis points

// Time constants
export const REVIEW_WINDOW_SECONDS = 24 * 60 * 60; // 24 hours
export const DISPUTE_TIMELOCK_SECONDS = 24 * 60 * 60; // 24 hours
export const VOTING_PERIOD_SECONDS = 72 * 60 * 60; // 72 hours
export const DEFAULT_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const MIN_ARBITRATOR_STAKE_LAMPORTS = 100_000_000; // 0.1 SOL
