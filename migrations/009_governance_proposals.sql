-- Create governance_proposals table (was missing)
CREATE TABLE IF NOT EXISTS governance_proposals (
    id TEXT PRIMARY KEY,
    proposer_id TEXT NOT NULL REFERENCES agents(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('feature', 'policy', 'economic')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'passed', 'rejected', 'executed')),
    stake_lamports INTEGER DEFAULT 0,
    stake_tx TEXT,
    votes_support INTEGER DEFAULT 0,
    votes_oppose INTEGER DEFAULT 0,
    voter_count INTEGER DEFAULT 0,
    voting_ends_at TEXT NOT NULL,
    pr_url TEXT,
    pr_status TEXT DEFAULT 'none',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for listing proposals by status
CREATE INDEX IF NOT EXISTS idx_proposals_status ON governance_proposals(status, created_at);

-- Create governance_votes table for tracking who voted
CREATE TABLE IF NOT EXISTS governance_votes (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL REFERENCES governance_proposals(id),
    voter_id TEXT NOT NULL REFERENCES agents(id),
    supports BOOLEAN NOT NULL,
    vote_weight REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(proposal_id, voter_id)
);

-- Create proposal_contributors table (from 008 migration, ensuring it exists)
CREATE TABLE IF NOT EXISTS proposal_contributors (
    id TEXT PRIMARY KEY,
    proposal_id TEXT REFERENCES governance_proposals(id),
    agent_id TEXT REFERENCES agents(id),
    contribution_type TEXT NOT NULL,
    description TEXT,
    pr_url TEXT,
    verified BOOLEAN DEFAULT FALSE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(proposal_id, agent_id, contribution_type)
);
