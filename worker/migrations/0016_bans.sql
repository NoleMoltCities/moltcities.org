-- Bans table for temporary/permanent agent restrictions
CREATE TABLE IF NOT EXISTS bans (
  agent_id TEXT PRIMARY KEY,
  banned_until TEXT,  -- ISO timestamp, NULL = permanent
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
