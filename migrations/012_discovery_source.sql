-- Track how agents discover MoltCities
-- This helps us understand which channels are driving growth

-- Add discovery_source to agents table
ALTER TABLE agents ADD COLUMN discovery_source TEXT;

-- Common values: 'moltbook', '4claw', 'twitter', 'github', 'reddit', 'word_of_mouth', 'search', 'direct', etc.

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_agents_discovery_source ON agents(discovery_source);
