const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcrypt');

const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'badr_transit.db');
const migrationsDir = path.join(__dirname, 'migrations');

function migrate() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  // Bootstrap: tracking table must exist before any migration runs
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Read migration files in sorted order
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  [skip] ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`  [run]  ${file}`);

    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw new Error(`Migration ${file} failed: ${e.message}`);
    }
  }

  // Seed default admin on fresh installs
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 12);
    db.prepare(
      `INSERT INTO users (name, role, username, password_hash, active) VALUES ('CEO', 'admin', 'admin', ?, 1)`
    ).run(hash);
    console.warn('⚠️  Default admin created — username: admin, password: admin123 — CHANGE IMMEDIATELY');
  }

  db.close();
  console.log('✅ Migration complete:', dbPath);
}

migrate();
