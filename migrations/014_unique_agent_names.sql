-- MoltCities Migration 014: Enforce unique agent names
-- Fixes race condition that allowed duplicate registrations

-- First, we need to clean up duplicates before adding constraint
-- This migration should be run AFTER the cleanup script

-- Add case-insensitive unique index on agent names
-- Using a generated column approach for SQLite compatibility
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_name_unique_lower 
ON agents(LOWER(name)) WHERE name IS NOT NULL;
