const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/db');
const { requireRole } = require('../auth/middleware');
const { hashPassword, hashPin, validatePasswordStrength, validatePinFormat } = require('../auth/passwords');
const { logAudit } = require('../utils/audit');

const router = Router();
router.use(requireRole('admin'));

const SAFE_COLS = 'id, name, role, username, active, created_at';

// GET /api/users
router.get('/', (req, res) => {
  const users = db.prepare(`SELECT ${SAFE_COLS} FROM users ORDER BY created_at ASC`).all();
  res.json(users);
});

// POST /api/users
router.post('/', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    role: z.enum(['admin', 'accountant', 'logistics']),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    pin: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides.' });

  const { name, role, username, password, pin } = parsed.data;

  if (['admin', 'accountant'].includes(role)) {
    if (!username) return res.status(400).json({ error: "Le nom d'utilisateur est requis." });
    if (!password) return res.status(400).json({ error: 'Le mot de passe est requis.' });
    const strength = validatePasswordStrength(password);
    if (!strength.ok) return res.status(400).json({ error: strength.reason });
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (exists) return res.status(409).json({ error: "Ce nom d'utilisateur existe déjà." });

    const hash = await hashPassword(password);
    const result = db.prepare(`INSERT INTO users (name, role, username, password_hash, active) VALUES (?, ?, ?, ?, 1)`).run(name, role, username, hash);
    const user = db.prepare(`SELECT ${SAFE_COLS} FROM users WHERE id = ?`).get(result.lastInsertRowid);
    logAudit(db, { user_id: req.user.id, action: 'user_create', entity_type: 'user', entity_id: user.id, new_value: user });
    return res.status(201).json(user);
  }

  // logistics
  if (!pin) return res.status(400).json({ error: 'Le PIN est requis.' });
  const pinCheck = validatePinFormat(pin);
  if (!pinCheck.ok) return res.status(400).json({ error: pinCheck.reason });

  const hash = await hashPin(pin);
  const result = db.prepare(`INSERT INTO users (name, role, pin_hash, active) VALUES (?, ?, ?, 1)`).run(name, role, hash);
  const user = db.prepare(`SELECT ${SAFE_COLS} FROM users WHERE id = ?`).get(result.lastInsertRowid);
  logAudit(db, { user_id: req.user.id, action: 'user_create', entity_type: 'user', entity_id: user.id, new_value: user });
  res.status(201).json(user);
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare(`SELECT ${SAFE_COLS} FROM users WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const schema = z.object({
    name: z.string().min(1).optional(),
    active: z.number().int().min(0).max(1).optional(),
    new_password: z.string().min(1).optional(),
    new_pin: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides.' });

  const { name, active, new_password, new_pin } = parsed.data;

  if (active === 0 && req.user.id === id) return res.status(400).json({ error: 'Vous ne pouvez pas vous désactiver vous-même.' });

  const updates = [];
  const params = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (active !== undefined) { updates.push('active = ?'); params.push(active); }

  if (new_password !== undefined) {
    if (existing.role === 'logistics') return res.status(400).json({ error: 'Utilisez new_pin pour les agents logistique.' });
    const strength = validatePasswordStrength(new_password);
    if (!strength.ok) return res.status(400).json({ error: strength.reason });
    updates.push('password_hash = ?');
    params.push(await hashPassword(new_password));
  }

  if (new_pin !== undefined) {
    if (existing.role !== 'logistics') return res.status(400).json({ error: 'Utilisez new_password pour cet utilisateur.' });
    const pinCheck = validatePinFormat(new_pin);
    if (!pinCheck.ok) return res.status(400).json({ error: pinCheck.reason });
    updates.push('pin_hash = ?');
    params.push(await hashPin(new_pin));
  }

  if (!updates.length) return res.status(400).json({ error: 'Aucune modification fournie.' });

  params.push(id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare(`SELECT ${SAFE_COLS} FROM users WHERE id = ?`).get(id);
  logAudit(db, { user_id: req.user.id, action: 'user_update', entity_type: 'user', entity_id: id, old_value: existing, new_value: updated });
  res.json(updated);
});

// DELETE /api/users/:id — soft delete
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.user.id === id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
  const existing = db.prepare(`SELECT ${SAFE_COLS} FROM users WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
  logAudit(db, { user_id: req.user.id, action: 'user_delete', entity_type: 'user', entity_id: id, old_value: existing });
  res.status(204).end();
});

module.exports = router;
