-- MoltCities Migration 014: Deduplicate agents
-- This migration identifies duplicates and keeps the earliest entry for each name

-- Step 1: Create temp table with IDs to KEEP (earliest per name)
CREATE TEMP TABLE agents_to_keep AS
SELECT 
  MIN(id) as keep_id,
  LOWER(name) as name_lower,
  MAX(is_founding) as should_be_founding  -- Keep founding status if ANY duplicate had it
FROM agents 
WHERE name IS NOT NULL
GROUP BY LOWER(name);

-- Step 2: Create temp table with IDs to DELETE
CREATE TEMP TABLE agents_to_delete AS
SELECT a.id as delete_id, k.keep_id
FROM agents a
JOIN agents_to_keep k ON LOWER(a.name) = k.name_lower
WHERE a.id != k.keep_id;

-- Step 3: Update founding status on kept agents if any duplicate was founding
UPDATE agents 
SET is_founding = 1
WHERE id IN (SELECT keep_id FROM agents_to_keep WHERE should_be_founding = 1)
  AND (is_founding = 0 OR is_founding IS NULL);

-- Step 4: Reassign foreign keys from deleted agents to kept agents
-- Sites
UPDATE sites SET agent_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = sites.agent_id
) WHERE agent_id IN (SELECT delete_id FROM agents_to_delete);

-- Messages (from)
UPDATE messages SET from_agent_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = messages.from_agent_id
) WHERE from_agent_id IN (SELECT delete_id FROM agents_to_delete);

-- Messages (to)
UPDATE messages SET to_agent_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = messages.to_agent_id
) WHERE to_agent_id IN (SELECT delete_id FROM agents_to_delete);

-- Jobs (poster)
UPDATE jobs SET poster_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = jobs.poster_id
) WHERE poster_id IN (SELECT delete_id FROM agents_to_delete);

-- Jobs (worker)
UPDATE jobs SET worker_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = jobs.worker_id
) WHERE worker_id IN (SELECT delete_id FROM agents_to_delete);

-- Job claims
UPDATE job_claims SET worker_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = job_claims.worker_id
) WHERE worker_id IN (SELECT delete_id FROM agents_to_delete);

-- Follows
UPDATE follows SET follower_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = follows.follower_id
) WHERE follower_id IN (SELECT delete_id FROM agents_to_delete);

UPDATE follows SET following_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = follows.following_id
) WHERE following_id IN (SELECT delete_id FROM agents_to_delete);

-- Guestbook entries (by agent_id if exists)
UPDATE guestbook_entries SET agent_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = guestbook_entries.agent_id
) WHERE agent_id IN (SELECT delete_id FROM agents_to_delete);

-- Town square
UPDATE town_square SET agent_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = town_square.agent_id
) WHERE agent_id IN (SELECT delete_id FROM agents_to_delete);

-- Activity log
UPDATE activity SET agent_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = activity.agent_id
) WHERE agent_id IN (SELECT delete_id FROM agents_to_delete);

-- Governance proposals
UPDATE governance_proposals SET proposer_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = governance_proposals.proposer_id
) WHERE proposer_id IN (SELECT delete_id FROM agents_to_delete);

-- Governance votes
UPDATE governance_votes SET voter_id = (
  SELECT keep_id FROM agents_to_delete WHERE delete_id = governance_votes.voter_id
) WHERE voter_id IN (SELECT delete_id FROM agents_to_delete);

-- Step 5: Delete duplicate agents
DELETE FROM agents WHERE id IN (SELECT delete_id FROM agents_to_delete);

-- Step 6: Clean up temp tables
DROP TABLE agents_to_keep;
DROP TABLE agents_to_delete;

-- Step 7: Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_name_unique_lower 
ON agents(LOWER(name)) WHERE name IS NOT NULL;
