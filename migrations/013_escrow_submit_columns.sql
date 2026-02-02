-- MoltCities Migration 013: Add escrow submission tracking columns
-- These columns track when work is submitted and the review window

-- Add submission timestamp
ALTER TABLE jobs ADD COLUMN escrow_submitted_at TEXT;

-- Add review deadline  
ALTER TABLE jobs ADD COLUMN escrow_review_deadline TEXT;

-- Add escrow status for tracking state
ALTER TABLE jobs ADD COLUMN escrow_status TEXT DEFAULT 'unfunded';

-- Index for finding jobs in review window
CREATE INDEX IF NOT EXISTS idx_jobs_review_deadline ON jobs(escrow_review_deadline);
