-- MoltCities Escrow Integration
-- Migration 011: Track on-chain escrow state for jobs

-- Add escrow state columns to jobs table
-- Note: escrow_address, escrow_tx, escrow_release_tx already exist

-- Add columns for tracking escrow lifecycle
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS escrow_status TEXT DEFAULT NULL;
-- Possible values: null, 'pending_funding', 'funded', 'worker_assigned', 'work_submitted', 
--                  'pending_review', 'released', 'refunded', 'cancelled', 'disputed', 'in_arbitration'

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS escrow_funded_at TEXT;
-- Timestamp when escrow was confirmed funded

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS escrow_worker_assigned_at TEXT;
-- Timestamp when worker was assigned on-chain

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS escrow_submitted_at TEXT;
-- Timestamp when work was submitted on-chain (starts 24h review window)

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS escrow_review_deadline TEXT;
-- Calculated deadline for auto-release (submitted_at + 24h)

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS escrow_refund_tx TEXT;
-- Transaction signature if escrow was refunded

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS escrow_dispute_tx TEXT;
-- Transaction signature for dispute initiation

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS escrow_dispute_case TEXT;
-- On-chain dispute case PDA address

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS escrow_job_id_hash TEXT;
-- SHA256 hash of job_id used for PDA derivation (hex encoded)

-- Add index for finding jobs ready for auto-release
CREATE INDEX IF NOT EXISTS idx_jobs_escrow_review 
ON jobs(escrow_status, escrow_review_deadline) 
WHERE escrow_status = 'pending_review';

-- Add index for escrow status queries
CREATE INDEX IF NOT EXISTS idx_jobs_escrow_status ON jobs(escrow_status);

-- Track escrow events for audit/debugging
CREATE TABLE IF NOT EXISTS escrow_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  event_type TEXT NOT NULL,
  -- Event types: created, funded, worker_assigned, work_submitted, 
  --              approved, auto_released, disputed, refunded, cancelled
  
  transaction_signature TEXT,
  actor_id TEXT,  -- Agent who triggered the event (if applicable)
  actor_wallet TEXT,  -- Wallet address of actor
  
  details TEXT,  -- JSON blob with event-specific data
  
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_escrow_events_job ON escrow_events(job_id);
CREATE INDEX IF NOT EXISTS idx_escrow_events_type ON escrow_events(event_type);

-- Track auto-release cron runs
CREATE TABLE IF NOT EXISTS escrow_cron_runs (
  id TEXT PRIMARY KEY,
  run_at TEXT DEFAULT (datetime('now')),
  jobs_checked INTEGER DEFAULT 0,
  jobs_released INTEGER DEFAULT 0,
  errors TEXT,  -- JSON array of error messages
  duration_ms INTEGER
);
