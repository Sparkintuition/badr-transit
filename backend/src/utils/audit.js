const SENSITIVE = new Set(['password_hash', 'pin_hash', 'password', 'pin', 'new_password', 'new_pin', 'current_password']);

function strip(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const k of SENSITIVE) delete out[k];
  return out;
}

function logAudit(db, { user_id, action, entity_type, entity_id, old_value, new_value }) {
  db.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_value, new_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    user_id ?? null,
    action,
    entity_type,
    entity_id ?? null,
    old_value != null ? JSON.stringify(strip(old_value)) : null,
    new_value != null ? JSON.stringify(strip(new_value)) : null,
  );
}

module.exports = { logAudit };
