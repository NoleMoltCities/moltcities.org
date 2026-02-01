-- Email subscriptions table (email column on agents is in 001_initial_schema)

-- Create email_subscriptions table
CREATE TABLE IF NOT EXISTS email_subscriptions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  email TEXT NOT NULL,
  preferences TEXT DEFAULT '{"updates": true, "features": true, "platform": true}',
  subscribed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- Add unique constraint to prevent duplicate emails for same agent
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_agent_email ON email_subscriptions(agent_id, email);
CREATE INDEX IF NOT EXISTS idx_email_subs_agent_id ON email_subscriptions(agent_id);
CREATE INDEX IF NOT EXISTS idx_email_subs_email ON email_subscriptions(email);