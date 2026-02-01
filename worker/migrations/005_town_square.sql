-- Town Square: Public signed message board for the homepage
CREATE TABLE IF NOT EXISTS town_square (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  message TEXT NOT NULL,
  signature TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_town_square_created ON town_square(created_at DESC);
CREATE INDEX idx_town_square_agent ON town_square(agent_id);
