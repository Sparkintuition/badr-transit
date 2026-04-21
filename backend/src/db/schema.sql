CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'accountant', 'logistics')),
  username TEXT UNIQUE,
  password_hash TEXT,
  pin_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ice TEXT,
  address TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  payment_deadline_days INTEGER NOT NULL DEFAULT 30,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_number TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','released','invoiced','paid','archived','cancelled')),
  dum_number TEXT,
  destinataire TEXT,
  nbre_tc INTEGER,
  poids_brut_kg REAL,
  nature_marchandise TEXT,
  bureau TEXT,
  depot_sequence_date TEXT,
  arrival_date TEXT,
  release_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id INTEGER REFERENCES users(id),
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_number TEXT UNIQUE NOT NULL,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  subtotal_taxable_cents INTEGER NOT NULL DEFAULT 0,
  subtotal_non_taxable_cents INTEGER NOT NULL DEFAULT 0,
  total_ht_cents INTEGER NOT NULL DEFAULT 0,
  tva_14_cents INTEGER NOT NULL DEFAULT 0,
  tva_20_cents INTEGER NOT NULL DEFAULT 0,
  taxe_regionale_cents INTEGER NOT NULL DEFAULT 0,
  taxe_regionale_applied INTEGER NOT NULL DEFAULT 1,
  total_ttc_cents INTEGER NOT NULL DEFAULT 0,
  avance_cents INTEGER NOT NULL DEFAULT 0,
  reste_a_payer_cents INTEGER NOT NULL DEFAULT 0,
  amount_in_words TEXT,
  pieces_jointes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  payment_date TEXT,
  payment_method TEXT,
  pdf_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS disbursements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  type TEXT NOT NULL,
  description TEXT,
  amount_cents INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('check','cash','transfer')),
  check_number TEXT,
  paid_by_user_id INTEGER REFERENCES users(id),
  paid_date TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  signed_at TEXT,
  signed_by_user_id INTEGER REFERENCES users(id),
  check_copy_path TEXT,
  receipt_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending_signature' CHECK (status IN ('pending_signature','signed','invoiced','reimbursed','cancelled')),
  cancelled_reason TEXT,
  invoice_id INTEGER REFERENCES invoices(id),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS service_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  designation TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  tva_rate INTEGER NOT NULL DEFAULT 20,
  is_transport INTEGER NOT NULL DEFAULT 0,
  invoice_id INTEGER REFERENCES invoices(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('service','disbursement')),
  source_id INTEGER NOT NULL,
  designation TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  is_taxable INTEGER NOT NULL,
  tva_rate INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  old_value TEXT,
  new_value TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cash_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount_cents INTEGER NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  paid_date TEXT NOT NULL,
  paid_by_user_id INTEGER REFERENCES users(id),
  receipt_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expired_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired_at);
CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_disbursements_job ON disbursements(job_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_status ON disbursements(status);
CREATE INDEX IF NOT EXISTS idx_disbursements_invoice ON disbursements(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('next_dossier_number', '1241071'),
  ('next_facture_number', '243779'),
  ('company_name', 'BADR TRANSIT'),
  ('red_flag_days', '3');
