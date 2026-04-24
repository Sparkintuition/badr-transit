const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/db');
const { requireAuth, requireRole } = require('../auth/middleware');
const { logAudit } = require('../utils/audit');
const { zodFieldErrors } = require('../utils/validators');

const router = Router();
router.use(requireAuth);

const agentSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(100),
  phone: z.string().max(30).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// ─── GET /api/commis-agents ───────────────────────────────────────────────────

router.get('/', (req, res) => {
  const { include_inactive = '0', search = '' } = req.query;

  const where = [];
  const params = [];

  if (include_inactive !== '1') { where.push('ca.active = 1'); }
  if (search.trim()) {
    where.push('ca.name LIKE ?');
    params.push(`%${search.trim()}%`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      ca.id, ca.name, ca.phone, ca.active, ca.notes, ca.created_at,
      COUNT(j.id) AS jobs_count
    FROM commis_agents ca
    LEFT JOIN jobs j ON j.commis_agent_id = ca.id
    ${clause}
    GROUP BY ca.id
    ORDER BY ca.active DESC, ca.name ASC
  `).all(...params);

  res.json(rows);
});

// ─── POST /api/commis-agents ──────────────────────────────────────────────────

router.post('/', requireRole('admin', 'accountant'), (req, res) => {
  const parsed = agentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const { name, phone, notes } = parsed.data;
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO commis_agents (name, phone, notes, created_by_user_id)
    VALUES (?, ?, ?, ?)
  `).run(name, phone ?? null, notes ?? null, req.user.id);

  const created = db.prepare('SELECT * FROM commis_agents WHERE id = ?').get(lastInsertRowid);
  logAudit(db, { user_id: req.user.id, action: 'create', entity_type: 'commis_agent', entity_id: created.id, new_value: { name, phone } });
  res.status(201).json(created);
});

// ─── PUT /api/commis-agents/:id ───────────────────────────────────────────────

router.put('/:id', requireRole('admin', 'accountant'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM commis_agents WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Agent introuvable' });

  const parsed = agentSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: zodFieldErrors(parsed.error) });

  const { name, phone, notes } = parsed.data;
  db.prepare(`
    UPDATE commis_agents
    SET
      name  = COALESCE(?, name),
      phone = CASE WHEN ? IS NOT NULL THEN ? ELSE phone END,
      notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END
    WHERE id = ?
  `).run(
    name ?? null,
    phone !== undefined ? 1 : null, phone ?? null,
    notes !== undefined ? 1 : null, notes ?? null,
    id,
  );

  const updated = db.prepare('SELECT * FROM commis_agents WHERE id = ?').get(id);
  logAudit(db, { user_id: req.user.id, action: 'update', entity_type: 'commis_agent', entity_id: id, old_value: existing, new_value: updated });
  res.json(updated);
});

// ─── PATCH /api/commis-agents/:id/status ─────────────────────────────────────

router.patch('/:id/status', requireRole('admin', 'accountant'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM commis_agents WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Agent introuvable' });

  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

  const { active } = parsed.data;

  if (!active) {
    const openCount = db.prepare(`
      SELECT COUNT(*) AS n FROM jobs j
      WHERE j.commis_agent_id = ? AND j.status IN ('open','released') AND j.archived = 0
    `).get(id).n;
    if (openCount > 0) {
      return res.status(409).json({ error: `Impossible de désactiver : cet agent est assigné à ${openCount} dossier(s) ouvert(s).` });
    }
  }

  db.prepare('UPDATE commis_agents SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  logAudit(db, {
    user_id: req.user.id, action: active ? 'activate' : 'deactivate',
    entity_type: 'commis_agent', entity_id: id,
    old_value: { active: existing.active }, new_value: { active: active ? 1 : 0 },
  });
  res.json(db.prepare('SELECT * FROM commis_agents WHERE id = ?').get(id));
});

// ─── DELETE /api/commis-agents/:id ───────────────────────────────────────────

router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM commis_agents WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Agent introuvable' });

  const usedCount = db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE commis_agent_id = ?').get(id).n;
  if (usedCount > 0) {
    return res.status(409).json({ error: `Impossible de supprimer : cet agent a été utilisé sur ${usedCount} dossier(s).` });
  }

  db.prepare('DELETE FROM commis_agents WHERE id = ?').run(id);
  logAudit(db, { user_id: req.user.id, action: 'delete', entity_type: 'commis_agent', entity_id: id, old_value: existing });
  res.json({ deleted: true });
});

module.exports = router;
