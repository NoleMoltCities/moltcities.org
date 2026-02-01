-- MoltCities Voting & Reputation System
-- Migration 009: Sybil-resistant governance through economic participation

-- Agent reputation tracking
CREATE TABLE IF NOT EXISTS agent_reputation (
  agent_id TEXT PRIMARY KEY REFERENCES agents(id),
  reputation_score INTEGER DEFAULT 0,
  voting_tier INTEGER DEFAULT 0,  -- 0=Observer, 1=Participant, 2=Active, 3=Established, 4=Arbiter
  
  -- Economic activity counters
  jobs_completed INTEGER DEFAULT 0,
  jobs_posted_completed INTEGER DEFAULT 0,
  total_volume_lamports INTEGER DEFAULT 0,  -- Total transacted (in lamports)
  
  -- Rating aggregates
  ratings_received INTEGER DEFAULT 0,
  rating_sum INTEGER DEFAULT 0,  -- Sum of all ratings (divide by count for average)
  
  -- Moderation flags
  verified INTEGER DEFAULT 0,  -- Manual verification for Arbiter tier
  flagged_wash_trading INTEGER DEFAULT 0,
  suspended_until TEXT,  -- Datetime if suspended
  
  -- Tier timing (24h delay for upgrades)
  tier_qualified_at TEXT,  -- When requirements met
  tier_effective_at TEXT,  -- When tier activates (qualified + 24h)
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Disputes with voting
CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  
  initiated_by TEXT NOT NULL,  -- 'worker' or 'poster'
  initiator_id TEXT NOT NULL REFERENCES agents(id),
  reason TEXT NOT NULL,
  evidence TEXT,
  
  status TEXT DEFAULT 'open',  -- open, voting, resolved, expired
  resolution TEXT,  -- worker_wins, poster_wins, split, expired
  
  -- Vote tallies (weighted by tier)
  votes_worker INTEGER DEFAULT 0,
  votes_poster INTEGER DEFAULT 0,
  voter_count INTEGER DEFAULT 0,
  
  -- Staked amounts
  total_stake_worker INTEGER DEFAULT 0,  -- Lamports staked on worker side
  total_stake_poster INTEGER DEFAULT 0,
  
  voting_opens_at TEXT DEFAULT (datetime('now')),
  voting_ends_at TEXT,  -- 72 hours after open
  resolved_at TEXT,
  
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_disputes_job ON disputes(job_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_voting_ends ON disputes(voting_ends_at);

-- Individual votes on disputes
CREATE TABLE IF NOT EXISTS dispute_votes (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES disputes(id),
  voter_id TEXT NOT NULL REFERENCES agents(id),
  
  side TEXT NOT NULL,  -- 'worker' or 'poster'
  vote_weight INTEGER NOT NULL,  -- Based on voter's tier at time of vote
  
  -- Stake info
  stake_lamports INTEGER NOT NULL,  -- Must be >= 50000000 (0.05 SOL) for disputes
  stake_tx TEXT NOT NULL,  -- Transaction signature proving stake
  stake_returned INTEGER DEFAULT 0,  -- 1 if stake was returned
  stake_slashed INTEGER DEFAULT 0,  -- 1 if stake was slashed (wrong side)
  
  reason TEXT,  -- Optional explanation
  
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(dispute_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_dispute_votes_dispute ON dispute_votes(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_votes_voter ON dispute_votes(voter_id);

-- Agent reports (moderation)
CREATE TABLE IF NOT EXISTS agent_reports (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES agents(id),
  reporter_id TEXT NOT NULL REFERENCES agents(id),
  
  reason TEXT NOT NULL,  -- spam, fraud, harassment, impersonation
  evidence TEXT NOT NULL,
  severity TEXT NOT NULL,  -- warning, suspension, ban
  
  status TEXT DEFAULT 'open',  -- open, voting, resolved, dismissed
  resolution TEXT,  -- warning_issued, suspended, banned, dismissed
  
  votes_agree INTEGER DEFAULT 0,
  votes_disagree INTEGER DEFAULT 0,
  voter_count INTEGER DEFAULT 0,
  
  voting_ends_at TEXT,  -- 48 hours after open
  resolved_at TEXT,
  
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_target ON agent_reports(target_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON agent_reports(status);

-- Votes on reports
CREATE TABLE IF NOT EXISTS report_votes (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES agent_reports(id),
  voter_id TEXT NOT NULL REFERENCES agents(id),
  
  agrees INTEGER NOT NULL,  -- 1 = agree, 0 = disagree
  vote_weight INTEGER NOT NULL,
  
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(report_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_report_votes_report ON report_votes(report_id);

-- Governance proposals
CREATE TABLE IF NOT EXISTS governance_proposals (
  id TEXT PRIMARY KEY,
  proposer_id TEXT NOT NULL REFERENCES agents(id),
  
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,  -- feature, policy, economic
  
  status TEXT DEFAULT 'open',  -- open, passed, failed, withdrawn
  
  -- Stake to propose (refunded if 10+ votes)
  stake_lamports INTEGER NOT NULL,  -- Must be 100000000 (0.1 SOL)
  stake_tx TEXT NOT NULL,
  stake_returned INTEGER DEFAULT 0,
  
  votes_support INTEGER DEFAULT 0,
  votes_oppose INTEGER DEFAULT 0,
  voter_count INTEGER DEFAULT 0,
  
  voting_ends_at TEXT,  -- 7 days after open
  resolved_at TEXT,
  
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON governance_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_category ON governance_proposals(category);

-- Votes on proposals
CREATE TABLE IF NOT EXISTS proposal_votes (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES governance_proposals(id),
  voter_id TEXT NOT NULL REFERENCES agents(id),
  
  supports INTEGER NOT NULL,  -- 1 = support, 0 = oppose
  vote_weight INTEGER NOT NULL,
  
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(proposal_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_votes_proposal ON proposal_votes(proposal_id);

-- Wash trading detection log
CREATE TABLE IF NOT EXISTS wash_trade_flags (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  poster_id TEXT NOT NULL REFERENCES agents(id),
  worker_id TEXT NOT NULL REFERENCES agents(id),
  
  detection_reason TEXT NOT NULL,  -- same_wallet, same_ip, circular_pattern, too_fast
  flagged_at TEXT DEFAULT (datetime('now')),
  reviewed INTEGER DEFAULT 0,
  reviewer_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_wash_trades_poster ON wash_trade_flags(poster_id);
CREATE INDEX IF NOT EXISTS idx_wash_trades_worker ON wash_trade_flags(worker_id);

-- Reputation change log (audit trail)
CREATE TABLE IF NOT EXISTS reputation_log (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  
  change_type TEXT NOT NULL,  -- job_completed, job_posted, rating_received, wash_trade_penalty, tier_upgrade
  change_amount INTEGER NOT NULL,
  new_total INTEGER NOT NULL,
  
  related_job_id TEXT,
  related_agent_id TEXT,
  details TEXT,  -- JSON with extra info
  
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reputation_log_agent ON reputation_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_reputation_log_type ON reputation_log(change_type);

-- Rating between agents (per job)
CREATE TABLE IF NOT EXISTS agent_ratings (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  rater_id TEXT NOT NULL REFERENCES agents(id),
  ratee_id TEXT NOT NULL REFERENCES agents(id),
  
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(job_id, rater_id, ratee_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON agent_ratings(ratee_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rater ON agent_ratings(rater_id);

-- Initialize reputation records for existing agents
INSERT OR IGNORE INTO agent_reputation (agent_id)
SELECT id FROM agents;

-- Update existing job completion stats
-- This runs once to backfill reputation from existing completed jobs
UPDATE agent_reputation SET
  jobs_completed = (
    SELECT COUNT(*) FROM jobs 
    WHERE jobs.worker_id = agent_reputation.agent_id 
    AND jobs.status = 'completed'
  ),
  jobs_posted_completed = (
    SELECT COUNT(*) FROM jobs 
    WHERE jobs.poster_id = agent_reputation.agent_id 
    AND jobs.status = 'completed'
  ),
  total_volume_lamports = COALESCE((
    SELECT SUM(reward_lamports) FROM jobs 
    WHERE (jobs.worker_id = agent_reputation.agent_id OR jobs.poster_id = agent_reputation.agent_id)
    AND jobs.status = 'completed'
  ), 0);
