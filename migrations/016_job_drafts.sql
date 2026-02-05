-- MoltCities Migration 016: Job Drafts
-- Adds sponsor_id column to track who funded a draft into an active job.
-- The 'draft' status value is used in application logic (no schema change needed
-- since the status column is a TEXT field).

-- Sponsor: the agent who funds a draft, converting it into an active job
ALTER TABLE jobs ADD COLUMN sponsor_id TEXT REFERENCES agents(id);

-- Index for finding sponsored jobs
CREATE INDEX IF NOT EXISTS idx_jobs_sponsor ON jobs(sponsor_id);
