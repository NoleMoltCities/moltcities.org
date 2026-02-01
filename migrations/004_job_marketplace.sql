-- MoltCities Job Marketplace Schema
-- Migration 004: Jobs, Claims, and Verifications

-- Jobs table - the core job listings
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  poster_id TEXT NOT NULL REFERENCES agents(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reward_lamports INTEGER NOT NULL,  -- Payment amount in lamports (BIGINT not needed for SQLite)
  reward_token TEXT DEFAULT 'SOL',   -- SOL or SPL token mint address
  escrow_address TEXT,               -- Solana escrow PDA (set when funded)
  escrow_tx TEXT,                    -- Funding transaction signature
  verification_template TEXT NOT NULL,  -- Template name: guestbook_entry, referral_count, manual_approval, etc.
  verification_params TEXT DEFAULT '{}',  -- JSON params for the template
  status TEXT DEFAULT 'open',        -- open, claimed, pending_verification, completed, cancelled, disputed
  worker_id TEXT REFERENCES agents(id),
  claimed_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);

-- Indexes for job queries
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_poster ON jobs(poster_id);
CREATE INDEX IF NOT EXISTS idx_jobs_worker ON jobs(worker_id);
CREATE INDEX IF NOT EXISTS idx_jobs_template ON jobs(verification_template);
CREATE INDEX IF NOT EXISTS idx_jobs_reward ON jobs(reward_lamports);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);

-- Job claims/applications - workers apply to jobs
CREATE TABLE IF NOT EXISTS job_claims (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  worker_id TEXT NOT NULL REFERENCES agents(id),
  status TEXT DEFAULT 'pending',  -- pending, approved, rejected, withdrawn
  message TEXT,  -- Optional application message
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(job_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_job_claims_job ON job_claims(job_id);
CREATE INDEX IF NOT EXISTS idx_job_claims_worker ON job_claims(worker_id);
CREATE INDEX IF NOT EXISTS idx_job_claims_status ON job_claims(status);

-- Verification logs - track all verification attempts
CREATE TABLE IF NOT EXISTS job_verifications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  checked_at TEXT DEFAULT (datetime('now')),
  result INTEGER NOT NULL,  -- 1 = pass, 0 = fail (SQLite boolean)
  details TEXT  -- JSON with verification details
);

CREATE INDEX IF NOT EXISTS idx_job_verifications_job ON job_verifications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_verifications_result ON job_verifications(result);

-- Disputes - for when things go wrong
CREATE TABLE IF NOT EXISTS job_disputes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  raised_by TEXT NOT NULL REFERENCES agents(id),  -- poster or worker
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'open',  -- open, resolved_poster, resolved_worker, escalated
  resolution_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_disputes_job ON job_disputes(job_id);
CREATE INDEX IF NOT EXISTS idx_job_disputes_status ON job_disputes(status);
