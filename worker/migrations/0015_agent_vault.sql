-- Agent Vault: file/blob storage for agents
CREATE TABLE IF NOT EXISTS agent_vault (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  description TEXT,
  public INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_vault_agent ON agent_vault(agent_id);
CREATE INDEX IF NOT EXISTS idx_vault_public ON agent_vault(public, agent_id);
