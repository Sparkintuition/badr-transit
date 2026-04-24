const { Router } = require('express');
const { z } = require('zod');
const fs = require('fs');
const db = require('../db/db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { logAudit } = require('../utils/audit');
const { zodFieldErrors } = require('../utils/validators');
const { jobBodySchema, jobUpdateSchema, dumSchema, milestoneUpdateSchema } = require('../validators/jobs');
const { createMilestonesForJob } = require('../services/jobsHelpers');
const { generateJobSheetPdf } = require('../services/jobSheetPdfService');
const serviceChargesRouter = require('./service-charges');

const router = Router();
router.use(requireAuth);

// Mount sub-router (mergeParams lets it see :id)
router.use('/:id/service-charges', serviceChargesRouter);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFullJob(jobId, userRole, { includeLog = false } = {}) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return null;

  const client = db.prepare(
    'SELECT id, name, ice, payment_deadline_days FROM clients WHERE id = ?'
  ).get(job.client_id);

  // Legacy commis (users table via commis_user_id)
  const commisUser = job.commis_user_id
    ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(job.commis_user_id)
    : null;

  // commis_name: use free-text field; fall back to legacy commis_agents lookup for old jobs
  let commisName = job.commis_name ?? null;
  if (!commisName && job.commis_agent_id) {
    const agent = db.prepare('SELECT name FROM commis_agents WHERE id = ?').get(job.commis_agent_id);
    commisName = agent?.name ?? null;
  }

  // Declarant (logistics user with login)
  const declarant = job.declarant_user_id
    ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(job.declarant_user_id)
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

  const result = {
    ...job,
    client,
    commis_user: commisUser,
    commis_name: commisName,
    declarant,
    dums,
    milestones,
    disbursements,
    service_charges: serviceCharges,
    invoice: invoice || null,
  };

  if (includeLog) {
    result.assignments_log = db.prepare(`
      SELECT
        l.id, l.field, l.is_force_claim, l.note, l.changed_at,
        l.from_user_id, fu.name AS from_user_name,
        l.to_user_id, tu.name AS to_user_name,
        l.from_commis_agent_id, fca.name AS from_commis_name,
        l.to_commis_agent_id, tca.name AS to_commis_name,
        l.changed_by_user_id, cbu.name AS changed_by_name
      FROM job_assignments_log l
      LEFT JOIN users fu  ON l.from_user_id = fu.id
      LEFT JOIN users tu  ON l.to_user_id = tu.id
      LEFT JOIN commis_agents fca ON l.from_commis_agent_id = fca.id
      LEFT JOIN commis_agents tca ON l.to_commis_agent_id = tca.id
      LEFT JOIN users cbu ON l.changed_by_user_id = cbu.id
      WHERE l.job_id = ?
      ORDER BY l.changed_at DESC
    `).all(jobId);
  }

  return result;
}

function logAssignment(db, { jobId, field, fromUserId, toUserId, fromCommisId, toCommisId, changedBy, isForceClaim, note }) {
  db.prepare(`
    INSERT INTO job_assignments_log
      (job_id, field, from_user_id, to_user_id, from_commis_agent_id, to_commis_agent_id, changed_by_user_id, is_force_claim, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    jobId, field,
    fromUserId ?? null, toUserId ?? null,
    fromCommisId ?? null, toCommisId ?? null,
    changedBy, isForceClaim ? 1 : 0, note ?? null,
  );
}

// ─── GET /api/jobs/my-assignments ─────────────────────────────────────────────
// Must be declared BEFORE /:id to avoid route shadowing

router.get('/my-assignments', (req, res) => {
  const limit = Math.min(20, parseInt(req.query.limit || '10', 10));
  const userId = req.user.id;

  const rows = db.prepare(`
    SELECT
      l.id, l.field, l.is_force_claim, l.note, l.changed_at,
      l.job_id, j.dossier_number,
      l.from_user_id, fu.name AS from_user_name,
      l.to_user_id,   tu.name AS to_user_name,
      l.changed_by_user_id, cbu.name AS changed_by_name
    FROM job_assignments_log l
    LEFT JOIN jobs j   ON l.job_id = j.id
    LEFT JOIN users fu ON l.from_user_id = fu.id
    LEFT JOIN users tu ON l.to_user_id = tu.id
    LEFT JOIN users cbu ON l.changed_by_user_id = cbu.id
    WHERE l.field = 'declarant' AND (l.from_user_id = ? OR l.to_user_id = ?)
    ORDER BY l.changed_at DESC
    LIMIT ?
  `).all(userId, userId, limit);

  res.json(rows);
});

// ─── GET /api/jobs/commis-suggestions ────────────────────────────────────────
// Must be declared BEFORE /:id to avoid route shadowing

router.get('/commis-suggestions', (req, res) => {
  const rows = db.prepare(`
    SELECT commis_name, COUNT(*) AS freq
    FROM jobs
    WHERE commis_name IS NOT NULL AND commis_name != ''
    GROUP BY commis_name
    ORDER BY freq DESC, commis_name ASC
    LIMIT 30
  `).all();
  res.json(rows.map((r) => r.commis_name));
});

// ─── GET /api/jobs ────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const {
    type, status, client_id, commis_user_id, declarant_user_id,
    unassigned, search = '',
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
  // Legacy filter (kept for backward compat)
  if (commis_user_id) { where.push('j.commis_user_id = ?'); params.push(parseInt(commis_user_id, 10)); }
  // New declarant filter
  if (unassigned === '1') {
    where.push('j.declarant_user_id IS NULL');
  } else if (declarant_user_id) {
    where.push('j.declarant_user_id = ?');
    params.push(parseInt(declarant_user_id, 10));
  }
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
      j.release_date, j.recu_le, j.inspecteur, j.client_id, j.commis_user_id,
      j.commis_agent_id, j.commis_name, j.declarant_user_id, j.observations,
      c.name  AS client_name, c.ice AS client_ice,
      cu.name AS commis_legacy_name,
      ca.name AS commis_agent_legacy_name,
      du.name AS declarant_name,
      (SELECT COUNT(*) FROM job_milestones WHERE job_id = j.id) AS milestones_total,
      (SELECT COUNT(*) FROM job_milestones WHERE job_id = j.id AND status = 'completed') AS milestones_completed,
      (SELECT COUNT(*) FROM job_milestones WHERE job_id = j.id AND status = 'skipped') AS milestones_skipped,
      (SELECT COUNT(*) FROM disbursements WHERE job_id = j.id AND status != 'cancelled') AS disbursements_count,
      (SELECT COALESCE(SUM(amount_cents),0) FROM disbursements WHERE job_id = j.id AND status != 'cancelled') AS disbursements_total_cents
    FROM jobs j
    LEFT JOIN clients c        ON j.client_id = c.id
    LEFT JOIN users cu         ON j.commis_user_id = cu.id
    LEFT JOIN commis_agents ca ON j.commis_agent_id = ca.id
    LEFT JOIN users du         ON j.declarant_user_id = du.id
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
    commis_user: r.commis_user_id ? { id: r.commis_user_id, name: r.commis_legacy_name } : null,
    commis_name: r.commis_name || r.commis_agent_legacy_name || null,
    declarant: r.declarant_user_id ? { id: r.declarant_user_id, name: r.declarant_name } : null,
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
  const job = buildFullJob(req.params.id, req.user.role, { includeLog: true });
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });
  res.json(job);
});

// ─── POST /api/jobs ───────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  const parsed = jobBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const data = parsed.data;

  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND active = 1').get(data.client_id);
  if (!client) return res.status(400).json({ errors: { client_id: 'Client introuvable ou inactif' } });

  // Legacy commis_user_id validation (for old jobs being migrated)
  if (data.commis_user_id) {
    const commis = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'logistics' AND active = 1").get(data.commis_user_id);
    if (!commis) return res.status(400).json({ errors: { commis_user_id: 'Déclarant introuvable' } });
  }
  // commis_agent_id is ignored for new jobs (free-text commis_name is used instead)

  // Declarant auto-set: logistics users self-claim on create
  let declarantId = data.declarant_user_id ?? null;
  if (req.user.role === 'logistics' && !declarantId) {
    declarantId = req.user.id;
  } else if (declarantId) {
    const decl = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'logistics' AND active = 1").get(declarantId);
    if (!decl) return res.status(400).json({ errors: { declarant_user_id: 'Déclarant introuvable ou inactif' } });
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
        commis_user_id, declarant_user_id, commis_name,
        inspecteur, recu_le, expediteur_exportateur, nombre_colis_tc,
        poids_brut_kg, nature_marchandise, bureau, depot_sequence_date, arrival_date,
        compagnie_transport, observations
      ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dossierNumber, data.type, data.client_id, req.user.id,
      data.commis_user_id ?? null, declarantId, data.commis_name ?? null,
      data.inspecteur ?? null, data.recu_le ?? null,
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

    // Log declarant assignment
    if (declarantId) {
      logAssignment(db, {
        jobId, field: 'declarant',
        fromUserId: null, toUserId: declarantId,
        changedBy: req.user.id, isForceClaim: false, note: 'Création du dossier',
      });
    }
    // commis_name is free text — no assignment log needed for creation

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
// NOTE: declarant_user_id is intentionally excluded — use the dedicated endpoints.

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
    if (!commis) return res.status(400).json({ errors: { commis_user_id: 'Déclarant introuvable' } });
  }
  // commis_agent_id is ignored for updates (free-text commis_name is used)

  db.prepare(`
    UPDATE jobs SET
      client_id = ?,
      commis_user_id = ?,
      commis_name = ?,
      inspecteur = ?, recu_le = ?,
      expediteur_exportateur = ?, nombre_colis_tc = ?, poids_brut_kg = ?,
      nature_marchandise = ?, bureau = ?, depot_sequence_date = ?, arrival_date = ?,
      compagnie_transport = ?, observations = ?
    WHERE id = ?
  `).run(
    data.client_id,
    'commis_user_id' in data ? (data.commis_user_id ?? null) : existing.commis_user_id,
    'commis_name' in data ? (data.commis_name ?? null) : existing.commis_name,
    data.inspecteur ?? null, data.recu_le ?? null,
    data.expediteur_exportateur ?? null, data.nombre_colis_tc ?? null, data.poids_brut_kg ?? null,
    data.nature_marchandise ?? null, data.bureau ?? null, data.depot_sequence_date ?? null,
    data.arrival_date ?? null, data.compagnie_transport ?? null, data.observations ?? null, id,
  );

  const updated = buildFullJob(id, req.user.role);
  logAudit(db, { user_id: req.user.id, action: 'update', entity_type: 'job', entity_id: id, old_value: existing, new_value: updated });

  res.json(updated);
});

// ─── POST /api/jobs/:id/claim-declarant ───────────────────────────────────────

router.post('/:id/claim-declarant', requireRole('logistics'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = db.prepare('SELECT id, declarant_user_id FROM jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });

  if (job.declarant_user_id !== null) {
    return res.status(409).json({ error: 'Ce dossier est déjà réclamé par un déclarant.' });
  }

  db.prepare('UPDATE jobs SET declarant_user_id = ? WHERE id = ?').run(req.user.id, id);
  logAssignment(db, {
    jobId: id, field: 'declarant',
    fromUserId: null, toUserId: req.user.id,
    changedBy: req.user.id, isForceClaim: false, note: 'Réclamé',
  });
  logAudit(db, { user_id: req.user.id, action: 'claim_declarant', entity_type: 'job', entity_id: id, new_value: { declarant_user_id: req.user.id } });

  res.json(buildFullJob(id, req.user.role, { includeLog: true }));
});

// ─── POST /api/jobs/:id/transfer-declarant ────────────────────────────────────

router.post('/:id/transfer-declarant', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = db.prepare('SELECT id, declarant_user_id FROM jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });

  const parsed = z.object({
    to_user_id: z.number().int().positive(),
    note: z.string().max(500).optional().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const { to_user_id, note } = parsed.data;

  // Logistics can only transfer if they are the current declarant or the job is unassigned
  if (req.user.role === 'logistics') {
    const isCurrentDeclarant = job.declarant_user_id === req.user.id;
    const isUnassigned = job.declarant_user_id === null;
    if (!isCurrentDeclarant && !isUnassigned) {
      return res.status(403).json({ error: 'Vous ne pouvez transférer que vos propres dossiers.' });
    }
  }

  const target = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'logistics' AND active = 1").get(to_user_id);
  if (!target) return res.status(400).json({ errors: { to_user_id: 'Déclarant cible introuvable ou inactif.' } });

  const prevDeclarantId = job.declarant_user_id;
  db.prepare('UPDATE jobs SET declarant_user_id = ? WHERE id = ?').run(to_user_id, id);
  logAssignment(db, {
    jobId: id, field: 'declarant',
    fromUserId: prevDeclarantId, toUserId: to_user_id,
    changedBy: req.user.id, isForceClaim: false, note: note ?? null,
  });
  logAudit(db, {
    user_id: req.user.id, action: 'transfer_declarant', entity_type: 'job', entity_id: id,
    old_value: { declarant_user_id: prevDeclarantId }, new_value: { declarant_user_id: to_user_id },
  });

  res.json(buildFullJob(id, req.user.role, { includeLog: true }));
});

// ─── POST /api/jobs/:id/force-claim-declarant ─────────────────────────────────

router.post('/:id/force-claim-declarant', requireRole('logistics'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = db.prepare('SELECT id, declarant_user_id FROM jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });

  if (!job.declarant_user_id) {
    return res.status(409).json({ error: 'Ce dossier n\'a pas de déclarant — utilisez "Réclamer" à la place.' });
  }
  if (job.declarant_user_id === req.user.id) {
    return res.status(409).json({ error: 'Vous êtes déjà le déclarant de ce dossier.' });
  }

  const parsed = z.object({
    note: z.string().min(5, 'Le motif doit contenir au moins 5 caractères').max(500),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const { note } = parsed.data;
  const prevDeclarantId = job.declarant_user_id;

  db.prepare('UPDATE jobs SET declarant_user_id = ? WHERE id = ?').run(req.user.id, id);
  logAssignment(db, {
    jobId: id, field: 'declarant',
    fromUserId: prevDeclarantId, toUserId: req.user.id,
    changedBy: req.user.id, isForceClaim: true, note,
  });
  logAudit(db, {
    user_id: req.user.id, action: 'force_claim', entity_type: 'job', entity_id: id,
    old_value: { declarant_user_id: prevDeclarantId }, new_value: { declarant_user_id: req.user.id, note },
  });

  res.json(buildFullJob(id, req.user.role, { includeLog: true }));
});

// ─── POST /api/jobs/:id/release-declarant ────────────────────────────────────

router.post('/:id/release-declarant', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = db.prepare('SELECT id, declarant_user_id FROM jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });

  if (!job.declarant_user_id) {
    return res.status(409).json({ error: 'Ce dossier n\'a pas de déclarant.' });
  }

  // Only current declarant or admin/accountant can release
  if (req.user.role === 'logistics' && job.declarant_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Vous ne pouvez libérer que vos propres dossiers.' });
  }

  const parsed = z.object({
    note: z.string().min(5, 'Motif requis pour libérer ce dossier.').max(500),
  }).safeParse(req.body);
  if (!parsed.success) {
    const firstMsg = Object.values(zodFieldErrors(parsed.error))[0] || 'Motif requis pour libérer ce dossier.';
    return res.status(400).json({ errors: { note: firstMsg } });
  }

  const { note } = parsed.data;
  const prevDeclarantId = job.declarant_user_id;
  db.prepare('UPDATE jobs SET declarant_user_id = NULL WHERE id = ?').run(id);
  logAssignment(db, {
    jobId: id, field: 'declarant',
    fromUserId: prevDeclarantId, toUserId: null,
    changedBy: req.user.id, isForceClaim: false, note,
  });
  logAudit(db, {
    user_id: req.user.id, action: 'release_declarant', entity_type: 'job', entity_id: id,
    old_value: { declarant_user_id: prevDeclarantId }, new_value: { declarant_user_id: null, note },
  });

  res.json(buildFullJob(id, req.user.role, { includeLog: true }));
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

// ─── GET /api/jobs/:id/sheet-pdf ──────────────────────────────────────────────

router.get('/:id/sheet-pdf', async (req, res) => {
  const job = db.prepare('SELECT id, dossier_number, commis_user_id, declarant_user_id FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Dossier introuvable' });

  // Logistics can access PDFs for jobs they are the declarant of, or legacy commis assignee
  if (req.user.role === 'logistics') {
    const isDeclarant = job.declarant_user_id === req.user.id;
    const isLegacyCommis = job.commis_user_id === req.user.id;
    if (!isDeclarant && !isLegacyCommis) {
      return res.status(403).json({ error: 'Accès refusé.' });
    }
  }

  try {
    const pdfPath = await generateJobSheetPdf(job.id);
    const filename = `Fiche_Dossier_${job.dossier_number.replace(/\//g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error('Job sheet PDF error:', err);
    res.status(500).json({ error: 'Erreur lors de la génération de la fiche dossier.' });
  }
});

module.exports = router;
