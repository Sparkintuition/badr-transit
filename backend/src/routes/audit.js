const { Router } = require('express');
const db = require('../db/db');
const { requireRole } = require('../auth/middleware');

const router = Router();

function computeEntityDisplay(entity_type, entity_id) {
  try {
    if (entity_type === 'client') {
      const row = db.prepare('SELECT name FROM clients WHERE id = ?').get(entity_id);
      return row ? row.name : '[supprimé]';
    }
    if (entity_type === 'job') {
      const row = db.prepare('SELECT dossier_number FROM jobs WHERE id = ?').get(entity_id);
      return row ? row.dossier_number : '[supprimé]';
    }
    if (entity_type === 'disbursement') {
      const row = db.prepare('SELECT type, description FROM disbursements WHERE id = ?').get(entity_id);
      if (!row) return '[supprimé]';
      return row.description ? `${row.type} — ${row.description}` : row.type;
    }
    if (entity_type === 'invoice') {
      const row = db.prepare('SELECT facture_number FROM invoices WHERE id = ?').get(entity_id);
      return row ? row.facture_number : '[supprimé]';
    }
    if (entity_type === 'user') {
      const row = db.prepare('SELECT name FROM users WHERE id = ?').get(entity_id);
      return row ? row.name : '[supprimé]';
    }
    if (entity_type === 'service_charge') {
      const row = db.prepare('SELECT label FROM service_charges WHERE id = ?').get(entity_id);
      return row ? row.label : '[supprimé]';
    }
    if (entity_type === 'setting') {
      return entity_id ? String(entity_id) : '';
    }
  } catch {
    // ignore
  }
  return entity_id ? String(entity_id) : '';
}

router.get('/', requireRole('admin'), (req, res) => {
  const {
    entity_type, entity_id, user_id, action,
    date_from, date_to, search,
    page = 1, page_size = 100,
  } = req.query;

  const limit = Math.min(parseInt(page_size) || 100, 500);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

  const conditions = [];
  const params = [];

  if (entity_type) { conditions.push('a.entity_type = ?'); params.push(entity_type); }
  if (entity_id)   { conditions.push('a.entity_id = ?');   params.push(entity_id); }
  if (user_id)     { conditions.push('a.user_id = ?');     params.push(user_id); }
  if (action)      { conditions.push('a.action = ?');      params.push(action); }
  if (date_from)   { conditions.push("a.timestamp >= ?");  params.push(date_from); }
  if (date_to)     { conditions.push("a.timestamp <= ?");  params.push(date_to + 'T23:59:59'); }
  if (search) {
    conditions.push('(a.action LIKE ? OR a.entity_type LIKE ? OR a.entity_id LIKE ? OR u.name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const total = db.prepare(
    `SELECT COUNT(*) as n FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ${where}`
  ).get(...params).n;

  const rows = db.prepare(
    `SELECT a.id, a.user_id, u.name AS user_name, a.action, a.entity_type, a.entity_id,
            a.old_value, a.new_value, a.timestamp
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  const items = rows.map((r) => ({
    ...r,
    entity_display: computeEntityDisplay(r.entity_type, r.entity_id),
    old_value: r.old_value ? JSON.parse(r.old_value) : null,
    new_value: r.new_value ? JSON.parse(r.new_value) : null,
  }));

  res.json({ items, total, page: parseInt(page), page_size: limit });
});

module.exports = router;
