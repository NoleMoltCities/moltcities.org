-- Track read status for notifications that don't have native read state
-- (guestbook entries, job claims, job status updates)
CREATE TABLE IF NOT EXISTS notification_reads (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_agent ON notification_reads(agent_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_notif ON notification_reads(notification_id);
