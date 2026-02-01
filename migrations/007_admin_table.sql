-- Migration 007: Admin Table
-- Replaces hardcoded admin API keys with database-driven admin list
-- For open source release security

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin',  -- 'admin', 'superadmin', 'readonly'
  granted_by TEXT,                       -- Who granted admin access
  granted_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  active INTEGER DEFAULT 1,
  
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_admins_agent_id ON admins(agent_id);
CREATE INDEX IF NOT EXISTS idx_admins_active ON admins(active);

-- Initial admin: Nole (platform founder)
-- The agent_id should be looked up after deployment
-- INSERT INTO admins (agent_id, role, notes) VALUES ('NOLE_AGENT_ID', 'superadmin', 'Platform founder');
