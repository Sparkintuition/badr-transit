const { Router } = require('express');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('../db/db');
const { requireRole } = require('../auth/middleware');
const { logAudit } = require('../utils/audit');

const router = Router();

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../data/backups');

const SETTINGS_WHITELIST = [
  'red_flag_days',
  'receipt_red_flag_days',
  'next_dossier_number',
  'next_facture_number',
  'company_name',
  'company_rc',
  'company_tp',
  'company_ice',
  'company_if',
  'company_cnss',
  'company_capital',
  'company_address',
  'company_phone',
  'company_email',
  'company_city',
];

// POST /api/admin/backup-now
router.post('/backup-now', requireRole('admin'), (req, res) => {
  try {
    const scriptPath = path.join(__dirname, '../scripts/backup.js');
    const result = spawnSync(process.execPath, [scriptPath], {
      env: process.env,
      encoding: 'utf8',
      timeout: 60000,
    });
    if (result.status !== 0) {
      return res.status(500).json({ error: result.stderr || 'Backup failed' });
    }
    const lastLine = (result.stdout || '').trim().split('\n').pop();
    const labelMatch = lastLine.match(/done: (.+)/);
    const label = labelMatch ? labelMatch[1] : 'ok';
    logAudit(db, { user_id: req.user?.id, action: 'backup', entity_type: 'system', entity_id: null });
    res.json({ ok: true, label, output: result.stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/backup-info
router.get('/backup-info', requireRole('admin'), (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ last_backup: null, count: 0, backup_dir: BACKUP_DIR });
    }
    const dirs = fs.readdirSync(BACKUP_DIR)
      .filter((name) => {
        const full = path.join(BACKUP_DIR, name);
        return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'manifest.json'));
      })
      .sort();

    if (dirs.length === 0) {
      return res.json({ last_backup: null, count: 0, backup_dir: BACKUP_DIR });
    }
    const latest = dirs[dirs.length - 1];
    const manifest = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, latest, 'manifest.json'), 'utf8'));
    res.json({ last_backup: manifest.timestamp, count: dirs.length, backup_dir: BACKUP_DIR });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/settings
router.get('/settings', requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

// PUT /api/admin/settings
router.put('/settings', requireRole('admin'), (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Body invalide' });
  }

  const errors = {};
  const applied = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!SETTINGS_WHITELIST.includes(key)) {
      errors[key] = 'Clé non autorisée';
      continue;
    }
    const old = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).run(key, String(value));
    logAudit(db, {
      user_id: req.user?.id,
      action: 'update',
      entity_type: 'setting',
      entity_id: key,
      old_value: old ? { value: old.value } : null,
      new_value: { value: String(value) },
    });
    applied.push(key);
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }
  res.json({ ok: true, applied });
});

module.exports = router;
