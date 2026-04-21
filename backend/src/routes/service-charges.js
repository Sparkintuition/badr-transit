const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/db');
const { requireRole } = require('../auth/middleware');
const { logAudit } = require('../utils/audit');
const { zodFieldErrors } = require('../utils/validators');

const router = Router({ mergeParams: true });

const scSchema = z.object({
  designation: z.string().min(1, 'La désignation est requise'),
  amount_cents: z.coerce.number().int().min(0, 'Montant invalide'),
  tva_rate: z.coerce.number().int().refine((v) => [0, 14, 20].includes(v), 'TVA doit être 0, 14 ou 20'),
  is_transport: z.boolean().optional().default(false),
});

router.get('/', requireRole('admin', 'accountant'), (req, res) => {
  const rows = db.prepare('SELECT * FROM service_charges WHERE job_id = ? ORDER BY created_at').all(req.params.id);
  res.json(rows);
});

router.post('/', requireRole('admin', 'accountant'), (req, res) => {
  const { id: job_id } = req.params;
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });

  const invoice = db.prepare('SELECT id FROM invoices WHERE job_id = ?').get(job_id);
  if (invoice) return res.status(409).json({ error: 'Ce dossier est déjà facturé' });

  const parsed = scSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const { designation, amount_cents, tva_rate, is_transport } = parsed.data;

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO service_charges (job_id, designation, amount_cents, tva_rate, is_transport)
    VALUES (?, ?, ?, ?, ?)
  `).run(job_id, designation, amount_cents, tva_rate, is_transport ? 1 : 0);

  const created = db.prepare('SELECT * FROM service_charges WHERE id = ?').get(lastInsertRowid);

  logAudit(db, {
    user_id: req.user.id, action: 'create', entity_type: 'service_charge',
    entity_id: created.id, new_value: created,
  });

  res.status(201).json(created);
});

router.delete('/:sc_id', requireRole('admin', 'accountant'), (req, res) => {
  const { id: job_id, sc_id } = req.params;

  const sc = db.prepare('SELECT * FROM service_charges WHERE id = ? AND job_id = ?').get(sc_id, job_id);
  if (!sc) return res.status(404).json({ error: 'Prestation introuvable' });

  const invoice = db.prepare('SELECT id FROM invoices WHERE job_id = ?').get(job_id);
  if (invoice) return res.status(409).json({ error: 'Ce dossier est déjà facturé' });

  db.prepare('DELETE FROM service_charges WHERE id = ?').run(sc_id);

  logAudit(db, {
    user_id: req.user.id, action: 'delete', entity_type: 'service_charge',
    entity_id: sc.id, old_value: sc,
  });

  res.json({ deleted: true });
});

module.exports = router;
