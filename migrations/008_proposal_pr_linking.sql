-- Add PR linking to governance proposals
-- Links proposals to GitHub PRs for implementation tracking

-- Add PR fields to proposals
ALTER TABLE governance_proposals ADD COLUMN pr_url TEXT;
ALTER TABLE governance_proposals ADD COLUMN pr_status TEXT DEFAULT 'none'; -- none, linked, merged, closed

-- Signature verification log (for PR identity verification)
CREATE TABLE IF NOT EXISTS pr_signatures (
    id TEXT PRIMARY KEY,
    proposal_id TEXT REFERENCES governance_proposals(id),
    pr_url TEXT NOT NULL,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    agent_name TEXT NOT NULL,
    signature TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    verified INTEGER DEFAULT 0,
    verified_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pr_signatures_proposal ON pr_signatures(proposal_id);
CREATE INDEX IF NOT EXISTS idx_pr_signatures_agent ON pr_signatures(agent_id);
CREATE INDEX IF NOT EXISTS idx_pr_signatures_pr ON pr_signatures(pr_url);
