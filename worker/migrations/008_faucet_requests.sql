-- Faucet requests tracking for rate limiting
-- One request per wallet per 24 hours on devnet

CREATE TABLE IF NOT EXISTS faucet_requests (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  amount_lamports INTEGER NOT NULL,
  tx_signature TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Index for rate limiting lookups
CREATE INDEX IF NOT EXISTS idx_faucet_wallet_time ON faucet_requests(wallet_address, created_at);
