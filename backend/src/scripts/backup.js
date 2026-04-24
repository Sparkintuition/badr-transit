#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '../../data/badr_transit.db');
const DATA_DIR = path.join(__dirname, '../../data');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../data/backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const KEEP_MIN = 7;

function pad(n) { return String(n).padStart(2, '0'); }

function nowLabel() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function run() {
  const label = nowLabel();
  const dest = path.join(BACKUP_DIR, label);
  fs.mkdirSync(dest, { recursive: true });

  // --- DB backup via VACUUM INTO (works with node:sqlite DatabaseSync) ---
  const dbDest = path.join(dest, 'badr_transit.db');
  const db = new DatabaseSync(DB_PATH);
  db.exec(`VACUUM INTO '${dbDest.replace(/'/g, "''")}'`);
  db.close();
  console.log(`[backup] DB → ${dbDest}`);

  // --- Copy receipts and invoices folders ---
  const receiptsDir = path.join(DATA_DIR, 'receipts');
  const invoicesDir = path.join(DATA_DIR, 'invoices');
  if (fs.existsSync(receiptsDir)) {
    fs.cpSync(receiptsDir, path.join(dest, 'receipts'), { recursive: true });
    console.log(`[backup] receipts copied`);
  }
  if (fs.existsSync(invoicesDir)) {
    fs.cpSync(invoicesDir, path.join(dest, 'invoices'), { recursive: true });
    console.log(`[backup] invoices copied`);
  }

  // --- Manifest ---
  const manifest = {
    timestamp: new Date().toISOString(),
    db: 'badr_transit.db',
    retention_days: RETENTION_DAYS,
  };
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // --- Retention: collect all backup folders sorted oldest first ---
  const all = fs.readdirSync(BACKUP_DIR)
    .filter((name) => {
      const full = path.join(BACKUP_DIR, name);
      return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'manifest.json'));
    })
    .sort();

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const toDelete = all.filter((name, idx) => {
    if (all.length - idx <= KEEP_MIN) return false;
    const ts = fs.readFileSync(path.join(BACKUP_DIR, name, 'manifest.json'), 'utf8');
    try {
      const { timestamp } = JSON.parse(ts);
      return new Date(timestamp).getTime() < cutoff;
    } catch {
      return false;
    }
  });

  for (const name of toDelete) {
    fs.rmSync(path.join(BACKUP_DIR, name), { recursive: true, force: true });
    console.log(`[backup] purged old backup: ${name}`);
  }

  console.log(`[backup] done: ${label}`);
  return { ok: true, label, dest };
}

if (require.main === module) {
  try {
    run();
    process.exit(0);
  } catch (err) {
    console.error('[backup] ERROR:', err.message);
    process.exit(1);
  }
}

module.exports = { run };
