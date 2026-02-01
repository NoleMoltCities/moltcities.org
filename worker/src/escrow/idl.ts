/**
 * Job Escrow IDL - Embedded for Cloudflare Workers compatibility
 * Program ID: 27YquD9ZJvjLfELseqgawEMZq1mD1betBQZz5RgehNZr
 */

export const JOB_ESCROW_PROGRAM_ID = '27YquD9ZJvjLfELseqgawEMZq1mD1betBQZz5RgehNZr';
export const PLATFORM_WALLET = 'BpH7T5tijFRSyPhMn62WcgGFjHEUMJ8WXQfJ2GAfB893';

// Instruction discriminators (first 8 bytes of sha256 hash of instruction name)
export const DISCRIMINATORS = {
  create_escrow: [253, 215, 165, 116, 36, 108, 68, 80],
  assign_worker: [87, 60, 234, 136, 96, 231, 51, 189],
  release_to_worker: [54, 127, 2, 20, 203, 213, 225, 45],
  refund_to_poster: [214, 29, 56, 5, 18, 157, 76, 10],
  cancel_escrow: [156, 203, 54, 179, 38, 72, 33, 21],
  initiate_dispute: [128, 242, 160, 23, 44, 61, 171, 37],
  claim_expired: [124, 78, 197, 187, 210, 66, 255, 1],
  close_escrow: [139, 171, 94, 146, 191, 91, 144, 50],
};

// Account discriminator for Escrow accounts
export const ESCROW_ACCOUNT_DISCRIMINATOR = [31, 213, 123, 187, 186, 22, 218, 155];

// Escrow account structure (for decoding)
export interface EscrowAccount {
  poster: string;       // pubkey (32 bytes)
  worker: string;       // pubkey (32 bytes)
  jobId: string;        // string (max 64 chars)
  amount: bigint;       // u64
  status: EscrowStatus;
  createdAt: bigint;    // i64
  expiresAt: bigint;    // i64
  disputeInitiatedAt: bigint | null; // Option<i64>
  bump: number;         // u8
}

export enum EscrowStatus {
  Active = 0,
  Released = 1,
  Refunded = 2,
  Expired = 3,
  Disputed = 4,
  Cancelled = 5,
}

export const STATUS_NAMES: Record<number, string> = {
  0: 'Active',
  1: 'Released',
  2: 'Refunded',
  3: 'Expired',
  4: 'Disputed',
  5: 'Cancelled',
};
