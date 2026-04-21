const { Router } = require('express');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const db = require('../db/db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { logAudit } = require('../utils/audit');
const { amountToFrenchWords } = require('../utils/numbersToWords');
const { buildInvoiceLines, computeInvoiceTotals } = require('../services/invoiceService');
const { generateInvoicePdf } = require('../services/pdfService');

const router = Router();
router.use(requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function computeIsOverdue(status, due_date) {
  if (status !== 'sent') return false;
  return due_date < todayStr();
}

function daysOverdue(due_date) {
  const diff = Date.now() - new Date(due_date + 'T00:00:00').getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function buildInvoiceItem(row) {
  const isOverdue = computeIsOverdue(row.status, row.due_date);
  return {
    id: row.id,
    facture_number: row.facture_number,
    issue_date: row.issue_date,
    due_date: row.due_date,
    job: { id: row.job_id, dossier_number: row.dossier_number, type: row.job_type },
    client: { id: row.client_id, name: row.client_name },
    total_ttc_cents: row.total_ttc_cents,
    reste_a_payer_cents: row.reste_a_payer_cents,
    status: isOverdue ? 'overdue' : row.status,
    _db_status: row.status,
    is_overdue: isOverdue,
    days_overdue: isOverdue ? daysOverdue(row.due_date) : 0,
    payment_date: row.payment_date,
    payment_method: row.payment_method,
    created_at: row.created_at,
    notes: row.notes,
  };
}

function getFullInvoice(id) {
  const row = db.prepare(`
    SELECT i.*, j.dossier_number, j.type AS job_type,
           c.name AS client_name, c.id AS client_id,
           u.name AS created_by_name
    FROM invoices i
    JOIN jobs j ON j.id = i.job_id
    JOIN clients c ON c.id = i.client_id
    LEFT JOIN users u ON u.id = i.created_by_user_id
    WHERE i.id = ?
  `).get(id);
  if (!row) return null;

  const lines = db.prepare(
    'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY display_order, id'
  ).all(id);

  const disbursements = db.prepare(`
    SELECT d.id, d.type, d.description, d.amount_cents, d.payment_method,
           d.paid_date, d.status, d.receipt_path
    FROM disbursements d WHERE d.invoice_id = ?
  `).all(id);

  const isOverdue = computeIsOverdue(row.status, row.due_date);

  return {
    id: row.id,
    facture_number: row.facture_number,
    issue_date: row.issue_date,
    due_date: row.due_date,
    job: { id: row.job_id, dossier_number: row.dossier_number, type: row.job_type },
    client: { id: row.client_id, name: row.client_name },
    subtotal_taxable_cents: row.subtotal_taxable_cents,
    subtotal_non_taxable_cents: row.subtotal_non_taxable_cents,
    total_ht_cents: row.total_ht_cents,
    tva_14_cents: row.tva_14_cents,
    tva_20_cents: row.tva_20_cents,
    taxe_regionale_cents: row.taxe_regionale_cents,
    taxe_regionale_applied: !!row.taxe_regionale_applied,
    total_ttc_cents: row.total_ttc_cents,
    avance_cents: row.avance_cents,
    reste_a_payer_cents: row.reste_a_payer_cents,
    amount_in_words: row.amount_in_words,
    pieces_jointes: row.pieces_jointes,
    status: isOverdue ? 'overdue' : row.status,
    _db_status: row.status,
    is_overdue: isOverdue,
    days_overdue: isOverdue ? daysOverdue(row.due_date) : 0,
    payment_date: row.payment_date,
    payment_method: row.payment_method,
    pdf_path: row.pdf_path,
    notes: row.notes,
    cancelled_reason: row.cancelled_reason,
    created_at: row.created_at,
    created_by_user: row.created_by_user_id ? { id: row.created_by_user_id, name: row.created_by_name } : null,
    lines,
    disbursements,
  };
}

function getJobForPdf(job_id) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id);
  if (!job) return null;
  const dums = db.prepare('SELECT * FROM job_dums WHERE job_id = ? ORDER BY display_order, id').all(job_id);
  return { ...job, dums };
}

async function buildAndSavePdf(invoice_id) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice_id);
  const job = getJobForPdf(inv.job_id);
  const client = db.prepare('SELECT id, name, address, ice FROM clients WHERE id = ?').get(inv.client_id);
  const lines = db.prepare(
    'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY display_order, id'
  ).all(invoice_id);

  const year = inv.issue_date.slice(0, 4);
  const invoiceDir = path.join(__dirname, '..', '..', 'data', 'invoices', year);
  fs.mkdirSync(invoiceDir, { recursive: true });
  const safeName = inv.facture_number.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outputPath = path.join(invoiceDir, `${safeName}.pdf`);

  await generateInvoicePdf({ invoice: inv, job, client, lines }, outputPath);
  return outputPath;
}

// ─── GET /alerts ───────────────────────────────────────────────────────────────
router.get('/alerts', requireRole('admin', 'accountant'), (req, res) => {
  const today = todayStr();
  const sevenDays = addDays(today, 7);

  const overdueRows = db.prepare(`
    SELECT i.id, i.facture_number, i.due_date, i.reste_a_payer_cents,
           c.name AS client_name, c.id AS client_id
    FROM invoices i JOIN clients c ON c.id = i.client_id
    WHERE i.status = 'sent' AND i.due_date < ?
    ORDER BY i.due_date ASC
  `).all(today);

  const dueSoonRows = db.prepare(`
    SELECT i.id, i.facture_number, i.due_date, i.reste_a_payer_cents,
           c.name AS client_name, c.id AS client_id
    FROM invoices i JOIN clients c ON c.id = i.client_id
    WHERE i.status = 'sent' AND i.due_date >= ? AND i.due_date <= ?
    ORDER BY i.due_date ASC
  `).all(today, sevenDays);

  const toItem = (r) => ({
    id: r.id,
    facture_number: r.facture_number,
    client: { id: r.client_id, name: r.client_name },
    due_date: r.due_date,
    days_overdue: daysOverdue(r.due_date),
    reste_a_payer_cents: r.reste_a_payer_cents,
  });

  res.json({
    overdue: {
      count: overdueRows.length,
      total_amount_cents: overdueRows.reduce((s, r) => s + r.reste_a_payer_cents, 0),
      items: overdueRows.map(toItem),
    },
    due_soon: {
      count: dueSoonRows.length,
      items: dueSoonRows.map(toItem),
    },
  });
});

// ─── POST /preview ─────────────────────────────────────────────────────────────
router.post('/preview', requireRole('admin', 'accountant'), (req, res) => {
  const { job_id, avance_cents = 0, taxe_regionale_applied = true, facture_number, issue_date } = req.body;
  if (!job_id) return res.status(400).json({ error: 'job_id requis.' });

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable.' });

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(job.client_id);
  const dums = db.prepare('SELECT * FROM job_dums WHERE job_id = ? ORDER BY display_order').all(job_id);

  const lines = buildInvoiceLines(job_id);
  const totals = computeInvoiceTotals({ lines, taxe_regionale_applied });
  const avance = Math.max(0, parseInt(avance_cents, 10) || 0);
  const restePayer = Math.max(0, totals.total_ttc_cents - avance);
  const amountInWords = amountToFrenchWords(restePayer);

  const fnRow = db.prepare("SELECT value FROM settings WHERE key = 'next_facture_number'").get();
  const suggestedFn = facture_number || (fnRow ? fnRow.value : '');
  const suggestedDate = issue_date || todayStr();
  const suggestedDue = addDays(suggestedDate, client.payment_deadline_days || 30);

  res.json({
    job: { id: job.id, dossier_number: job.dossier_number, type: job.type, ...job, dums },
    client,
    lines,
    ...totals,
    avance_cents: avance,
    reste_a_payer_cents: restePayer,
    amount_in_words: amountInWords,
    suggested_facture_number: suggestedFn,
    suggested_issue_date: suggestedDate,
    suggested_due_date: suggestedDue,
  });
});

// ─── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const {
    status, client_id, job_id, search = '',
    date_from, date_to, overdue_only,
    page = '1', page_size = '50',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(page_size, 10) || 50));
  const offset = (pageNum - 1) * pageSize;
  const today = todayStr();

  const where = [];
  const params = [];

  if (client_id) { where.push('i.client_id = ?'); params.push(parseInt(client_id, 10)); }
  if (job_id) { where.push('i.job_id = ?'); params.push(parseInt(job_id, 10)); }
  if (date_from) { where.push('i.issue_date >= ?'); params.push(date_from); }
  if (date_to) { where.push('i.issue_date <= ?'); params.push(date_to); }

  // Status filter — 'overdue' is computed
  if (status) {
    const statuses = status.split(',').map((s) => s.trim());
    if (statuses.includes('overdue') && statuses.length === 1) {
      where.push("i.status = 'sent' AND i.due_date < ?");
      params.push(today);
    } else if (statuses.includes('overdue')) {
      const dbStatuses = statuses.filter((s) => s !== 'overdue');
      const placeholders = dbStatuses.map(() => '?').join(',');
      where.push(`(i.status IN (${placeholders}) OR (i.status = 'sent' AND i.due_date < ?))`);
      params.push(...dbStatuses, today);
    } else {
      const placeholders = statuses.map(() => '?').join(',');
      where.push(`i.status IN (${placeholders})`);
      params.push(...statuses);
    }
  }

  if (overdue_only === '1') {
    where.push("i.status = 'sent' AND i.due_date < ?");
    params.push(today);
  }

  if (search.trim()) {
    const term = `%${search.trim()}%`;
    where.push('(i.facture_number LIKE ? OR j.dossier_number LIKE ? OR c.name LIKE ?)');
    params.push(term, term, term);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const baseQuery = `
    FROM invoices i
    JOIN jobs j ON j.id = i.job_id
    JOIN clients c ON c.id = i.client_id
    ${whereClause}
  `;

  const countRow = db.prepare(`SELECT COUNT(*) AS n ${baseQuery}`).get(...params);
  const total = countRow.n;

  const rows = db.prepare(`
    SELECT i.*, j.dossier_number, j.type AS job_type,
           c.name AS client_name, c.id AS client_id
    ${baseQuery}
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  const items = rows.map(buildInvoiceItem);

  const summaryRows = db.prepare(`
    SELECT i.total_ttc_cents, i.reste_a_payer_cents, i.status, i.due_date
    FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN clients c ON c.id = i.client_id
    ${whereClause}
  `).all(...params);

  const summary = {
    total_ttc_cents: summaryRows.reduce((s, r) => s + r.total_ttc_cents, 0),
    total_outstanding_cents: summaryRows
      .filter((r) => r.status !== 'paid' && r.status !== 'cancelled')
      .reduce((s, r) => s + r.reste_a_payer_cents, 0),
    count_overdue: summaryRows.filter((r) => r.status === 'sent' && r.due_date < today).length,
  };

  res.json({ items, total, page: pageNum, page_size: pageSize, summary });
});

// ─── POST / ────────────────────────────────────────────────────────────────────
router.post('/', requireRole('admin', 'accountant'), async (req, res) => {
  const {
    job_id,
    facture_number: inputFn,
    issue_date: inputDate,
    due_date: inputDue,
    taxe_regionale_applied = true,
    avance_cents = 0,
    pieces_jointes,
    notes,
  } = req.body;

  if (!job_id) return res.status(400).json({ error: 'job_id requis.' });

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable.' });
  if (job.status !== 'released') return res.status(409).json({ error: 'Le dossier doit être en statut "Livré" pour être facturé.' });

  const existing = db.prepare('SELECT id FROM invoices WHERE job_id = ?').get(job_id);
  if (existing) return res.status(409).json({ error: 'Ce dossier possède déjà une facture.' });

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(job.client_id);
  const lines = buildInvoiceLines(job_id);
  if (lines.length === 0) return res.status(400).json({ error: 'Aucune prestation ou décaissement à facturer.' });

  const avance = Math.max(0, parseInt(avance_cents, 10) || 0);
  const totals = computeInvoiceTotals({ lines, taxe_regionale_applied: !!taxe_regionale_applied });
  const restePayer = Math.max(0, totals.total_ttc_cents - avance);
  const amountInWords = amountToFrenchWords(restePayer);

  const issueDate = inputDate || todayStr();
  const dueDate = inputDue || addDays(issueDate, client.payment_deadline_days || 30);
  const defaultPieces = 'COPIE DUM - COPIE FACTURE COMMERCIALE - FICHE D\'IMPUTATION';

  // Atomically assign and increment facture number
  let factureNumber = inputFn;
  if (!factureNumber) {
    db.exec('BEGIN');
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'next_facture_number'").get();
      const current = row ? row.value : '1';
      db.prepare("UPDATE settings SET value = ? WHERE key = 'next_facture_number'").run(
        String(parseInt(current, 10) + 1)
      );
      db.exec('COMMIT');
      factureNumber = current;
    } catch (fnErr) {
      db.exec('ROLLBACK');
      throw fnErr;
    }
  }

  let invoiceId;
  try {
    db.exec('BEGIN');
    try {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO invoices (
          facture_number, job_id, client_id, issue_date, due_date,
          subtotal_taxable_cents, subtotal_non_taxable_cents, total_ht_cents,
          tva_14_cents, tva_20_cents, taxe_regionale_cents, taxe_regionale_applied,
          total_ttc_cents, avance_cents, reste_a_payer_cents,
          amount_in_words, pieces_jointes, notes,
          status, created_by_user_id, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,datetime('now'))
      `).run(
        factureNumber, job_id, job.client_id, issueDate, dueDate,
        totals.subtotal_taxable_cents, totals.subtotal_non_taxable_cents, totals.total_ht_cents,
        totals.tva_14_cents, totals.tva_20_cents, totals.taxe_regionale_cents,
        taxe_regionale_applied ? 1 : 0,
        totals.total_ttc_cents, avance, restePayer,
        amountInWords, pieces_jointes || defaultPieces, notes || null,
        req.user.id
      );

      // Insert lines
      lines.forEach((line, idx) => {
        db.prepare(`
          INSERT INTO invoice_lines (invoice_id, source_type, source_id, designation, amount_cents, is_taxable, tva_rate, display_order)
          VALUES (?,?,?,?,?,?,?,?)
        `).run(lastInsertRowid, line.source_type, line.source_id, line.designation,
          line.amount_cents, line.is_taxable ? 1 : 0, line.tva_rate, idx);
      });

      // Link service_charges
      const scIds = lines.filter((l) => l.source_type === 'service').map((l) => l.source_id);
      for (const scId of scIds) {
        db.prepare('UPDATE service_charges SET invoice_id = ? WHERE id = ?').run(lastInsertRowid, scId);
      }

      // Link disbursements: mark invoiced
      const disbIds = lines.filter((l) => l.source_type === 'disbursement').map((l) => l.source_id);
      for (const disbId of disbIds) {
        db.prepare("UPDATE disbursements SET status = 'invoiced', invoice_id = ? WHERE id = ?").run(lastInsertRowid, disbId);
      }

      // Update job status
      db.prepare("UPDATE jobs SET status = 'invoiced' WHERE id = ? AND status != 'paid'").run(job_id);

      db.exec('COMMIT');
      invoiceId = lastInsertRowid;
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    // Generate PDF (outside transaction — async)
    try {
      const pdfPath = await buildAndSavePdf(invoiceId);
      db.prepare('UPDATE invoices SET pdf_path = ? WHERE id = ?').run(pdfPath, invoiceId);
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr.message);
    }

    logAudit(db, {
      user_id: req.user.id, action: 'create', entity_type: 'invoice',
      entity_id: invoiceId, new_value: { facture_number: factureNumber, job_id, total_ttc_cents: totals.total_ttc_cents },
    });

    res.status(201).json(getFullInvoice(invoiceId));
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed: invoices.facture_number')) {
      return res.status(409).json({ error: `Le numéro de facture ${factureNumber} existe déjà.` });
    }
    console.error('Invoice create error:', err);
    res.status(500).json({ error: 'Erreur lors de la création de la facture.' });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const inv = getFullInvoice(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Facture introuvable.' });

  // Logistics: only their jobs
  if (req.user.role === 'logistics') {
    const job = db.prepare('SELECT commis_user_id FROM jobs WHERE id = ?').get(inv.job.id);
    if (!job || job.commis_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès refusé.' });
    }
  }
  res.json(inv);
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────
router.put('/:id', requireRole('admin', 'accountant'), async (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Facture introuvable.' });

  const { notes, taxe_regionale_applied, avance_cents, facture_number, pieces_jointes } = req.body;
  const isDraft = inv.status === 'draft';

  if (!isDraft && (taxe_regionale_applied !== undefined || avance_cents !== undefined || facture_number)) {
    return res.status(409).json({ error: 'Seule la facture en brouillon peut être modifiée intégralement. Seules les notes sont éditables après envoi.' });
  }

  const updates = {};
  if (notes !== undefined) updates.notes = notes;

  if (isDraft) {
    if (facture_number !== undefined) updates.facture_number = facture_number;
    if (pieces_jointes !== undefined) updates.pieces_jointes = pieces_jointes;

    const newTaxe = taxe_regionale_applied !== undefined ? !!taxe_regionale_applied : !!inv.taxe_regionale_applied;
    const newAvance = avance_cents !== undefined ? Math.max(0, parseInt(avance_cents, 10) || 0) : inv.avance_cents;

    if (taxe_regionale_applied !== undefined || avance_cents !== undefined) {
      const lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ?').all(inv.id);
      const totals = computeInvoiceTotals({ lines, taxe_regionale_applied: newTaxe });
      const restePayer = Math.max(0, totals.total_ttc_cents - newAvance);
      Object.assign(updates, {
        ...totals,
        avance_cents: newAvance,
        reste_a_payer_cents: restePayer,
        amount_in_words: amountToFrenchWords(restePayer),
        taxe_regionale_applied: newTaxe ? 1 : 0,
      });
    }
  }

  if (Object.keys(updates).length === 0) return res.json(getFullInvoice(inv.id));

  const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE invoices SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), inv.id);

  // Regenerate PDF if draft and totals changed
  if (isDraft && (taxe_regionale_applied !== undefined || avance_cents !== undefined)) {
    try {
      const pdfPath = await buildAndSavePdf(inv.id);
      db.prepare('UPDATE invoices SET pdf_path = ? WHERE id = ?').run(pdfPath, inv.id);
    } catch (e) { console.error('PDF regen failed:', e.message); }
  }

  logAudit(db, { user_id: req.user.id, action: 'update', entity_type: 'invoice', entity_id: inv.id });
  res.json(getFullInvoice(inv.id));
});

// ─── POST /:id/send ───────────────────────────────────────────────────────────
router.post('/:id/send', requireRole('admin', 'accountant'), (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Facture introuvable.' });
  if (inv.status !== 'draft') return res.status(409).json({ error: 'Seule une facture en brouillon peut être marquée envoyée.' });

  db.prepare("UPDATE invoices SET status = 'sent' WHERE id = ?").run(inv.id);
  logAudit(db, { user_id: req.user.id, action: 'send', entity_type: 'invoice', entity_id: inv.id });
  res.json(getFullInvoice(inv.id));
});

// ─── POST /:id/mark-paid ──────────────────────────────────────────────────────
router.post('/:id/mark-paid', requireRole('admin', 'accountant'), (req, res) => {
  const { payment_date, payment_method } = req.body;
  if (!payment_date) return res.status(400).json({ error: 'payment_date requis.' });
  if (!payment_method) return res.status(400).json({ error: 'payment_method requis.' });

  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Facture introuvable.' });

  const today = todayStr();
  const isOverdue = inv.status === 'sent' && inv.due_date < today;
  if (inv.status !== 'sent' && !isOverdue) {
    return res.status(409).json({ error: 'La facture doit être en statut "Envoyée" ou "En retard" pour être marquée payée.' });
  }

  db.transaction(() => {
    db.prepare("UPDATE invoices SET status = 'paid', payment_date = ?, payment_method = ? WHERE id = ?")
      .run(payment_date, payment_method, inv.id);

    db.prepare("UPDATE disbursements SET status = 'reimbursed' WHERE invoice_id = ?").run(inv.id);
    db.prepare("UPDATE jobs SET status = 'paid' WHERE id = ?").run(inv.job_id);
  })();

  logAudit(db, {
    user_id: req.user.id, action: 'mark_paid', entity_type: 'invoice',
    entity_id: inv.id, new_value: { payment_date, payment_method },
  });
  res.json(getFullInvoice(inv.id));
});

// ─── POST /:id/cancel ─────────────────────────────────────────────────────────
router.post('/:id/cancel', requireRole('admin'), (req, res) => {
  const { reason } = req.body;
  if (!reason || reason.trim().length < 10) {
    return res.status(400).json({ error: 'La raison doit contenir au moins 10 caractères.' });
  }

  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Facture introuvable.' });
  if (inv.status === 'paid') return res.status(409).json({ error: 'Une facture payée ne peut pas être annulée.' });
  if (inv.status === 'cancelled') return res.status(409).json({ error: 'Facture déjà annulée.' });

  db.transaction(() => {
    db.prepare("UPDATE invoices SET status = 'cancelled', cancelled_reason = ? WHERE id = ?")
      .run(reason.trim(), inv.id);

    // Revert disbursements
    db.prepare("UPDATE disbursements SET status = 'signed', invoice_id = NULL WHERE invoice_id = ?").run(inv.id);

    // Revert service charges
    db.prepare('UPDATE service_charges SET invoice_id = NULL WHERE invoice_id = ?').run(inv.id);

    // Revert job
    db.prepare("UPDATE jobs SET status = 'released' WHERE id = ? AND status = 'invoiced'").run(inv.job_id);
  })();

  logAudit(db, {
    user_id: req.user.id, action: 'cancel', entity_type: 'invoice',
    entity_id: inv.id, new_value: { reason: reason.trim() },
  });
  res.json(getFullInvoice(inv.id));
});

// ─── GET /:id/pdf ─────────────────────────────────────────────────────────────
router.get('/:id/pdf', (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Facture introuvable.' });

  if (req.user.role === 'logistics') {
    const job = db.prepare('SELECT commis_user_id FROM jobs WHERE id = ?').get(inv.job_id);
    if (!job || job.commis_user_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé.' });
  }

  if (!inv.pdf_path || !fs.existsSync(inv.pdf_path)) {
    return res.status(404).json({ error: 'PDF non disponible. Régénérez la facture.' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Facture_${inv.facture_number}.pdf"`);
  fs.createReadStream(inv.pdf_path).pipe(res);
});

// ─── POST /:id/regenerate-pdf ─────────────────────────────────────────────────
router.post('/:id/regenerate-pdf', requireRole('admin', 'accountant'), async (req, res) => {
  const inv = db.prepare('SELECT id FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Facture introuvable.' });

  try {
    const pdfPath = await buildAndSavePdf(inv.id);
    db.prepare('UPDATE invoices SET pdf_path = ? WHERE id = ?').run(pdfPath, inv.id);
    logAudit(db, { user_id: req.user.id, action: 'regenerate_pdf', entity_type: 'invoice', entity_id: inv.id });
    res.json({ ok: true, pdf_path: pdfPath });
  } catch (err) {
    console.error('PDF regen error:', err);
    res.status(500).json({ error: 'Erreur lors de la génération du PDF.' });
  }
});

module.exports = router;
