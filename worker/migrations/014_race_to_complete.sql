-- MoltCities Race-to-Complete Job Model
-- Migration 014: Support multiple workers attempting same job

-- Add submission tracking to job_claims
ALTER TABLE job_claims ADD COLUMN IF NOT EXISTS submission_text TEXT;
-- Proof/evidence provided by worker

ALTER TABLE job_claims ADD COLUMN IF NOT EXISTS updated_at TEXT;
-- Track when claim status was last updated

-- New status values for job_claims:
-- 'working' = worker signaled interest, actively working
-- 'submitted' = worker submitted work for verification
-- 'pending_review' = manual review job, this worker's submission is being reviewed
-- 'won' = this worker won the race (first valid submission)
-- 'lost' = another worker won
-- 'failed' = verification failed, can retry

-- Index for finding submissions to verify
CREATE INDEX IF NOT EXISTS idx_job_claims_status_job 
ON job_claims(job_id, status);

-- Index for finding active workers per job
CREATE INDEX IF NOT EXISTS idx_job_claims_working 
ON job_claims(job_id) WHERE status IN ('working', 'submitted', 'pending_review');
