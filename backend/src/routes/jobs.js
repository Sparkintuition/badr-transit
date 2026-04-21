const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { logAudit } = require('../utils/audit');
const { zodFieldErrors } = require('../utils/validators');
const { jobBodySchema, jobUpdateSchema, dumSchema, milestoneUpdateSchema } = require('../validators/jobs');
const { createMilestonesForJob } = require('../services/jobsHelpers');
const serviceChargesRouter = require('./service-charges');

const router = Router();
router.use(requireAuth);

// Mount sub-router (mergeParams lets it see :id)
router.use('/:id/service-charges', serviceChargesRouter);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFullJob(jobId, userRole) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return null;

  const client = db.prepare(
    'SELECT id, name, ice, payment_deadline_days FROM clients WHERE id = ?'
  ).get(job.client_id);

  const commisUser = job.commis_user_id
    ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(job.commis_user_id)
    : null;

  const dums = db.prepare(
    'SELECT * FROM job_dums WHERE job_id = ? ORDER BY display_order, id'
  ).all(jobId);

  const milestones = db.prepare(`
    SELECT m.*, u.name AS completed_by_user_name
    FROM job_milestones m
    LEFT JOIN users u ON m.completed_by_user_id = u.id
    WHERE m.job_id = ? ORDER BY m.display_order
  `).all(jobId);

  const disbursements = userRole !== 'logistics'
    ? db.prepare("SELECT * FROM disbursements WHERE job_id = ? AND status != 'cancelled' ORDER BY requested_at").all(jobId)
    : [];

  const serviceCharges = userRole !== 'logistics'
    ? db.prepare('SELECT * FROM service_charges WHERE job_id = ? ORDER BY created_at').all(jobId)
    : [];

  const invoice = db.prepare(
    'SELECT id, facture_number, issue_date, due_date, status, total_ttc_cents FROM invoices WHERE job_id = ?'
  ).get(jobId);

  return { ...job, client, commis_user: commisUser, dums, milestones, disbursements, service_charges: serviceCharges, invoice: invoice || null };
}

// ─── GET /api/jobs ────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const {
    type, status, client_id, commis_user_id, search = '',
    include_archived = '0', page = '1', page_size = '50',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(page_size, 10) || 50));
  const offset = (pageNum - 1) * pageSize;

  const where = [];
  const params = [];

  if (include_archived !== '1') { where.push('j.archived = 0'); }
  if (type) { where.push('j.type = ?'); params.push(type); }
  if (status) { where.push('j.status = ?'); params.push(status); }
  if (client_id) { where.push('j.client_id = ?'); params.push(parseInt(client_id, 10)); }
  if (commis_user_id) { where.push('j.commis_user_id = ?'); params.push(parseInt(commis_user_id, 10)); }
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    where.push('(j.dossier_number LIKE ? OR j.expediteur_exportateur LIKE ? OR EXISTS (SELECT 1 FROM job_dums jd WHERE jd.job_id = j.id AND jd.dum_number LIKE ?))');
    params.push(term, term, term);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM jobs j ${clause}`).get(...params);

  const rows = db.prepare(`
    SELECT
      j.id, j.dossier_number, j.type, j.status, j.archived, j.created_at,
      j.release_date, j.recu_le, j.inspecteur, j.client_id, j.commis_user_id, j.observations,
      c.name AS client_name, c.ice AS client_ice,
      u.name AS commis_name,
      (SELECT COUNT(*) FROM job_milestones WHERE job_id = j.id) AS milestones_total,
      (SELECT COUNT(*) FROM job_milestones WHERE job_id = j.id AND status = 'completed') AS milestones_completed,
      (SELECT COUNT(*) FROM job_milestones WHERE job_id = j.id AND status = 'skipped') AS milestones_skipped,
      (SELECT COUNT(*) FROM disbursements WHERE job_id = j.id AND status != 'cancelled') AS disbursements_count,
      (SELECT COALESCE(SUM(amount_cents),0) FROM disbursements WHERE job_id = j.id AND status != 'cancelled') AS disbursements_total_cents
    FROM jobs j
    LEFT JOIN clients c ON j.client_id = c.id
    LEFT JOIN users u ON j.commis_user_id = u.id
    ${clause}
    ORDER BY j.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  const items = rows.map((r) => ({
    id: r.id,
    dossier_number: r.dossier_number,
    type: r.type,
    status: r.status,
    archived: r.archived,
    created_at: r.created_at,
    release_date: r.release_date,
    recu_le: r.recu_le,
    inspecteur: r.inspecteur,
    client: { id: r.client_id, name: r.client_name, ice: r.client_ice },
    commis_user: r.commis_user_id ? { id: r.commis_user_id, name: r.commis_name } : null,
    milestones_total: r.milestones_total,
    milestones_completed: r.milestones_completed,
    milestones_skipped: r.milestones_skipped,
    disbursements_count: r.disbursements_count,
    disbursements_total_cents: r.disbursements_total_cents,
    observations_preview: r.observations ? r.observations.slice(0, 100) : null,
    dums: [],
  }));

  // Batch-load DUMs for all jobs on this page
  if (items.length > 0) {
    const ids = items.map((j) => j.id);
    const placeholders = ids.map(() => '?').join(',');
    const dums = db.prepare(
      `SELECT * FROM job_dums WHERE job_id IN (${placeholders}) ORDER BY job_id, display_order, id`
    ).all(...ids);
    const byJob = {};
    for (const d of dums) {
      if (!byJob[d.job_id]) byJob[d.job_id] = [];
      byJob[d.job_id].push(d);
    }
    for (const item of items) item.dums = byJob[item.id] || [];
  }

  res.json({ items, total, page: pageNum, page_size: pageSize });
});

// ─── GET /api/jobs/:id ────────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const job = buildFullJob(req.params.id, req.user.role);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });
  res.json(job);
});

// ─── POST /api/jobs ───────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  const parsed = jobBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const data = parsed.data;

  // Validate client
  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND active = 1').get(data.client_id);
  if (!client) return res.status(400).json({ errors: { client_id: 'Client introuvable ou inactif' } });

  // Validate commis
  if (data.commis_user_id) {
    const commis = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'logistics' AND active = 1").get(data.commis_user_id);
    if (!commis) return res.status(400).json({ errors: { commis_user_id: 'Agent logistique introuvable' } });
  }

  let dossierNumber = data.dossier_number?.trim() || null;

  db.exec('BEGIN');
  try {
    if (!dossierNumber) {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'next_dossier_number'").get();
      dossierNumber = row.value;
      db.prepare("UPDATE settings SET value = CAST(value AS INTEGER) + 1, updated_at = datetime('now') WHERE key = 'next_dossier_number'").run();
    } else {
      const dup = db.prepare('SELECT id FROM jobs WHERE dossier_number = ?').get(dossierNumber);
      if (dup) {
        db.exec('ROLLBACK');
        return res.status(409).json({ errors: { dossier_number: 'Ce numéro de dossier existe déjà' } });
      }
    }

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO jobs (
        dossier_number, type, client_id, status, created_by_user_id,
        commis_user_id, inspecteur, recu_le, expediteur_exportateur, nombre_colis_tc,
        poids_brut_kg, nature_marchandise, bureau, depot_sequence_date, arrival_date,
        compagnie_transport, observations
      ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dossierNumber, data.type, data.client_id, req.user.id,
      data.commis_user_id ?? null, data.inspecteur ?? null, data.recu_le ?? null,
      data.expediteur_exportateur ?? null, data.nombre_colis_tc ?? null,
      data.poids_brut_kg ?? null, data.nature_marchandise ?? null,
      data.bureau ?? null, data.depot_sequence_date ?? null, data.arrival_date ?? null,
      data.compagnie_transport ?? null, data.observations ?? null,
    );

    const jobId = lastInsertRowid;
    createMilestonesForJob(db, jobId, data.type);

    const insertDum = db.prepare(
      'INSERT INTO job_dums (job_id, dum_number, dum_date, display_order) VALUES (?, ?, ?, ?)'
    );
    (data.dums || []).forEach((d, i) => insertDum.run(jobId, d.dum_number, d.dum_date ?? null, (i + 1) * 10));

    db.exec('COMMIT');

    const created = buildFullJob(jobId, req.user.role);
    logAudit(db, { user_id: req.user.id, action: 'create', entity_type: 'job', entity_id: jobId, new_value: { dossier_number: dossierNumber, type: data.type, client_id: data.client_id } });

    res.status(201).json(created);
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
});

// ─── PUT /api/jobs/:id ────────────────────────────────────────────────────────

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Dossier introuvable' });

  if (existing.archived && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Seul un administrateur peut modifier un dossier archivé' });
  }

  const parsed = jobUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const data = parsed.data;

  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND active = 1').get(data.client_id);
  if (!client) return res.status(400).json({ errors: { client_id: 'Client introuvable ou inactif' } });

  if (data.commis_user_id) {
    const commis = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'logistics' AND active = 1").get(data.commis_user_id);
    if (!commis) return res.status(400).json({ errors: { commis_user_id: 'Agent logistique introuvable' } });
  }

  db.prepare(`
    UPDATE jobs SET
      client_id = ?, commis_user_id = ?, inspecteur = ?, recu_le = ?,
      expediteur_exportateur = ?, nombre_colis_tc = ?, poids_brut_kg = ?,
      nature_marchandise = ?, bureau = ?, depot_sequence_date = ?, arrival_date = ?,
      compagnie_transport = ?, observations = ?
    WHERE id = ?
  `).run(
    data.client_id, data.commis_user_id ?? null, data.inspecteur ?? null, data.recu_le ?? null,
    data.expediteur_exportateur ?? null, data.nombre_colis_tc ?? null, data.poids_brut_kg ?? null,
    data.nature_marchandise ?? null, data.bureau ?? null, data.depot_sequence_date ?? null,
    data.arrival_date ?? null, data.compagnie_transport ?? null, data.observations ?? null, id,
  );

  const updated = buildFullJob(id, req.user.role);
  logAudit(db, { user_id: req.user.id, action: 'update', entity_type: 'job', entity_id: id, old_value: existing, new_value: updated });

  res.json(updated);
});

// ─── PATCH /api/jobs/:id/status ───────────────────────────────────────────────

router.patch('/:id/status', requireRole('admin', 'accountant'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });

  const parsed = z.object({
    status: z.enum(['open', 'released', 'cancelled']),
    notes: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const { status, notes } = parsed.data;

  if (status === 'cancelled' && !notes?.trim()) {
    return res.status(400).json({ errors: { notes: "Une raison est requise pour annuler le dossier" } });
  }

  const today = new Date().toISOString().slice(0, 10);
  const releaseDate = status === 'released' && !job.release_date ? today : job.release_date;

  db.prepare('UPDATE jobs SET status = ?, release_date = ?, notes = ? WHERE id = ?')
    .run(status, releaseDate, notes != null ? notes : job.notes, id);

  logAudit(db, {
    user_id: req.user.id, action: 'status_change', entity_type: 'job', entity_id: id,
    old_value: { status: job.status }, new_value: { status, notes },
  });

  res.json(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
});

// ─── POST /api/jobs/:id/archive ───────────────────────────────────────────────

router.post('/:id/archive', requireRole('admin', 'accountant'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });

  if (!['released', 'paid', 'cancelled'].includes(job.status)) {
    return res.status(409).json({ error: 'Le dossier doit être livré, payé ou annulé pour être archivé.' });
  }

  db.prepare('UPDATE jobs SET archived = 1 WHERE id = ?').run(id);
  logAudit(db, { user_id: req.user.id, action: 'archive', entity_type: 'job', entity_id: id });
  res.json({ archived: true });
});

// ─── POST /api/jobs/:id/unarchive ─────────────────────────────────────────────

router.post('/:id/unarchive', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });

  db.prepare('UPDATE jobs SET archived = 0 WHERE id = ?').run(id);
  logAudit(db, { user_id: req.user.id, action: 'unarchive', entity_type: 'job', entity_id: id });
  res.json({ archived: false });
});

// ─── DUM sub-routes ───────────────────────────────────────────────────────────

router.post('/:id/dums', (req, res) => {
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });

  const parsed = dumSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const { dum_number, dum_date } = parsed.data;
  const { m } = db.prepare('SELECT COALESCE(MAX(display_order), 0) AS m FROM job_dums WHERE job_id = ?').get(job.id);
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO job_dums (job_id, dum_number, dum_date, display_order) VALUES (?, ?, ?, ?)'
  ).run(job.id, dum_number, dum_date ?? null, m + 10);

  const created = db.prepare('SELECT * FROM job_dums WHERE id = ?').get(lastInsertRowid);
  logAudit(db, { user_id: req.user.id, action: 'create', entity_type: 'job_dum', entity_id: created.id, new_value: created });
  res.status(201).json(created);
});

router.put('/:id/dums/:dum_id', (req, res) => {
  const dum = db.prepare('SELECT * FROM job_dums WHERE id = ? AND job_id = ?').get(req.params.dum_id, req.params.id);
  if (!dum) return res.status(404).json({ error: 'DUM introuvable' });

  const parsed = dumSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  db.prepare('UPDATE job_dums SET dum_number = ?, dum_date = ? WHERE id = ?')
    .run(parsed.data.dum_number, parsed.data.dum_date ?? null, dum.id);

  const updated = db.prepare('SELECT * FROM job_dums WHERE id = ?').get(dum.id);
  logAudit(db, { user_id: req.user.id, action: 'update', entity_type: 'job_dum', entity_id: dum.id, old_value: dum, new_value: updated });
  res.json(updated);
});

router.delete('/:id/dums/:dum_id', (req, res) => {
  const dum = db.prepare('SELECT * FROM job_dums WHERE id = ? AND job_id = ?').get(req.params.dum_id, req.params.id);
  if (!dum) return res.status(404).json({ error: 'DUM introuvable' });

  db.prepare('DELETE FROM job_dums WHERE id = ?').run(dum.id);
  logAudit(db, { user_id: req.user.id, action: 'delete', entity_type: 'job_dum', entity_id: dum.id, old_value: dum });
  res.json({ deleted: true });
});

// ─── Milestone sub-route ──────────────────────────────────────────────────────

router.patch('/:id/milestones/:milestone_id', (req, res) => {
  const ms = db.prepare('SELECT * FROM job_milestones WHERE id = ? AND job_id = ?')
    .get(req.params.milestone_id, req.params.id);
  if (!ms) return res.status(404).json({ error: 'Jalon introuvable' });

  const parsed = milestoneUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const { status, notes } = parsed.data;
  const now = new Date().toISOString();
  const completedAt = status === 'completed' ? now : null;
  const completedBy = status === 'completed' ? req.user.id : null;

  db.prepare(`
    UPDATE job_milestones
    SET status = ?, completed_at = ?, completed_by_user_id = ?, notes = ?
    WHERE id = ?
  `).run(status, completedAt, completedBy, notes !== undefined ? notes : ms.notes, ms.id);

  const updated = db.prepare(`
    SELECT m.*, u.name AS completed_by_user_name
    FROM job_milestones m
    LEFT JOIN users u ON m.completed_by_user_id = u.id
    WHERE m.id = ?
  `).get(ms.id);

  logAudit(db, {
    user_id: req.user.id, action: 'update', entity_type: 'job_milestone', entity_id: ms.id,
    old_value: { status: ms.status }, new_value: { status },
  });

  res.json(updated);
});

module.exports = router;
