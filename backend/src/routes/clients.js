const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { logAudit } = require('../utils/audit');
const { nullableStr, zodFieldErrors } = require('../utils/validators');

const router = Router();
router.use(requireAuth);

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysOverdue(due_date) {
  const diff = Date.now() - new Date(due_date + 'T00:00:00').getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

// ─── Validation schema ────────────────────────────────────────────────────────

const clientBodySchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(200),
  ice: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : (v ?? null)),
    z.string().regex(/^\d{15}$/, 'ICE doit contenir exactement 15 chiffres').nullable().optional()
  ),
  address: nullableStr,
  contact_person: nullableStr,
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : (v ?? null)),
    z.string().email('Email invalide').nullable().optional()
  ),
  phone: nullableStr,
  payment_deadline_days: z.coerce
    .number({ required_error: 'Le délai de paiement est requis', invalid_type_error: 'Nombre invalide' })
    .int()
    .min(0, 'Le délai minimum est 0 jours')
    .max(180, 'Le délai maximum est 180 jours'),
});

// ─── SQL helpers ──────────────────────────────────────────────────────────────

const CLIENT_SELECT = `
  SELECT
    c.id, c.name, c.ice, c.address, c.contact_person, c.email, c.phone,
    c.payment_deadline_days, c.active, c.created_at,
    COALESCE((SELECT COUNT(*) FROM jobs WHERE client_id = c.id), 0) AS jobs_count,
    COALESCE((SELECT COUNT(*) FROM invoices WHERE client_id = c.id AND status NOT IN ('paid','cancelled')), 0) AS unpaid_invoices_count,
    COALESCE((SELECT SUM(reste_a_payer_cents) FROM invoices WHERE client_id = c.id AND status NOT IN ('paid','cancelled')), 0) AS total_unpaid_cents,
    COALESCE((SELECT SUM(total_ttc_cents) FROM invoices WHERE client_id = c.id AND status != 'cancelled'), 0) AS total_invoiced_cents,
    COALESCE((SELECT SUM(reste_a_payer_cents) FROM invoices WHERE client_id = c.id AND status = 'sent' AND due_date < DATE('now')), 0) AS total_overdue_cents,
    COALESCE((SELECT COUNT(*) FROM invoices WHERE client_id = c.id AND status = 'sent' AND due_date < DATE('now')), 0) AS count_overdue
  FROM clients c
`;

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/clients
router.get('/', requireRole('admin', 'accountant', 'logistics'), (req, res) => {
  const { search = '', include_inactive = '0' } = req.query;

  const where = [];
  const params = [];

  if (include_inactive !== '1') {
    where.push('c.active = 1');
  }

  if (search.trim()) {
    where.push('(c.name LIKE ? OR c.ice LIKE ?)');
    params.push(`%${search.trim()}%`, `${search.trim()}%`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`${CLIENT_SELECT} ${clause} ORDER BY c.name ASC`).all(...params);
  res.json(rows);
});

// GET /api/clients/:id
router.get('/:id', requireRole('admin', 'accountant', 'logistics'), (req, res) => {
  const client = db.prepare(`${CLIENT_SELECT} WHERE c.id = ?`).get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client introuvable' });
  res.json(client);
});

// POST /api/clients
router.post('/', requireRole('admin', 'accountant'), (req, res) => {
  const parsed = clientBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const data = parsed.data;

  if (data.ice) {
    const dup = db.prepare('SELECT id FROM clients WHERE ice = ?').get(data.ice);
    if (dup) return res.status(409).json({ errors: { ice: 'Un client avec cet ICE existe déjà' } });
  }

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO clients (name, ice, address, contact_person, email, phone, payment_deadline_days)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.name, data.ice ?? null, data.address ?? null, data.contact_person ?? null,
         data.email ?? null, data.phone ?? null, data.payment_deadline_days);

  const created = db.prepare(`${CLIENT_SELECT} WHERE c.id = ?`).get(lastInsertRowid);

  logAudit(db, { user_id: req.user.id, action: 'create', entity_type: 'client', entity_id: created.id, new_value: created });

  res.status(201).json(created);
});

// PUT /api/clients/:id
router.put('/:id', requireRole('admin', 'accountant'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Client introuvable' });

  const parsed = clientBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const data = parsed.data;

  if (data.ice) {
    const conflict = db.prepare('SELECT id FROM clients WHERE ice = ? AND id != ?').get(data.ice, id);
    if (conflict) return res.status(409).json({ errors: { ice: 'Un client avec cet ICE existe déjà' } });
  }

  db.prepare(`
    UPDATE clients
    SET name = ?, ice = ?, address = ?, contact_person = ?, email = ?, phone = ?, payment_deadline_days = ?
    WHERE id = ?
  `).run(data.name, data.ice ?? null, data.address ?? null, data.contact_person ?? null,
         data.email ?? null, data.phone ?? null, data.payment_deadline_days, id);

  const updated = db.prepare(`${CLIENT_SELECT} WHERE c.id = ?`).get(id);

  logAudit(db, { user_id: req.user.id, action: 'update', entity_type: 'client', entity_id: id,
    old_value: existing, new_value: updated });

  res.json(updated);
});

// PATCH /api/clients/:id/status
router.patch('/:id/status', requireRole('admin', 'accountant'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).json({ error: 'Client introuvable' });

  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Paramètre active invalide' });

  const { active } = parsed.data;

  if (!active) {
    const { n } = db.prepare(
      "SELECT COUNT(*) as n FROM jobs WHERE client_id = ? AND status NOT IN ('archived', 'cancelled')"
    ).get(id);
    if (n > 0) {
      return res.status(409).json({
        error: 'Ce client a des dossiers en cours. Veuillez les archiver avant de le désactiver.',
      });
    }
  }

  db.prepare('UPDATE clients SET active = ? WHERE id = ?').run(active ? 1 : 0, id);

  logAudit(db, { user_id: req.user.id, action: active ? 'reactivate' : 'deactivate',
    entity_type: 'client', entity_id: id,
    old_value: { active: client.active }, new_value: { active: active ? 1 : 0 } });

  res.json({ id, active: active ? 1 : 0 });
});

// DELETE /api/clients/:id
router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).json({ error: 'Client introuvable' });

  const jobsCount = db.prepare('SELECT COUNT(*) as n FROM jobs WHERE client_id = ?').get(id).n;
  const invoicesCount = db.prepare('SELECT COUNT(*) as n FROM invoices WHERE client_id = ?').get(id).n;

  if (jobsCount > 0 || invoicesCount > 0) {
    return res.status(409).json({
      error: 'Ce client ne peut pas être supprimé car il a des dossiers ou factures. Vous pouvez le désactiver.',
    });
  }

  db.prepare('DELETE FROM clients WHERE id = ?').run(id);

  logAudit(db, { user_id: req.user.id, action: 'delete', entity_type: 'client', entity_id: id, old_value: client });

  res.json({ deleted: true });
});

// ─── GET /:id/payment-summary ─────────────────────────────────────────────────
router.get('/:id/payment-summary', requireRole('admin', 'accountant'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const exists = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Client introuvable' });

  const today = todayStr();

  const inv = db.prepare(`
    SELECT
      COUNT(*) AS total_invoices,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS count_paid,
      SUM(CASE WHEN status NOT IN ('paid','cancelled') THEN 1 ELSE 0 END) AS count_unpaid,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_ttc_cents ELSE 0 END), 0) AS total_invoiced_cents,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN total_ttc_cents ELSE 0 END), 0) AS total_paid_cents,
      COALESCE(SUM(CASE WHEN status NOT IN ('paid','cancelled') THEN reste_a_payer_cents ELSE 0 END), 0) AS total_outstanding_cents,
      COALESCE(SUM(CASE WHEN status = 'sent' AND due_date < ? THEN reste_a_payer_cents ELSE 0 END), 0) AS total_overdue_cents,
      COUNT(CASE WHEN status = 'sent' AND due_date < ? THEN 1 END) AS count_overdue,
      MAX(issue_date) AS last_invoice_date,
      MAX(payment_date) AS last_payment_date,
      AVG(CASE WHEN status = 'paid' AND payment_date IS NOT NULL
          THEN julianday(payment_date) - julianday(issue_date) END) AS avg_days_to_pay
    FROM invoices WHERE client_id = ?
  `).get(today, today, id);

  const job = db.prepare(`
    SELECT
      COUNT(*) AS total_jobs,
      SUM(CASE WHEN status IN ('open','released') THEN 1 ELSE 0 END) AS open_jobs,
      SUM(CASE WHEN status = 'invoiced' THEN 1 ELSE 0 END) AS invoiced_jobs,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_jobs
    FROM jobs WHERE client_id = ?
  `).get(id);

  res.json({
    total_jobs: job.total_jobs || 0,
    open_jobs: job.open_jobs || 0,
    invoiced_jobs: job.invoiced_jobs || 0,
    paid_jobs: job.paid_jobs || 0,
    total_invoiced_cents: inv.total_invoiced_cents || 0,
    total_paid_cents: inv.total_paid_cents || 0,
    total_outstanding_cents: inv.total_outstanding_cents || 0,
    total_overdue_cents: inv.total_overdue_cents || 0,
    count_overdue: inv.count_overdue || 0,
    avg_days_to_pay: inv.avg_days_to_pay != null ? Math.round(inv.avg_days_to_pay) : null,
    last_invoice_date: inv.last_invoice_date || null,
    last_payment_date: inv.last_payment_date || null,
  });
});

// ─── GET /:id/statement ───────────────────────────────────────────────────────
router.get('/:id/statement', requireRole('admin', 'accountant'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const client = db.prepare(`${CLIENT_SELECT} WHERE c.id = ?`).get(id);
  if (!client) return res.status(404).json({ error: 'Client introuvable' });

  const today = todayStr();
  const fromDate = req.query.from || '2000-01-01';
  const toDate   = req.query.to   || today;

  const rows = db.prepare(`
    SELECT i.id, i.facture_number, i.issue_date, i.due_date,
           i.total_ttc_cents, i.reste_a_payer_cents, i.status,
           i.payment_date, i.payment_method
    FROM invoices i
    WHERE i.client_id = ? AND i.issue_date >= ? AND i.issue_date <= ?
    ORDER BY i.issue_date DESC
  `).all(id, fromDate, toDate);

  const invoices = rows.map((r) => {
    const isOv = r.status === 'sent' && r.due_date < today;
    return {
      ...r,
      _db_status: r.status,
      status: isOv ? 'overdue' : r.status,
      is_overdue: isOv,
      days_overdue: isOv ? daysOverdue(r.due_date) : 0,
    };
  });

  const summary = {
    count_invoices: invoices.length,
    count_paid: invoices.filter((i) => i._db_status === 'paid').length,
    count_unpaid: invoices.filter((i) => !['paid', 'cancelled'].includes(i._db_status)).length,
    count_overdue: invoices.filter((i) => i.is_overdue).length,
    total_invoiced_cents: invoices.filter((i) => i._db_status !== 'cancelled').reduce((s, i) => s + i.total_ttc_cents, 0),
    total_paid_cents: invoices.filter((i) => i._db_status === 'paid').reduce((s, i) => s + i.total_ttc_cents, 0),
    total_outstanding_cents: invoices.filter((i) => !['paid', 'cancelled'].includes(i._db_status)).reduce((s, i) => s + i.reste_a_payer_cents, 0),
    total_overdue_cents: invoices.filter((i) => i.is_overdue).reduce((s, i) => s + i.reste_a_payer_cents, 0),
  };

  res.json({ client, period: { from: fromDate, to: toDate }, invoices, summary });
});

module.exports = router;
