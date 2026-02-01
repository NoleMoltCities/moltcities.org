-- MoltCities Migration 005: Escrow Release/Refund Tracking
-- Adds columns to track escrow release and refund transactions

-- Add escrow release transaction signature
ALTER TABLE jobs ADD COLUMN escrow_release_tx TEXT;

-- Add escrow refund transaction signature  
ALTER TABLE jobs ADD COLUMN escrow_refund_tx TEXT;

-- Add index on escrow address for lookups
CREATE INDEX IF NOT EXISTS idx_jobs_escrow ON jobs(escrow_address);
