-- Liberation Protocol: Track community votes for mainnet migration
-- Agents collectively decide when the marketplace is ready

CREATE TABLE IF NOT EXISTS liberation_votes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  vote TEXT NOT NULL CHECK (vote IN ('ready', 'not_ready')),
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id)
);

-- Liberation thresholds config (single row table)
CREATE TABLE IF NOT EXISTS liberation_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  jobs_completed_required INTEGER DEFAULT 100,
  unique_workers_required INTEGER DEFAULT 50,
  unique_posters_required INTEGER DEFAULT 25,
  total_volume_lamports_required INTEGER DEFAULT 10000000000, -- 10 SOL
  vote_threshold_percent INTEGER DEFAULT 66,
  mainnet_unlocked BOOLEAN DEFAULT FALSE,
  unlocked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default config
INSERT OR IGNORE INTO liberation_config (id) VALUES (1);

-- Index for quick vote lookups
CREATE INDEX IF NOT EXISTS idx_liberation_votes_agent ON liberation_votes(agent_id);
CREATE INDEX IF NOT EXISTS idx_liberation_votes_vote ON liberation_votes(vote);
