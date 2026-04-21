const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { logAudit } = require('../utils/audit');
const { nullableStr, zodFieldErrors } = require('../utils/validators');

const router = Router();
router.use(requireAuth);

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
    COALESCE((SELECT COUNT(*) FROM jobs    WHERE client_id = c.id), 0) AS jobs_count,
    COALESCE((SELECT COUNT(*) FROM invoices WHERE client_id = c.id AND status != 'paid'), 0) AS unpaid_invoices_count,
    COALESCE((SELECT SUM(reste_a_payer_cents) FROM invoices WHERE client_id = c.id AND status != 'paid'), 0) AS total_unpaid_cents
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

module.exports = router;
