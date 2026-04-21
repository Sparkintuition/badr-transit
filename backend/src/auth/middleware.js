const db = require('../db/db');

function requireAuth(req, res, next) {
  if (!req.session?.user_id) return res.status(401).json({ error: 'Non authentifié' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user_id) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.session.role)) return res.status(403).json({ error: 'Accès refusé' });
    next();
  };
}

function attachUser(req, res, next) {
  if (!req.session?.user_id) return next();

  const user = db.prepare('SELECT id, name, role, username, active FROM users WHERE id = ?').get(req.session.user_id);

  if (!user || !user.active) {
    return req.session.destroy(() => res.status(401).json({ error: 'Session expirée' }));
  }

  req.user = user;
  next();
}

module.exports = { requireAuth, requireRole, attachUser };
