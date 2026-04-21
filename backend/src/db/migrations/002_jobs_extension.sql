-- Extend jobs table with fields from real paper files.
-- ALTER TABLE ADD COLUMN cannot carry CHECK constraints in SQLite;
-- validation is enforced at the application layer via Zod.

ALTER TABLE jobs ADD COLUMN type TEXT NOT NULL DEFAULT 'import';
ALTER TABLE jobs ADD COLUMN commis_user_id INTEGER REFERENCES users(id);
ALTER TABLE jobs ADD COLUMN inspecteur TEXT;
ALTER TABLE jobs ADD COLUMN recu_le TEXT;
ALTER TABLE jobs ADD COLUMN expediteur_exportateur TEXT;
ALTER TABLE jobs ADD COLUMN nombre_colis_tc TEXT;
ALTER TABLE jobs ADD COLUMN observations TEXT;
ALTER TABLE jobs ADD COLUMN remise_documents_datetime TEXT;
ALTER TABLE jobs ADD COLUMN remise_documents_notes TEXT;
ALTER TABLE jobs ADD COLUMN compagnie_transport TEXT;
ALTER TABLE jobs ADD COLUMN dossier_signe_par TEXT;

-- Multiple DUM declarations per job
CREATE TABLE IF NOT EXISTS job_dums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  dum_number TEXT NOT NULL,
  dum_date TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_job_dums_job ON job_dums(job_id);

-- Per-job milestone tracking
CREATE TABLE IF NOT EXISTS job_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage_code TEXT NOT NULL,
  stage_label TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','completed','skipped')),
  completed_at TEXT,
  completed_by_user_id INTEGER REFERENCES users(id),
  notes TEXT,
  UNIQUE(job_id, stage_code)
);

CREATE INDEX IF NOT EXISTS idx_job_milestones_job ON job_milestones(job_id);

-- Disbursement type autocomplete suggestions
CREATE TABLE IF NOT EXISTS disbursement_type_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT UNIQUE NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO disbursement_type_suggestions (label, display_order) VALUES
  ('Droits de douane',        10),
  ('Transport',               20),
  ('Honoraires agent',        30),
  ('Inspection physique',     40),
  ('MCA (tests sanitaires)',  50),
  ('Magasinage',              60),
  ('Parking',                 70),
  ('Carburant',               80),
  ('Manutention',             90),
  ('Redevance informatique',  100),
  ('Assistance manipulation', 110),
  ('Autre',                   999);
