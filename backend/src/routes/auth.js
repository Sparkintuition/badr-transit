const { Router } = require('express');
const { z } = require('zod');
const db = require('../db/db');
const { verifyPassword, verifyPin, hashPassword, validatePasswordStrength } = require('../auth/passwords');
const { requireAuth } = require('../auth/middleware');
const { logAudit } = require('../utils/audit');

const router = Router();

// In-memory rate limiter
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
const MAX = 5;

function rateLimited(ip) {
  const now = Date.now();
  let r = attempts.get(ip);
  if (!r || now > r.resetAt) { r = { count: 0, resetAt: now + WINDOW }; attempts.set(ip, r); }
  if (r.count >= MAX) return true;
  r.count++;
  return false;
}
function clearLimit(ip) { attempts.delete(ip); }

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const ip = req.ip;
  if (rateLimited(ip)) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });

  const schema = z.discriminatedUnion('method', [
    z.object({ method: z.literal('password'), username: z.string().min(1), password: z.string().min(1) }),
    z.object({ method: z.literal('pin'), user_id: z.number().int().positive(), pin: z.string().length(4) }),
  ]);

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides.' });

  const data = parsed.data;

  if (data.method === 'password') {
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND active = 1").get(data.username);
    if (!user || !['admin', 'accountant'].includes(user.role)) {
      logAudit(db, { action: 'login_failed', entity_type: 'user', new_value: { username: data.username } });
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }
    const ok = await verifyPassword(data.password, user.password_hash);
    if (!ok) {
      logAudit(db, { action: 'login_failed', entity_type: 'user', entity_id: user.id, new_value: { username: user.username } });
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }
    clearLimit(ip);
    req.session.user_id = user.id;
    req.session.role = user.role;
    req.session.name = user.name;
    logAudit(db, { user_id: user.id, action: 'login_success', entity_type: 'user', entity_id: user.id });
    return res.json({ user: { id: user.id, name: user.name, role: user.role } });
  }

  // PIN login
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'logistics' AND active = 1").get(data.user_id);
  if (!user) {
    logAudit(db, { action: 'login_failed', entity_type: 'user', new_value: { user_id: data.user_id } });
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }
  const ok = await verifyPin(data.pin, user.pin_hash);
  if (!ok) {
    logAudit(db, { action: 'login_failed', entity_type: 'user', entity_id: user.id });
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }
  clearLimit(ip);
  req.session.user_id = user.id;
  req.session.role = user.role;
  req.session.name = user.name;
  logAudit(db, { user_id: user.id, action: 'login_success', entity_type: 'user', entity_id: user.id });
  res.json({ user: { id: user.id, name: user.name, role: user.role } });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const userId = req.session?.user_id;
  req.session.destroy(() => {
    if (userId) logAudit(db, { user_id: userId, action: 'logout', entity_type: 'user', entity_id: userId });
    res.status(204).end();
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, name: req.user.name, role: req.user.role } });
});

// GET /api/auth/logistics-users — public, for PIN login dropdown
router.get('/logistics-users', (req, res) => {
  const users = db.prepare("SELECT id, name FROM users WHERE role = 'logistics' AND active = 1 ORDER BY name").all();
  res.json(users);
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  if (req.user.role === 'logistics') return res.status(400).json({ error: 'Les agents logistique utilisent un PIN.' });

  const schema = z.object({ current_password: z.string().min(1), new_password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides.' });

  const { current_password, new_password } = parsed.data;
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  const ok = await verifyPassword(current_password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });

  const strength = validatePasswordStrength(new_password);
  if (!strength.ok) return res.status(400).json({ error: strength.reason });

  const hash = await hashPassword(new_password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  logAudit(db, { user_id: req.user.id, action: 'password_changed', entity_type: 'user', entity_id: req.user.id });
  res.json({ ok: true });
});

module.exports = router;
