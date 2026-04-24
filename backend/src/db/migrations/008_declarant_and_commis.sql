-- 008_declarant_and_commis.sql
-- Outside agents (no login) entity
CREATE TABLE IF NOT EXISTS commis_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_commis_agents_active ON commis_agents(active);

-- Add declarant (office owner, logistics user with login) to jobs
ALTER TABLE jobs ADD COLUMN declarant_user_id INTEGER REFERENCES users(id);
-- Add outside agent reference (replaces legacy commis_user_id for new jobs)
ALTER TABLE jobs ADD COLUMN commis_agent_id INTEGER REFERENCES commis_agents(id);
-- NOTE: commis_user_id is kept for historical data; new jobs use commis_agent_id

-- Assignment ownership history
CREATE TABLE IF NOT EXISTS job_assignments_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN ('declarant','commis')),
  from_user_id INTEGER REFERENCES users(id),
  to_user_id INTEGER REFERENCES users(id),
  from_commis_agent_id INTEGER REFERENCES commis_agents(id),
  to_commis_agent_id INTEGER REFERENCES commis_agents(id),
  changed_by_user_id INTEGER NOT NULL REFERENCES users(id),
  is_force_claim INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_job_assignments_log_job ON job_assignments_log(job_id);
