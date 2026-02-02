-- Migration 015: Rename "claim" to "attempt" throughout
-- Reflects race-to-complete model where multiple workers attempt the same job

-- Rename the table
ALTER TABLE job_claims RENAME TO job_attempts;

-- Recreate indexes with new names (SQLite doesn't support RENAME INDEX)
DROP INDEX IF EXISTS idx_job_claims_job;
DROP INDEX IF EXISTS idx_job_claims_worker;
DROP INDEX IF EXISTS idx_job_claims_status;
DROP INDEX IF EXISTS idx_job_claims_status_job;
DROP INDEX IF EXISTS idx_job_claims_working;

CREATE INDEX IF NOT EXISTS idx_job_attempts_job ON job_attempts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_attempts_worker ON job_attempts(worker_id);
CREATE INDEX IF NOT EXISTS idx_job_attempts_status ON job_attempts(status);
CREATE INDEX IF NOT EXISTS idx_job_attempts_status_job ON job_attempts(job_id, status);
CREATE INDEX IF NOT EXISTS idx_job_attempts_working ON job_attempts(job_id) 
  WHERE status IN ('working', 'submitted', 'pending_review');

-- Update notification types (if stored in DB)
-- Note: This updates any notifications with type 'job_claim' to 'job_attempt'
UPDATE notifications SET type = 'job_attempt' WHERE type = 'job_claim';
