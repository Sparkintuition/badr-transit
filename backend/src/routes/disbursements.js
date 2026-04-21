const { Router } = require('express');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const db = require('../db/db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { logAudit } = require('../utils/audit');
const { uploadSingle } = require('../middleware/upload');

const router = Router();
router.use(requireAuth);

// ─── Settings helpers ─────────────────────────────────────────────────────────

function getSettings() {
  const rfRow = db.prepare("SELECT value FROM settings WHERE key = 'red_flag_days'").get();
  const rrfRow = db.prepare("SELECT value FROM settings WHERE key = 'receipt_red_flag_days'").get();
  const cashRow = db.prepare("SELECT value FROM settings WHERE key = 'cash_auto_sign_threshold_cents'").get();
  return {
    redFlagDays: rfRow ? parseInt(rfRow.value, 10) : 3,
    receiptRedFlagDays: rrfRow ? parseInt(rrfRow.value, 10) : 7,
    cashAutoSignThreshold: cashRow ? parseInt(cashRow.value, 10) : 50000,
  };
}

function nowSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ─── Base SELECT ──────────────────────────────────────────────────────────────

const BASE_SELECT = `
  SELECT
    d.id, d.job_id, d.type, d.description, d.amount_cents,
    d.payment_method, d.payment_reference,
    d.paid_by_user_id, d.paid_date, d.requested_at,
    d.signed_at, d.signed_by_user_id,
    d.receipt_path, d.payment_proof_path,
    d.no_receipt_expected, d.no_receipt_reason,
    d.status, d.cancelled_reason, d.invoice_id,
    d.created_by_user_id,
    j.dossier_number, j.client_id, j.archived AS job_archived, j.status AS job_status,
    c.name AS client_name,
    pb.name AS paid_by_user_name,
    sb.name AS signed_by_user_name,
    cb.name AS created_by_user_name,
    i.facture_number
  FROM disbursements d
  JOIN jobs j ON j.id = d.job_id
  JOIN clients c ON c.id = j.client_id
  LEFT JOIN users pb ON pb.id = d.paid_by_user_id
  LEFT JOIN users sb ON sb.id = d.signed_by_user_id
  LEFT JOIN users cb ON cb.id = d.created_by_user_id
  LEFT JOIN invoices i ON i.id = d.invoice_id
`;

function buildItem(row, redFlagDays, receiptRedFlagDays) {
  let daysSincePaid = null;
  let isRedFlagInvoice = false;
  let isRedFlagReceipt = false;
  if (row.status === 'signed' && row.paid_date) {
    const paidMs = new Date(String(row.paid_date).slice(0, 10) + 'T00:00:00').getTime();
    daysSincePaid = Math.floor((Date.now() - paidMs) / 86400000);
    if (!row.invoice_id) isRedFlagInvoice = daysSincePaid > redFlagDays;
    if (!row.receipt_path && !row.no_receipt_expected) {
      isRedFlagReceipt = daysSincePaid > receiptRedFlagDays;
    }
  }
  return {
    id: row.id,
    job: {
      id: row.job_id,
      dossier_number: row.dossier_number,
      client: { id: row.client_id, name: row.client_name },
    },
    type: row.type,
    description: row.description,
    amount_cents: row.amount_cents,
    payment_method: row.payment_method,
    payment_reference: row.payment_reference || null,
    paid_by_user: row.paid_by_user_id ? { id: row.paid_by_user_id, name: row.paid_by_user_name } : null,
    paid_date: row.paid_date,
    requested_at: row.requested_at,
    signed_at: row.signed_at,
    signed_by_user: row.signed_by_user_id ? { id: row.signed_by_user_id, name: row.signed_by_user_name } : null,
    created_by_user: row.created_by_user_id ? { id: row.created_by_user_id, name: row.created_by_user_name } : null,
    status: row.status,
    invoice_id: row.invoice_id,
    invoice_facture_number: row.facture_number || null,
    cancelled_reason: row.cancelled_reason,
    has_receipt: !!row.receipt_path,
    has_payment_proof: !!row.payment_proof_path,
    no_receipt_expected: !!row.no_receipt_expected,
    no_receipt_reason: row.no_receipt_reason || null,
    days_since_paid: daysSincePaid,
    is_red_flag_invoice: isRedFlagInvoice,
    is_red_flag_receipt: isRedFlagReceipt,
  };
}

function canView(user, row) {
  if (['admin', 'accountant'].includes(user.role)) return true;
  return row.created_by_user_id === user.id;
}

// ─── GET /api/disbursements/stats ─────────────────────────────────────────────

router.get('/stats', requireRole('admin', 'accountant'), (req, res) => {
  const { redFlagDays, receiptRedFlagDays } = getSettings();

  const pending = db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS amt FROM disbursements WHERE status = 'pending_signature'"
  ).get();

  const signedUninvoiced = db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS amt FROM disbursements WHERE status = 'signed' AND invoice_id IS NULL"
  ).get();

  const redFlags = db.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS amt
    FROM disbursements
    WHERE status = 'signed' AND invoice_id IS NULL
      AND paid_date IS NOT NULL
      AND (julianday('now') - julianday(paid_date)) > ?
  `).get(redFlagDays);

  const receiptAlerts = db.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS amt
    FROM disbursements
    WHERE status = 'signed' AND receipt_path IS NULL AND no_receipt_expected = 0
      AND paid_date IS NOT NULL
      AND (julianday('now') - julianday(paid_date)) > ?
  `).get(receiptRedFlagDays);

  const thisMonth = db.prepare(`
    SELECT COALESCE(SUM(amount_cents),0) AS amt
    FROM disbursements
    WHERE status != 'cancelled'
      AND strftime('%Y-%m', COALESCE(paid_date, requested_at)) = strftime('%Y-%m', 'now')
  `).get();

  res.json({
    pending_signature_count: pending.n,
    pending_signature_amount: pending.amt,
    signed_uninvoiced_count: signedUninvoiced.n,
    signed_uninvoiced_amount: signedUninvoiced.amt,
    red_flag_count: redFlags.n,
    red_flag_amount: redFlags.amt,
    receipt_alert_count: receiptAlerts.n,
    receipt_alert_amount: receiptAlerts.amt,
    this_month_total: thisMonth.amt,
  });
});

// ─── GET /api/disbursements/alerts ────────────────────────────────────────────

router.get('/alerts', requireRole('admin', 'accountant'), (req, res) => {
  const { redFlagDays, receiptRedFlagDays } = getSettings();

  const invoiceAlertRows = db.prepare(`
    ${BASE_SELECT}
    WHERE d.status = 'signed' AND d.invoice_id IS NULL
      AND d.paid_date IS NOT NULL
      AND (julianday('now') - julianday(d.paid_date)) > ?
    ORDER BY d.paid_date ASC
  `).all(redFlagDays);

  const receiptAlertRows = db.prepare(`
    ${BASE_SELECT}
    WHERE d.status = 'signed' AND d.receipt_path IS NULL AND d.no_receipt_expected = 0
      AND d.paid_date IS NOT NULL
      AND (julianday('now') - julianday(d.paid_date)) > ?
    ORDER BY d.paid_date ASC
  `).all(receiptRedFlagDays);

  const invoiceAlerts = invoiceAlertRows.map((r) => buildItem(r, redFlagDays, receiptRedFlagDays));
  const receiptAlerts = receiptAlertRows.map((r) => buildItem(r, redFlagDays, receiptRedFlagDays));

  res.json({
    invoice_alerts: {
      count: invoiceAlerts.length,
      total_amount_cents: invoiceAlerts.reduce((s, d) => s + d.amount_cents, 0),
      items: invoiceAlerts,
    },
    receipt_alerts: {
      count: receiptAlerts.length,
      total_amount_cents: receiptAlerts.reduce((s, d) => s + d.amount_cents, 0),
      items: receiptAlerts,
    },
  });
});

// ─── GET /api/disbursements/pending-signature ─────────────────────────────────

router.get('/pending-signature', requireRole('admin'), (req, res) => {
  const { redFlagDays, receiptRedFlagDays } = getSettings();
  const rows = db.prepare(`
    ${BASE_SELECT}
    WHERE d.status = 'pending_signature'
    ORDER BY d.requested_at ASC
  `).all();
  res.json(rows.map((r) => buildItem(r, redFlagDays, receiptRedFlagDays)));
});

// ─── GET /api/disbursements/suggestions ──────────────────────────────────────

router.get('/suggestions', (req, res) => {
  const fromSuggestions = db.prepare(
    'SELECT label FROM disbursement_type_suggestions ORDER BY label LIMIT 20'
  ).all().map((r) => r.label);

  const fromHistory = db.prepare(
    "SELECT DISTINCT type FROM disbursements WHERE type IS NOT NULL AND type != '' ORDER BY requested_at DESC LIMIT 20"
  ).all().map((r) => r.type);

  const combined = [...new Set([...fromSuggestions, ...fromHistory])].slice(0, 30);
  res.json(combined);
});

// ─── GET /api/disbursements ───────────────────────────────────────────────────

router.get('/', (req, res) => {
  const {
    status, job_id, client_id, type, payment_method,
    red_flag, receipt_alert,
    include_cancelled = '0',
    page = '1', page_size = '50',
    date_from, date_to,
    search,
  } = req.query;

  const { redFlagDays, receiptRedFlagDays } = getSettings();
  const user = req.user;
  const conditions = [];
  const params = [];

  if (user.role === 'logistics') {
    conditions.push('d.created_by_user_id = ?');
    params.push(user.id);
  }

  if (red_flag === '1') {
    conditions.push("d.status = 'signed' AND d.invoice_id IS NULL AND d.paid_date IS NOT NULL AND (julianday('now') - julianday(d.paid_date)) > ?");
    params.push(redFlagDays);
  } else if (receipt_alert === '1') {
    conditions.push("d.status = 'signed' AND d.receipt_path IS NULL AND d.no_receipt_expected = 0 AND d.paid_date IS NOT NULL AND (julianday('now') - julianday(d.paid_date)) > ?");
    params.push(receiptRedFlagDays);
  } else if (status) {
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      conditions.push(`d.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  } else if (include_cancelled !== '1') {
    conditions.push("d.status != 'cancelled'");
  }

  if (job_id) { conditions.push('d.job_id = ?'); params.push(parseInt(job_id, 10)); }
  if (client_id) { conditions.push('j.client_id = ?'); params.push(parseInt(client_id, 10)); }
  if (type) { conditions.push('d.type LIKE ?'); params.push(`%${type}%`); }
  if (payment_method) { conditions.push('d.payment_method = ?'); params.push(payment_method); }
  if (search) {
    const term = `%${search.trim()}%`;
    conditions.push('(j.dossier_number LIKE ? OR d.type LIKE ? OR d.description LIKE ? OR d.payment_reference LIKE ?)');
    params.push(term, term, term, term);
  }
  if (date_from) {
    conditions.push('(d.paid_date >= ? OR (d.paid_date IS NULL AND substr(d.requested_at,1,10) >= ?))');
    params.push(date_from, date_from);
  }
  if (date_to) {
    conditions.push('(d.paid_date <= ? OR (d.paid_date IS NULL AND substr(d.requested_at,1,10) <= ?))');
    params.push(date_to, date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(page_size, 10) || 50));
  const offset = (pageNum - 1) * pageSize;

  const countSql = `SELECT COUNT(*) AS n FROM disbursements d JOIN jobs j ON j.id = d.job_id JOIN clients c ON c.id = j.client_id ${where}`;
  const { n: total } = db.prepare(countSql).get(...params);

  const rows = db.prepare(`${BASE_SELECT} ${where} ORDER BY d.requested_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  const items = rows.map((r) => buildItem(r, redFlagDays, receiptRedFlagDays));

  const summaryRows = db.prepare(
    `SELECT d.status, d.amount_cents FROM disbursements d JOIN jobs j ON j.id = d.job_id JOIN clients c ON c.id = j.client_id ${where}`
  ).all(...params);

  const total_amount_cents = summaryRows.reduce((s, r) => s + r.amount_cents, 0);
  const by_status = {};
  for (const r of summaryRows) {
    by_status[r.status] = (by_status[r.status] || 0) + 1;
  }

  res.json({ items, total, page: pageNum, page_size: pageSize, summary: { total_amount_cents, by_status } });
});

// ─── GET /api/disbursements/:id ───────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const row = db.prepare(`${BASE_SELECT} WHERE d.id = ?`).get(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'Décaissement introuvable.' });
  if (!canView(req.user, row)) return res.status(403).json({ error: 'Accès refusé.' });
  const { redFlagDays, receiptRedFlagDays } = getSettings();
  res.json(buildItem(row, redFlagDays, receiptRedFlagDays));
});

// ─── POST /api/disbursements ──────────────────────────────────────────────────

const CreateSchema = z.object({
  job_id: z.number().int().positive(),
  type: z.string().min(1),
  description: z.string().nullable().optional(),
  amount_cents: z.number().int().min(1),
  payment_method: z.enum(['check', 'cash', 'transfer']),
  payment_reference: z.string().nullable().optional(),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  no_receipt_expected: z.number().int().min(0).max(1).optional().default(0),
  no_receipt_reason: z.string().nullable().optional(),
});

router.post('/', (req, res) => {
  const parse = CreateSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Données invalides.', errors: parse.error.flatten().fieldErrors });

  const data = parse.data;

  if (['check', 'transfer'].includes(data.payment_method) && !data.payment_reference?.trim()) {
    return res.status(400).json({ error: 'Numéro de chèque ou référence de virement requis.', errors: { payment_reference: 'Requis pour un paiement par chèque ou virement.' } });
  }
  if (data.no_receipt_expected && !data.no_receipt_reason?.trim()) {
    return res.status(400).json({ error: 'Motif requis si aucun reçu attendu.', errors: { no_receipt_reason: 'Requis.' } });
  }

  const job = db.prepare('SELECT id, status, archived FROM jobs WHERE id = ?').get(data.job_id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable.' });
  if (job.archived) return res.status(409).json({ error: "Impossible d'ajouter un décaissement à un dossier archivé." });
  if (job.status === 'cancelled') return res.status(409).json({ error: "Impossible d'ajouter un décaissement à un dossier annulé." });

  const user = req.user;
  const { cashAutoSignThreshold } = getSettings();
  const autoSign = data.payment_method === 'cash'
    && data.amount_cents <= cashAutoSignThreshold
    && ['admin', 'accountant'].includes(user.role);

  const now = nowSql();
  const status = autoSign ? 'signed' : 'pending_signature';
  const signedAt = autoSign ? now : null;
  const signedBy = autoSign ? user.id : null;

  const info = db.prepare(`
    INSERT INTO disbursements
      (job_id, type, description, amount_cents, payment_method, payment_reference,
       paid_by_user_id, paid_date, status, signed_at, signed_by_user_id, created_by_user_id,
       no_receipt_expected, no_receipt_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.job_id, data.type, data.description || null, data.amount_cents,
    data.payment_method, data.payment_reference || null,
    user.id, data.paid_date || null,
    status, signedAt, signedBy, user.id,
    data.no_receipt_expected || 0, data.no_receipt_reason || null
  );

  const { redFlagDays, receiptRedFlagDays } = getSettings();
  const newRow = db.prepare(`${BASE_SELECT} WHERE d.id = ?`).get(info.lastInsertRowid);
  logAudit(db, { user_id: user.id, action: 'create', entity_type: 'disbursement', entity_id: info.lastInsertRowid, new_value: newRow });
  res.status(201).json(buildItem(newRow, redFlagDays, receiptRedFlagDays));
});

// ─── PUT /api/disbursements/:id ───────────────────────────────────────────────

const UpdateSchema = z.object({
  type: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  amount_cents: z.number().int().min(1).optional(),
  payment_method: z.enum(['check', 'cash', 'transfer']).optional(),
  payment_reference: z.string().nullable().optional(),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

router.put('/:id', (req, res) => {
  const row = db.prepare(`${BASE_SELECT} WHERE d.id = ?`).get(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'Décaissement introuvable.' });

  const user = req.user;
  if (user.role === 'logistics' && row.created_by_user_id !== user.id) {
    return res.status(403).json({ error: 'Accès refusé.' });
  }
  if (row.status !== 'pending_signature') {
    return res.status(409).json({ error: 'Le décaissement ne peut plus être modifié après validation.' });
  }

  const parse = UpdateSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Données invalides.', errors: parse.error.flatten().fieldErrors });

  const data = parse.data;
  const effectivePm = data.payment_method ?? row.payment_method;
  if (['check', 'transfer'].includes(effectivePm) && 'payment_reference' in data && !data.payment_reference?.trim()) {
    return res.status(400).json({ error: 'Numéro de chèque ou référence de virement requis.', errors: { payment_reference: 'Requis.' } });
  }

  const allowed = ['type', 'description', 'amount_cents', 'payment_method', 'payment_reference', 'paid_date'];
  const updates = {};
  for (const k of allowed) {
    if (k in data) updates[k] = data[k];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour.' });

  const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE disbursements SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), row.id);

  const { redFlagDays, receiptRedFlagDays } = getSettings();
  const newRow = db.prepare(`${BASE_SELECT} WHERE d.id = ?`).get(row.id);
  logAudit(db, { user_id: user.id, action: 'update', entity_type: 'disbursement', entity_id: row.id, old_value: row, new_value: newRow });
  res.json(buildItem(newRow, redFlagDays, receiptRedFlagDays));
});

// ─── POST /api/disbursements/:id/validate (+ deprecated /sign alias) ──────────
// For check/transfer: must include payment_proof file (multipart).
// For cash: JSON body with optional paid_date.

function resolveJobId(req, res, next) {
  const row = db.prepare('SELECT job_id, payment_method FROM disbursements WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'Décaissement introuvable.' });
  req._uploadJobId = row.job_id;
  req._uploadPaymentMethod = row.payment_method;
  next();
}

function uploadErrorHandler(err, req, res, next) {
  if (err) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Fichier trop volumineux (max 10 MB).'
      : err.message || 'Erreur de téléchargement.';
    return res.status(400).json({ error: msg });
  }
  next();
}

function validateHandler(req, res) {
  const row = db.prepare('SELECT * FROM disbursements WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!row) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Décaissement introuvable.' });
  }
  if (row.status !== 'pending_signature') {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(409).json({ error: 'Ce décaissement ne peut pas être validé dans son état actuel.' });
  }

  if (['check', 'transfer'].includes(row.payment_method) && !req.file && !row.payment_proof_path) {
    return res.status(400).json({ error: 'Une copie du moyen de paiement est obligatoire pour valider un décaissement par chèque ou virement.' });
  }

  const now = nowSql();
  const paidDate = (req.body?.paid_date) || row.paid_date || now.slice(0, 10);

  const setClauses = ["status = 'signed'", 'signed_at = ?', 'signed_by_user_id = ?', 'paid_date = ?'];
  const setParams = [now, req.user.id, paidDate];

  if (req.file) {
    if (row.payment_proof_path && fs.existsSync(row.payment_proof_path)) {
      const ext = path.extname(row.payment_proof_path);
      const base = row.payment_proof_path.slice(0, -ext.length);
      try { fs.renameSync(row.payment_proof_path, `${base}_old_${Date.now()}${ext}`); } catch { /* best effort */ }
    }
    setClauses.push('payment_proof_path = ?');
    setParams.push(req.file.path);
  }

  db.prepare(`UPDATE disbursements SET ${setClauses.join(', ')} WHERE id = ?`).run(...setParams, row.id);

  logAudit(db, {
    user_id: req.user.id, action: 'validate', entity_type: 'disbursement', entity_id: row.id,
    old_value: { status: row.status },
    new_value: { status: 'signed', signed_at: now, has_payment_proof: !!(req.file || row.payment_proof_path) },
  });

  const { redFlagDays, receiptRedFlagDays } = getSettings();
  const newRow = db.prepare(`${BASE_SELECT} WHERE d.id = ?`).get(row.id);
  res.json(buildItem(newRow, redFlagDays, receiptRedFlagDays));
}

const validateMiddleware = [requireRole('admin'), resolveJobId, uploadSingle('payment_proof'), uploadErrorHandler, validateHandler];

router.post('/:id/validate', ...validateMiddleware);
// deprecated alias — remove once all clients use /validate
router.post('/:id/sign', ...validateMiddleware);

// ─── POST /api/disbursements/:id/cancel ──────────────────────────────────────

router.post('/:id/cancel', (req, res) => {
  const row = db.prepare('SELECT * FROM disbursements WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'Décaissement introuvable.' });

  const user = req.user;
  const isAdmin = user.role === 'admin';
  const isAccountant = user.role === 'accountant';

  if (!isAdmin && !(isAccountant && row.status === 'pending_signature')) {
    return res.status(403).json({ error: 'Accès refusé.' });
  }
  if (['invoiced', 'reimbursed', 'cancelled'].includes(row.status)) {
    return res.status(409).json({ error: "Ce décaissement ne peut pas être annulé dans son état actuel." });
  }

  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) {
    return res.status(400).json({ error: 'Raison requise (minimum 5 caractères).', errors: { reason: 'Minimum 5 caractères.' } });
  }

  db.prepare("UPDATE disbursements SET status = 'cancelled', cancelled_reason = ? WHERE id = ?").run(reason, row.id);
  logAudit(db, {
    user_id: user.id, action: 'cancel', entity_type: 'disbursement', entity_id: row.id,
    old_value: { status: row.status }, new_value: { status: 'cancelled', reason },
  });

  const { redFlagDays, receiptRedFlagDays } = getSettings();
  const newRow = db.prepare(`${BASE_SELECT} WHERE d.id = ?`).get(row.id);
  res.json(buildItem(newRow, redFlagDays, receiptRedFlagDays));
});

// ─── POST /api/disbursements/:id/no-receipt ───────────────────────────────────

router.post('/:id/no-receipt', requireRole('admin', 'accountant'), (req, res) => {
  const row = db.prepare('SELECT * FROM disbursements WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: 'Décaissement introuvable.' });
  if (row.status === 'cancelled') return res.status(409).json({ error: 'Ce décaissement est annulé.' });

  const noReceiptExpected = req.body?.no_receipt_expected === true || req.body?.no_receipt_expected === 1 ? 1 : 0;
  const reason = String(req.body?.reason || '').trim() || null;

  if (noReceiptExpected && !reason) {
    return res.status(400).json({ error: "Motif requis quand aucun reçu n'est attendu.", errors: { reason: 'Requis.' } });
  }

  db.prepare('UPDATE disbursements SET no_receipt_expected = ?, no_receipt_reason = ? WHERE id = ?')
    .run(noReceiptExpected, noReceiptExpected ? reason : null, row.id);

  logAudit(db, {
    user_id: req.user.id, action: 'update_no_receipt', entity_type: 'disbursement', entity_id: row.id,
    old_value: { no_receipt_expected: row.no_receipt_expected, no_receipt_reason: row.no_receipt_reason },
    new_value: { no_receipt_expected: noReceiptExpected, no_receipt_reason: noReceiptExpected ? reason : null },
  });

  const { redFlagDays, receiptRedFlagDays } = getSettings();
  const newRow = db.prepare(`${BASE_SELECT} WHERE d.id = ?`).get(row.id);
  res.json(buildItem(newRow, redFlagDays, receiptRedFlagDays));
});

// ─── File uploads ─────────────────────────────────────────────────────────────

function makeSaveHandler(dbColumn, auditAction) {
  return (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    const row = db.prepare('SELECT * FROM disbursements WHERE id = ?').get(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'Décaissement introuvable.' });
    if (!canView(req.user, row)) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'Accès refusé.' });
    }

    const oldPath = row[dbColumn];
    if (oldPath && fs.existsSync(oldPath)) {
      const ext = path.extname(oldPath);
      const base = oldPath.slice(0, -ext.length);
      try { fs.renameSync(oldPath, `${base}_old_${Date.now()}${ext}`); } catch { /* best effort */ }
    }

    db.prepare(`UPDATE disbursements SET ${dbColumn} = ? WHERE id = ?`).run(req.file.path, row.id);
    logAudit(db, { user_id: req.user.id, action: auditAction, entity_type: 'disbursement', entity_id: row.id, new_value: { path: req.file.path } });

    const { redFlagDays, receiptRedFlagDays } = getSettings();
    const newRow = db.prepare(`${BASE_SELECT} WHERE d.id = ?`).get(row.id);
    res.json(buildItem(newRow, redFlagDays, receiptRedFlagDays));
  };
}

router.post('/:id/receipt',
  resolveJobId,
  uploadSingle('file'),
  uploadErrorHandler,
  makeSaveHandler('receipt_path', 'upload_receipt')
);

router.post('/:id/payment-proof',
  resolveJobId,
  (req, res, next) => {
    if (!['check', 'transfer'].includes(req._uploadPaymentMethod)) {
      return res.status(400).json({ error: "La copie du moyen de paiement n'est applicable qu'aux paiements par chèque ou virement." });
    }
    next();
  },
  uploadSingle('file'),
  uploadErrorHandler,
  makeSaveHandler('payment_proof_path', 'upload_payment_proof')
);

// ─── File serving ─────────────────────────────────────────────────────────────

function serveFile(dbColumn) {
  return (req, res) => {
    const row = db.prepare('SELECT * FROM disbursements WHERE id = ?').get(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'Décaissement introuvable.' });
    if (!canView(req.user, row)) return res.status(403).json({ error: 'Accès refusé.' });

    const filePath = row[dbColumn];
    if (!filePath) return res.status(404).json({ error: 'Aucun fichier attaché.' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable sur le serveur.' });

    res.sendFile(path.resolve(filePath));
  };
}

router.get('/:id/receipt', serveFile('receipt_path'));
router.get('/:id/payment-proof', serveFile('payment_proof_path'));

module.exports = router;
